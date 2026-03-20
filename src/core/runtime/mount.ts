import { Buffer } from "../buffer.ts";
import type { InputEvent } from "../input.ts";
import { createInputParser } from "../input.ts";
import { computeLayout } from "../layout.ts";
import type { ClipRect, InheritedStyle } from "../render.ts";
import {
  DEFAULT_INHERITED_STYLE,
  enterTuiMode,
  exitTuiMode,
  flushFrame,
} from "../render.ts";
import type { Accessor } from "../signals.ts";
import { batch, createRoot, createSignal } from "../signals.ts";
import {
  type App,
  DEFAULT_MOUNT_OPTIONS,
  type MountOptions,
  type RuntimeContext,
  type RuntimeState,
  pendingPortalAttachments,
  withContext,
} from "./App.ts";
import { bindNodes, clearSubtreeLayoutSignals, updateAllLayoutSignals } from "./binding.ts";
import { routeEvent } from "./events.ts";
import { initializeFocus } from "./focus.ts";
import type { Node } from "./Node.ts";
import { paintTree } from "./paint.ts";
import { nodeToLayoutNode } from "./tree.ts";

/**
 * Layout information for reactive layout access via refs.
 * All values are integers representing terminal cells.
 */
export interface LayoutInfo {
  /** Position relative to parent */
  x: number;
  y: number;
  /** Computed width in cells */
  width: number;
  /** Computed height in cells */
  height: number;
  /** Absolute X position from screen origin */
  screenX: number;
  /** Absolute Y position from screen origin */
  screenY: number;
}

/**
 * Performs the actual buffer flush to terminal.
 * Clears the back buffer, recomputes layout, paints the full tree, then flushes.
 */
function doFlush(state: RuntimeState): void {
  const fs = state.flushState;
  fs.scheduled = false;
  fs.lastFlushTime = performance.now();

  if (fs.timeout) {
    clearTimeout(fs.timeout);
    fs.timeout = null;
  }

  // Recompute layout - signal-driven content may have changed sizes
  const layoutNode = nodeToLayoutNode(state.root);
  const layoutResult = computeLayout(
    layoutNode,
    fs.stdout.columns,
    fs.stdout.rows,
  );
  state.layoutResult = layoutResult;

  updateAllLayoutSignals(state.root, layoutResult);

  fs.buffer.clear();

  const rootClip: ClipRect = {
    x: 0,
    y: 0,
    width: fs.stdout.columns,
    height: fs.stdout.rows,
  };
  paintTree(
    state.root,
    layoutResult,
    fs.buffer,
    DEFAULT_INHERITED_STYLE,
    rootClip,
    fs.stdout,
  );

  const output = fs.buffer.flush();
  if (output.length > 0) {
    flushFrame(fs.stdout, output);
  }
}

/**
 * Creates a closure for throttled flush scheduling.
 */
function createScheduleFlush(state: RuntimeState): () => void {
  return () => {
    const fs = state.flushState;
    if (fs.scheduled) return;
    fs.scheduled = true;

    const now = performance.now();
    const elapsed = now - fs.lastFlushTime;
    const frameInterval = fs.fpsLimit > 0 ? 1000 / fs.fpsLimit : 0;

    if (frameInterval === 0 || elapsed >= frameInterval) {
      queueMicrotask(() => doFlush(state));
    } else {
      const remaining = frameInterval - elapsed;
      fs.timeout = setTimeout(() => doFlush(state), remaining);
    }
  };
}

/**
 * Performs relayout and binds any new nodes.
 */
function doRelayout(
  state: RuntimeState,
  scheduleFlush: () => void,
  scheduleRelayout: () => void,
): void {
  state.relayoutScheduled = false;

  const { root, flushState } = state;
  const { stdout } = flushState;

  const layoutNode = nodeToLayoutNode(root);
  const layoutResult = computeLayout(layoutNode, stdout.columns, stdout.rows);
  state.layoutResult = layoutResult;

  updateAllLayoutSignals(root, layoutResult);

  const rootClipAccessor: Accessor<ClipRect> = () => ({
    x: 0,
    y: 0,
    width: stdout.columns,
    height: stdout.rows,
  });
  const rootInheritedAccessor: Accessor<InheritedStyle> = () =>
    DEFAULT_INHERITED_STYLE;

  bindNodes(
    root,
    layoutResult,
    rootInheritedAccessor,
    rootClipAccessor,
    true,
  );

  scheduleFlush();
}

/**
 * Creates a closure for relayout scheduling.
 */
function createScheduleRelayout(
  state: RuntimeState,
  scheduleFlush: () => void,
): () => void {
  const scheduleRelayout = (): void => {
    if (state.relayoutScheduled) return;
    state.relayoutScheduled = true;

    queueMicrotask(() => {
      doRelayout(state, scheduleFlush, scheduleRelayout);
    });
  };
  return scheduleRelayout;
}

/**
 * Handle incoming input events.
 * Resize events trigger relayout and repaint; others route events.
 */
