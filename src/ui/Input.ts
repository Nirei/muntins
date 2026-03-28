// Input component - single-line text input (thin wrapper around Textarea)

import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime.ts";
import type { MaybeAccessor } from "../core/signals.ts";
import { theme } from "../core/theme.ts";
import { Textarea } from "./Textarea.ts";

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

  /** Input width in characters. Default from theme. */
  width?: number | (() => number);

  /** Disable the input */
  disabled?: MaybeAccessor<boolean>;

  /** Focus control */
  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;

  /** Style overrides */
  style?: Partial<ReactiveFlexStyle>;
}

/**
 * A single-line text input field with cursor and editing support.
 *
 * The input is intentionally unstyled - it renders text with no default
 * border, padding, or colors. Use composition or style overrides to add
 * visual styling.
 *
 * Input is a thin wrapper around Textarea with multiline disabled.
 * Enter key is not handled - use onKeyPress to handle submission.
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
  return Textarea({
    value: props.value,
    onChange: props.onChange,
    placeholder: props.placeholder,
    width: props.width ?? (theme('input').width as number),
    disabled: props.disabled,
    focusable: props.focusable,
    autoFocus: props.autoFocus,
    ref: props.ref,
    style: props.style,
    multiline: false,
  });
}
