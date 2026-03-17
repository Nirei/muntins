// Progress component - progress bar showing completion percentage

import type { InheritableColor } from "../core/buffer.ts";
import type { FlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime.ts";
import { Box, Text } from "../core/runtime.ts";

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
  value: number | (() => number);

  /** Total width of the progress bar in cells. Default: 20 */
  width?: number | (() => number);

  /** Color of the filled portion (block characters). */
  color?: InheritableColor | (() => InheritableColor);

  /** Background color (visible in empty portion). */
  backgroundColor?: InheritableColor | (() => InheritableColor);

  /** Style overrides */
  style?: Partial<FlexStyle>;
}

/**
 * Resolves a value that may be static or a getter function.
 */
function resolveValue<T>(value: T | (() => T) | undefined, defaultValue: T): T {
  if (value === undefined) return defaultValue;
  return typeof value === "function" ? (value as () => T)() : value;
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

  const getValue = (): number => clampValue(resolveValue(value, 0));
  const getWidth = (): number => resolveValue(width, 20);

  // Generate progress bar string reactively
  const getContent = (): string => {
    const barWidth = getWidth();
    const currentValue = getValue();

    // Calculate total eighths filled (8 eighths per cell)
    const totalEighths = Math.round((currentValue / 100) * barWidth * 8);
    const fullCells = Math.floor(totalEighths / 8);
    const remainder = totalEighths % 8;

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
