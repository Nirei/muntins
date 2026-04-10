import { DEFAULT_FLEX_STYLE } from "../layout.ts";
import { App } from "../runtime/App.ts";
import { Node } from "../runtime/Node.ts";
import {
  type MaybeAccessor,
  createEffect,
  createRoot,
  createSignal,
  onCleanup,
  resolve,
} from "../signals.ts";

/** Props for For component. */
export interface ForProps<T> {
  each: MaybeAccessor<T[]>;
  render: (item: () => T, index: () => number) => Node;
  key?: (item: T) => unknown;
}

interface ForItemEntry<T> {
  dispose: () => void;
  node: Node;
  setItem: (item: T) => void;
  setIndex: (index: number) => void;
}

/**
 * Renders a list of items with efficient updates using keyed reconciliation.
 *
 * Items are identified by key (defaults to object identity). When the array
 * changes:
 * - New items create new roots with reactive item/index getters
 * - Removed items have their roots disposed
 * - Reordered items update their index and item signals, keeping nodes alive
 *
 * Duplicate keys are supported: each occurrence gets its own node. The render
 * function receives getter functions for item and index, enabling reactive
 * updates when items change or reorder.
 *
 * Must be called within a mounted component context for proper effect ownership.
 */
export function For<T>(props: ForProps<T>): Node {
  const { each: items, render, key: keyFn } = props;

  const ctx = App.getActiveContext();
  const children: Node[] = [];
  const itemRoots: Map<unknown, ForItemEntry<T>[]> = new Map();
  const getKey = keyFn ?? ((item: T) => item);

  const container = new Node({
    style: { ...DEFAULT_FLEX_STYLE, display: "contents" },
    children: () => children,
  });

  const disposeEntry = (entry: ForItemEntry<T>) => {
    if (ctx) {
      ctx.app.cleanupSubtreeState(entry.node);
    }
    // Clear layout signals for the removed subtree
    entry.node.clearLayoutSignals();
    entry.node._parent = undefined;
    entry.dispose();
  };

  // Detached roots persist across effect re-runs. We manage lifecycle manually.
  const createEntry = (
    item: T,
    index: number,
    key: unknown,
  ): ForItemEntry<T> => {
    const [getItem, setItem] = createSignal(item);
    const [getIndex, setIndex] = createSignal(index);

    let entry!: ForItemEntry<T>;

    createRoot(
      (dispose) => {
        const node = render(getItem, getIndex);
        node._parent = container;
        entry = { dispose, node, setItem, setIndex };

        const existing = itemRoots.get(key);
        if (existing) {
          existing.push(entry);
        } else {
          itemRoots.set(key, [entry]);
        }

        if (ctx) {
          ctx.app.focus.registerSubtreeFocusables(node);
        }

        return dispose;
      },
      { detached: true },
    );

    return entry;
  };

  createEffect(() => {
    const currentItems = resolve(items);

    const keyCounts = new Map<unknown, number>();
    for (const item of currentItems) {
      const key = getKey(item);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }

    const keyUsed = new Map<unknown, number>();
    children.length = 0;

    for (let i = 0; i < currentItems.length; i++) {
      const item = currentItems[i];
      const key = getKey(item);

      const entries = itemRoots.get(key);
      const usedCount = keyUsed.get(key) ?? 0;

      if (entries && usedCount < entries.length) {
        const entry = entries[usedCount];
        entry.setItem(item);
        entry.setIndex(i);
        children.push(entry.node);
      } else {
        const entry = createEntry(item, i, key);
        children.push(entry.node);
      }

      keyUsed.set(key, usedCount + 1);
    }

    for (const [key, entries] of itemRoots) {
      const needed = keyCounts.get(key) ?? 0;
      if (needed === 0) {
        for (const entry of entries) {
          disposeEntry(entry);
        }
        itemRoots.delete(key);
      } else if (entries.length > needed) {
        const excess = entries.splice(needed);
        for (const entry of excess) {
          disposeEntry(entry);
        }
      }
    }

    ctx?.app.scheduleRelayout();
  });

  onCleanup(() => {
    for (const entries of itemRoots.values()) {
      for (const entry of entries) {
        disposeEntry(entry);
      }
    }
    itemRoots.clear();
  });

  return container;
}
