// Separator component - visual divider for content

import { Box } from "../core/components/Box.ts";
import type { FlexStyle, ReactiveFlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor, resolve } from "../core/signals.ts";
import { styleFallback } from "../core/theme.ts";

/** Orientation of the separator. */
export type SeparatorOrientation = "horizontal" | "vertical";

/**
 * Props for the Separator component.
 */
export interface SeparatorProps {
  /** Orientation of the separator. Default: "horizontal" */
  orientation?: MaybeAccessor<SeparatorOrientation>;

  /** Style overrides */
  style?: Partial<ReactiveFlexStyle>;
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
    resolve(orientation) ?? "horizontal";

  const isHorizontal = () => getOrientation() === "horizontal";

  // Build props as Record so Box resolves functions at runtime
  const boxProps: Record<string, unknown> = {
    // Use a single border edge to create the line
    border: () => (isHorizontal() ? { top: true } : { left: true }),
    // Horizontal: width is 'auto' (fills via alignSelf), fixed height of 1
    // Vertical: fixed width of 1, height is 'auto' (fills via alignSelf)
    // Using 'auto' instead of undefined to avoid overriding DEFAULT_FLEX_STYLE
    width: () => (isHorizontal() ? "auto" : 1),
    height: () => (isHorizontal() ? 1 : "auto"),
    // Stretch to fill available space in the cross-axis
    alignSelf: "stretch",
    ...styleFallback(style, "separator"),
  };

  return Box(boxProps as Parameters<typeof Box>[0]);
}
