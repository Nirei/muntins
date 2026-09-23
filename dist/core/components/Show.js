import { DEFAULT_FLEX_STYLE } from "../layout.js";
import { Node } from "../runtime/Node.js";
import { getActiveContext, withContext } from "../runtime/context.js";
import { createEffect, createRoot, onCleanup } from "../signals.js";
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
export function Show(props) {
    const { when: condition, children: childrenBranch, fallback } = props;
    const ctx = getActiveContext();
    const children = [];
    let currentDispose = null;
    let currentChild = null;
    const container = new Node({
        style: { ...DEFAULT_FLEX_STYLE, display: "contents" },
        children: () => children,
    });
    const disposeChild = () => {
        if (currentDispose) {
            if (ctx && currentChild) {
                ctx.app.cleanupSubtreeState(currentChild);
            }
            if (currentChild) {
                currentChild.clearLayoutSignals();
            }
            currentDispose();
            currentDispose = null;
            currentChild = null;
        }
    };
    const createChildNode = (factory, dispose) => {
        const node = ctx ? withContext(ctx, factory) : factory();
        node._parent = container;
        children.push(node);
        currentChild = node;
        if (ctx) {
            ctx.app.focus.registerSubtreeFocusables(node);
        }
        return dispose;
    };
    createEffect(() => {
        const value = condition();
        disposeChild();
        children.length = 0;
        if (value) {
            currentDispose = createRoot((dispose) => createChildNode(() => childrenBranch(value), dispose));
            ctx?.app.scheduleRelayout();
        }
        else if (fallback) {
            currentDispose = createRoot((dispose) => createChildNode(fallback, dispose));
            ctx?.app.scheduleRelayout();
        }
    });
    onCleanup(() => {
        disposeChild();
    });
    return container;
}
//# sourceMappingURL=Show.js.map