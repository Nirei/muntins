// Markdown AST → component tree.
//
// Composes the generic ui components (Heading, Blockquote, CodeBlock,
// List, Table, Separator) and RichText. Knows nothing about any parser.

import { Box } from "../core/components/Box.ts";
import { For } from "../core/components/For.ts";
import { RichText } from "../core/components/RichText.ts";
import type { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor, createMemo, resolve } from "../core/signals.ts";
import type { StyledSpan } from "../core/text.ts";
import { theme } from "../core/theme.ts";
import { Blockquote } from "../ui/Blockquote.ts";
import { CodeBlock } from "../ui/CodeBlock.ts";
import { Heading } from "../ui/Heading.ts";
import { List, ListItem } from "../ui/List.ts";
import { Separator } from "../ui/Separator.ts";
import { Table, type TableCell } from "../ui/Table.ts";
import type { MarkdownBlock, MarkdownInline } from "./ast.ts";

/** Options for rendering a Markdown document. */
export interface MarkdownRenderOptions {
  /** How to treat HTML blocks: "literal" (dimmed source) or "skip". */
  html?: "literal" | "skip";
}

/** Convert inline nodes into styled spans. */
function inlineToSpans(inlines: readonly MarkdownInline[]): StyledSpan[] {
  const spans: StyledSpan[] = [];
  const push = (span: StyledSpan): void => {
    // Merge into the previous span when styles match exactly
    const previous = spans[spans.length - 1];
    if (previous && sameStyle(previous, span)) {
      previous.text += span.text;
    } else {
      spans.push(span);
    }
  };

  const walk = (nodes: readonly MarkdownInline[], style: StyledStyle): void => {
    for (const node of nodes) {
      switch (node.type) {
        case "text":
          push({ ...style, text: node.text });
          break;
        case "strong":
          walk(node.children, { ...style, bold: true });
          break;
        case "emphasis":
          walk(node.children, { ...style, italic: true });
          break;
        case "strikethrough":
          walk(node.children, { ...style, strikethrough: true });
          break;
        case "codespan":
          push({
            ...style,
            text: node.text,
            color: spanColor("code"),
            backgroundColor: undefined,
          });
          break;
        case "link":
          walk(node.children, {
            ...style,
            color: spanColor("link"),
            underline: true,
          });
          break;
        case "image":
          push({ ...style, text: `![${node.alt}]`, color: spanColor("image") });
          break;
        case "break":
          push({ ...style, text: node.hard ? "\n" : " " });
          break;
      }
    }
  };

  walk(inlines, {});
  return spans;
}

interface StyledStyle {
  color?: ReturnType<typeof spanColor>;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
}

function sameStyle(a: StyledSpan, b: StyledSpan): boolean {
  return (
    a.color === b.color &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.strikethrough === b.strikethrough &&
    a.underline === b.underline &&
    a.backgroundColor === b.backgroundColor &&
    a.inverse === b.inverse
  );
}

function spanColor(key: string): StyledSpan["color"] {
  return theme(key).color as StyledSpan["color"];
}

/** Render one Markdown block to a component node. */
function blockToNode(
  block: MarkdownBlock,
  options: MarkdownRenderOptions,
): Node {
  switch (block.type) {
    case "paragraph":
      return RichText({ spans: inlineToSpans(block.inlines) });
    case "heading":
      return Heading({ level: block.level, children: block.text });
    case "code":
      return CodeBlock({
        content: block.content,
        language: block.language,
      });
    case "blockquote":
      return Blockquote({
        children: block.children.map((child) => blockToNode(child, options)),
      });
    case "list":
      return List({
        ordered: block.ordered,
        start: block.start,
        gap: 0,
        children: block.items.map((item) =>
          ListItem({
            task: item.task,
            children: item.children.map((child) => blockToNode(child, options)),
          }),
        ),
      });
    case "table":
      return Table({
        columns: block.columns.map((column) => ({
          header: cellText(column.header),
          align: column.align,
        })),
        rows: block.rows.map((row) =>
          row.map((cell) => inlineToSpans(cell) as TableCell),
        ),
      });
    case "thematicBreak":
      return Separator({ orientation: "horizontal" });
    case "html":
      return options.html === "skip"
        ? Box({})
        : CodeBlock({ content: block.text });
  }
}

function cellText(inlines: readonly MarkdownInline[]): string {
  return inlineToSpans(inlines)
    .map((span) => span.text)
    .join("")
    .replace(/\n/g, " ");
}

/**
 * Build the component tree for parsed Markdown blocks.
 *
 * Blocks are laid out in a vertical container with one blank row between
 * them (theme `markdown.gap`).
 */
export function renderBlocks(
  blocks: MaybeAccessor<readonly MarkdownBlock[]>,
  options: MarkdownRenderOptions = {},
): Node {
  const getBlocks = createMemo(() => resolve(blocks));

  // Keyed by block index so appending to a document only builds nodes
  // for the new tail; existing nodes are reused via For's reconciliation.
  const entries = createMemo(() =>
    getBlocks().map((block, index) => ({ index, block })),
  );

  return Box({
    flexDirection: "column",
    alignItems: "stretch",
    gap: () => (theme("markdown").gap as number | undefined) ?? 1,
    children: [
      For({
        each: entries,
        key: (entry) => entry.index,
        render: (entry) => blockToNode(entry().block, options),
      }),
    ],
  });
}
