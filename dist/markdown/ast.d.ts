import type { ColumnAlign } from "../ui/Table.ts";
/** Table column definition in the AST. */
export interface MarkdownTableColumn {
    header: MarkdownInline[];
    align?: ColumnAlign;
}
/** Block-level Markdown constructs. */
export type MarkdownBlock = {
    type: "paragraph";
    inlines: MarkdownInline[];
} | {
    type: "heading";
    level: 1 | 2 | 3 | 4 | 5 | 6;
    text: string;
} | {
    type: "code";
    content: string;
    language?: string;
} | {
    type: "blockquote";
    children: MarkdownBlock[];
} | {
    type: "list";
    ordered: boolean;
    start: number;
    items: MarkdownListItem[];
} | {
    type: "table";
    columns: MarkdownTableColumn[];
    rows: MarkdownTableCell[][];
} | {
    type: "thematicBreak";
} | {
    type: "html";
    text: string;
};
/** A list item: loose items have block children, tight items plain inlines. */
export interface MarkdownListItem {
    task?: "checked" | "unchecked";
    children: MarkdownBlock[];
}
/** A table cell's inline content. */
export type MarkdownTableCell = MarkdownInline[];
/** Inline-level Markdown constructs. */
export type MarkdownInline = {
    type: "text";
    text: string;
} | {
    type: "strong";
    children: MarkdownInline[];
} | {
    type: "emphasis";
    children: MarkdownInline[];
} | {
    type: "strikethrough";
    children: MarkdownInline[];
} | {
    type: "codespan";
    text: string;
} | {
    type: "link";
    href: string;
    children: MarkdownInline[];
} | {
    type: "image";
    href: string;
    alt: string;
} | {
    type: "break";
    hard: boolean;
};
//# sourceMappingURL=ast.d.ts.map