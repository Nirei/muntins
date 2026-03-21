// Checkbox component - boolean toggle control

import type { ActivateEvent, KeyEvent, MouseEvent } from "../core/input.ts";
import type { FlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime.ts";
import { Box, Text } from "../core/runtime.ts";
import { type MaybeAccessor, resolve } from "../core/signals.ts";

/**
 * Props for the Checkbox component.
 */
export interface CheckboxProps {
  /** Whether the checkbox is checked */
  checked: MaybeAccessor<boolean>;

  /** Called when checked state changes */
  onChange?: (checked: boolean) => void;

  /** Disable the checkbox */
  disabled?: MaybeAccessor<boolean>;

  /** Focus control */
  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;

  /** Style overrides for layout */
  style?: Partial<FlexStyle>;
}

/**
 * A boolean toggle control that renders as a single Unicode glyph.
 *
 * Renders as:
 * - Unchecked: `☐` (U+2610 BALLOT BOX)
 * - Checked: `☑` (U+2611 BALLOT BOX WITH CHECK)
 *
 * The checkbox toggles on Enter or Space key press when focused.
 * When disabled, the checkbox is dimmed and does not respond to input.
 *
 * No label is included - use the Label component with `for` prop for association.
 *
 * @example
 * ```typescript
 * const [agreed, setAgreed] = createSignal(false);
 *
 * Box({
 *   flexDirection: "row",
 *   gap: 1,
 *   children: [
 *     Checkbox({
 *       checked: agreed,
 *       onChange: setAgreed,
 *     }),
 *     Label({ children: "I agree to the terms" }),
 *   ],
 * });
 * ```
 */
export function Checkbox(props: CheckboxProps): Node {
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
    ...props.style,
    children: [
      Text({
        content: () => (isChecked() ? "☑" : "☐"),
        dim: isDisabled,
      }),
    ],
  });
}
