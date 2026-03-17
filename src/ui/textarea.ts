// Textarea component - multi-line text input with cursor navigation and editing

import type { Buffer, Color } from "../core/buffer.ts";
import { graphemeDisplayWidth, graphemes } from "../core/buffer.ts";
import { type KeyEvent, isPrintable } from "../core/input.ts";
import { DEFAULT_FLEX_STYLE, type FlexStyle } from "../core/layout.ts";
import type { InheritedStyle, Node, Ref } from "../core/runtime.ts";
import { Box, getActiveContext } from "../core/runtime.ts";
import {
  type Accessor,
  createEffect,
  createSignal,
  resolve,
  untrack,
} from "../core/signals.ts";
import { ScrollArea } from "./scroll-area.ts";

/**
 * Props for the Textarea component.
 */
export interface TextareaProps {
  /** Current textarea value (controlled) */
  value: string | (() => string);

  /** Called when value changes */
  onChange?: (value: string) => void;

  /** Placeholder text when empty */
  placeholder?: string | (() => string);

  /** Width in characters. Default: 40 */
  width?: number | (() => number);

  /**
   * Maximum visible height. When content exceeds this, scrolling is enabled
   * and a scrollbar appears. When undefined, textarea grows with content.
   */
  maxHeight?: number | (() => number);

  /** Disable the textarea */
  disabled?: boolean | (() => boolean);

  /** Focus control */
  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;

  /** Style overrides */
  style?: Partial<FlexStyle>;
}

/**
 * Cursor position in the textarea as line and column.
 */
interface CursorPosition {
  line: number;
  column: number;
}

/**
 * Count graphemes in a string.
 */
function graphemeCount(str: string): number {
  let count = 0;
  for (const _ of graphemes(str)) {
    count++;
  }
  return count;
}

/**
 * Calculate display width of graphemes from start to position.
 */
function displayWidthToPosition(str: string, pos: number): number {
  let width = 0;
  let i = 0;
  for (const grapheme of graphemes(str)) {
    if (i >= pos) break;
    width += graphemeDisplayWidth(grapheme);
    i++;
  }
  return width;
}

/**
 * Convert linear cursor position to line/column.
 */
function posToLineCol(text: string, pos: number): CursorPosition {
  const lines = text.split("\n");
  let remaining = pos;

  for (let line = 0; line < lines.length; line++) {
    const lineLen = graphemeCount(lines[line]);
    if (remaining <= lineLen) {
      return { line, column: remaining };
    }
    remaining -= lineLen + 1; // +1 for newline
  }

  // Past end - return end of last line
  const lastLine = lines.length - 1;
  return { line: lastLine, column: graphemeCount(lines[lastLine]) };
}

/**
 * Convert line/column to linear cursor position.
 */
function lineColToPos(text: string, cursor: CursorPosition): number {
  const lines = text.split("\n");
  let pos = 0;

  for (let i = 0; i < cursor.line && i < lines.length; i++) {
    pos += graphemeCount(lines[i]) + 1; // +1 for newline
  }

  const currentLine = lines[cursor.line] ?? "";
  return pos + Math.min(cursor.column, graphemeCount(currentLine));
}

/**
 * Get total grapheme count including newlines.
 */
function textLength(text: string): number {
  let count = 0;
  for (const _ of graphemes(text)) {
    count++;
  }
  return count;
}

/**
 * Convert grapheme position to character index in the string.
 * This handles the fact that some graphemes may be multi-byte.
 */
function posToCharIndex(text: string, graphemePos: number): number {
  let charIndex = 0;
  let graphemeIndex = 0;

  for (const grapheme of graphemes(text)) {
    if (graphemeIndex >= graphemePos) break;
    charIndex += grapheme.length;
    graphemeIndex++;
  }

  return charIndex;
}

// Modifier constants
const DIM = 2;
const INVERSE = 32;

