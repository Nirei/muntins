// Toast component - temporary notification with auto-dismiss

import type { FlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime.ts";
import { Box, Portal, Text } from "../core/runtime.ts";
import { type MaybeAccessor, onCleanup, resolve } from "../core/signals.ts";

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
  children: string | (() => string) | Node | Node[];

  /** Duration in ms before auto-dismiss. Default: 3000. 0 = no auto-dismiss */
  duration?: number;

  /** Called when toast should be dismissed */
  onDismiss?: () => void;

  /** Position on screen. Default: "bottom-right" */
  position?: MaybeAccessor<ToastPosition>;

  /** Style overrides */
  style?: Partial<FlexStyle>;
}

/**
 * Normalize children to an array of Nodes.
 */
function resolveChildren(
  children: string | (() => string) | Node | Node[],
): Node[] {
  if (typeof children === "string") {
    return [Text({ content: children })];
  }
  if (typeof children === "function") {
    return [Text({ content: children })];
  }
  if (Array.isArray(children)) {
    return children;
  }
  return [children];
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
  const duration = props.duration ?? 3000;

  // Auto-dismiss timer
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
        children: resolveChildren(props.children),
      }),
    ],
  });
}
