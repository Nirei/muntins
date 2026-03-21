import type { LayoutResult } from "../layout.ts";
import type { Accessor, Setter } from "../signals.ts";
import type { Node } from "./Node.ts";

/**
 * Configuration for mounting an application.
 */
export interface MountOptions {
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
  mouse?: boolean;
  alternateScreen?: boolean;
  /** Max renders per second. Default: 240. Set to 0 for unlimited. */
  fpsLimit?: number;
}

/**
 * Default values for mount options.
 */
export const DEFAULT_MOUNT_OPTIONS: Required<MountOptions> = {
  stdout: process.stdout,
  stdin: process.stdin,
  mouse: false,
  alternateScreen: true,
  fpsLimit: 240,
};

/**
 * Focus scope for organizing focusable nodes.
 * Scopes can be nested and optionally trap focus within themselves.
 * @internal Exported for testing purposes.
 */
export interface FocusScope {
  parent: FocusScope | null;
  focusableNodes: Node[];
  focusedIndex: number;
  trap: boolean;
}

/**
 * State for throttled buffer flushing.
 */
export interface FlushState {
  active: boolean;
  scheduled: boolean;
  lastFlushTime: number;
  timeout: ReturnType<typeof setTimeout> | null;
  buffer: import("../buffer.ts").Buffer;
  stdout: NodeJS.WriteStream;
  fpsLimit: number;
}

/**
 * Internal state for a mounted application.
 * @internal Exported for testing purposes.
 */
export interface RuntimeState {
  // Core tree
  root: Node;
  rootDispose: () => void;

  // Layout
  layoutResult: LayoutResult | null;

  // Flush scheduling
  flushState: FlushState;

  // Relayout scheduling
  relayoutScheduled: boolean;

  // Mount options
  options: Required<MountOptions>;

  // Input
  stdin: NodeJS.ReadStream;
  inputParser: { destroy: () => void };

  // Focus (reactive signal for tracking focus changes)
  focusedNode: Accessor<Node | null>;
  setFocusedNode: Setter<Node | null>;
  rootScope: FocusScope;

  // Hover and terminal focus
  hoverState: HoverState;
  terminalFocused: boolean;
}

/**
 * Runtime context threaded through component construction via closures.
 * Supports multiple concurrent mount() calls.
 * @internal Exported for testing purposes.
 */
export interface RuntimeContext {
  state: RuntimeState;
  currentScope: FocusScope;
  /** Schedule a relayout for when Show/For create new children */
  scheduleRelayout: () => void;
  /** Schedule a flush to repaint the screen */
  scheduleFlush: () => void;
}

interface HoverState {
  currentNode: Node | null;
}

/**
 * Returned by mount().
 */
export interface App {
  unmount(): void;
}

// The context is set during mount and captured by component closures
let activeContext: RuntimeContext | null = null;

/**
 * Get the current active context.
 * Exposed for testing purposes only.
 * @internal
 */
export function getActiveContext(): RuntimeContext | null {
  return activeContext;
}

/**
 * Set the active context.
 * Exposed for testing purposes only.
 * @internal
 */
export function setActiveContext(ctx: RuntimeContext | null): void {
  activeContext = ctx;
}

/**
 * Execute a function within a runtime context.
 * The context is set during the callback and restored after.
 */
export function withContext<T>(ctx: RuntimeContext, fn: () => T): T {
  const prev = activeContext;
  activeContext = ctx;
  try {
    return fn();
  } finally {
    activeContext = prev;
  }
}

/**
 * Get the current runtime context.
 * Throws if called outside of a mounted component.
 */
export function getContext(): RuntimeContext {
  if (!activeContext) {
    throw new Error("must be called within a mounted component");
  }
  return activeContext;
}

// Module-level list for portal children created before root exists.
// Cleared after each mount() by setting length = 0.
export const pendingPortalAttachments: Node[][] = [];
