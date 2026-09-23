import { FocusManager, } from "../runtime/FocusManager.js";
import { getContext, withContext } from "../runtime/context.js";
import { Box } from "./Box.js";
/**
 * Creates a focus scope node with the given box factory.
 * Shared implementation for FocusScopeComponent and TabFocus.
 */
export function createFocusScopeNode(props, boxFactory) {
    const ctx = getContext();
    const scope = {
        parent: ctx.currentScope,
        focusableNodes: [],
        focusedIndex: -1,
        trap: props.trap ?? false,
    };
    const childCtx = {
        app: ctx.app,
        currentScope: scope,
    };
    const node = withContext(childCtx, () => boxFactory(props.children, scope));
    node._focusScope = scope;
    FocusManager.collectFocusableInScope(node, scope);
    return node;
}
/**
 * Creates a nested focus scope for organizing focusable elements.
 *
 * When `trap` is true, Tab/Shift+Tab navigation wraps within this scope
 * instead of escaping to the parent. Useful for modal dialogs.
 */
export function FocusScopeComponent(props) {
    return createFocusScopeNode(props, (children) => Box({ children }));
}
//# sourceMappingURL=FocusScopeComponent.js.map