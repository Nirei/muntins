// Switch component - on/off toggle control

import type { ActivateEvent, KeyEvent, MouseEvent } from "../core/input.ts";
import type { FlexStyle, ReactiveFlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime.ts";
import { Box, Text } from "../core/runtime.ts";
import { type MaybeAccessor, resolve } from "../core/signals.ts";
import { styleFallback, theme } from "../core/theme.ts";

/**
 * Props for the Switch component.
 */
export interface SwitchProps {
  /** Whether the switch is on */
  checked: MaybeAccessor<boolean>;

  /** Called when switch state changes */
  onChange?: (checked: boolean) => void;

  /** Disable the switch */
  disabled?: MaybeAccessor<boolean>;

  /** Focus control */
  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;

  /** Style overrides for layout */
  style?: Partial<ReactiveFlexStyle>;
}

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
export function Switch(props: SwitchProps): Node {
  const isChecked = () => resolve(props.checked) ?? false;
  const isDisabled = () => resolve(props.disabled) ?? false;

  const handleActivate = (_event: ActivateEvent): void => {
    if (isDisabled()) return;
    props.onChange?.(!isChecked());
  };

  const handleKeyPress = (event: KeyEvent): boolean | undefined => {
    if (isDisabled()) return false;
    if (event.name === "enter" || event.name === "space") {
      event.target.activate?.();
      return true;
    }
    return false;
  };

  const handleMousePress = (event: MouseEvent): void => {
    if (isDisabled()) return;
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
            ? (t.checkedChar as string)
            : (t.uncheckedChar as string);
        },
        ...styleFallback(
          undefined,
          () => (isDisabled() ? "switch--disabled" : ""),
          () => (isChecked() ? "switch--checked" : "switch--unchecked"),
        ),
      }),
    ],
  });
}
