import type { MarkdownBlock } from "./ast.ts";
/**
 * Parse a Markdown document into the neutral block AST.
 *
 * Normalizations applied here so the rendering side stays dumb:
 * - soft line breaks become spaces, hard breaks become `break` inlines
 * - GFM task list items are detected into `task` markers
 * - table alignment maps onto `ColumnAlign`
 * - link reference definitions are resolved by marked (invisible here)
 */
export declare function parse(markdown: string): MarkdownBlock[];
//# sourceMappingURL=parse.d.ts.map