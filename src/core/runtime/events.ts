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
import type { RuntimeState } from "./App.ts";
import { focusNode } from "./focus.ts";
import type { Node } from "./Node.ts";
import { buildPathToRoot, hitTest } from "./tree.ts";

/**
 * Route keyboard input to focused node with bubbling.
 *
 * Events start at the focused node and bubble up to the root.
 * Handlers return true to consume the event and stop bubbling.
 */
function routeKeyEvent(state: RuntimeState, input: KeyInput): void {
  const focused = state.focusedNode();
  if (!focused) return;

  const path = buildPathToRoot(focused);

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

/**
 * Route mouse input to node under cursor, with hover tracking.
 *
 * Updates hover state and dispatches press/release/move events
 * to the target node.
 */
function routeMouseEvent(state: RuntimeState, input: MouseInput): void {
  const { root, layoutResult, hoverState } = state;
  if (!layoutResult) return;

  const target = hitTest(root, layoutResult, input.x, input.y);

  if (target !== hoverState.currentNode) {
    if (hoverState.currentNode?.onHover) {
      hoverState.currentNode.onHover(false);
    }
    if (target?.onHover) {
      target.onHover(true);
    }
    hoverState.currentNode = target;
  }

  if (!target) return;

  const path = buildPathToRoot(target);

  switch (input.action) {
    case "press": {
      // Focus the nearest focusable node (like browser click-to-focus)
      for (const node of path) {
        if (node.focusable) {
          focusNode(state, node);
          break;
        }
      }
      // Then dispatch the press event
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

/**
 * Route scroll input to node under cursor with bubbling.
 *
 * Scroll events bubble up the tree until a handler is found.
 */
function routeScrollEvent(state: RuntimeState, input: ScrollInput): void {
  const { root, layoutResult } = state;
  if (!layoutResult) return;

  const target = hitTest(root, layoutResult, input.x, input.y);
  if (!target) return;

  const path = buildPathToRoot(target);

  for (const node of path) {
    if (node.onScroll) {
      const event: ScrollEvent = { ...input, target: node };
      node.onScroll(event);
      return;
    }
  }
}

/**
 * Route paste event to focused node with bubbling.
 *
 * Paste text is converted to synthetic key events for each grapheme.
 * Events bubble up the tree like regular keyboard events.
 */
function routePasteEvent(state: RuntimeState, event: PasteEvent): void {
  const focused = state.focusedNode();
  if (!focused) return;

  const path = buildPathToRoot(focused);

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

/**
 * Route terminal focus event.
 * Tracks whether the terminal window has focus.
 */
function routeFocusEvent(state: RuntimeState, event: FocusEvent): void {
  state.terminalFocused = event.focused;
}

/**
 * Route an input event to the appropriate handler.
 *
 * Dispatches based on event type:
 * - key: Sent to focused node with bubbling
 * - mouse: Sent to node under cursor
 * - scroll: Sent to node under cursor with bubbling
 * - paste: Converted to key events for focused node
 * - focus: Updates terminal focus state
 * - resize: Handled separately in handleEvent
 */
export function routeEvent(state: RuntimeState, event: InputEvent): void {
  switch (event.type) {
    case "key":
      routeKeyEvent(state, event);
      break;
    case "mouse":
      routeMouseEvent(state, event);
      break;
    case "scroll":
      routeScrollEvent(state, event);
      break;
    case "paste":
      routePasteEvent(state, event);
      break;
    case "focus":
      routeFocusEvent(state, event);
      break;
    case "resize":
      // Handled separately in handleEvent
      break;
  }
}
