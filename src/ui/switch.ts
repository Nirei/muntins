// Switch component - on/off toggle control

import type { KeyEvent } from "../core/input.ts";
import type { FlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime.ts";
import { Box, Text } from "../core/runtime.ts";
import { type MaybeAccessor, resolve } from "../core/signals.ts";

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
  style?: Partial<FlexStyle>;
}

/**
 * An on/off toggle control that renders as a 2-character track with a sliding indicator.
 *
 * Renders as:
 * - Off: `■ ` (indicator on left)
 * - On: ` ■` (indicator on right)
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

  const handleKeyPress = (key: KeyEvent): boolean | undefined => {
    if (isDisabled()) return false;
    if (key.name === "enter" || key.name === "space") {
      props.onChange?.(!isChecked());
      return true;
    }
    return false;
  };

  return Box({
    focusable: props.focusable ?? true,
    autoFocus: props.autoFocus,
    ref: props.ref,
    onKeyPress: handleKeyPress,
    ...props.style,
    children: [
      Text({
        content: () => (isChecked() ? " ■" : "■ "),
        dim: isDisabled,
      }),
    ],
  });
}
