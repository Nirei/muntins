import { Box } from "../components/Box.js";
import { ScrollArea } from "../components/ScrollArea.js";
import { createInputParser } from "../input.js";
import { enterTuiMode, exitTuiMode } from "../render.js";
import { batch, createRoot } from "../signals.js";
import { styleFallback } from "../theme.js";
import { EventDispatcher } from "./EventDispatcher.js";
import { FocusManager } from "./FocusManager.js";
import { Renderer } from "./Renderer.js";
import { getActiveContext, getContext, withContext, } from "./context.js";
/**
 * Default values for mount options.
 */
export const DEFAULT_MOUNT_OPTIONS = {
    stdout: process.stdout,
    stdin: process.stdin,
    mouse: false,
    alternateScreen: true,
    fpsLimit: 240,
    scroll: true,
};
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
    static getActiveContext = getActiveContext;
    static getContext = getContext;
    static withContext = withContext;
    static mount(component, options) {
        return new App(component, options);
    }
    root;
    rootDispose;
    options;
    stdin;
    inputParser;
    focus;
    renderer;
    events;
    pendingPortalAttachments = [];
    // Backward-compat accessors during migration
    get focusedNode() {
        return this.focus.focusedNode;
    }
    get setFocusedNode() {
        return (node) => this.focus.setFocus(node);
    }
    get rootScope() {
        return this.focus.rootScope;
    }
    get layoutResult() {
        return this.renderer.layoutResult;
    }
    set layoutResult(value) {
        this.renderer.layoutResult = value;
    }
    get hoverState() {
        return this.events.getHoverState();
    }
    set hoverState(value) {
        this.events.setHoverState(value);
    }
    get terminalFocused() {
        return this.events.terminalFocused;
    }
    set terminalFocused(value) {
        this.events.terminalFocused = value;
    }
    unmounted = false;
    removeSignalHandlers = null;
    constructor(component, options) {
        const opts = {
            ...DEFAULT_MOUNT_OPTIONS,
            ...options,
        };
        const { stdin, stdout } = opts;
        if (!stdout.isTTY) {
            throw new Error("Cannot mount: stdout is not a TTY.");
        }
        this.options = opts;
        this.stdin = stdin;
        this.focus = new FocusManager();
        this.renderer = new Renderer(stdout, opts.fpsLimit, () => this.root);
        this.events = new EventDispatcher(this.focus, () => this.root, () => this.renderer.layoutResult);
        enterTuiMode(stdout, { alternateScreen: opts.alternateScreen });
        try {
            this.inputParser = createInputParser(stdin, stdout, (event) => this.handleEvent(event), { mouse: opts.mouse });
            const ctx = {
                app: this,
                currentScope: this.focus.rootScope,
            };
            this.rootDispose = createRoot((dispose) => {
                let contentNode = App.withContext(ctx, () => component());
                if (opts.scroll) {
                    const origStyle = contentNode.style;
                    contentNode.style = () => {
                        const base = typeof origStyle === "function" ? origStyle() : origStyle;
                        if (base.height === "auto") {
                            return {
                                ...base,
                                minHeight: Math.max(typeof base.minHeight === "number" ? base.minHeight : 0, stdout.rows),
                            };
                        }
                        return base;
                    };
                    contentNode = App.withContext(ctx, () => ScrollArea({
                        height: () => stdout.rows,
                        minHeight: () => stdout.rows,
                        focusable: false,
                        children: [contentNode],
                    }));
                }
                const contentStyle = contentNode.style;
                contentNode.style = () => {
                    const base = typeof contentStyle === "function" ? contentStyle() : contentStyle;
                    return { ...base, flexGrow: 1 };
                };
                this.root = App.withContext(ctx, () => Box({
                    ...styleFallback(undefined, "root"),
                    flexDirection: "column",
                    children: [contentNode],
                }));
                const rootChildren = this.root.children ?? [];
                if (!this.root.children)
                    this.root.children = rootChildren;
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
        catch (error) {
            this.inputParser?.destroy();
            exitTuiMode(stdout, { alternateScreen: opts.alternateScreen });
            throw error;
        }
    }
    unmount() {
        if (this.unmounted)
            return;
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
    cleanupSubtreeState(subtreeRoot) {
        this.focus.cleanupFocus(subtreeRoot);
        this.events.cleanupHover(subtreeRoot);
    }
    scheduleFlush() {
        this.renderer.scheduleFlush();
    }
    scheduleRelayout() {
        this.renderer.scheduleRelayout();
    }
    /**
     * Handle incoming input events (Mediator coordination).
     * Resize → renderer, others → event dispatcher + schedule repaint.
     */
    handleEvent(event) {
        if (event.type === "resize") {
            this.renderer.handleResize(event.width, event.height);
            return;
        }
        batch(() => {
            this.events.routeEvent(event);
        });
        this.renderer.scheduleFlush();
    }
    setupSignalHandlers() {
        const handleExit = () => this.unmount();
        const rethrowSignal = (signal) => {
            if (this.removeSignalHandlers) {
                this.removeSignalHandlers();
            }
            this.unmount();
            process.kill(process.pid, signal);
        };
        const sigintHandler = () => rethrowSignal("SIGINT");
        const sigtermHandler = () => rethrowSignal("SIGTERM");
        process.on("exit", handleExit);
        process.on("SIGINT", sigintHandler);
        process.on("SIGTERM", sigtermHandler);
        this.removeSignalHandlers = () => {
            process.off("exit", handleExit);
            process.off("SIGINT", sigintHandler);
            process.off("SIGTERM", sigtermHandler);
        };
    }
}
//# sourceMappingURL=App.js.map