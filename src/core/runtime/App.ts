import { Buffer } from "../buffer.ts";
import type { InputEvent } from "../input.ts";
import { createInputParser } from "../input.ts";
import { computeLayout, type LayoutResult } from "../layout.ts";
import type { ClipRect, InheritedStyle } from "../render.ts";
import {
  DEFAULT_INHERITED_STYLE,
  enterTuiMode,
  exitTuiMode,
  flushFrame,
} from "../render.ts";
import type { Accessor, Setter } from "../signals.ts";
import { batch, createRoot, createSignal } from "../signals.ts";
import { bindNodes, clearSubtreeLayoutSignals, updateAllLayoutSignals } from "./binding.ts";
import { routeEvent } from "./events.ts";
import { type FocusScope, initializeFocus } from "./focus.ts";
import type { Node } from "./Node.ts";
import { paintTree } from "./paint.ts";
import { nodeToLayoutNode } from "./tree.ts";

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
 * State for throttled buffer flushing.
 */
export interface FlushState {
  active: boolean;
  scheduled: boolean;
  lastFlushTime: number;
  timeout: ReturnType<typeof setTimeout> | null;
  buffer: Buffer;
  stdout: NodeJS.WriteStream;
  fpsLimit: number;
}

interface HoverState {
  currentNode: Node | null;
}

/**
 * Runtime context threaded through component construction via closures.
 * Supports multiple concurrent mount() calls.
 * @internal Exported for testing purposes.
 */
export interface RuntimeContext {
  app: App;
  currentScope: FocusScope;
}

/**
 * A mounted terminal UI application.
 *
 * Owns the component tree, rendering pipeline, input handling, and focus
 * management. Created by `mount()` or `new App()`.
 *
 * @example
 * ```ts
 * const app = mount(() => Box({ children: [Text({ content: "hello" })] }));
 * // later...
 * app.unmount();
 * ```
 */
export class App {
  private static activeContext: RuntimeContext | null = null;

  /** Get the current active context, or null if outside a mount. */
  static getActiveContext(): RuntimeContext | null {
    return App.activeContext;
  }

  /**
   * Execute a function within a runtime context.
   * The context is set during the callback and restored after.
   */
  static withContext<T>(ctx: RuntimeContext, fn: () => T): T {
    const prev = App.activeContext;
    App.activeContext = ctx;
    try {
      return fn();
    } finally {
      App.activeContext = prev;
    }
  }

  /**
   * Get the current runtime context.
   * Throws if called outside of a mounted component.
   */
  static getContext(): RuntimeContext {
    if (!App.activeContext) {
      throw new Error("must be called within a mounted component");
    }
    return App.activeContext;
  }

  /**
   * Mount an application to the terminal.
   *
   * Creates the component tree, sets up input handling, and starts the
   * render loop. Returns an App instance with an unmount() method.
   *
   * @param component - Function that returns the root node
   * @param options - Optional mount configuration
   * @returns App instance
   */
  static mount(component: () => Node, options?: MountOptions): App {
    return new App(component, options);
  }

  root!: Node;
  rootDispose!: () => void;
  layoutResult: LayoutResult | null = null;
  flushState!: FlushState;
  relayoutScheduled = false;
  options!: Required<MountOptions>;
  stdin!: NodeJS.ReadStream;
  inputParser!: { destroy: () => void };
  focusedNode!: Accessor<Node | null>;
  setFocusedNode!: Setter<Node | null>;
  rootScope!: FocusScope;
  hoverState: HoverState = { currentNode: null };
  terminalFocused = true;
  pendingPortalAttachments: Node[][] = [];

  private unmounted = false;
  private removeSignalHandlers: (() => void) | null = null;

  /**
   * Mount an application to the terminal.
   *
   * Creates the component tree, sets up input handling, and starts the
   * render loop.
   *
   * @param component - Function that returns the root node
   * @param options - Optional mount configuration
   */
  constructor(component: () => Node, options?: MountOptions) {
    const opts: Required<MountOptions> = { ...DEFAULT_MOUNT_OPTIONS, ...options };
    const { stdin, stdout } = opts;

    const [focusedNode, setFocusedNode] = createSignal<Node | null>(null);

    const buffer = new Buffer(stdout.columns, stdout.rows);

    this.options = opts;
    this.stdin = stdin;
    this.focusedNode = focusedNode;
    this.setFocusedNode = setFocusedNode;
    this.rootScope = {
      parent: null,
      focusableNodes: [],
      focusedIndex: -1,
      trap: false,
    };
    this.flushState = {
      active: true,
      scheduled: false,
      lastFlushTime: 0,
      timeout: null,
      buffer,
      stdout,
      fpsLimit: opts.fpsLimit,
    };

    enterTuiMode(stdout, { alternateScreen: opts.alternateScreen });

    this.inputParser = createInputParser(
      stdin,
      stdout,
      (event) => this.handleEvent(event),
      { mouse: opts.mouse },
    );

    const ctx: RuntimeContext = {
      app: this,
      currentScope: this.rootScope,
    };

    this.rootDispose = createRoot((dispose) => {
      this.root = App.withContext(ctx, () => component());

      // Attach pending portal children to root
      for (const children of this.pendingPortalAttachments) {
        if (!this.root.children) this.root.children = [];
        this.root.children.push(...children);
        for (const child of children) {
          child._parent = this.root;
        }
      }
      this.pendingPortalAttachments.length = 0;

      initializeFocus(this);

      buffer.clear();
      const layoutNode = nodeToLayoutNode(this.root);
      const layoutResult = computeLayout(layoutNode, stdout.columns, stdout.rows);
      this.layoutResult = layoutResult;

      const rootClipAccessor: Accessor<ClipRect> = () => ({
        x: 0,
        y: 0,
        width: stdout.columns,
        height: stdout.rows,
      });
      const rootInheritedAccessor: Accessor<InheritedStyle> = () =>
        DEFAULT_INHERITED_STYLE;

      bindNodes(
        this.root,
        layoutResult,
        rootInheritedAccessor,
        rootClipAccessor,
      );

      return dispose;
    });

    this.doFlush();
    this.setupSignalHandlers();
  }

