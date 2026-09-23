import { graphemes } from "../buffer.js";
/**
 * Routes input events to the correct node handlers and tracks hover state.
 *
 * Dependencies are injected via constructor (Dependency Inversion).
 * Uses only a narrow slice of FocusManager (Interface Segregation):
 * focusedNode and focusNode.
 */
export class EventDispatcher {
    terminalFocused = true;
    hoverState = { currentNode: null };
    focusManager;
    getRoot;
    getLayoutResult;
    /**
     * Get the current hover state. Returns a readonly view.
     * Used by App's backward-compat accessor.
     */
    getHoverState() {
        return this.hoverState;
    }
    /**
     * Set the hover state. Accepts a partial update for the currentNode.
     * Used by App's backward-compat accessor.
     */
    setHoverState(state) {
        this.hoverState = state;
    }
    constructor(focusManager, getRoot, getLayoutResult) {
        this.focusManager = focusManager;
        this.getRoot = getRoot;
        this.getLayoutResult = getLayoutResult;
    }
    /** Route a non-resize input event to the appropriate handler. */
    routeEvent(event) {
        switch (event.type) {
            case "key":
                this.routeKeyEvent(event);
                break;
            case "mouse":
                this.routeMouseEvent(event);
                break;
            case "scroll":
                this.routeScrollEvent(event);
                break;
            case "paste":
                this.routePasteEvent(event);
                break;
            case "focus":
                this.routeFocusEvent(event);
                break;
            case "resize":
                break;
        }
    }
    /** Clear hover state if the hovered node is in the disposed subtree. */
    cleanupHover(subtreeRoot) {
        if (this.hoverState.currentNode?.isInSubtree(subtreeRoot)) {
            if (this.hoverState.currentNode.onHover) {
                this.hoverState.currentNode.onHover(false);
            }
            this.hoverState.currentNode = null;
        }
    }
    routeKeyEvent(input) {
        const focused = this.focusManager.focusedNode();
        if (!focused)
            return;
        const path = focused.pathToRoot();
        for (const node of path) {
            if (node.onKeyPress) {
                const event = { ...input, target: node };
                const consumed = node.onKeyPress(event);
                if (consumed === true) {
                    return;
                }
            }
        }
    }
    routeMouseEvent(input) {
        const root = this.getRoot();
        const layoutResult = this.getLayoutResult();
        if (!layoutResult)
            return;
        const target = root.hitTest(layoutResult, input.x, input.y);
        const hoverTarget = target
            ? (target.pathToRoot().find((n) => n.onHover) ?? null)
            : null;
        if (hoverTarget !== this.hoverState.currentNode) {
            if (this.hoverState.currentNode?.onHover) {
                this.hoverState.currentNode.onHover(false);
            }
            if (hoverTarget?.onHover) {
                hoverTarget.onHover(true);
            }
            this.hoverState.currentNode = hoverTarget;
        }
        if (!target)
            return;
        const path = target.pathToRoot();
        switch (input.action) {
            case "press": {
                for (const node of path) {
                    if (node.focusable) {
                        this.focusManager.focusNode(node);
                        break;
                    }
                }
                for (const node of path) {
                    if (node.onMousePress) {
                        const event = { ...input, target: node };
                        node.onMousePress(event);
                        return;
                    }
                }
                break;
            }
            case "release":
                for (const node of path) {
                    if (node.onMouseRelease) {
                        const event = { ...input, target: node };
                        node.onMouseRelease(event);
                        return;
                    }
                }
                break;
            case "move":
                for (const node of path) {
                    if (node.onMouseMove) {
                        const event = { ...input, target: node };
                        node.onMouseMove(event);
                        return;
                    }
                }
                break;
        }
    }
    routeScrollEvent(input) {
        const root = this.getRoot();
        const layoutResult = this.getLayoutResult();
        if (!layoutResult)
            return;
        const target = root.hitTest(layoutResult, input.x, input.y);
        if (!target)
            return;
        const path = target.pathToRoot();
        for (const node of path) {
            if (node.onScroll) {
                const event = { ...input, target: node };
                node.onScroll(event);
                return;
            }
        }
    }
    routePasteEvent(event) {
        const focused = this.focusManager.focusedNode();
        if (!focused)
            return;
        const path = focused.pathToRoot();
        for (const char of graphemes(event.text)) {
            const keyInput = {
                type: "key",
                name: char === "\n" ? "enter" : char,
                char: char,
                ctrl: false,
                alt: false,
                shift: false,
                sequence: char,
            };
            let consumed = false;
            for (const node of path) {
                if (node.onKeyPress) {
                    const keyEvent = { ...keyInput, target: node };
                    const result = node.onKeyPress(keyEvent);
                    if (result === true) {
                        consumed = true;
                        break;
                    }
                }
            }
            if (consumed) {
                return;
            }
        }
    }
    routeFocusEvent(event) {
        this.terminalFocused = event.focused;
    }
}
//# sourceMappingURL=EventDispatcher.js.map