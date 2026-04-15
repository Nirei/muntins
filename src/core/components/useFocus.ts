import type { FocusController } from "../runtime/FocusManager.ts";
import { getContext } from "../runtime/context.ts";

/**
 * Access the focus controller for the current scope.
 * Must be called within a mounted component context.
 */
export function useFocus(): FocusController {
  const ctx = getContext();
  return ctx.app.focus.createController(ctx.currentScope);
}
