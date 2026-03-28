// Progress component - progress bar showing completion percentage

import type { InheritableColor } from "../core/buffer.ts";
import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime.ts";
import { Box, Text } from "../core/runtime.ts";
import { type MaybeAccessor, resolve } from "../core/signals.ts";
import { theme } from "../core/theme.ts";

/** Number of sub-cell divisions per cell for smooth progress visualization. */
const EIGHTHS_PER_CELL = 8;

/**
 * Props for the Progress component.
 */
export interface ProgressProps {
  /** Progress value from 0 to 100. */
  value: MaybeAccessor<number>;

  /** Total width of the progress bar in cells. Default from theme. */
  width?: MaybeAccessor<number>;

  /** Color of the filled portion (block characters). */
  color?: MaybeAccessor<InheritableColor>;

  /** Background color (visible in empty portion). */
  backgroundColor?: MaybeAccessor<InheritableColor>;

  /** Style overrides */
  style?: Partial<ReactiveFlexStyle>;
}

/**
 * Clamps a value to the 0-100 range.
 */
function clampValue(value: number): number {
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
export function Progress(props: ProgressProps): Node {
  const { value, width, color, backgroundColor, style } = props;

  const getValue = (): number => clampValue(resolve(value) ?? 0);
  const getWidth = (): number =>
    resolve(width) ?? (theme("progress").width as number);

  // Generate progress bar string reactively
  const getContent = (): string => {
    const barWidth = getWidth();
    const currentValue = getValue();
    const blocks = theme("progress").chars as string[];

    // Calculate total eighths filled
    const totalEighths = Math.round(
      (currentValue / 100) * barWidth * EIGHTHS_PER_CELL,
    );
    const fullCells = Math.floor(totalEighths / EIGHTHS_PER_CELL);
    const remainder = totalEighths % EIGHTHS_PER_CELL;

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
    overflow: "hidden" as const,
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
