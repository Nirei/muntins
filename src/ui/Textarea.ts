// Textarea component - multi-line text input with cursor navigation and editing

import type { Buffer, Color } from "../core/buffer.ts";
import {
  DIM,
  INVERSE,
  graphemeDisplayWidth,
  graphemes,
} from "../core/buffer.ts";
import { type KeyEvent, isPrintable } from "../core/input.ts";
import { DEFAULT_FLEX_STYLE, type FlexStyle } from "../core/layout.ts";
import { isInClipRect } from "../core/render.ts";
import { Node } from "../core/runtime.ts";
import type { ClipRect, InheritedStyle, Ref } from "../core/runtime.ts";
import { App, Box } from "../core/runtime.ts";
import {
  type Accessor,
  type MaybeAccessor,
  createEffect,
  createSignal,
  resolve,
  untrack,
} from "../core/signals.ts";
import { displayWidthToPosition, textLength } from "../core/text.ts";
import { ScrollArea } from "../core/components/ScrollArea.ts";

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

  /**
   * Allow multiple lines. When false, Enter key is not handled and
   * Up/Down arrows do nothing. Default: true
   */
  multiline?: boolean;

  /** Disable the textarea */
  disabled?: MaybeAccessor<boolean>;

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
 * Convert linear cursor position to line/column.
 */
function posToLineCol(text: string, pos: number): CursorPosition {
  const lines = text.split("\n");
  let remaining = pos;

  for (let line = 0; line < lines.length; line++) {
    const lineLen = textLength(lines[line]);
    if (remaining <= lineLen) {
      return { line, column: remaining };
    }
    remaining -= lineLen + 1; // +1 for newline
  }

  const lastLine = lines.length - 1;
  return { line: lastLine, column: textLength(lines[lastLine]) };
}

/**
 * Convert line/column to linear cursor position.
 */
