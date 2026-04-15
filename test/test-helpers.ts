import type { Buffer as RenderBuffer } from "../src/core/buffer.ts";
import type { LayoutResult } from "../src/core/layout.ts";
import type { LayoutNode } from "../src/core/layout.ts";
import {
  App,
  DEFAULT_MOUNT_OPTIONS,
  EventDispatcher,
  FocusManager,
  type FocusScope,
  Renderer,
  type RuntimeContext,
} from "../src/core/runtime.ts";
import type { Node } from "../src/core/runtime.ts";
import {
  DEFAULT_CLIP,
  DEFAULT_INHERITED_STYLE,
  type InheritedStyle,
  type Rect,
} from "../src/core/runtime.ts";
import type { Accessor, Setter } from "../src/core/signals.ts";

interface HoverState {
  currentNode: Node | null;
}

/**
 * Create a minimal App instance for unit testing.
 * Skips terminal setup, input parsing, and signal handlers.
 */
export function createTestApp(
  root: Node,
  overrides?: {
    focusedNode?: Accessor<Node | null>;
    setFocusedNode?: Setter<Node | null>;
    rootScope?: FocusScope;
    layoutResult?: LayoutResult | null;
    hoverState?: HoverState;
    terminalFocused?: boolean;
  },
): App {
  const app = Object.create(App.prototype) as App;

  const focus = new FocusManager();
  (app as unknown as Record<string, unknown>).focus = focus;

  const renderer = Object.create(Renderer.prototype) as Renderer;
  renderer.layoutResult = overrides?.layoutResult ?? {
    x: 0,
    y: 0,
    screenX: 0,
    screenY: 0,
    width: 80,
    height: 24,
    children: [],
  };
  (renderer as unknown as Record<string, unknown>).active = false;
  (renderer as unknown as Record<string, unknown>).scheduled = false;
  (renderer as unknown as Record<string, unknown>).lastFlushTime = 0;
  (renderer as unknown as Record<string, unknown>).timeout = null;
  (renderer as unknown as Record<string, unknown>).stdout = process.stdout;
  (renderer as unknown as Record<string, unknown>).fpsLimit = 0;
  (renderer as unknown as Record<string, unknown>).needsRebind = false;
  (app as unknown as Record<string, unknown>).renderer = renderer;

  const events = new EventDispatcher(
    focus,
    () => app.root,
    () => renderer.layoutResult,
  );
  if (overrides?.hoverState) {
    events.setHoverState(overrides.hoverState);
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

// ---------------------------------------------------------------------------
// Mock terminal streams
// ---------------------------------------------------------------------------

export interface MockStdin {
  isTTY: boolean;
  setRawMode: () => MockStdin;
  on: (event: string, handler: (...args: unknown[]) => void) => MockStdin;
  off: (event: string, handler: (...args: unknown[]) => void) => MockStdin;
  emit: (event: string, ...args: unknown[]) => boolean;
  resume: () => void;
  pause: () => void;
  listenerCount: (event: string) => number;
  _handlers: Map<string, Array<(...args: unknown[]) => void>>;
}

export interface MockStdout {
  isTTY: boolean;
  columns: number;
  rows: number;
  written: string;
  write: (s: string) => boolean;
  on: (event: string, handler: () => void) => MockStdout;
  off: (event: string, handler: () => void) => MockStdout;
  emit: (event: string) => boolean;
  _handlers: Map<string, Array<() => void>>;
}

export function createMockStdin(): MockStdin {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  const stdin: MockStdin = {
    isTTY: true,
    setRawMode: () => stdin,
    on: (event, handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return stdin;
    },
    off: (event, handler) => {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
      return stdin;
    },
    emit: (event, ...args) => {
      const list = handlers.get(event);
      if (list) {
        for (const h of list) h(...args);
      }
      return true;
    },
    resume: () => {},
    pause: () => {},
    listenerCount: (event) => handlers.get(event)?.length ?? 0,
    _handlers: handlers,
  };

  return stdin;
}

export function createMockStdout(cols = 80, rows = 24): MockStdout {
  const handlers = new Map<string, Array<() => void>>();

  const stdout: MockStdout = {
    isTTY: true,
    columns: cols,
    rows: rows,
    written: "",
    write: function (s: string) {
      this.written += s;
      return true;
    },
    on: (event, handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return stdout;
    },
    off: (event, handler) => {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
      return stdout;
    },
    emit: (event) => {
      const list = handlers.get(event);
      if (list) {
        for (const h of list) h();
      }
      return true;
    },
    _handlers: handlers,
  };

  return stdout;
}

// ---------------------------------------------------------------------------
// Event helpers
// ---------------------------------------------------------------------------

export function keyEvent(
  name: string,
  opts: Partial<{
    char: string;
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    sequence: string;
  }> = {},
) {
  return {
    type: "key" as const,
    name,
    char: opts.char ?? (name.length === 1 ? name : ""),
    ctrl: opts.ctrl ?? false,
    alt: opts.alt ?? false,
    shift: opts.shift ?? false,
    sequence: opts.sequence ?? name,
    target: {},
  };
}

export function scrollEvent(direction: "up" | "down", x = 0, y = 0) {
  return {
    type: "scroll" as const,
    direction,
    x,
    y,
    ctrl: false,
    alt: false,
    shift: false,
    target: {},
  };
}

/** Wait for next render cycle (2 microtasks: relayout + flush). */
export const nextRender = () =>
  new Promise<void>((resolve) => queueMicrotask(() => queueMicrotask(resolve)));

// ---------------------------------------------------------------------------
// Layout / rendering helpers
// ---------------------------------------------------------------------------

export function toLayoutNode(node: Node): LayoutNode {
  const style = typeof node.style === "function" ? node.style() : node.style;
  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : node.children;
  return {
    style,
    measure: node.measure,
    children: children?.map(toLayoutNode),
  };
}

export function paintTree(
  node: Node,
  layout: LayoutResult,
  buffer: RenderBuffer,
  inherited: InheritedStyle,
  clip: Rect,
): void {
  if (node.render) {
    node.render(layout, buffer, inherited, clip);
  }

  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : (node.children ?? []);
  const childLayouts = layout.children ?? [];

  for (let i = 0; i < children.length && i < childLayouts.length; i++) {
    paintTree(children[i], childLayouts[i], buffer, inherited, clip);
  }
}
