// Input component - single-line text input (thin wrapper around Textarea)
import { theme } from "../core/theme.js";
import { Textarea } from "./Textarea.js";
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
export function Input(props) {
    return Textarea({
        value: props.value,
        onChange: props.onChange,
        placeholder: props.placeholder,
        width: props.width ?? theme("input").width,
        disabled: props.disabled,
        focusable: props.focusable,
        autoFocus: props.autoFocus,
        ref: props.ref,
        style: props.style,
        multiline: false,
    });
}
//# sourceMappingURL=Input.js.map