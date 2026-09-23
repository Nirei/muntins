// Progress component - progress bar showing completion percentage
import { Box } from "../core/components/Box.js";
import { Text } from "../core/components/Text.js";
import { resolve } from "../core/signals.js";
import { theme } from "../core/theme.js";
/** Number of sub-cell divisions per cell for smooth progress visualization. */
const SUBDIVISIONS_PER_CELL = 8;
/**
 * Clamps a value to the 0-100 range.
 */
function clampValue(value) {
    return Math.max(0, Math.min(100, value));
}
/**
 * A progress bar showing completion percentage with sub-cell precision.
 *
 * Renders as a horizontal bar using Unicode block characters to achieve
 * smooth visual progression. With a width of 20 cells, there are 160
 * possible visual states (20 cells × 8 eighths per cell).
 *
 * Not focusable (purely visual).
 *
 * @example
 * ```typescript
 * // Basic progress bar
 * Progress({ value: 50 });
 *
 * // Custom width and colors
 * Progress({
 *   value: 75,
 *   width: 30,
 *   color: { type: "named", index: 2 },        // green
 *   backgroundColor: { type: "named", index: 0 }, // black
 * });
 * ```
 */
export function Progress(props) {
    const { value, width, color, backgroundColor, style } = props;
    const getValue = () => clampValue(resolve(value) ?? 0);
    const getWidth = () => resolve(width) ?? theme("progress").width;
    // Generate progress bar string reactively
    const getContent = () => {
        const barWidth = getWidth();
        const currentValue = getValue();
        const blocks = theme("progress").chars;
        // Calculate total eighths filled
        const totalEighths = Math.round((currentValue / 100) * barWidth * SUBDIVISIONS_PER_CELL);
        const fullCells = Math.floor(totalEighths / SUBDIVISIONS_PER_CELL);
        const remainder = totalEighths % SUBDIVISIONS_PER_CELL;
        // Build the bar string
        const full = blocks[8].repeat(fullCells);
        const partial = remainder > 0 ? blocks[remainder] : "";
        const emptyCount = barWidth - fullCells - (remainder > 0 ? 1 : 0);
        const empty = blocks[0].repeat(emptyCount);
        return full + partial + empty;
    };
    return Box({
        width: getWidth(),
        height: 1,
        overflow: "hidden",
        ...style,
        children: [
            Text({
                content: getContent,
                color,
                backgroundColor,
            }),
        ],
    });
}
//# sourceMappingURL=Progress.js.map