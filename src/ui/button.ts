// Button component - focusable, activatable element

import type { ActivateEvent, KeyEvent, MouseEvent } from "../core/input.ts";
import type { FlexStyle } from "../core/layout.ts";
import type { BoxChild, Node, Ref } from "../core/runtime.ts";
import { Box } from "../core/runtime.ts";
import { type MaybeAccessor, resolve } from "../core/signals.ts";

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
  style?: Partial<FlexStyle>;
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
export function Button(props: ButtonProps): Node {
  const isDisabled = () => resolve(props.disabled) ?? false;

  const handleActivate = (_event: ActivateEvent): void => {
    if (isDisabled()) return;
    props.onClick?.();
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
    children: props.children,
  });
}
