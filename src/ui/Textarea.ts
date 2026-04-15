// Textarea component - multi-line text input with cursor navigation and editing

import type { Buffer, Color } from "../core/buffer.ts";
import {
  DIM,
  INVERSE,
  graphemeDisplayWidth,
  graphemes,
} from "../core/buffer.ts";
import { Box } from "../core/components/Box.ts";
import { ScrollArea } from "../core/components/ScrollArea.ts";
import { type KeyEvent, type MouseEvent, isPrintable } from "../core/input.ts";
import {
  DEFAULT_FLEX_STYLE,
  type FlexStyle,
  type ReactiveFlexStyle,
} from "../core/layout.ts";
import { rectContains } from "../core/rects.ts";
import type { Rect } from "../core/rects.ts";
import { App } from "../core/runtime/App.ts";
import { Node, type Ref } from "../core/runtime/Node.ts";
import {
  type Accessor,
  type MaybeAccessor,
  createEffect,
  createSignal,
  resolve,
  untrack,
} from "../core/signals.ts";
import {
  layoutLine as computeLayoutLine,
  displayWidthToPosition,
  textLength,
} from "../core/text.ts";
import { styleFallback, theme } from "../core/theme.ts";

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

  /** Width in characters. Default from theme. */
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
  style?: Partial<ReactiveFlexStyle>;
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

interface TextareaVisualLine {
  text: string;
  globalGraphemeStart: number;
  graphemeCount: number;
  isLastOfLogicalLine: boolean;
  isCursorOverflow: boolean;
}

function getVisualLines(text: string, width: number): TextareaVisualLine[] {
  if (width <= 0) {
    const gc = textLength(text);
    return [
      {
        text,
        globalGraphemeStart: 0,
        graphemeCount: gc,
        isLastOfLogicalLine: true,
        isCursorOverflow: false,
      },
    ];
  }

  const logicalLines = text.split("\n");
  const result: TextareaVisualLine[] = [];
  let globalOffset = 0;

  for (let i = 0; i < logicalLines.length; i++) {
    const line = logicalLines[i];
    const wrapped = computeLayoutLine(line, width);

    for (let j = 0; j < wrapped.length; j++) {
      result.push({
        text: wrapped[j].text,
        globalGraphemeStart: globalOffset,
        graphemeCount: textLength(wrapped[j].text),
        isLastOfLogicalLine: j === wrapped.length - 1,
        isCursorOverflow: false,
      });
      globalOffset += textLength(wrapped[j].text);
    }

    const lastWrapped = wrapped[wrapped.length - 1];
    if (lastWrapped.displayWidth === width) {
      result.push({
        text: "",
        globalGraphemeStart: globalOffset,
        graphemeCount: 0,
        isLastOfLogicalLine: true,
        isCursorOverflow: true,
      });
    }

    if (i < logicalLines.length - 1) {
      globalOffset += 1;
    }
  }

  return result.length > 0
    ? result
    : [
        {
          text: "",
          globalGraphemeStart: 0,
          graphemeCount: 0,
          isLastOfLogicalLine: true,
          isCursorOverflow: false,
        },
      ];
}

function cursorToVisualPos(
  text: string,
  cursorPos: number,
  width: number,
): { row: number; col: number } {
  const vlines = getVisualLines(text, width);

  for (let row = 0; row < vlines.length; row++) {
    const vl = vlines[row];
    const endPos = vl.globalGraphemeStart + vl.graphemeCount;

    if (cursorPos < endPos) {
      return { row, col: cursorPos - vl.globalGraphemeStart };
    }

    if (cursorPos === endPos) {
      const next = vlines[row + 1];
      if (next && next.globalGraphemeStart === cursorPos) continue;
      return { row, col: cursorPos - vl.globalGraphemeStart };
    }
  }

  const last = vlines[vlines.length - 1];
  return { row: vlines.length - 1, col: last.graphemeCount };
}