  /** Clean up the application and restore the terminal. */
  unmount(): void {
    if (this.unmounted) return;
    this.unmounted = true;

    this.flushState.active = false;

    if (this.removeSignalHandlers) {
      this.removeSignalHandlers();
    }

    if (this.flushState.timeout) {
      clearTimeout(this.flushState.timeout);
      this.flushState.timeout = null;
    }

    this.rootDispose();
    clearSubtreeLayoutSignals(this.root);
    this.inputParser.destroy();
    exitTuiMode(this.options.stdout, { alternateScreen: this.options.alternateScreen });
  }

  /** Schedule a flush to repaint the screen. */
  scheduleFlush(): void {
    const fs = this.flushState;
    if (fs.scheduled) return;
    fs.scheduled = true;

    const now = performance.now();
    const elapsed = now - fs.lastFlushTime;
    const frameInterval = fs.fpsLimit > 0 ? 1000 / fs.fpsLimit : 0;

    if (frameInterval === 0 || elapsed >= frameInterval) {
      queueMicrotask(() => this.doFlush());
    } else {
      const remaining = frameInterval - elapsed;
      fs.timeout = setTimeout(() => this.doFlush(), remaining);
    }
  }

  /** Schedule a relayout for when Show/For create new children. */
  scheduleRelayout(): void {
    if (this.relayoutScheduled) return;
    this.relayoutScheduled = true;

    queueMicrotask(() => this.doRelayout());
  }

  private doFlush(): void {
    const fs = this.flushState;
    if (!fs.active) return;
    fs.scheduled = false;
    fs.lastFlushTime = performance.now();

    if (fs.timeout) {
      clearTimeout(fs.timeout);
      fs.timeout = null;
    }

    const layoutNode = nodeToLayoutNode(this.root);
    const layoutResult = computeLayout(
      layoutNode,
      fs.stdout.columns,
      fs.stdout.rows,
    );
    this.layoutResult = layoutResult;

    updateAllLayoutSignals(this.root, layoutResult);

    fs.buffer.clear();

    const rootClip: ClipRect = {
      x: 0,
      y: 0,
      width: fs.stdout.columns,
      height: fs.stdout.rows,
    };
    paintTree(
      this.root,
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

  private doRelayout(): void {
    this.relayoutScheduled = false;

    const { root, flushState } = this;
    const { stdout } = flushState;

    const layoutNode = nodeToLayoutNode(root);
    const layoutResult = computeLayout(layoutNode, stdout.columns, stdout.rows);
    this.layoutResult = layoutResult;

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

    this.scheduleFlush();
  }

  private handleEvent(event: InputEvent): void {
    if (event.type === "resize") {
      this.flushState.buffer.resize(event.width, event.height);

      const layoutNode = nodeToLayoutNode(this.root);
      const layoutResult = computeLayout(layoutNode, event.width, event.height);
      this.layoutResult = layoutResult;

      updateAllLayoutSignals(this.root, layoutResult);

      this.scheduleFlush();
      return;
    }

    batch(() => {
      routeEvent(this, event);
    });

    this.scheduleFlush();
  }

  private setupSignalHandlers(): void {
    const handleExit = () => this.unmount();

    const handleSignal = (signal: NodeJS.Signals) => {
      this.unmount();
      process.exit(signal === "SIGINT" ? 130 : 143);
    };

    const handleUncaughtException = (err: Error) => {
      this.unmount();
      console.error(err);
      process.exit(1);
    };

    const sigintHandler = () => handleSignal("SIGINT");
    const sigtermHandler = () => handleSignal("SIGTERM");

    process.on("exit", handleExit);
    process.on("SIGINT", sigintHandler);
    process.on("SIGTERM", sigtermHandler);
    process.on("uncaughtException", handleUncaughtException);

    this.removeSignalHandlers = () => {
      process.off("exit", handleExit);
      process.off("SIGINT", sigintHandler);
      process.off("SIGTERM", sigtermHandler);
      process.off("uncaughtException", handleUncaughtException);
    };
  }
}

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
