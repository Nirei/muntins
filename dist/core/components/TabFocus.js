import { getContext } from "../runtime/context.js";
import { Box } from "./Box.js";
import { createFocusScopeNode } from "./FocusScopeComponent.js";
/**
 * Convenience component that combines a FocusScope with Tab key handling.
 *
 * Wraps children in a focus scope and handles Tab/Shift+Tab to navigate
 * between focusable children.
 */
export function TabFocus(props) {
    const ctx = getContext();
    const propsWithTrap = { ...props, trap: props.trap ?? true };
    return createFocusScopeNode(propsWithTrap, (children, scope) => {
        const focus = ctx.app.focus.createController(scope);
        return Box({
            children,
            onKeyPress(event) {
                if (event.name === "tab") {
                    event.shift ? focus.prev() : focus.next();
                    return true;
                }
                return false;
            },
        });
    });
}
//# sourceMappingURL=TabFocus.js.map