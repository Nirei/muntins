// Toggle component - a button that toggles between pressed and unpressed states

import type { Color, InheritableColor } from "../core/buffer.ts";
import type { KeyEvent, MouseEvent } from "../core/input.ts";
import type { FlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime.ts";
import { Box, Text, useFocus } from "../core/runtime.ts";

/**
 * Props for the Toggle component.
 */
export interface ToggleProps {
  /** Whether the toggle is pressed */
  pressed: boolean | (() => boolean);

  /** Called when toggle state changes */
  onChange?: (pressed: boolean) => void;

  /** Toggle label text */
  label: string | (() => string);

  /** Disable the toggle */
  disabled?: boolean | (() => boolean);

  /** Focus control */
  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;

  /** Style overrides */
  style?: Partial<FlexStyle>;

  /** Border color when focused */
  focusBorderColor?: Color;
}

/**
 * A button that toggles between pressed and unpressed states.
 *
 * The toggle renders with brackets around the label. When pressed,
 * the label is displayed with inverse styling. When focused, the
 * bracket color changes to indicate focus. Disabled toggles appear
 * dimmed and do not respond to activation.
 *
 * @example
 * ```typescript
 * // Controlled toggle
 * const [pressed, setPressed] = createSignal(false);
 * Toggle({
 *   label: "Bold",
 *   pressed,
 *   onChange: setPressed,
 * })
 *
 * // Disabled toggle
 * Toggle({ label: "Disabled", pressed: false, disabled: true })
 *
 * // Reactive label
 * Toggle({
 *   label: () => pressed() ? "ON" : "OFF",
 *   pressed,
 *   onChange: setPressed,
 * })
 * ```
 */
export function Toggle(props: ToggleProps): Node {
  const {
    pressed,
    onChange,
    label,
    disabled,
    focusable = true,
    autoFocus,
    ref,
    style,
    focusBorderColor = { type: "named", index: 6 }, // cyan
  } = props;

  // Get focus controller for reactive focus state
  let focus: ReturnType<typeof useFocus> | undefined;
  try {
    focus = useFocus();
  } catch {
    // Outside mount context - focus features won't work
  }

  // Resolve reactive pressed prop
  const isPressed = (): boolean =>
    typeof pressed === "function" ? pressed() : pressed;

  // Resolve reactive disabled prop
  const isDisabled = (): boolean =>
    typeof disabled === "function" ? disabled() : (disabled ?? false);

  // Resolve reactive label prop
  const getLabel = (): string =>
    typeof label === "function" ? label() : label;

  // Handle keyboard activation
  const handleKeyPress = (key: KeyEvent): boolean | undefined => {
    if (isDisabled()) return false;

    if (key.name === "enter" || key.name === "space") {
      onChange?.(!isPressed());
      return true; // Consume the event
    }
    return false; // Let event bubble
  };

  // Handle mouse click
  const handleMousePress = (_event: MouseEvent) => {
    if (isDisabled()) return;

    // Focus this toggle when clicked
    if (focus && ref) {
      focus.set(ref);
    }

    onChange?.(!isPressed());
  };

  // Build content with brackets
  const content = (): string => {
    const labelText = getLabel();
    if (isPressed()) {
      return `[*${labelText}*]`;
    }
    return `[ ${labelText} ]`;
  };

  // Reactive border color based on focus state
  const getColor = (): InheritableColor => {
    if (!focus) return "inherit";

    // Check if this toggle is currently focused
    if (ref?.current && focus.current() === ref.current) {
      return focusBorderColor;
    }
    return "inherit";
  };

  return Box({
    focusable,
    autoFocus,
    ref,
    onKeyPress: handleKeyPress,
    onMousePress: handleMousePress,
    ...style,
    children: [
      Text({
        content,
        dim: isDisabled,
        inverse: isPressed,
        color: getColor,
      }),
    ],
  });
}
