// Button component - focusable, activatable element
import { Box } from "../core/components/Box.js";
import { useFocus } from "../core/components/useFocus.js";
import { createRef } from "../core/runtime/Node.js";
import { createSignal, resolve } from "../core/signals.js";
import { styleFallback } from "../core/theme.js";
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
export function Button(props) {
    const isDisabled = () => resolve(props.disabled) ?? false;
    const [isHovered, setIsHovered] = createSignal(false);
    const ref = createRef(props.ref);
    const focus = useFocus();
    const isFocused = () => focus.current() === ref.current;
    const handleActivate = (_event) => {
        if (isDisabled())
            return;
        props.onClick?.();
    };
    const handleKeyPress = (event) => {
        if (isDisabled())
            return false;
        if (event.name === "enter" || event.name === "space") {
            event.target.activate?.();
            return true;
        }
        return false;
    };
    const handleMousePress = (event) => {
        if (isDisabled())
            return;
        event.target.activate?.();
    };
    return Box({
        focusable: props.focusable ?? true,
        autoFocus: props.autoFocus,
        ref: ref,
        onActivate: handleActivate,
        onKeyPress: handleKeyPress,
        onMousePress: handleMousePress,
        onHover: setIsHovered,
        ...styleFallback(props.style, () => (isDisabled() ? "button--disabled" : ""), () => (isFocused() ? "button--focused" : ""), () => (isHovered() ? "button--hover" : ""), "button"),
        children: props.children,
    });
}
//# sourceMappingURL=Button.js.map