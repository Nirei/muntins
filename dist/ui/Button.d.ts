import type { BoxChild } from "../core/components/Box.ts";
import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime/Node.ts";
import { type MaybeAccessor } from "../core/signals.ts";
/**
 * Props for the Button component.
 */
export interface ButtonProps {
    /** Button content - text, reactive string, or child nodes */
    children: BoxChild | BoxChild[];
    /** Called when button is activated (Enter/Space or click) */
    onClick?: () => void;
    /** Disable the button */
    disabled?: MaybeAccessor<boolean>;
    /** Focus control */
    focusable?: boolean;
    autoFocus?: boolean;
    ref?: Ref;
    /** Style overrides for layout */
    style?: Partial<ReactiveFlexStyle>;
}
/**
 * A focusable, activatable button that responds to Enter/Space key presses and mouse clicks.
 *
 * The button is intentionally unstyled - it renders its children with no default
 * border, padding, or colors. Use composition or style overrides to add visual styling.
 *
 * @example
 * ```typescript
 * // Basic usage
 * Button({
 *   children: "Click me",
 *   onClick: () => console.log("clicked"),
 * });
 *
 * // With styling
 * Button({
 *   children: "Submit",
 *   onClick: handleSubmit,
 *   style: { border: "round", paddingStart: 2, paddingEnd: 2 },
 * });
 *
 * // With reactive content
 * const [count, setCount] = createSignal(0);
 * Button({
 *   children: () => `Count: ${count()}`,
 *   onClick: () => setCount(c => c + 1),
 * });
 *
 * // With child nodes
 * Button({
 *   children: [
 *     Text({ content: "* " }),
 *     Text({ content: "Favorite" }),
 *   ],
 *   onClick: handleFavorite,
 * });
 * ```
 */
export declare function Button(props: ButtonProps): Node;
//# sourceMappingURL=Button.d.ts.map