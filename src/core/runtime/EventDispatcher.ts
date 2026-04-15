import { graphemes } from "../buffer.ts";
import type {
  FocusEvent,
  InputEvent,
  KeyEvent,
  KeyInput,
  MouseEvent,
  MouseInput,
  PasteEvent,
  ScrollEvent,
  ScrollInput,
} from "../input.ts";
import type { LayoutResult } from "../layout.ts";
import type { FocusManager } from "./FocusManager.ts";
import type { Node } from "./Node.ts";

interface HoverState {
  currentNode: Node | null;
}

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
export class EventDispatcher {
  terminalFocused = true;
  private hoverState: HoverState = { currentNode: null };
  private readonly focusManager: FocusManager;
  private readonly getRoot: () => Node;
  private readonly getLayoutResult: () => LayoutResult | null;

  /**
   * Get the current hover state. Returns a readonly view.
   * Used by App's backward-compat accessor.
   */
  getHoverState(): HoverStateView {
    return this.hoverState;
  }

  /**
   * Set the hover state. Accepts a partial update for the currentNode.
   * Used by App's backward-compat accessor.
   */
  setHoverState(state: { currentNode: Node | null }): void {
    this.hoverState = state;
  }

  constructor(
    focusManager: FocusManager,
    getRoot: () => Node,
    getLayoutResult: () => LayoutResult | null,
  ) {
    this.focusManager = focusManager;
    this.getRoot = getRoot;
    this.getLayoutResult = getLayoutResult;
  }

  /** Route a non-resize input event to the appropriate handler. */
  routeEvent(event: InputEvent): void {
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
  cleanupHover(subtreeRoot: Node): void {
    if (this.hoverState.currentNode?.isInSubtree(subtreeRoot)) {
      if (this.hoverState.currentNode.onHover) {
        this.hoverState.currentNode.onHover(false);
      }
      this.hoverState.currentNode = null;
    }
  }

  private routeKeyEvent(input: KeyInput): void {
    const focused = this.focusManager.focusedNode();
    if (!focused) return;

    const path = focused.pathToRoot();

    for (const node of path) {
      if (node.onKeyPress) {
        const event: KeyEvent = { ...input, target: node };
        const consumed = node.onKeyPress(event);
        if (consumed === true) {
          return;
        }
      }
    }
  }

  private routeMouseEvent(input: MouseInput): void {
    const root = this.getRoot();
    const layoutResult = this.getLayoutResult();
    if (!layoutResult) return;

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

    if (!target) return;

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
            const event: MouseEvent = { ...input, target: node };
            node.onMousePress(event);
            return;
          }
        }
        break;
      }
      case "release":
        for (const node of path) {
          if (node.onMouseRelease) {
            const event: MouseEvent = { ...input, target: node };
            node.onMouseRelease(event);
            return;
          }
        }
        break;
      case "move":
        for (const node of path) {
          if (node.onMouseMove) {
            const event: MouseEvent = { ...input, target: node };
            node.onMouseMove(event);
            return;
          }
        }
        break;
    }
  }

  private routeScrollEvent(input: ScrollInput): void {
    const root = this.getRoot();
    const layoutResult = this.getLayoutResult();
    if (!layoutResult) return;

    const target = root.hitTest(layoutResult, input.x, input.y);
    if (!target) return;

    const path = target.pathToRoot();

    for (const node of path) {
      if (node.onScroll) {
        const event: ScrollEvent = { ...input, target: node };
        node.onScroll(event);
        return;
      }
    }
  }

  private routePasteEvent(event: PasteEvent): void {
    const focused = this.focusManager.focusedNode();
    if (!focused) return;

    const path = focused.pathToRoot();

    for (const char of graphemes(event.text)) {
      const keyInput: KeyInput = {
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
          const keyEvent: KeyEvent = { ...keyInput, target: node };
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

  private routeFocusEvent(event: FocusEvent): void {
    this.terminalFocused = event.focused;
  }
}
