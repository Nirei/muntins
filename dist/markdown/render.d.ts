import type { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor } from "../core/signals.ts";
import type { MarkdownBlock } from "./ast.ts";
/** Options for rendering a Markdown document. */
export interface MarkdownRenderOptions {
    /** How to treat HTML blocks: "literal" (dimmed source) or "skip". */
    html?: "literal" | "skip";
}
/**
 * Build the component tree for parsed Markdown blocks.
 *
 * Blocks are laid out in a vertical container with one blank row between
 * them (theme `markdown.gap`).
 */
export declare function renderBlocks(blocks: MaybeAccessor<readonly MarkdownBlock[]>, options?: MarkdownRenderOptions): Node;
//# sourceMappingURL=render.d.ts.map