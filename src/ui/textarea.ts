// Textarea component - multi-line text input with cursor navigation and editing

import type { Buffer, Color } from "../core/buffer.ts";
import { graphemeDisplayWidth, graphemes } from "../core/buffer.ts";
import { type KeyEvent, isPrintable } from "../core/input.ts";
import { DEFAULT_FLEX_STYLE, type FlexStyle } from "../core/layout.ts";
import type { InheritedStyle, Node, Ref } from "../core/runtime.ts";
import { getActiveContext } from "../core/runtime.ts";
import { type Accessor, createEffect, createSignal } from "../core/signals.ts";

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
 * Resolve a value that may be static or a getter function.
 */
function resolve<T>(value: T | (() => T) | undefined): T | undefined {
  return typeof value === "function" ? (value as () => T)() : value;
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
 * Slice a string by grapheme positions.
 */
function graphemeSlice(str: string, start: number, end?: number): string {
  let result = "";
  let i = 0;
  for (const grapheme of graphemes(str)) {
    if (i >= start && (end === undefined || i < end)) {
      result += grapheme;
    }
    i++;
  }
  return result;
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
  // Count newlines explicitly since they're part of the text
  return count;
}

/**
 * A multi-line text input field with cursor navigation and editing support.
 *
 * The textarea is intentionally unstyled - it renders text with no default
 * border, padding, or colors. Use composition or style overrides to add
 * visual styling.
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
 * // With styling
 * Box({
 *   border: "single",
 *   children: [
 *     Textarea({
 *       value: message,
 *       onChange: setMessage,
 *       width: 60,
 *       height: 10,
 *     }),
 *   ],
 * });
 * ```
 */
export function Textarea(props: TextareaProps): Node {
  const [cursorPos, setCursorPos] = createSignal(0);

  const getValue = () => resolve(props.value) ?? "";
  const isDisabled = () => resolve(props.disabled) ?? false;
  const getWidth = () => resolve(props.width) ?? 40;
  const getPlaceholder = () => resolve(props.placeholder) ?? "";

  // Try to get focus accessor from context (may be null in tests)
  const ctx = getActiveContext();
  const focusedNodeAccessor: Accessor<Node | null> | null =
    ctx?.state.focusedNode ?? null;

  // Declare node first so we can reference it in isFocused
  let node: Node;

  // Clamp cursor when value changes externally
  createEffect(() => {
    const val = getValue();
    const len = textLength(val);
    if (cursorPos() > len) {
      setCursorPos(len);
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
      // If at start of line and not first line, join with previous line
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
      const currentLineStart = lineColToPos(val, {
        line: cursorLineCol.line,
        column: 0,
      });
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

  // Check if this node is focused (used in render)
  const isFocused = (): boolean => {
    if (!focusedNodeAccessor) return false;
    return focusedNodeAccessor() === node;
  };

  node = {
    get style() {
      return {
        ...DEFAULT_FLEX_STYLE,
        width: getWidth(),
        ...props.style,
      } as FlexStyle;
    },
    focusable: props.focusable ?? true,
    autoFocus: props.autoFocus,
    onKeyPress: handleKeyPress,

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

      // Determine colors
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

  // Bind ref
  if (props.ref) {
    props.ref.current = node;
  }

  return node;
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

// DIM modifier constant
const DIM = 2;
const INVERSE = 32;

/**
 * Render textarea content with optional cursor.
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

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    // Stop if below visible area
    if (lineIdx >= height) break;

    const line = lines[lineIdx];
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
      buffer.set(x + col, y + lineIdx, grapheme, fg, bg, modifiers);

      // Handle double-width chars
      if (graphemeWidth === 2 && col + 1 < width) {
        buffer.set(x + col + 1, y + lineIdx, "", fg, bg, modifiers);
      }

      col += graphemeWidth;
      globalGraphemeIndex++;
    }

    // Draw cursor at end of line if cursor is at end of this line
    if (
      showCursor &&
      globalGraphemeIndex === cursorPos &&
      col < width &&
      lineIdx < lines.length - 1
    ) {
      // Cursor is on the newline character
      buffer.set(x + col, y + lineIdx, " ", fg, bg, INVERSE);
    }

    // Account for newline in position tracking (except for last line)
    if (lineIdx < lines.length - 1) {
      globalGraphemeIndex++; // newline
    }
  }

  // Draw cursor at very end of text if it's there
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
