import type { FocusScope } from "./FocusManager.ts";

export interface RuntimeContext {
  app: import("./App.ts").App;
  currentScope: FocusScope;
}

let activeContext: RuntimeContext | null = null;

export function getActiveContext(): RuntimeContext | null {
  return activeContext;
}

export function getContext(): RuntimeContext {
  if (!activeContext) {
    throw new Error("must be called within a mounted component");
  }
  return activeContext;
}

export function withContext<T>(ctx: RuntimeContext, fn: () => T): T {
  const prev = activeContext;
  activeContext = ctx;
  try {
    return fn();
  } finally {
    activeContext = prev;
  }
}

export function _setActiveContext(ctx: RuntimeContext | null): void {
  activeContext = ctx;
}
