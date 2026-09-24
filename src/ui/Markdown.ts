import { Box } from "../core/components/Box.ts";
import type { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor, createMemo, resolve } from "../core/signals.ts";
import type { ReactiveFlexStyle } from "../core/layout.ts";
import { styleFallback } from "../core/theme.ts";
import { parse } from "../markdown/parse.ts";
import {
  renderBlocks,
  type MarkdownRenderOptions,
} from "../markdown/render.ts";

/** Props for the Markdown component. */
export interface MarkdownProps extends MarkdownRenderOptions {
  /** Markdown source text */
  content: MaybeAccessor<string>;

  /** Style overrides */
  style?: Partial<ReactiveFlexStyle>;
}

/**
 * Renders a Markdown document.
 *
 * The source is parsed (memoized) into a neutral AST and rendered with the
 * generic components: `Heading`, `CodeBlock`, `Blockquote`, `List`,
 * `Table`, `Separator`, and `RichText` for styled paragraphs. GFM tables,
 * task lists, strikethrough, and autolinks are supported. HTML blocks are
 * shown as dimmed literal source by default (`html: "skip"` drops them).
 *
 * @example
 * ```typescript
 * Markdown({ content: () => fileTextSignal() });
 * ```
 */
export function Markdown(props: MarkdownProps): Node {
  const { content, html, style } = props;

  const blocks = createMemo(() => parse(resolve(content)));

  const themeStyle = styleFallback(style, "markdown");

  const boxProps: Record<string, unknown> = {
    ...themeStyle,
    flexDirection: () => resolve(themeStyle.flexDirection) ?? "column",
    alignSelf: () => resolve(themeStyle.alignSelf) ?? "stretch",
    gap: () => resolve(themeStyle.gap as number | undefined) ?? 1,
    children: [renderBlocks(blocks, { html: html ?? "literal" })],
  };

  return Box(boxProps as Parameters<typeof Box>[0]);
}
