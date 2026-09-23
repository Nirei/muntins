import { getContext } from "../runtime/context.js";
/**
 * Access the focus controller for the current scope.
 * Must be called within a mounted component context.
 */
export function useFocus() {
    const ctx = getContext();
    return ctx.app.focus.createController(ctx.currentScope);
}
//# sourceMappingURL=useFocus.js.map