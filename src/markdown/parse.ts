// Markdown parser adapter.
//
// The ONLY module that imports `marked`. Converts marked's token stream
// into the neutral AST from ast.ts. Swapping the parser touches this file
// alone — rendering never imports a parser.

import { Lexer } from "marked";
import type {
  MarkdownBlock,
  MarkdownInline,
  MarkdownListItem,
  MarkdownTableCell,
  MarkdownTableColumn,
} from "./ast.ts";

/**
 * Parse a Markdown document into the neutral block AST.
 *
 * Normalizations applied here so the rendering side stays dumb:
 * - soft line breaks become spaces, hard breaks become `break` inlines
 * - GFM task list items are detected into `task` markers
 * - table alignment maps onto `ColumnAlign`
 * - link reference definitions are resolved by marked (invisible here)
 */
export function parse(markdown: string): MarkdownBlock[] {
  const tokens = new Lexer({ gfm: true }).lex(markdown);
  return (tokens as unknown[]).flatMap((token) =>
    blockFromToken(token as Record<string, unknown>),
  );
}

function blockFromToken(token: Record<string, unknown>): MarkdownBlock[] {
  switch (token.type) {
    case "space":
      return [];
    case "heading":
      return [
        {
          type: "heading",
          level: headingLevel(token.depth),
          text: textFromTokens(token.tokens) ?? String(token.text ?? ""),
        },
      ];
    case "paragraph":
      return [{ type: "paragraph", inlines: inlineChildren(token.tokens) }];
    case "code":
      return [
        {
          type: "code",
          content: String(token.text ?? ""),
          language: langOf(token.lang),
        },
      ];
    case "blockquote":
      return [
        {
          type: "blockquote",
          children: (
            (token.tokens as Record<string, unknown>[] | undefined) ?? []
          ).flatMap((child) =>
            blockFromToken(child as Record<string, unknown>),
          ),
        },
      ];
    case "hr":
      return [{ type: "thematicBreak" }];
    case "table":
      return [tableFromToken(token)];
    case "html":
      return [{ type: "html", text: String(token.text ?? "") }];
    case "list": {
      const items = (
        (token.items as Record<string, unknown>[] | undefined) ?? []
      ).map(listItemFromToken);
      return [
        {
          type: "list",
          ordered: Boolean(token.ordered),
          start: Number(token.start ?? 1) || 1,
          items,
        },
      ];
    }
    case "text":
      // Loose text outside paragraphs (e.g. tight list item content
      // surfaced by flatMap): treat as a paragraph
      return [{ type: "paragraph", inlines: inlineChildren(token.tokens) }];
    default:
      return [];
  }
}

function headingLevel(depth: unknown): 1 | 2 | 3 | 4 | 5 | 6 {
  const level = Math.min(6, Math.max(1, Number(depth) || 1));
  return level as 1 | 2 | 3 | 4 | 5 | 6;
}

function langOf(lang: unknown): string | undefined {
  if (typeof lang !== "string" || lang === "") return undefined;
  return lang.split(/\s+/)[0];
}

function listItemFromToken(token: Record<string, unknown>): MarkdownListItem {
  let task: "checked" | "unchecked" | undefined;
  if (token.task === true) {
    task = token.checked === true ? "checked" : "unchecked";
  }

  const rawTokens =
    (token.tokens as Record<string, unknown>[] | undefined) ?? [];
  // A tight list item has a single text token carrying inline tokens
  // directly; a loose item contains paragraph/block tokens.
  const children: MarkdownBlock[] = rawTokens.flatMap(blockFromToken);

  // Strip the task marker checkbox `[ ] `/`[x] ` from the first text run
  if (task !== undefined) {
    stripTaskPrefix(children);
  }

  return { task, children };
}

/** Remove a leading `[ ] ` / `[x] ` from the first inline text of the item. */
function stripTaskPrefix(children: MarkdownBlock[]): void {
  const first = children[0];
  if (!first || first.type !== "paragraph") return;
  const firstInline = first.inlines[0];
  if (!firstInline || firstInline.type !== "text") return;
  firstInline.text = firstInline.text.replace(/^\[([ xX])\]\s*/, "");
  if (firstInline.text === "") first.inlines.shift();
}

function tableFromToken(token: Record<string, unknown>): MarkdownBlock {
  const header = (token.header ?? []) as Record<string, unknown>[];
  const aligns = (token.align ?? []) as (string | null)[];
  const rows = (token.rows ?? []) as Record<string, unknown>[][];

  const columns: MarkdownTableColumn[] = header.map((cell, i) => ({
    header: inlineChildren(cell.tokens),
    align: alignOf(aligns[i]),
  }));

  const cells: MarkdownTableCell[][] = rows.map((row) =>
    row.map((cell) => inlineChildren(cell.tokens)),
  );

  return { type: "table", columns, rows: cells };
}

function alignOf(
  align: string | null | undefined,
): MarkdownTableColumn["align"] {
  if (align === "center") return "center";
  if (align === "right") return "right";
  if (align === "left") return "left";
  return undefined;
}

function inlineChildren(tokens: unknown): MarkdownInline[] {
  if (tokens === undefined || tokens === null) return [];
  if (!Array.isArray(tokens)) return [];
  return (tokens as Record<string, unknown>[]).flatMap(inlineFromToken);
}

function inlineFromToken(token: Record<string, unknown>): MarkdownInline[] {
  switch (token.type) {
    case "text":
    case "escape": {
      // Soft line breaks surface as "\n" inside text tokens; CommonMark
      // renders them as spaces. Hard breaks arrive as separate `br` tokens.
      const text = String(token.text ?? "").replace(/\n/g, " ");
      return [{ type: "text", text }];
    }
    case "strong":
      return [{ type: "strong", children: inlineChildren(token.tokens) }];
    case "em":
      return [{ type: "emphasis", children: inlineChildren(token.tokens) }];
    case "del":
      return [
        { type: "strikethrough", children: inlineChildren(token.tokens) },
      ];
    case "codespan":
      return [{ type: "codespan", text: String(token.text ?? "") }];
    case "link":
      return [
        {
          type: "link",
          href: String(token.href ?? ""),
          children: inlineChildren(token.tokens),
        },
      ];
    case "image":
      return [
        {
          type: "image",
          href: String(token.href ?? ""),
          alt: String(token.text ?? ""),
        },
      ];
    case "br":
      return [{ type: "break", hard: true }];
    default:
      // Unknown inline token: keep its raw text rather than dropping content
      return token.raw ? [{ type: "text", text: String(token.raw) }] : [];
  }
}

/** Flatten inline tokens to plain text (for headings, alt text). */
function textFromTokens(tokens: unknown): string | null {
  if (tokens === undefined || tokens === null) return null;
  if (!Array.isArray(tokens)) return null;
  const flat = (list: Record<string, unknown>[]): string =>
    list
      .map((token) =>
        Array.isArray(token.tokens)
          ? flat(token.tokens as Record<string, unknown>[])
          : String(token.text ?? ""),
      )
      .join("");
  const text = flat(tokens as Record<string, unknown>[]);
  return text === "" ? null : text;
}
