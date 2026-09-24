import { Box } from "../core/components/Box.js";
import { createMemo, resolve } from "../core/signals.js";
import { styleFallback } from "../core/theme.js";
import { parse } from "../markdown/parse.js";
import { renderBlocks, } from "../markdown/render.js";
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
export function Markdown(props) {
    const { content, html, style } = props;
    const blocks = createMemo(() => parse(resolve(content)));
    const themeStyle = styleFallback(style, "markdown");
    const boxProps = {
        ...themeStyle,
        flexDirection: () => resolve(themeStyle.flexDirection) ?? "column",
        alignSelf: () => resolve(themeStyle.alignSelf) ?? "stretch",
        gap: () => resolve(themeStyle.gap) ?? 1,
        children: [renderBlocks(blocks, { html: html ?? "literal" })],
    };
    return Box(boxProps);
}
//# sourceMappingURL=Markdown.js.map