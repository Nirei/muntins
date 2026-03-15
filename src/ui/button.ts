// Button component - focusable, activatable button

import type { Color, InheritableColor } from "../core/buffer.ts";
import type { KeyEvent, MouseEvent } from "../core/input.ts";
import type { FlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime.ts";
import { Box, Text, useFocus } from "../core/runtime.ts";

/** Visual variant for the Button. */
export type ButtonVariant = "default" | "outline";

/**
 * Props for the Button component.
 */
export interface ButtonProps {
  /** Button label text */
  label: string | (() => string);

  /** Called when button is activated (Enter/Space) */
  onClick?: () => void;

  /** Disable the button */
  disabled?: boolean | (() => boolean);

  /** Visual variant */
  variant?: ButtonVariant | (() => ButtonVariant);

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
 * A focusable, activatable button that responds to Enter/Space key presses.
 *
 * The button renders with a border (default variant uses round border,
 * outline variant uses brackets). When focused, the border color changes
 * to indicate focus. Disabled buttons appear dimmed and do not respond
 * to activation.
 *
 * @example
 * ```typescript
 * // Basic button
 * Button({ label: "Click me", onClick: () => console.log("clicked") })
 *
 * // Disabled button
 * Button({ label: "Disabled", disabled: true })
 *
 * // Outline variant
 * Button({ label: "Submit", variant: "outline" })
 *
 * // Reactive label
 * const [count, setCount] = createSignal(0);
 * Button({
 *   label: () => `Count: ${count()}`,
 *   onClick: () => setCount(c => c + 1),
 * })
 * ```
 */
export function Button(props: ButtonProps): Node {
  const {
    label,
    onClick,
    disabled,
    variant,
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

  // Resolve reactive disabled prop
  const isDisabled = (): boolean =>
    typeof disabled === "function" ? disabled() : (disabled ?? false);

  // Resolve reactive variant prop
  const getVariant = (): ButtonVariant =>
    typeof variant === "function" ? variant() : (variant ?? "default");

  // Handle keyboard activation
  const handleKeyPress = (key: KeyEvent): boolean | undefined => {
    if (isDisabled()) return false;

    if (key.name === "enter" || key.name === "space") {
      onClick?.();
      return true; // Consume the event
    }
    return false; // Let event bubble
  };

  // Handle mouse click
  const handleMousePress = (_event: MouseEvent) => {
    if (isDisabled()) return;

    // Focus this button when clicked
    if (focus && ref) {
      focus.set(ref);
    }

    onClick?.();
  };

  // For outline variant, render with bracket style
  const isOutline = () => getVariant() === "outline";

  // Get the label content
  const getLabel = (): string =>
    typeof label === "function" ? label() : label;

  // Build content based on variant
  const content = (): string => {
    if (isOutline()) {
      return `[ ${getLabel()} ]`;
    }
    return getLabel();
  };

  // Reactive border color based on focus state
  const getBorderColor = (): InheritableColor => {
    if (!focus) return "inherit";

    // Check if this button is currently focused
    if (ref?.current && focus.current() === ref.current) {
      return focusBorderColor;
    }
    return "inherit";
  };

  // For outline variant, we use Text directly without border
  if (typeof variant === "string" && variant === "outline") {
    // Static outline - no border box needed
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
          color: getBorderColor,
        }),
      ],
    });
  }

  // For default variant or reactive variant, use Box with border
  return Box({
    paddingStart: 2,
    paddingEnd: 2,
    border: () => (isOutline() ? false : "round"),
    borderColor: getBorderColor,
    focusable,
    autoFocus,
    ref,
    onKeyPress: handleKeyPress,
    onMousePress: handleMousePress,
    ...style,
    children: [
      Text({
        content: () => (isOutline() ? content() : getLabel()),
        dim: isDisabled,
      }),
    ],
  });
}
