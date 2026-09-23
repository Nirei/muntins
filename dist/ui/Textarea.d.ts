import { type ReactiveFlexStyle } from "../core/layout.ts";
import { Node, type Ref } from "../core/runtime/Node.ts";
import { type MaybeAccessor } from "../core/signals.ts";
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
export declare function Textarea(props: TextareaProps): Node;
//# sourceMappingURL=Textarea.d.ts.map