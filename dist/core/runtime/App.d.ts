import type { LayoutResult } from "../layout.ts";
import type { Accessor, Setter } from "../signals.ts";
import { EventDispatcher, type HoverStateView } from "./EventDispatcher.ts";
import { FocusManager, type FocusScope } from "./FocusManager.ts";
import type { Node } from "./Node.ts";
import { Renderer } from "./Renderer.ts";
import { getActiveContext, getContext, withContext } from "./context.ts";
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
export declare const DEFAULT_MOUNT_OPTIONS: Required<MountOptions>;
export type { RuntimeContext } from "./context.ts";
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
export declare class App {
    static getActiveContext: typeof getActiveContext;
    static getContext: typeof getContext;
    static withContext: typeof withContext;
    static mount(component: () => Node, options?: MountOptions): App;
    root: Node;
    rootDispose: () => void;
    options: Required<MountOptions>;
    stdin: NodeJS.ReadStream;
    inputParser: {
        destroy: () => void;
    };
    readonly focus: FocusManager;
    readonly renderer: Renderer;
    readonly events: EventDispatcher;
    pendingPortalAttachments: Node[][];
    get focusedNode(): Accessor<Node | null>;
    get setFocusedNode(): Setter<Node | null>;
    get rootScope(): FocusScope;
    get layoutResult(): LayoutResult | null;
    set layoutResult(value: LayoutResult | null);
    get hoverState(): HoverStateView;
    set hoverState(value: {
        currentNode: Node | null;
    });
    get terminalFocused(): boolean;
    set terminalFocused(value: boolean);
    private unmounted;
    private removeSignalHandlers;
    constructor(component: () => Node, options?: MountOptions);
    unmount(): void;
    /**
     * Clean up focus and hover state when a subtree is being disposed.
     * Facade that coordinates cleanup across subsystems.
     */
    cleanupSubtreeState(subtreeRoot: Node): void;
    scheduleFlush(): void;
    scheduleRelayout(): void;
    /**
     * Handle incoming input events (Mediator coordination).
     * Resize → renderer, others → event dispatcher + schedule repaint.
     */
    private handleEvent;
    private setupSignalHandlers;
}
//# sourceMappingURL=App.d.ts.map