// Spinner component - animated loading indicator
import { Box } from "../core/components/Box.js";
import { Text } from "../core/components/Text.js";
import { createEffect, createSignal, onCleanup, resolve, } from "../core/signals.js";
import { theme } from "../core/theme.js";
/**
 * An animated loading indicator that cycles through frames to show activity.
 *
 * The spinner animates at the specified interval, cycling through the frames
 * for the selected variant. When disposed, the animation interval is cleaned up.
 *
 * @example
 * ```typescript
 * // Basic spinner
 * Spinner({});
 *
 * // Spinner with label
 * Spinner({ label: "Loading..." });
 *
 * // Custom variant and speed
 * Spinner({ variant: "arc", interval: 100 });
 * ```
 */
export function Spinner(props) {
    const { variant, interval, label, style } = props;
    const getVariant = () => resolve(variant) ?? "dots";
    const getInterval = () => resolve(interval) ?? theme("spinner").interval;
    const getFrames = () => {
        const key = `spinner--${getVariant()}`;
        return theme(key).frames;
    };
    // Frame index signal for animation
    const [frameIndex, setFrameIndex] = createSignal(0);
    // Reactive interval that restarts when interval prop changes
    createEffect(() => {
        const ms = getInterval();
        const intervalId = setInterval(() => {
            const frames = getFrames();
            setFrameIndex((prev) => (prev + 1) % frames.length);
        }, ms);
        // Clean up interval when effect re-runs or component disposes
        onCleanup(() => {
            clearInterval(intervalId);
        });
    });
    // Create spinner text node
    const spinnerText = Text({
        content: () => {
            const frames = getFrames();
            return frames[frameIndex() % frames.length];
        },
    });
    // If no label, just return the spinner
    if (label === undefined) {
        if (style) {
            return Box({
                ...style,
                children: [spinnerText],
            });
        }
        return spinnerText;
    }
    // With label: horizontal layout with gap
    const labelText = Text({
        content: label,
    });
    return Box({
        flexDirection: "row",
        gap: 1,
        ...style,
        children: [spinnerText, labelText],
    });
}
//# sourceMappingURL=Spinner.js.map