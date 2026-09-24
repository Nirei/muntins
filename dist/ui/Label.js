// Label component - text label for form elements
import { Text } from "../core/components/Text.js";
import { getActiveContext } from "../core/runtime/context.js";
import { styleFallback } from "../core/theme.js";
/**
 * A text label for form elements, optionally associated with a focusable target.
 *
 * When `for` is provided and the label receives a mouse press, focus moves
 * to the referenced element and the element is activated (triggering its
 * onActivate handler). This enables labels to toggle checkboxes, switches,
 * and other activatable components. The label itself is not focusable.
 *
 * @example
 * ```typescript
 * const switchRef = createRef();
 *
 * Box({
 *   flexDirection: "row",
 *   gap: 1,
 *   children: [
 *     Switch({ ref: switchRef, checked, onChange }),
 *     Label({ children: "I agree", for: switchRef }),
 *   ],
 * });
 * ```
 */
export function Label(props) {
    const { children, for: forRef, style } = props;
    // Focus controller for the for association. Only available within a
    // mount context - outside one, for is inert but the label still renders.
    const activeContext = getActiveContext();
    const focus = activeContext === null
        ? null
        : activeContext.app.focus.createController(activeContext.currentScope);
    // Sync with for focused
    const isFocused = () => focus !== null && focus.current() === forRef?.current;
    const handleMousePress = forRef
        ? (_event) => {
            focus?.set(forRef);
            forRef.current?.activate?.();
        }
        : undefined;
    return Text({
        content: children,
        ...styleFallback(style, () => (isFocused() ? "label--focused" : ""), "label"),
        onMousePress: handleMousePress,
    });
}
//# sourceMappingURL=Label.js.map