import type { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor } from "../core/signals.ts";
import type { ReactiveFlexStyle } from "../core/layout.ts";
import { type MarkdownRenderOptions } from "../markdown/render.ts";
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
export declare function Markdown(props: MarkdownProps): Node;
//# sourceMappingURL=Markdown.d.ts.map