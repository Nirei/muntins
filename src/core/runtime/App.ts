import { Box } from "../components/Box.ts";
import { ScrollArea } from "../components/ScrollArea.ts";
import { type InputEvent, createInputParser } from "../input.ts";
import type { LayoutResult } from "../layout.ts";
import { enterTuiMode, exitTuiMode } from "../render.ts";
import type { Accessor, Setter } from "../signals.ts";
import { batch, createRoot } from "../signals.ts";
import { styleFallback } from "../theme.ts";
import { EventDispatcher } from "./EventDispatcher.ts";
import { FocusManager, type FocusScope } from "./FocusManager.ts";
import type { Node } from "./Node.ts";
import { Renderer } from "./Renderer.ts";

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
  /** Wrap root in a ScrollArea so content scrolls when it exceeds the terminal. Default: true. */
  scroll?: boolean;
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
  scroll: true,
};

/**
 * Runtime context threaded through component construction via closures.
 * Supports multiple concurrent mount() calls.
 */
export interface RuntimeContext {
  app: App;
  currentScope: FocusScope;
}

/**
 * A mounted terminal UI application.
 *
 * Owns the component tree and coordinates subsystems (Mediator pattern):
 * - FocusManager: focus state and navigation
 * - Renderer: render cycle (layout, bind, paint, flush)
 * - EventDispatcher: event routing and hover tracking
 *
 * Created via `App.mount()`.
 */
export class App {
  private static activeContext: RuntimeContext | null = null;

  static getActiveContext(): RuntimeContext | null {
    return App.activeContext;
  }

  static withContext<T>(ctx: RuntimeContext, fn: () => T): T {
    const prev = App.activeContext;
    App.activeContext = ctx;
    try {
      return fn();
    } finally {
      App.activeContext = prev;
    }
  }

  static getContext(): RuntimeContext {
    if (!App.activeContext) {
      throw new Error("must be called within a mounted component");
    }
    return App.activeContext;
  }

  static mount(component: () => Node, options?: MountOptions): App {
    return new App(component, options);
  }

  root!: Node;
  rootDispose!: () => void;
  options!: Required<MountOptions>;
  stdin!: NodeJS.ReadStream;
  inputParser!: { destroy: () => void };
  readonly focus: FocusManager;
  readonly renderer: Renderer;
  readonly events: EventDispatcher;
  pendingPortalAttachments: Node[][] = [];

  // Backward-compat accessors during migration
  get focusedNode(): Accessor<Node | null> {
    return this.focus.focusedNode;
  }
  get setFocusedNode(): Setter<Node | null> {
    return (this.focus as unknown as { setFocusedNode: Setter<Node | null> })
      .setFocusedNode;
  }
  get rootScope(): FocusScope {
    return this.focus.rootScope;
  }
  get layoutResult(): LayoutResult | null {
    return this.renderer.layoutResult;
  }
  set layoutResult(value: LayoutResult | null) {
    this.renderer.layoutResult = value;
  }
  get hoverState() {
    return (
      this.events as unknown as Record<string, { currentNode: Node | null }>
    ).hoverState;
  }
  set hoverState(value: { currentNode: Node | null }) {
    (
      this.events as unknown as Record<string, { currentNode: Node | null }>
    ).hoverState = value;
  }
  get terminalFocused(): boolean {
    return this.events.terminalFocused;
  }
  set terminalFocused(value: boolean) {
    this.events.terminalFocused = value;
  }

  private unmounted = false;
  private removeSignalHandlers: (() => void) | null = null;

  constructor(component: () => Node, options?: MountOptions) {
    const opts: Required<MountOptions> = {
      ...DEFAULT_MOUNT_OPTIONS,
      ...options,
    };
    const { stdin, stdout } = opts;

    this.options = opts;
    this.stdin = stdin;
    this.focus = new FocusManager();
    this.renderer = new Renderer(stdout, opts.fpsLimit, () => this.root);
    this.events = new EventDispatcher(
      this.focus,
      () => this.root,
      () => this.renderer.layoutResult,
    );

    enterTuiMode(stdout, { alternateScreen: opts.alternateScreen });

    this.inputParser = createInputParser(
      stdin,
      stdout,
      (event) => this.handleEvent(event),
      { mouse: opts.mouse },
    );

    const ctx: RuntimeContext = {
      app: this,
      currentScope: this.focus.rootScope,
    };

    this.rootDispose = createRoot((dispose) => {
      let contentNode = App.withContext(ctx, () => component());

      if (opts.scroll) {
        // Inject minHeight so the user's root fills the viewport height.
        // Without this, intermediate wrappers (e.g. TabFocus) that lack
        // flexGrow won't stretch vertically, breaking centering.
        // Only when the user hasn't set an explicit height.
        const origStyle = contentNode.style;
        contentNode.style = () => {
          const base =
            typeof origStyle === "function" ? origStyle() : origStyle;
          if (base.height === "auto") {
            return {
              ...base,
              minHeight: Math.max(base.minHeight, stdout.rows),
            };
          }
          return base;
        };

        contentNode = App.withContext(ctx, () =>
          ScrollArea({
            height: () => stdout.rows,
            minHeight: () => stdout.rows,
            focusable: false,
            children: [contentNode],
          }),
        );
      }

      // Ensure content fills the root Box (previously the content WAS the
      // layout root and received full terminal dimensions automatically).
      const contentStyle = contentNode.style;
      contentNode.style = () => {
        const base =
          typeof contentStyle === "function" ? contentStyle() : contentStyle;
        return { ...base, flexGrow: 1 };
      };

      this.root = App.withContext(ctx, () =>
        Box({
          ...styleFallback(undefined, "root"),
          flexDirection: "column",
          children: [contentNode],
        }),
      );

      // Attach pending portal children to root
      const rootChildren = (this.root.children as Node[]) ?? [];
      if (!this.root.children) this.root.children = rootChildren;
      for (const children of this.pendingPortalAttachments) {
        rootChildren.push(...children);
        for (const child of children) {
          child._parent = this.root;
        }
      }
      this.pendingPortalAttachments.length = 0;

      this.focus.initialize(this.root);
      this.renderer.bind(this.root);

      return dispose;
    });

    this.renderer.flush();
    this.setupSignalHandlers();
  }

  unmount(): void {
    if (this.unmounted) return;
    this.unmounted = true;

    this.renderer.shutdown();

    if (this.removeSignalHandlers) {
      this.removeSignalHandlers();
    }

    this.rootDispose();
    this.root.clearLayoutSignals();
    this.inputParser.destroy();
    exitTuiMode(this.options.stdout, {
      alternateScreen: this.options.alternateScreen,
    });
  }

  /**
   * Clean up focus and hover state when a subtree is being disposed.
   * Facade that coordinates cleanup across subsystems.
   */
  cleanupSubtreeState(subtreeRoot: Node): void {
    this.focus.cleanupFocus(subtreeRoot);
    this.events.cleanupHover(subtreeRoot);
  }

  scheduleFlush(): void {
    this.renderer.scheduleFlush();
  }

  scheduleRelayout(): void {
    this.renderer.scheduleRelayout();
  }

  /**
   * Handle incoming input events (Mediator coordination).
   * Resize → renderer, others → event dispatcher + schedule repaint.
   */
  private handleEvent(event: InputEvent): void {
    if (event.type === "resize") {
      this.renderer.handleResize(event.width, event.height);
      return;
    }

    batch(() => {
      this.events.routeEvent(event);
    });

    this.renderer.scheduleFlush();
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
