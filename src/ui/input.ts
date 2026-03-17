// Input component - single-line text input with cursor and editing support

import type { Buffer, Color } from "../core/buffer.ts";
import { graphemeDisplayWidth, graphemes } from "../core/buffer.ts";
import { type KeyEvent, isPrintable } from "../core/input.ts";
import { DEFAULT_FLEX_STYLE, type FlexStyle } from "../core/layout.ts";
import type { InheritedStyle, Node, Ref } from "../core/runtime.ts";
import { getActiveContext } from "../core/runtime.ts";
import {
  type Accessor,
  createEffect,
  createSignal,
  resolve,
} from "../core/signals.ts";

/**
 * Props for the Input component.
 */
export interface InputProps {
  /** Current input value (controlled) */
  value: string | (() => string);

  /** Called when value changes */
  onChange?: (value: string) => void;

  /** Placeholder text when empty */
  placeholder?: string | (() => string);

  /** Input width in characters. Default: 20 */
  width?: number | (() => number);

  /** Disable the input */
  disabled?: boolean | (() => boolean);

  /** Called on Enter key */
  onSubmit?: (value: string) => void;

  /** Focus control */
  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;

  /** Style overrides */
  style?: Partial<FlexStyle>;
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
 * A single-line text input field with cursor and editing support.
 *
 * The input is intentionally unstyled - it renders text with no default
 * border, padding, or colors. Use composition or style overrides to add
 * visual styling.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const [name, setName] = createSignal("");
 * Input({
 *   value: name,
 *   onChange: setName,
 *   placeholder: "Enter your name",
 * });
 *
 * // With styling
 * Box({
 *   border: "single",
 *   children: [
 *     Input({
 *       value: name,
 *       onChange: setName,
 *       width: 30,
 *     }),
 *   ],
 * });
 * ```
 */
export function Input(props: InputProps): Node {
  const [cursorPos, setCursorPos] = createSignal(0);
  const [scrollOffset, setScrollOffset] = createSignal(0);

  const getValue = () => resolve(props.value) ?? "";
  const isDisabled = () => resolve(props.disabled) ?? false;
  const getWidth = () => resolve(props.width) ?? 20;
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
    const len = graphemeCount(val);
    if (cursorPos() > len) {
      setCursorPos(len);
    }
  });

  // Update scroll offset to keep cursor visible
  createEffect(() => {
    const pos = cursorPos();
    const width = getWidth();
    const val = getValue();
    const cursorDisplayPos = displayWidthToPosition(val, pos);
    const offset = scrollOffset();

    // Scroll right if cursor is past visible area
    if (cursorDisplayPos >= offset + width) {
      setScrollOffset(cursorDisplayPos - width + 1);
    }
    // Scroll left if cursor is before visible area
    else if (cursorDisplayPos < offset) {
      setScrollOffset(cursorDisplayPos);
    }
  });

  const handleKeyPress = (key: KeyEvent): boolean | undefined => {
    if (isDisabled()) return false;

    const val = getValue();
    const pos = cursorPos();
    const len = graphemeCount(val);

    if (key.name === "left") {
      setCursorPos(Math.max(0, pos - 1));
      return true;
    }
    if (key.name === "right") {
      setCursorPos(Math.min(len, pos + 1));
      return true;
    }
    if (key.name === "home" || (key.ctrl && key.name === "a")) {
      setCursorPos(0);
      return true;
    }
    if (key.name === "end" || (key.ctrl && key.name === "e")) {
      setCursorPos(len);
      return true;
    }
    if (key.name === "backspace" && pos > 0) {
      const newVal = graphemeSlice(val, 0, pos - 1) + graphemeSlice(val, pos);
      props.onChange?.(newVal);
      setCursorPos(pos - 1);
      return true;
    }
    if (key.name === "delete" && pos < len) {
      const newVal = graphemeSlice(val, 0, pos) + graphemeSlice(val, pos + 1);
      props.onChange?.(newVal);
      return true;
    }
    if (key.ctrl && key.name === "k") {
      const newVal = graphemeSlice(val, 0, pos);
      props.onChange?.(newVal);
      return true;
    }
    if (key.ctrl && key.name === "u") {
      const newVal = graphemeSlice(val, pos);
      props.onChange?.(newVal);
      setCursorPos(0);
      return true;
    }
    if (key.name === "enter") {
      props.onSubmit?.(val);
      return true;
    }
    if (isPrintable(key.char)) {
      const newVal =
        graphemeSlice(val, 0, pos) + key.char + graphemeSlice(val, pos);
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
      const width = getWidth();
      return {
        ...DEFAULT_FLEX_STYLE,
        width,
        height: 1,
        ...props.style,
      } as FlexStyle;
    },
    focusable: props.focusable ?? true,
    autoFocus: props.autoFocus,
    onKeyPress: handleKeyPress,

    measure(_availableWidth: number, _availableHeight: number) {
      return { width: getWidth(), height: 1 };
    },

    render(
      x: number,
      y: number,
      width: number,
      _height: number,
      buffer: Buffer,
      inherited: InheritedStyle,
    ) {
      const val = getValue();
      const placeholder = getPlaceholder();
      const disabled = isDisabled();
      const pos = cursorPos();
      const offset = scrollOffset();

      // Determine colors
      const fg = inherited.color;
      const bg = inherited.backgroundColor;

      // Show placeholder when empty
      if (val.length === 0 && placeholder.length > 0) {
        // Dim placeholder text
        renderInputText(
          buffer,
          x,
          y,
          width,
          placeholder,
          fg,
          bg,
          true,
          false,
          -1,
          offset,
        );
        return;
      }

      // Render value with cursor
      // Cursor is only visible when focused and not disabled
      const showCursor = !disabled && isFocused();
      renderInputText(
        buffer,
        x,
        y,
        width,
        val,
        fg,
        bg,
        disabled,
        showCursor,
        pos,
        offset,
      );
    },
  };

  // Bind ref
  if (props.ref) {
    props.ref.current = node;
  }

  return node;
}

// DIM modifier constant (from buffer.ts)
const DIM = 2;
const INVERSE = 32;

/**
 * Render input text with optional cursor.
 */
function renderInputText(
  buffer: Buffer,
  x: number,
  y: number,
  width: number,
  text: string,
  fg: Color,
  bg: Color,
  dim: boolean,
  showCursor: boolean,
  cursorPos: number,
  scrollOffset: number,
): void {
  let col = 0;
  let graphemeIndex = 0;
  let displayCol = 0;

  for (const grapheme of graphemes(text)) {
    const graphemeWidth = graphemeDisplayWidth(grapheme);

    // Skip graphemes that are scrolled out of view
    if (displayCol + graphemeWidth <= scrollOffset) {
      displayCol += graphemeWidth;
      graphemeIndex++;
      continue;
    }

    // Calculate visible position
    const visibleCol = displayCol - scrollOffset;

    // Stop if we're past the visible width
    if (visibleCol >= width) break;

    // Determine modifiers for this grapheme
    let modifiers = dim ? DIM : 0;
    if (showCursor && graphemeIndex === cursorPos) {
      modifiers |= INVERSE;
    }

    // Write grapheme to buffer
    buffer.set(x + visibleCol, y, grapheme, fg, bg, modifiers);

    // Handle double-width chars
    if (graphemeWidth === 2 && visibleCol + 1 < width) {
      buffer.set(x + visibleCol + 1, y, "", fg, bg, modifiers);
    }

    displayCol += graphemeWidth;
    col++;
    graphemeIndex++;
  }

  // Draw cursor at end of text if cursor is at end position
  if (showCursor && cursorPos === graphemeCount(text)) {
    const cursorDisplayPos =
      displayWidthToPosition(text, cursorPos) - scrollOffset;
    if (cursorDisplayPos >= 0 && cursorDisplayPos < width) {
      buffer.set(x + cursorDisplayPos, y, " ", fg, bg, INVERSE);
    }
  }
}