function lineColToPos(text: string, cursor: CursorPosition): number {
  const lines = text.split("\n");
  let pos = 0;

  for (let i = 0; i < cursor.line && i < lines.length; i++) {
    pos += textLength(lines[i]) + 1; // +1 for newline
  }

  const currentLine = lines[cursor.line] ?? "";
  return pos + Math.min(cursor.column, textLength(currentLine));
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
  const initialValue = resolve(props.value) ?? "";
  const [cursorPos, setCursorPos] = createSignal(textLength(initialValue));
  const [scrollTop, setScrollTop] = createSignal(0);
  const [scrollLeft, setScrollLeft] = createSignal(0);

  const getValue = () => resolve(props.value) ?? "";
  const isDisabled = () => resolve(props.disabled) ?? false;
  const getWidth = () => resolve(props.width) ?? 40;
  const getMaxHeight = () => resolve(props.maxHeight);
  const getPlaceholder = () => resolve(props.placeholder) ?? "";
  const isMultiline = props.multiline ?? true;

  const ctx = App.getActiveContext();
  const focusedNodeAccessor: Accessor<Node | null> | null =
    ctx?.app.focusedNode ?? null;

  let focusableNode: Node;

  createEffect(() => {
    const val = getValue();
    const len = textLength(val);
    if (cursorPos() > len) {
      setCursorPos(len);
    }
  });

  createEffect(() => {
    const maxHeight = getMaxHeight();
    if (maxHeight === undefined) return; // No scrolling without maxHeight

    const val = getValue();
    const cursorLineCol = posToLineCol(val, cursorPos());
    const cursorLine = cursorLineCol.line;
    const currentScrollTop = untrack(scrollTop);

    if (cursorLine < currentScrollTop) {
      setScrollTop(cursorLine);
    } else if (cursorLine >= currentScrollTop + maxHeight) {
      setScrollTop(cursorLine - maxHeight + 1);
    }
  });

  // Horizontal scrolling for single-line mode
  createEffect(() => {
    if (isMultiline) return;

    const pos = cursorPos();
    const width = getWidth();
    const val = getValue();
    const cursorDisplayPos = displayWidthToPosition(val, pos);
    const offset = untrack(scrollLeft);

    if (cursorDisplayPos >= offset + width) {
      setScrollLeft(cursorDisplayPos - width + 1);
    } else if (cursorDisplayPos < offset) {
      setScrollLeft(cursorDisplayPos);
    }
  });

  createEffect(() => {
    const maxHeight = getMaxHeight();
    if (maxHeight === undefined) return;

    const val = getValue();
    const lineCount = val.length === 0 ? 1 : val.split("\n").length;
    const maxScroll = Math.max(0, lineCount - maxHeight);

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
      if (!isMultiline) return false;
      if (cursorLineCol.line > 0) {
        const prevLineLen = textLength(lines[cursorLineCol.line - 1]);
        const newCol = Math.min(cursorLineCol.column, prevLineLen);
        setCursorPos(
          lineColToPos(val, { line: cursorLineCol.line - 1, column: newCol }),
        );
      }
      return true;
    }

    if (key.name === "down") {
      if (!isMultiline) return false;
      if (cursorLineCol.line < lines.length - 1) {
        const nextLineLen = textLength(lines[cursorLineCol.line + 1]);
        const newCol = Math.min(cursorLineCol.column, nextLineLen);
        setCursorPos(
          lineColToPos(val, { line: cursorLineCol.line + 1, column: newCol }),
        );
      }
      return true;
    }

    if (key.name === "home" || (key.ctrl && key.name === "a")) {
      setCursorPos(lineColToPos(val, { line: cursorLineCol.line, column: 0 }));
      return true;
    }

    if (key.name === "end" || (key.ctrl && key.name === "e")) {
      const currentLineLen = textLength(lines[cursorLineCol.line]);
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
      const currentLineEnd = lineColToPos(val, {
        line: cursorLineCol.line,
        column: textLength(lines[cursorLineCol.line]),
      });

      if (pos === currentLineEnd && cursorLineCol.line < lines.length - 1) {
        const beforeCursor = val.slice(0, posToCharIndex(val, pos));
        const afterCursor = val.slice(posToCharIndex(val, pos + 1));
        props.onChange?.(beforeCursor + afterCursor);
      } else {
        const beforeCursor = val.slice(0, posToCharIndex(val, pos));
        const afterLine = val.slice(posToCharIndex(val, currentLineEnd));
        props.onChange?.(beforeCursor + afterLine);
      }
      return true;
    }

    if (key.ctrl && key.name === "u") {
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
      if (!isMultiline) return false;
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

  const isFocused = (): boolean => {
    if (!focusedNodeAccessor) return false;
    return focusedNodeAccessor() === focusableNode;
  };

  const contentNode = new Node({
    style: () => {
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
      clip: ClipRect,
    ) {
      const val = getValue();
      const placeholder = getPlaceholder();
      const disabled = isDisabled();
      const pos = cursorPos();

      const fg = inherited.color;
      const bg = inherited.backgroundColor;

      const hScroll = isMultiline ? 0 : scrollLeft();

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
          hScroll,
          clip,
        );
        return;
      }

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
        hScroll,
        clip,
      );
    },
  });

  const maxHeight = getMaxHeight();

  if (maxHeight !== undefined) {
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
    focusableNode = new Node({
      ...contentNode,
      focusable: props.focusable ?? true,
      autoFocus: props.autoFocus,
      onKeyPress: handleKeyPress,
    });
  }

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
  scrollLeft = 0,
  clip?: ClipRect,
): void {
  const lines = text.split("\n");
  let globalGraphemeIndex = 0;

  // Helper to check if a position is within the clip bounds
  const inClip = (cx: number, cy: number): boolean =>
    !clip || isInClipRect(cx, cy, clip);

  for (let row = 0; row < Math.min(lines.length, height); row++) {
    const line = lines[row];
    let displayCol = 0; // Position in display coordinates
    let graphemeIdx = 0; // Index of grapheme in this line
    const screenY = y + row;

    for (const grapheme of graphemes(line)) {
      const graphemeWidth = graphemeDisplayWidth(grapheme);

      // Check if this grapheme is visible (after scrollLeft, before width)
      const visibleStart = displayCol - scrollLeft;
      const isVisible =
        visibleStart + graphemeWidth > 0 && visibleStart < width;

      if (isVisible) {
        let modifiers = dim ? DIM : 0;
        if (showCursor && globalGraphemeIndex === cursorPos) {
          modifiers |= INVERSE;
        }

        const renderCol = Math.max(0, visibleStart);
        const screenX = x + renderCol;
        if (renderCol < width && inClip(screenX, screenY)) {
          buffer.set(screenX, screenY, grapheme, fg, bg, modifiers);

          if (
            graphemeWidth === 2 &&
            renderCol + 1 < width &&
            inClip(screenX + 1, screenY)
          ) {
            buffer.set(screenX + 1, screenY, "", fg, bg, modifiers);
          }
        }
      }

      displayCol += graphemeWidth;
      graphemeIdx++;
      globalGraphemeIndex++;

      // Stop if we've gone past the visible area
      if (displayCol - scrollLeft >= width) break;
    }

    // Cursor at end of line (before newline)
    if (
      showCursor &&
      globalGraphemeIndex === cursorPos &&
      displayCol - scrollLeft < width &&
      row < lines.length - 1
    ) {
      const renderCol = displayCol - scrollLeft;
      const screenX = x + renderCol;
      if (renderCol >= 0 && inClip(screenX, screenY)) {
        buffer.set(screenX, screenY, " ", fg, bg, INVERSE);
      }
    }

    if (row < lines.length - 1) {
      globalGraphemeIndex++;
    }
  }

  // Cursor at end of text
  if (showCursor && cursorPos === textLength(text)) {
    const cursorLineCol = posToLineCol(text, cursorPos);

    if (cursorLineCol.line < height) {
      const line = lines[cursorLineCol.line] ?? "";
      const cursorCol =
        displayWidthToPosition(line, cursorLineCol.column) - scrollLeft;
      const screenX = x + cursorCol;
      const screenY = y + cursorLineCol.line;
      if (cursorCol >= 0 && cursorCol < width && inClip(screenX, screenY)) {
        buffer.set(screenX, screenY, " ", fg, bg, INVERSE);
      }
    }
  }
}