/**
 * A multi-line text input field with cursor navigation and editing support.
 *
 * The textarea is intentionally unstyled - it renders text with no default
 * border, padding, or colors. Use composition or style overrides to add
 * visual styling.
 *
 * When `maxHeight` is set and content exceeds it, the textarea becomes
 * scrollable with a scrollbar on the right. The view automatically scrolls
 * to keep the cursor visible.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const [message, setMessage] = createSignal("");
 * Textarea({
 *   value: message,
 *   onChange: setMessage,
 *   placeholder: "Enter your message...",
 * });
 *
 * // With max height (scrollable)
 * Textarea({
 *   value: message,
 *   onChange: setMessage,
 *   width: 60,
 *   maxHeight: 10,
 * });
 *
 * // With styling
 * Box({
 *   border: "single",
 *   children: [
 *     Textarea({
 *       value: message,
 *       onChange: setMessage,
 *       width: 60,
 *       maxHeight: 10,
 *     }),
 *   ],
 * });
 * ```
 */
export function Textarea(props: TextareaProps): Node {
  const [cursorPos, setCursorPos] = createSignal(0);
  const [scrollTop, setScrollTop] = createSignal(0);

  const getValue = () => resolve(props.value) ?? "";
  const isDisabled = () => resolve(props.disabled) ?? false;
  const getWidth = () => resolve(props.width) ?? 40;
  const getMaxHeight = () => resolve(props.maxHeight);
  const getPlaceholder = () => resolve(props.placeholder) ?? "";

  // Try to get focus accessor from context (may be null in tests)
  const ctx = getActiveContext();
  const focusedNodeAccessor: Accessor<Node | null> | null =
    ctx?.state.focusedNode ?? null;

  // The focusable node that receives keyboard events
  let focusableNode: Node;

  // Clamp cursor when value changes externally
  createEffect(() => {
    const val = getValue();
    const len = textLength(val);
    if (cursorPos() > len) {
      setCursorPos(len);
    }
  });

  // Auto-scroll to keep cursor visible
  createEffect(() => {
    const maxHeight = getMaxHeight();
    if (maxHeight === undefined) return; // No scrolling without maxHeight

    const val = getValue();
    const cursorLineCol = posToLineCol(val, cursorPos());
    const cursorLine = cursorLineCol.line;
    // Read scrollTop without tracking to avoid circular dependency
    const currentScrollTop = untrack(scrollTop);

    // If cursor is above visible area, scroll up
    if (cursorLine < currentScrollTop) {
      setScrollTop(cursorLine);
    }
    // If cursor is below visible area, scroll down
    else if (cursorLine >= currentScrollTop + maxHeight) {
      setScrollTop(cursorLine - maxHeight + 1);
    }
  });

  // Clamp scrollTop when content shrinks
  createEffect(() => {
    const maxHeight = getMaxHeight();
    if (maxHeight === undefined) return;

    const val = getValue();
    const lineCount = val.length === 0 ? 1 : val.split("\n").length;
    const maxScroll = Math.max(0, lineCount - maxHeight);

    // Read scrollTop without tracking to avoid circular dependency
    if (untrack(scrollTop) > maxScroll) {
      setScrollTop(maxScroll);
    }
  });

  const handleKeyPress = (key: KeyEvent): boolean | undefined => {
    if (isDisabled()) return false;

    const val = getValue();
    const pos = cursorPos();
    const len = textLength(val);
    const lines = val.split("\n");
    const cursorLineCol = posToLineCol(val, pos);

    if (key.name === "left") {
      if (pos > 0) {
        setCursorPos(pos - 1);
      }
      return true;
    }

    if (key.name === "right") {
      if (pos < len) {
        setCursorPos(pos + 1);
      }
      return true;
    }

    if (key.name === "up") {
      if (cursorLineCol.line > 0) {
        // Move to previous line, same column or end of line if shorter
        const prevLineLen = graphemeCount(lines[cursorLineCol.line - 1]);
        const newCol = Math.min(cursorLineCol.column, prevLineLen);
        setCursorPos(
          lineColToPos(val, { line: cursorLineCol.line - 1, column: newCol }),
        );
      }
      return true;
    }

    if (key.name === "down") {
      if (cursorLineCol.line < lines.length - 1) {
        // Move to next line, same column or end of line if shorter
        const nextLineLen = graphemeCount(lines[cursorLineCol.line + 1]);
        const newCol = Math.min(cursorLineCol.column, nextLineLen);
        setCursorPos(
          lineColToPos(val, { line: cursorLineCol.line + 1, column: newCol }),
        );
      }
      return true;
    }

    if (key.name === "home" || (key.ctrl && key.name === "a")) {
      // Move to start of current line
      setCursorPos(lineColToPos(val, { line: cursorLineCol.line, column: 0 }));
      return true;
    }

    if (key.name === "end" || (key.ctrl && key.name === "e")) {
      // Move to end of current line
      const currentLineLen = graphemeCount(lines[cursorLineCol.line]);
      setCursorPos(
        lineColToPos(val, { line: cursorLineCol.line, column: currentLineLen }),
      );
      return true;
    }

    if (key.name === "backspace" && pos > 0) {
      const beforeCursor = val.slice(0, posToCharIndex(val, pos - 1));
      const afterCursor = val.slice(posToCharIndex(val, pos));
      const newVal = beforeCursor + afterCursor;
      props.onChange?.(newVal);
      setCursorPos(pos - 1);
      return true;
    }

    if (key.name === "delete" && pos < len) {
      const beforeCursor = val.slice(0, posToCharIndex(val, pos));
      const afterCursor = val.slice(posToCharIndex(val, pos + 1));
      const newVal = beforeCursor + afterCursor;
      props.onChange?.(newVal);
      return true;
    }

    if (key.ctrl && key.name === "k") {
      // Delete from cursor to end of current line
      const currentLineEnd = lineColToPos(val, {
        line: cursorLineCol.line,
        column: graphemeCount(lines[cursorLineCol.line]),
      });

      if (pos === currentLineEnd && cursorLineCol.line < lines.length - 1) {
        // At end of line, delete the newline (join with next line)
        const beforeCursor = val.slice(0, posToCharIndex(val, pos));
        const afterCursor = val.slice(posToCharIndex(val, pos + 1));
        props.onChange?.(beforeCursor + afterCursor);
      } else {
        // Delete from cursor to end of line
        const beforeCursor = val.slice(0, posToCharIndex(val, pos));
        const afterLine = val.slice(posToCharIndex(val, currentLineEnd));
        props.onChange?.(beforeCursor + afterLine);
      }
      return true;
    }

    if (key.ctrl && key.name === "u") {
      // Delete from start of current line to cursor
      const currentLineStart = lineColToPos(val, {
        line: cursorLineCol.line,
        column: 0,
      });

      const beforeLine = val.slice(0, posToCharIndex(val, currentLineStart));
      const afterCursor = val.slice(posToCharIndex(val, pos));
      props.onChange?.(beforeLine + afterCursor);
      setCursorPos(currentLineStart);
      return true;
    }

    if (key.name === "enter") {
      // Insert newline
      const beforeCursor = val.slice(0, posToCharIndex(val, pos));
      const afterCursor = val.slice(posToCharIndex(val, pos));
      const newVal = `${beforeCursor}\n${afterCursor}`;
      props.onChange?.(newVal);
      setCursorPos(pos + 1);
      return true;
    }

    if (isPrintable(key.char)) {
      const beforeCursor = val.slice(0, posToCharIndex(val, pos));
      const afterCursor = val.slice(posToCharIndex(val, pos));
      const newVal = beforeCursor + key.char + afterCursor;
      props.onChange?.(newVal);
      setCursorPos(pos + 1);
      return true;
    }

    return false;
  };

  // Check if the focusable node is focused (used in render)
  const isFocused = (): boolean => {
    if (!focusedNodeAccessor) return false;
    return focusedNodeAccessor() === focusableNode;
  };

  // Create the content node that renders the text
  const contentNode: Node = {
    get style() {
      const val = getValue();
      const lineCount = val.length === 0 ? 1 : val.split("\n").length;

      return {
        ...DEFAULT_FLEX_STYLE,
        width: getWidth(),
        height: lineCount,
        ...props.style,
      } as FlexStyle;
    },

    measure(_availableWidth: number, _availableHeight: number) {
      const val = getValue();
      const lineCount = val.length === 0 ? 1 : val.split("\n").length;
      return { width: getWidth(), height: lineCount };
    },

    render(
      x: number,
      y: number,
      width: number,
      height: number,
      buffer: Buffer,
      inherited: InheritedStyle,
    ) {
      const val = getValue();
      const placeholder = getPlaceholder();
      const disabled = isDisabled();
      const pos = cursorPos();

      const fg = inherited.color;
      const bg = inherited.backgroundColor;

      // Show placeholder when empty
      if (val.length === 0 && placeholder.length > 0) {
        renderTextareaContent(
          buffer,
          x,
          y,
          width,
          height,
          placeholder,
          fg,
          bg,
          true, // dim
          false, // no cursor
          -1,
        );
        return;
      }

      // Render value with cursor
      const showCursor = !disabled && isFocused();

      renderTextareaContent(
        buffer,
        x,
        y,
        width,
        height,
        val,
        fg,
        bg,
        disabled,
        showCursor,
        pos,
      );
    },
  };

  const maxHeight = getMaxHeight();

  if (maxHeight !== undefined) {
    // With maxHeight: wrap content in ScrollArea
    // Use a Box wrapper to be the focusable element
    // Build props as Record to allow reactive width (Box resolves functions at runtime)
    const boxProps: Record<string, unknown> = {
      width: props.width ?? 40,
      focusable: props.focusable ?? true,
      autoFocus: props.autoFocus,
      onKeyPress: handleKeyPress,
      ...props.style,
      children: [
        ScrollArea({
          height: maxHeight,
          width: props.width ?? 40,
          scrollTop: scrollTop,
          onScroll: setScrollTop,
          focusable: false,
          children: [contentNode],
        }),
      ],
    };
    focusableNode = Box(boxProps as Parameters<typeof Box>[0]);
  } else {
    // Without maxHeight: content node is the focusable element
    focusableNode = {
      ...contentNode,
      focusable: props.focusable ?? true,
      autoFocus: props.autoFocus,
      onKeyPress: handleKeyPress,
    };
  }

  // Bind ref to the focusable node
  if (props.ref) {
    props.ref.current = focusableNode;
  }

  return focusableNode;
}

