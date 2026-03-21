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
import type { App } from "./App.ts";
import { focusNode } from "./focus.ts";
import type { Node } from "./Node.ts";
import { buildPathToRoot, hitTest } from "./tree.ts";

/**
 * Route keyboard input to focused node with bubbling.
 *
 * Events start at the focused node and bubble up to the root.
 * Handlers return true to consume the event and stop bubbling.
 */
function routeKeyEvent(app: App, input: KeyInput): void {
  const focused = app.focusedNode();
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
function routeMouseEvent(app: App, input: MouseInput): void {
  const { root, layoutResult, hoverState } = app;
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
          focusNode(app, node);
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
function routeScrollEvent(app: App, input: ScrollInput): void {
  const { root, layoutResult } = app;
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
function routePasteEvent(app: App, event: PasteEvent): void {
  const focused = app.focusedNode();
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
function routeFocusEvent(app: App, event: FocusEvent): void {
  app.terminalFocused = event.focused;
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
export function routeEvent(app: App, event: InputEvent): void {
  switch (event.type) {
    case "key":
      routeKeyEvent(app, event);
      break;
    case "mouse":
      routeMouseEvent(app, event);
      break;
    case "scroll":
      routeScrollEvent(app, event);
      break;
    case "paste":
      routePasteEvent(app, event);
      break;
    case "focus":
      routeFocusEvent(app, event);
      break;
    case "resize":
      // Handled separately in handleEvent
      break;
  }
}
