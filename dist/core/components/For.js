import { DEFAULT_FLEX_STYLE } from "../layout.js";
import { Node } from "../runtime/Node.js";
import { getActiveContext } from "../runtime/context.js";
import { createEffect, createRoot, createSignal, onCleanup, resolve, } from "../signals.js";
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
export function For(props) {
    const { each: items, render, key: keyFn } = props;
    const ctx = getActiveContext();
    const children = [];
    const itemRoots = new Map();
    const getKey = keyFn ?? ((item) => item);
    const container = new Node({
        style: { ...DEFAULT_FLEX_STYLE, display: "contents" },
        children: () => children,
    });
    const disposeEntry = (entry) => {
        if (ctx) {
            ctx.app.cleanupSubtreeState(entry.node);
        }
        // Clear layout signals for the removed subtree
        entry.node.clearLayoutSignals();
        entry.node._parent = undefined;
        entry.dispose();
    };
    // Detached roots persist across effect re-runs. We manage lifecycle manually.
    const createEntry = (item, index, key) => {
        const [getItem, setItem] = createSignal(item);
        const [getIndex, setIndex] = createSignal(index);
        let entry;
        createRoot((dispose) => {
            const node = render(getItem, getIndex);
            node._parent = container;
            entry = { dispose, node, setItem, setIndex };
            const existing = itemRoots.get(key);
            if (existing) {
                existing.push(entry);
            }
            else {
                itemRoots.set(key, [entry]);
            }
            if (ctx) {
                ctx.app.focus.registerSubtreeFocusables(node);
            }
            return dispose;
        }, { detached: true });
        return entry;
    };
    createEffect(() => {
        const currentItems = resolve(items);
        const keyCounts = new Map();
        for (const item of currentItems) {
            const key = getKey(item);
            keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
        }
        const keyUsed = new Map();
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
            }
            else {
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
            }
            else if (entries.length > needed) {
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
//# sourceMappingURL=For.js.map