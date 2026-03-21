import { DEFAULT_FLEX_STYLE } from "../layout.ts";
import { createEffect, createRoot, onCleanup } from "../signals.ts";
import { App } from "./App.ts";
import { clearSubtreeLayoutSignals } from "./binding.ts";
import { cleanupSubtreeState, registerSubtreeFocusables } from "./focus.ts";
import type { Node } from "./Node.ts";

/** Props for Show component. */
export interface ShowProps<T> {
  when: () => T;
  children: (value: T) => Node;
  fallback?: () => Node;
}

/**
 * Conditionally renders one of two branches based on a reactive condition.
 *
 * When the condition is truthy, renders the `children` branch with the truthy value.
 * When falsy, renders the `fallback` branch if provided, otherwise renders nothing.
 * Branch changes dispose the previous subtree and create a new one with proper
 * ownership tracking.
 *
 * Must be called within a mounted component context (inside mount()'s component
 * function or a child thereof) for proper effect ownership.
 */
export function Show<T>(props: ShowProps<T>): Node {
  const { when: condition, children: childrenBranch, fallback } = props;

  const ctx = App.getActiveContext();
  const children: Node[] = [];
  let currentDispose: (() => void) | null = null;
  let currentChild: Node | null = null;

  const container: Node = {
    style: { ...DEFAULT_FLEX_STYLE, display: "contents" },
    get children() {
      return children;
    },
  };

  const disposeChild = () => {
    if (currentDispose) {
      if (ctx && currentChild) {
        cleanupSubtreeState(ctx.app, currentChild);
      }
      if (currentChild) {
        clearSubtreeLayoutSignals(currentChild);
      }
      currentDispose();
      currentDispose = null;
      currentChild = null;
    }
  };

  const createChildNode = (
    factory: () => Node,
    dispose: () => void,
  ): (() => void) => {
    const node = ctx ? App.withContext(ctx, factory) : factory();
    node._parent = container;
    children.push(node);
    currentChild = node;

    if (ctx) {
      registerSubtreeFocusables(ctx.app, node);
    }

    return dispose;
  };

  createEffect(() => {
    const value = condition();

    disposeChild();
    children.length = 0;

    if (value) {
      currentDispose = createRoot((dispose) =>
        createChildNode(() => childrenBranch(value), dispose),
      );
      ctx?.app.scheduleRelayout();
    } else if (fallback) {
      currentDispose = createRoot((dispose) =>
        createChildNode(fallback, dispose),
      );
      ctx?.app.scheduleRelayout();
    }
  });

  onCleanup(() => {
    disposeChild();
  });

  return container;
}
