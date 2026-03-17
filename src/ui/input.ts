// Input component - single-line text input with cursor and editing support

import { graphemeDisplayWidth, graphemes } from "../core/buffer.ts";
import { type KeyEvent, isPrintable } from "../core/input.ts";
import type { FlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime.ts";
import { Box, Text, createRef, getActiveContext } from "../core/runtime.ts";
import {
  type Accessor,
  type MaybeAccessor,
  createEffect,
  createSignal,
  resolve,
} from "../core/signals.ts";
import { textDelete, textInsert, textLength, textSlice } from "../core/text.ts";

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
  disabled?: MaybeAccessor<boolean>;

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

  // Create internal ref to track this node for focus checking
  const internalRef = createRef();

  // Try to get focus accessor from context (may be null in tests)
  const ctx = getActiveContext();
  const focusedNodeAccessor: Accessor<Node | null> | null =
    ctx?.state.focusedNode ?? null;

  // Clamp cursor when value changes externally
  createEffect(() => {
    const val = getValue();
    const len = textLength(val);
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
    const len = textLength(val);

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
      props.onChange?.(textDelete(val, pos - 1, pos));
      setCursorPos(pos - 1);
      return true;
    }
    if (key.name === "delete" && pos < len) {
      props.onChange?.(textDelete(val, pos, pos + 1));
      return true;
    }
    if (key.ctrl && key.name === "k") {
      const newVal = textSlice(val, 0, pos);
      props.onChange?.(newVal);
      return true;
    }
    if (key.ctrl && key.name === "u") {
      const newVal = textSlice(val, pos);
      props.onChange?.(newVal);
      setCursorPos(0);
      return true;
    }
    if (key.name === "enter") {
      props.onSubmit?.(val);
      return true;
    }
    if (isPrintable(key.char)) {
      props.onChange?.(textInsert(val, pos, key.char));
      setCursorPos(pos + 1);
      return true;
    }

    return false;
  };

  // Check if this node is focused
  const isFocused = (): boolean => {
    if (!focusedNodeAccessor) return false;
    return focusedNodeAccessor() === internalRef.current;
  };

  // Computed text segments
  const beforeCursor = () => textSlice(getValue(), 0, cursorPos());
  const cursorChar = () => {
    const char = textSlice(getValue(), cursorPos(), cursorPos() + 1);
    return char || " "; // Space at end of text
  };
  const afterCursor = () => textSlice(getValue(), cursorPos() + 1);

  // Show cursor only when focused and not disabled
  const showCursor = () => !isDisabled() && isFocused();

  // Show placeholder when value is empty
  const showPlaceholder = () =>
    getValue().length === 0 && getPlaceholder().length > 0;

  // Bind external ref if provided
  const boundRef = props.ref ?? internalRef;

  return Box({
    ref: boundRef,
    overflow: "hidden" as const,
    width: getWidth(),
    height: 1,
    focusable: props.focusable ?? true,
    autoFocus: props.autoFocus,
    onKeyPress: handleKeyPress,
    ...props.style,
    children: [
      // Content container with negative margin for horizontal scrolling
      Box({
        flexDirection: "row",
        marginStart: -scrollOffset(),
        children: showPlaceholder()
          ? [
              // Placeholder (dimmed)
              Text({ content: getPlaceholder, dim: true }),
            ]
          : [
              // Text before cursor
              Text({ content: beforeCursor, dim: isDisabled }),
              // Cursor character (inverse when focused)
              Text({
                content: cursorChar,
                inverse: showCursor,
                dim: isDisabled,
              }),
              // Text after cursor
              Text({ content: afterCursor, dim: isDisabled }),
            ],
      }),
    ],
  });
}
