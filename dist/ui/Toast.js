// Toast component - temporary notification with auto-dismiss
import { Box } from "../core/components/Box.js";
import { Portal } from "../core/components/Portal.js";
import { onCleanup, resolve } from "../core/signals.js";
import { theme } from "../core/theme.js";
/**
 * Get position styles for a given ToastPosition.
 */
function getPositionStyle(position) {
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
export function Toast(props) {
    const getPosition = () => resolve(props.position) ?? "bottom-right";
    const duration = props.duration ?? theme("toast").duration;
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
//# sourceMappingURL=Toast.js.map