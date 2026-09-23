import type { InputEvent } from "../input.ts";
import type { LayoutResult } from "../layout.ts";
import type { FocusManager } from "./FocusManager.ts";
import type { Node } from "./Node.ts";
/**
 * Public view of hover state exposed to consumers.
 * The `currentNode` field is read-only through this interface.
 */
export interface HoverStateView {
    readonly currentNode: Node | null;
}
/**
 * Routes input events to the correct node handlers and tracks hover state.
 *
 * Dependencies are injected via constructor (Dependency Inversion).
 * Uses only a narrow slice of FocusManager (Interface Segregation):
 * focusedNode and focusNode.
 */
export declare class EventDispatcher {
    terminalFocused: boolean;
    private hoverState;
    private readonly focusManager;
    private readonly getRoot;
    private readonly getLayoutResult;
    /**
     * Get the current hover state. Returns a readonly view.
     * Used by App's backward-compat accessor.
     */
    getHoverState(): HoverStateView;
    /**
     * Set the hover state. Accepts a partial update for the currentNode.
     * Used by App's backward-compat accessor.
     */
    setHoverState(state: {
        currentNode: Node | null;
    }): void;
    constructor(focusManager: FocusManager, getRoot: () => Node, getLayoutResult: () => LayoutResult | null);
    /** Route a non-resize input event to the appropriate handler. */
    routeEvent(event: InputEvent): void;
    /** Clear hover state if the hovered node is in the disposed subtree. */
    cleanupHover(subtreeRoot: Node): void;
    private routeKeyEvent;
    private routeMouseEvent;
    private routeScrollEvent;
    private routePasteEvent;
    private routeFocusEvent;
}
//# sourceMappingURL=EventDispatcher.d.ts.map