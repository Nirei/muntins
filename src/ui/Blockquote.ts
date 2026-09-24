import { Box, type BoxChild } from "../core/components/Box.ts";
import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime/Node.ts";
import { resolve } from "../core/signals.ts";
import { styleFallback } from "../core/theme.ts";

/** Props for the Blockquote component. */
export interface BlockquoteProps {
  /** Quoted content: nodes (or strings) laid out vertically inside the quote */
  children: BoxChild | BoxChild[];

  /** Style overrides */
  style?: Partial<ReactiveFlexStyle>;
}

/**
 * A quotation block with a vertical bar on its start edge and inner padding.
 *
 * Nesting is plain composition: put a `Blockquote` inside a `Blockquote`.
 * The bar color and inner text color come from the `blockquote` theme slice.
 * Standalone use: callouts and asides.
 *
 * @example
 * ```typescript
 * Blockquote({ children: Text({ content: "Famous words." }) });
 * ```
 */
export function Blockquote(props: BlockquoteProps): Node {
  const { children, style } = props;

  const themeStyle = styleFallback(style, "blockquote");

  const boxProps: Record<string, unknown> = {
    ...themeStyle,
    flexDirection: () => resolve(themeStyle.flexDirection) ?? "column",
    alignSelf: () => resolve(themeStyle.alignSelf) ?? "stretch",
    border: () => ({ left: true }),
    paddingStart: () =>
      resolve(themeStyle.paddingStart as number | undefined) ?? 1,
    paddingBottom: () =>
      resolve(themeStyle.paddingBottom as number | undefined) ?? 0,
    paddingTop: () => resolve(themeStyle.paddingTop as number | undefined) ?? 0,
    children,
  };

  return Box(boxProps as Parameters<typeof Box>[0]);
}
