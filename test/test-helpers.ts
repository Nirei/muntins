import { App, type FocusScope, DEFAULT_MOUNT_OPTIONS, type RuntimeContext } from "../src/core/runtime.ts";
import type { Node } from "../src/core/runtime.ts";
import type { Accessor, Setter } from "../src/core/signals.ts";
import { createSignal } from "../src/core/signals.ts";
import type { LayoutResult } from "../src/core/layout.ts";
import type { Buffer } from "../src/core/buffer.ts";

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

  const [focusedNode, setFocusedNode] = createSignal<Node | null>(null);

  app.root = root;
  app.rootDispose = () => {};
  app.layoutResult = overrides?.layoutResult ?? {
    x: 0, y: 0, screenX: 0, screenY: 0,
    width: 80, height: 24, children: [],
  };
  app.flushState = {
    active: false,
    scheduled: false,
    lastFlushTime: 0,
    timeout: null,
    buffer: null as unknown as Buffer,
    stdout: process.stdout,
    fpsLimit: 0,
  };
  app.relayoutScheduled = false;
  app.options = { ...DEFAULT_MOUNT_OPTIONS, fpsLimit: 0 };
  app.stdin = process.stdin;
  app.inputParser = { destroy: () => {} };
  app.focusedNode = overrides?.focusedNode ?? focusedNode;
  app.setFocusedNode = overrides?.setFocusedNode ?? setFocusedNode;
  app.rootScope = overrides?.rootScope ?? {
    parent: null,
    focusableNodes: [],
    focusedIndex: -1,
    trap: false,
  };
  app.hoverState = overrides?.hoverState ?? { currentNode: null };
  app.terminalFocused = overrides?.terminalFocused ?? true;
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
