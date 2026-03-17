// Button component - focusable, activatable element

import type { KeyEvent, MouseEvent } from "../core/input.ts";
import type { FlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime.ts";
import { Box, Text } from "../core/runtime.ts";
import { resolve } from "../core/signals.ts";

/**
 * Props for the Button component.
 */
export interface ButtonProps {
  /** Button content - text or child nodes */
  children: string | (() => string) | Node | Node[];

  /** Called when button is activated (Enter/Space or click) */
  onClick?: () => void;

  /** Disable the button */
  disabled?: boolean | (() => boolean);

  /** Focus control */
  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;

  /** Style overrides for layout */
  style?: Partial<FlexStyle>;
}

/**
 * Resolve children to an array of nodes.
 * String and function children are wrapped in Text nodes with dim support.
 */
function resolveChildren(
  children: string | (() => string) | Node | Node[],
  dim: () => boolean,
): Node[] {
  if (typeof children === "string") {
    return [Text({ content: children, dim })];
  }
  if (typeof children === "function") {
    return [Text({ content: children as () => string, dim })];
  }
  if (Array.isArray(children)) {
    return children;
  }
  return [children];
}

/**
 * A focusable, activatable button that responds to Enter/Space key presses and mouse clicks.
 *
 * The button is intentionally unstyled - it renders its children with no default
 * border, padding, or colors. Use composition or style overrides to add visual styling.
 *
 * When disabled, string/function children are rendered with dim styling.
 * Node children are rendered as-is (user is responsible for disabled styling).
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

  const handleKeyPress = (key: KeyEvent): boolean | undefined => {
    if (isDisabled()) return false;
    if (key.name === "enter" || key.name === "space") {
      props.onClick?.();
      return true;
    }
    return false;
  };

  const handleMousePress = (_event: MouseEvent): void => {
    if (isDisabled()) return;
    props.onClick?.();
  };

  const children = resolveChildren(props.children, isDisabled);

  return Box({
    focusable: props.focusable ?? true,
    autoFocus: props.autoFocus,
    ref: props.ref,
    onKeyPress: handleKeyPress,
    onMousePress: handleMousePress,
    ...props.style,
    children,
  });
}
