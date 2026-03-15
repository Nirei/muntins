// Separator component - visual divider for content

import type { Buffer } from "../core/buffer.ts";
import { DEFAULT_FLEX_STYLE, type FlexStyle } from "../core/layout.ts";
import type { InheritedStyle, Node } from "../core/runtime.ts";

/** Orientation of the separator. */
export type SeparatorOrientation = "horizontal" | "vertical";

/** Box drawing characters for separator lines. */
const HORIZONTAL_CHAR = "\u2500"; // ─
const VERTICAL_CHAR = "\u2502"; // │

/**
 * Props for the Separator component.
 */
export interface SeparatorProps {
  /** Orientation of the separator. Default: "horizontal" */
  orientation?: SeparatorOrientation | (() => SeparatorOrientation);

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
 * A visual divider that separates content.
 *
 * Renders as a horizontal or vertical line using box drawing characters.
 * The separator fills available space in the appropriate direction:
 * - Horizontal: fills width, height is 1
 * - Vertical: fills height, width is 1
 *
 * Not focusable (purely decorative).
 */
export function Separator(props: SeparatorProps): Node {
  const { orientation, style } = props;

  const getOrientation = (): SeparatorOrientation =>
    resolveValue(orientation, "horizontal");

  const node: Node = {
    get style() {
      const orient = getOrientation();
      const isHorizontal = orient === "horizontal";

      return {
        ...DEFAULT_FLEX_STYLE,
        // Horizontal: fixed height of 1, stretch to fill width (via alignSelf)
        // Vertical: fixed width of 1, stretch to fill height (via alignSelf)
        // alignSelf defaults to "auto" which inherits parent's alignItems (default "stretch")
        width: isHorizontal ? "auto" : 1,
        height: isHorizontal ? 1 : "auto",
        ...style,
      } as FlexStyle;
    },

    measure(availableWidth: number, availableHeight: number) {
      const orient = getOrientation();
      const isHorizontal = orient === "horizontal";

      if (isHorizontal) {
        // Horizontal separator: fills width, 1 cell tall
        const width =
          availableWidth === Number.POSITIVE_INFINITY ? 1 : availableWidth;
        return { width, height: 1 };
      }

      // Vertical separator: 1 cell wide, fills height
      const height =
        availableHeight === Number.POSITIVE_INFINITY ? 1 : availableHeight;
      return { width: 1, height };
    },

    render(
      x: number,
      y: number,
      width: number,
      height: number,
      buffer: Buffer,
      inherited: InheritedStyle,
    ) {
      const orient = getOrientation();
      const isHorizontal = orient === "horizontal";

      const fg = inherited.color;
      const bg = inherited.backgroundColor;

      if (isHorizontal) {
        // Draw horizontal line across the width
        for (let col = 0; col < width; col++) {
          buffer.set(x + col, y, HORIZONTAL_CHAR, fg, bg, 0);
        }
      } else {
        // Draw vertical line down the height
        for (let row = 0; row < height; row++) {
          buffer.set(x, y + row, VERTICAL_CHAR, fg, bg, 0);
        }
      }
    },
  };

  return node;
}
