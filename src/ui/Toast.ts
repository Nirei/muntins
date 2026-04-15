// Toast component - temporary notification with auto-dismiss

import type { BoxChild } from "../core/components/Box.ts";
import { Box } from "../core/components/Box.ts";
import { Portal } from "../core/components/Portal.ts";
import type { FlexStyle, ReactiveFlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor, onCleanup, resolve } from "../core/signals.ts";
import { theme } from "../core/theme.ts";

/**
 * Position options for Toast placement on screen.
 */
export type ToastPosition =
  | "top-left"
  | "top-right"
  | "top-center"
  | "bottom-left"
  | "bottom-right"
  | "bottom-center";

/**
 * Props for the Toast component.
 */
export interface ToastProps {
  /** Toast content */
  children: BoxChild | BoxChild[];

  /** Duration in ms before auto-dismiss. Default from theme. 0 = no auto-dismiss */
  duration?: number;

  /** Called when toast should be dismissed */
  onDismiss?: () => void;

  /** Position on screen. Default: "bottom-right" */
  position?: MaybeAccessor<ToastPosition>;

  /** Style overrides */
  style?: Partial<ReactiveFlexStyle>;
}

/**
 * Get position styles for a given ToastPosition.
 */
function getPositionStyle(position: ToastPosition): Partial<FlexStyle> {
  switch (position) {
    case "top-left":
      return { top: 0, start: 0 };
    case "top-right":
      return { top: 0, end: 0 };
    case "top-center":
      return { top: 0, alignSelf: "center" };
    case "bottom-left":
      return { bottom: 0, start: 0 };
    case "bottom-right":
      return { bottom: 0, end: 0 };
    case "bottom-center":
      return { bottom: 0, alignSelf: "center" };
  }
}

/**
 * A temporary notification that appears and auto-dismisses after a duration.
 *
 * Toast renders at the specified position via Portal, making it appear at the
 * root level of the screen regardless of where it's placed in the component tree.
 *
 * The toast is intentionally unstyled - it renders its children with no default
 * border, padding, or colors. Use style overrides to add visual styling.
 *
 * @example
 * ```typescript
 * // Basic usage with Show for conditional rendering
 * const [showToast, setShowToast] = createSignal(false);
 *
 * Show({
 *   when: showToast,
 *   children: () =>
 *     Toast({
 *       children: "File saved",
 *       duration: 3000,
 *       onDismiss: () => setShowToast(false),
 *     }),
 * })
 *
 * // With styling
 * Toast({
 *   children: "Error: Connection lost",
 *   position: "top-center",
 *   style: {
 *     border: "single",
 *     padding: 1,
 *   },
 *   onDismiss: () => setShowToast(false),
 * })
 *
 * // No auto-dismiss (duration: 0)
 * Toast({
 *   children: "Click to dismiss",
 *   duration: 0,
 *   onDismiss: handleDismiss,
 * })
 * ```
 */
export function Toast(props: ToastProps): Node {
  const getPosition = () => resolve(props.position) ?? "bottom-right";
  const duration = props.duration ?? (theme("toast").duration as number);

  if (duration !== 0) {
    const timer = setTimeout(() => {
      props.onDismiss?.();
    }, duration);

    onCleanup(() => clearTimeout(timer));
  }

  return Portal({
    children: [
      Box({
        position: "absolute",
        ...getPositionStyle(getPosition()),
        ...props.style,
        children: props.children,
      }),
    ],
  });
}