function handleEvent(
  state: RuntimeState,
  event: InputEvent,
  scheduleFlush: () => void,
): void {
  if (event.type === "resize") {
    state.flushState.buffer.resize(event.width, event.height);

    const layoutNode = nodeToLayoutNode(state.root);
    const layoutResult = computeLayout(layoutNode, event.width, event.height);
    state.layoutResult = layoutResult;

    updateAllLayoutSignals(state.root, layoutResult);

    scheduleFlush();
    return;
  }

  batch(() => {
    routeEvent(state, event);
  });

  scheduleFlush();
}

/**
 * Internal unmount function.
 */
function unmountState(state: RuntimeState, cleanupHandlers?: () => void): void {
  const { options } = state;
  const { stdout } = options;

  if (cleanupHandlers) {
    cleanupHandlers();
  }

  if (state.flushState.timeout) {
    clearTimeout(state.flushState.timeout);
    state.flushState.timeout = null;
  }

  state.rootDispose();
  clearSubtreeLayoutSignals(state.root);
  state.inputParser.destroy();
  exitTuiMode(stdout, { alternateScreen: options.alternateScreen });
}

/**
 * Mount an application to the terminal.
 *
 * Creates the component tree, sets up input handling, and starts the
 * render loop. Returns an App handle with an unmount() method.
 *
 * @param component - Function that returns the root node
 * @param options - Optional mount configuration
 * @returns App handle with unmount() method
 */
export function mount(component: () => Node, options?: MountOptions): App {
  const opts: Required<MountOptions> = { ...DEFAULT_MOUNT_OPTIONS, ...options };
  const { stdin, stdout } = opts;

  const [focusedNode, setFocusedNode] = createSignal<Node | null>(null);

  const buffer = new Buffer(stdout.columns, stdout.rows);

  const state: RuntimeState = {
    root: undefined as unknown as Node,
    rootDispose: undefined as unknown as () => void,
    layoutResult: null,
    flushState: {
      scheduled: false,
      lastFlushTime: 0,
      timeout: null,
      buffer,
      stdout,
      fpsLimit: opts.fpsLimit,
    },
    relayoutScheduled: false,
    inputParser: undefined as unknown as { destroy: () => void },
    options: opts,
    focusedNode,
    setFocusedNode,
    rootScope: {
      parent: null,
      focusableNodes: [],
      focusedIndex: -1,
      trap: false,
    },
    hoverState: { currentNode: null },
    terminalFocused: true,
    stdin,
  };

  const scheduleFlush = createScheduleFlush(state);
  const scheduleRelayout = createScheduleRelayout(state, scheduleFlush);

  enterTuiMode(stdout, { alternateScreen: opts.alternateScreen });

  state.inputParser = createInputParser(
    stdin,
    stdout,
    (event) => handleEvent(state, event, scheduleFlush),
    { mouse: opts.mouse },
  );

  const ctx: RuntimeContext = {
    state,
    currentScope: state.rootScope,
    scheduleRelayout,
    scheduleFlush,
  };

  state.rootDispose = createRoot((dispose) => {
    state.root = withContext(ctx, () => component());

    // Attach pending portal children to root
    for (const children of pendingPortalAttachments) {
      if (!state.root.children) state.root.children = [];
      state.root.children.push(...children);
      for (const child of children) {
        child._parent = state.root;
      }
    }
    pendingPortalAttachments.length = 0;

    initializeFocus(state);

    buffer.clear();
    const layoutNode = nodeToLayoutNode(state.root);
    const layoutResult = computeLayout(layoutNode, stdout.columns, stdout.rows);
    state.layoutResult = layoutResult;

    const rootClipAccessor: Accessor<ClipRect> = () => ({
      x: 0,
      y: 0,
      width: stdout.columns,
      height: stdout.rows,
    });
    const rootInheritedAccessor: Accessor<InheritedStyle> = () =>
      DEFAULT_INHERITED_STYLE;

    bindNodes(
      state.root,
      layoutResult,
      rootInheritedAccessor,
      rootClipAccessor,
    );

    return dispose;
  });

  doFlush(state);

  let unmounted = false;

  const handleExit = () => {
    if (!unmounted) {
      unmounted = true;
      unmountState(state, removeSignalHandlers);
    }
  };

  const handleSignal = (signal: NodeJS.Signals) => {
    handleExit();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };

  const handleUncaughtException = (err: Error) => {
    handleExit();
    console.error(err);
    process.exit(1);
  };

  const sigintHandler = () => handleSignal("SIGINT");
  const sigtermHandler = () => handleSignal("SIGTERM");

  process.on("exit", handleExit);
  process.on("SIGINT", sigintHandler);
  process.on("SIGTERM", sigtermHandler);
  process.on("uncaughtException", handleUncaughtException);

  const removeSignalHandlers = () => {
    process.off("exit", handleExit);
    process.off("SIGINT", sigintHandler);
    process.off("SIGTERM", sigtermHandler);
    process.off("uncaughtException", handleUncaughtException);
  };

  return {
    unmount() {
      if (!unmounted) {
        unmounted = true;
        unmountState(state, removeSignalHandlers);
      }
    },
  };
}
