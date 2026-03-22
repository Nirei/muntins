import { App } from "../runtime/App.ts";
import type { FocusScope } from "../runtime/FocusManager.ts";
import type { Node } from "../runtime/Node.ts";
import { Box } from "./Box.ts";
import { createFocusScopeNode } from "./FocusScopeComponent.ts";

/** Props for TabFocus component */
export interface TabFocusProps {
  children: Node[];
  trap?: boolean;
}

/**
 * Convenience component that combines a FocusScope with Tab key handling.
 *
 * Wraps children in a focus scope and handles Tab/Shift+Tab to navigate
 * between focusable children.
 */
export function TabFocus(props: TabFocusProps): Node {
  const ctx = App.getContext();

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
