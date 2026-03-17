// Progress component - progress bar showing completion percentage

import type { InheritableColor } from "../core/buffer.ts";
import type { FlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime.ts";
import { Box, Text } from "../core/runtime.ts";
import { type MaybeAccessor, resolve } from "../core/signals.ts";

/** Number of sub-cell divisions per cell for smooth progress visualization. */
const EIGHTHS_PER_CELL = 8;

/**
 * Block characters for sub-cell precision, indexed by eighths (0-8).
 * Index 0 = empty (space), index 8 = full block.
 */
const BLOCKS = [
  " ", // 0/8
  "\u258F", // ▏ 1/8
  "\u258E", // ▎ 2/8
  "\u258D", // ▍ 3/8
  "\u258C", // ▌ 4/8
  "\u258B", // ▋ 5/8
  "\u258A", // ▊ 6/8
  "\u2589", // ▉ 7/8
  "\u2588", // █ 8/8
];

/**
 * Props for the Progress component.
 */
export interface ProgressProps {
  /** Progress value from 0 to 100. */
  value: MaybeAccessor<number>;

  /** Total width of the progress bar in cells. Default: 20 */
  width?: MaybeAccessor<number>;

  /** Color of the filled portion (block characters). */
  color?: MaybeAccessor<InheritableColor>;

  /** Background color (visible in empty portion). */
  backgroundColor?: MaybeAccessor<InheritableColor>;

  /** Style overrides */
  style?: Partial<FlexStyle>;
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
  const getWidth = (): number => resolve(width) ?? 20;

  // Generate progress bar string reactively
  const getContent = (): string => {
    const barWidth = getWidth();
    const currentValue = getValue();

    // Calculate total eighths filled
    const totalEighths = Math.round(
      (currentValue / 100) * barWidth * EIGHTHS_PER_CELL,
    );
    const fullCells = Math.floor(totalEighths / EIGHTHS_PER_CELL);
    const remainder = totalEighths % EIGHTHS_PER_CELL;

    // Build the bar string
    const full = BLOCKS[8].repeat(fullCells);
    const partial = remainder > 0 ? BLOCKS[remainder] : "";
    const emptyCount = barWidth - fullCells - (remainder > 0 ? 1 : 0);
    const empty = BLOCKS[0].repeat(emptyCount);

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
