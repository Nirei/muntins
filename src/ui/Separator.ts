// Separator component - visual divider for content

import { Box } from "../core/components/Box.ts";
import type { ReactiveFlexStyle } from "../core/layout.ts";
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

  // styleFallback emits an entry for every style key, so spreading it after
  // our own props would clobber them with theme getters. Resolve through it
  // instead: instance style > theme > component default.
  const themeStyle = styleFallback(style, "separator");

  // Build props as Record so Box resolves functions at runtime
  const boxProps: Record<string, unknown> = {
    // Use a single border edge to create the line
    border: () => (isHorizontal() ? { top: true } : { left: true }),
    ...themeStyle,
    // Horizontal: width is 'auto' (fills via stretch), fixed height of 1
    // Vertical: fixed width of 1, height is 'auto' (fills via stretch)
    alignSelf: () => resolve(themeStyle.alignSelf) ?? "stretch",
    width: () => resolve(themeStyle.width) ?? (isHorizontal() ? "auto" : 1),
    height: () => resolve(themeStyle.height) ?? (isHorizontal() ? 1 : "auto"),
  };

  return Box(boxProps as Parameters<typeof Box>[0]);
}