function visualPosToCursor(
  text: string,
  row: number,
  col: number,
  width: number,
): number {
  const vlines = getVisualLines(text, width);
  const clampedRow = Math.max(0, Math.min(row, vlines.length - 1));
  const vl = vlines[clampedRow];
  return vl.globalGraphemeStart + Math.min(col, vl.graphemeCount);
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
 * Convert a display column to a grapheme position within a line.
 * Clicking on a wide character positions the cursor before it.
 */
function displayColumnToGraphemePos(line: string, displayCol: number): number {
  let width = 0;
  let pos = 0;
  for (const grapheme of graphemes(line)) {
    const gw = graphemeDisplayWidth(grapheme);
    if (width + gw > displayCol) return pos;
    width += gw;
    pos++;
  }
  return pos;
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
  const getWidth = () =>
    resolve(props.width) ?? (theme("textarea").width as number);
  const getMaxHeight = () => resolve(props.maxHeight);
  const getPlaceholder = () => resolve(props.placeholder) ?? "";
  const isMultiline = props.multiline ?? true;

  const ctx = App.getActiveContext();
  const focusedNodeAccessor: Accessor<Node | null> | null =
    ctx?.app.focusedNode ?? null;

  let focusableNode: Node;
  let lastScreenX = 0;
  let lastScreenY = 0;

  const themeStyle = styleFallback(props.style, "textarea", "input");

  const getPadding = (side: "paddingStart" | "paddingEnd"): number => {
    const val = themeStyle[side];
    return (
      ((typeof val === "function" ? (val as () => number)() : val) as number) ??
      0
    );
  };

  const contentWidth = () => {
    const ps = getPadding("paddingStart");
    const pe = getPadding("paddingEnd");
    if (getMaxHeight() === undefined) return getWidth() - ps - pe;
    return getWidth() - ps - pe - 1;
  };

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
    const cw = contentWidth();
    const visualPos = cursorToVisualPos(val, cursorPos(), cw);
    const cursorRow = visualPos.row;
    const currentScrollTop = untrack(scrollTop);

    if (cursorRow < currentScrollTop) {
      setScrollTop(cursorRow);
    } else if (cursorRow >= currentScrollTop + maxHeight) {
      setScrollTop(cursorRow - maxHeight + 1);
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
    const cw = contentWidth();
    const vlines = isMultiline
      ? getVisualLines(val, cw)
      : getVisualLines(val, 0);
    const lineCount = val.length === 0 ? 1 : vlines.length;
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
    const cw = contentWidth();
    const vlines = isMultiline
      ? getVisualLines(val, cw)
      : getVisualLines(val, 0);
    const visualPos = cursorToVisualPos(val, pos, isMultiline ? cw : 0);

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
      if (visualPos.row > 0) {
        const onOverflow = vlines[visualPos.row].isCursorOverflow;
        const effectiveCol = onOverflow ? cw : visualPos.col;
        let targetRow = visualPos.row - 1;
        if (onOverflow && targetRow > 0) targetRow--;
        setCursorPos(visualPosToCursor(val, targetRow, effectiveCol, cw));
      }
      return true;
    }

    if (key.name === "down") {
      if (!isMultiline) return false;
      if (visualPos.row < vlines.length - 1) {
        const onOverflow = vlines[visualPos.row].isCursorOverflow;
        const effectiveCol = onOverflow ? cw : visualPos.col;
        let targetRow = visualPos.row + 1;
        if (onOverflow && targetRow < vlines.length - 1) targetRow++;
        setCursorPos(visualPosToCursor(val, targetRow, effectiveCol, cw));
      }
      return true;
    }

    if (key.name === "home" || (key.ctrl && key.name === "a")) {
      if (isMultiline) {
        setCursorPos(visualPosToCursor(val, visualPos.row, 0, cw));
      } else {
        setCursorPos(0);
      }
      return true;
    }

    if (key.name === "end" || (key.ctrl && key.name === "e")) {
      if (isMultiline) {
        const vl = vlines[visualPos.row];
        setCursorPos(
          visualPosToCursor(val, visualPos.row, vl.graphemeCount, cw),
        );
      } else {
        setCursorPos(len);
      }
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
      const vl = vlines[visualPos.row];
      const visualRowEnd = vl.globalGraphemeStart + vl.graphemeCount;

      if (
        pos === visualRowEnd &&
        vl.isLastOfLogicalLine &&
        visualPos.row < vlines.length - 1
      ) {
        const beforeCursor = val.slice(0, posToCharIndex(val, pos));
        const afterCursor = val.slice(posToCharIndex(val, pos + 1));
        props.onChange?.(beforeCursor + afterCursor);
      } else {
        const beforeCursor = val.slice(0, posToCharIndex(val, pos));
        const afterVisualRow = val.slice(posToCharIndex(val, visualRowEnd));
        props.onChange?.(beforeCursor + afterVisualRow);
      }
      return true;
    }

    if (key.ctrl && key.name === "u") {
      const vl = vlines[visualPos.row];
      const visualRowStart = vl.globalGraphemeStart;

      const beforeVisualRow = val.slice(0, posToCharIndex(val, visualRowStart));
      const afterCursor = val.slice(posToCharIndex(val, pos));
      props.onChange?.(beforeVisualRow + afterCursor);
      setCursorPos(visualRowStart);
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

  const handleMousePress = (event: MouseEvent): void => {
    if (isDisabled()) return;

    const val = getValue();
    const cw = contentWidth();
    const vlines = isMultiline
      ? getVisualLines(val, cw)
      : getVisualLines(val, 0);

    const relCol = event.x - lastScreenX;
    const relRow = event.y - lastScreenY;

    const row = Math.max(0, Math.min(relRow, vlines.length - 1));
    const vl = vlines[row];
    const displayCol = isMultiline ? relCol : relCol + scrollLeft();
    const col = displayColumnToGraphemePos(vl.text, Math.max(0, displayCol));

    setCursorPos(vl.globalGraphemeStart + Math.min(col, vl.graphemeCount));
  };

  const isFocused = (): boolean => {
    if (!focusedNodeAccessor) return false;
    return focusedNodeAccessor() === focusableNode;
  };

  const contentNode = new Node({
    style: () => {
      const val = getValue();
      const cw = contentWidth();
      const vlines = isMultiline
        ? getVisualLines(val, cw)
        : getVisualLines(val, 0);
      const lineCount = val.length === 0 ? 1 : vlines.length;

      return {
        ...DEFAULT_FLEX_STYLE,
        width: contentWidth(),
        height: lineCount,
        ...props.style,
      } as FlexStyle;
    },

    measure(_availableWidth: number, _availableHeight: number) {
      const val = getValue();
      const cw = contentWidth();
      const vlines = isMultiline
        ? getVisualLines(val, cw)
        : getVisualLines(val, 0);
      const lineCount = val.length === 0 ? 1 : vlines.length;
      return { width: contentWidth(), height: lineCount };
    },

    render(bounds, buffer, inherited, clip) {
      const { screenX: x, screenY: y, width, height } = bounds;
      lastScreenX = x;
      lastScreenY = y;

      const val = getValue();
      const placeholder = getPlaceholder();
      const disabled = isDisabled();
      const pos = cursorPos();

      const fg = inherited.color;
      const bg = inherited.backgroundColor;

      const cursorInverse = theme("textarea--cursor").inverse as boolean;
      const placeholderDim = theme("textarea--placeholder").dim as boolean;
      const disabledDim = theme("textarea--disabled").dim as boolean;

      const hScroll = isMultiline ? 0 : scrollLeft();
      const cw = contentWidth();

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
          placeholderDim,
          false,
          -1,
          hScroll,
          clip,
          cursorInverse,
          isMultiline ? cw : 0,
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
        disabled && disabledDim,
        showCursor,
        pos,
        hScroll,
        clip,
        cursorInverse,
        isMultiline ? cw : 0,
      );
    },
  });

  const maxHeight = getMaxHeight();

  if (maxHeight !== undefined) {
    const boxProps: Record<string, unknown> = {
      focusable: props.focusable ?? true,
      autoFocus: props.autoFocus,
      onKeyPress: handleKeyPress,
      onMousePress: handleMousePress,
      ...themeStyle,
      paddingEnd: 0,
      width: getWidth(),
      children: [
        ScrollArea({
          height: maxHeight,
          width: () => getWidth() - getPadding("paddingStart"),
          scrollTop: scrollTop,
          onScroll: setScrollTop,
          focusable: false,
          children: [contentNode],
        }),
      ],
    };
    focusableNode = Box(boxProps as Parameters<typeof Box>[0]);
  } else {
    focusableNode = Box({
      focusable: props.focusable ?? true,
      autoFocus: props.autoFocus,
      onKeyPress: handleKeyPress,
      onMousePress: handleMousePress,
      ...themeStyle,
      width: getWidth(),
      children: [contentNode],
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
  clip?: Rect,
  cursorInverse = true,
  cw = 0,
): void {
  const vlines = getVisualLines(text, cw);

  const inClip = (cx: number, cy: number): boolean =>
    !clip || rectContains(clip, cx, cy);

  let cursorVisualRow = -1;
  let cursorVisualCol = -1;
  if (showCursor) {
    const vp = cursorToVisualPos(text, cursorPos, cw);
    cursorVisualRow = vp.row;
    cursorVisualCol = vp.col;
  }

  for (let row = 0; row < Math.min(vlines.length, height); row++) {
    const vl = vlines[row];
    let displayCol = 0;
    let graphemeIdx = 0;
    const screenY = y + row;

    for (const grapheme of graphemes(vl.text)) {
      const graphemeWidth = graphemeDisplayWidth(grapheme);

      const visibleStart = displayCol - scrollLeft;
      const isVisible =
        visibleStart + graphemeWidth > 0 && visibleStart < width;

      if (isVisible) {
        let modifiers = dim ? DIM : 0;
        if (
          showCursor &&
          cursorInverse &&
          row === cursorVisualRow &&
          graphemeIdx === cursorVisualCol
        ) {
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

      if (displayCol - scrollLeft >= width) break;
    }

    if (
      showCursor &&
      row === cursorVisualRow &&
      cursorVisualCol === vl.graphemeCount
    ) {
      const cursorDisplayCol =
        displayWidthToPosition(vl.text, cursorVisualCol) - scrollLeft;
      if (
        cursorDisplayCol >= 0 &&
        cursorDisplayCol < width &&
        inClip(x + cursorDisplayCol, screenY)
      ) {
        buffer.set(
          x + cursorDisplayCol,
          screenY,
          " ",
          fg,
          bg,
          cursorInverse ? INVERSE : 0,
        );
      }
    }
  }
}
