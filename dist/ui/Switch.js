// Switch component - on/off toggle control
import { Box } from "../core/components/Box.js";
import { Text } from "../core/components/Text.js";
import { resolve } from "../core/signals.js";
import { styleFallback, theme } from "../core/theme.js";
/**
 * An on/off toggle control that renders as a 2-character track with a sliding indicator.
 *
 * The switch toggles on Enter or Space key press when focused.
 * When disabled, the switch is dimmed and does not respond to input.
 *
 * @example
 * ```typescript
 * const [darkMode, setDarkMode] = createSignal(false);
 *
 * Box({
 *   flexDirection: "row",
 *   gap: 1,
 *   children: [
 *     Label({ children: "Dark mode" }),
 *     Switch({
 *       checked: darkMode,
 *       onChange: setDarkMode,
 *     }),
 *   ],
 * });
 * ```
 */
export function Switch(props) {
    const isChecked = () => resolve(props.checked) ?? false;
    const isDisabled = () => resolve(props.disabled) ?? false;
    const handleActivate = (_event) => {
        if (isDisabled())
            return;
        props.onChange?.(!isChecked());
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
        ref: props.ref,
        onActivate: handleActivate,
        onKeyPress: handleKeyPress,
        onMousePress: handleMousePress,
        ...styleFallback(props.style, "switch"),
        children: [
            Text({
                content: () => {
                    const t = theme("switch");
                    return isChecked()
                        ? t.checkedChar
                        : t.uncheckedChar;
                },
                ...styleFallback(undefined, () => (isDisabled() ? "switch--disabled" : ""), () => (isChecked() ? "switch--checked" : "switch--unchecked")),
            }),
        ],
    });
}
//# sourceMappingURL=Switch.js.map