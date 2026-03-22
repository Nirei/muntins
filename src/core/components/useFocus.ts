import { App } from "../runtime/App.ts";
import type { FocusController } from "../runtime/FocusManager.ts";

/**
 * Access the focus controller for the current scope.
 * Must be called within a mounted component context.
 */
export function useFocus(): FocusController {
  const ctx = App.getContext();
  return ctx.app.focus.createController(ctx.currentScope);
}
