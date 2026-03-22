import { App, FocusManager, type FocusScope, DEFAULT_MOUNT_OPTIONS, type RuntimeContext, Renderer, EventDispatcher } from "../src/core/runtime.ts";
import type { Node } from "../src/core/runtime.ts";
import type { Accessor, Setter } from "../src/core/signals.ts";
import type { LayoutResult } from "../src/core/layout.ts";

interface HoverState {
  currentNode: Node | null;
}

/**
 * Create a minimal App instance for unit testing.
 * Skips terminal setup, input parsing, and signal handlers.
 */
export function createTestApp(root: Node, overrides?: {
  focusedNode?: Accessor<Node | null>;
  setFocusedNode?: Setter<Node | null>;
  rootScope?: FocusScope;
  layoutResult?: LayoutResult | null;
  hoverState?: HoverState;
  terminalFocused?: boolean;
}): App {
  const app = Object.create(App.prototype) as App;

  const focus = new FocusManager();
  (app as unknown as Record<string, unknown>).focus = focus;

  const renderer = Object.create(Renderer.prototype) as Renderer;
  renderer.layoutResult = overrides?.layoutResult ?? {
    x: 0, y: 0, screenX: 0, screenY: 0,
    width: 80, height: 24, children: [],
  };
  (renderer as unknown as Record<string, unknown>).active = false;
  (renderer as unknown as Record<string, unknown>).scheduled = false;
  (renderer as unknown as Record<string, unknown>).lastFlushTime = 0;
  (renderer as unknown as Record<string, unknown>).timeout = null;
  (renderer as unknown as Record<string, unknown>).stdout = process.stdout;
  (renderer as unknown as Record<string, unknown>).fpsLimit = 0;
  (renderer as unknown as Record<string, unknown>).relayoutScheduled = false;
  (app as unknown as Record<string, unknown>).renderer = renderer;

  const events = new EventDispatcher(
    focus,
    () => app.root,
    () => renderer.layoutResult,
  );
  if (overrides?.hoverState) {
    (events as unknown as Record<string, unknown>).hoverState = overrides.hoverState;
  }
  if (overrides?.terminalFocused !== undefined) {
    events.terminalFocused = overrides.terminalFocused;
  }
  (app as unknown as Record<string, unknown>).events = events;

  app.root = root;
  app.rootDispose = () => {};
  app.options = { ...DEFAULT_MOUNT_OPTIONS, fpsLimit: 0 };
  app.stdin = process.stdin;
  app.inputParser = { destroy: () => {} };
  app.pendingPortalAttachments = [];
  (app as unknown as Record<string, unknown>).unmounted = false;
  (app as unknown as Record<string, unknown>).removeSignalHandlers = null;

  return app;
}

/**
 * Set the active runtime context. Test-only — production code
 * uses App.withContext() which saves/restores automatically.
 */
export function setActiveContext(ctx: RuntimeContext | null): void {
  (App as unknown as Record<string, unknown>).activeContext = ctx;
}