/**
 * Render textarea content with optional cursor.
 * When inside ScrollArea, height is the visible portion and content is clipped.
 */
function renderTextareaContent(
  buffer: Buffer,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  fg: Color,
  bg: Color,
  dim: boolean,
  showCursor: boolean,
  cursorPos: number,
): void {
  const lines = text.split("\n");
  let globalGraphemeIndex = 0;

  for (let row = 0; row < Math.min(lines.length, height); row++) {
    const line = lines[row];
    let col = 0;

    for (const grapheme of graphemes(line)) {
      if (col >= width) break;

      const graphemeWidth = graphemeDisplayWidth(grapheme);

      // Determine modifiers for this grapheme
      let modifiers = dim ? DIM : 0;
      if (showCursor && globalGraphemeIndex === cursorPos) {
        modifiers |= INVERSE;
      }

      // Write grapheme to buffer
      buffer.set(x + col, y + row, grapheme, fg, bg, modifiers);

      // Handle double-width chars
      if (graphemeWidth === 2 && col + 1 < width) {
        buffer.set(x + col + 1, y + row, "", fg, bg, modifiers);
      }

      col += graphemeWidth;
      globalGraphemeIndex++;
    }

    // Draw cursor at end of line if cursor is at end of this line
    if (
      showCursor &&
      globalGraphemeIndex === cursorPos &&
      col < width &&
      row < lines.length - 1
    ) {
      // Cursor is on the newline character
      buffer.set(x + col, y + row, " ", fg, bg, INVERSE);
    }

    // Account for newline in position tracking (except for last line)
    if (row < lines.length - 1) {
      globalGraphemeIndex++; // newline
    }
  }

  // Draw cursor at very end of text if it's there and visible
  if (showCursor && cursorPos === textLength(text)) {
    const cursorLineCol = posToLineCol(text, cursorPos);

    if (cursorLineCol.line < height) {
      const line = lines[cursorLineCol.line] ?? "";
      const cursorCol = displayWidthToPosition(line, cursorLineCol.column);
      if (cursorCol < width) {
        buffer.set(x + cursorCol, y + cursorLineCol.line, " ", fg, bg, INVERSE);
      }
    }
  }
}
