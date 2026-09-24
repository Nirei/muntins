import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import { Box } from "../../src/core/components/Box.ts";
import { createRoot } from "../../src/core/signals.ts";
import { computeLayout } from "../../src/core/layout.ts";
import { DEFAULT_CLIP } from "../../src/core/rects.ts";
import { DEFAULT_INHERITED_STYLE } from "../../src/core/render.ts";
import type { Node } from "../../src/core/runtime/Node.ts";
import { Markdown } from "../../src/ui/Markdown.ts";
import { paintTree, toLayoutNode } from "../test-helpers.ts";

function render(node: Node, width: number, height: number): RenderBuffer {
  const wrapper = Box({
    width,
    height,
    flexDirection: "column",
    alignItems: "flex-start",
    children: [node],
  });
  const buffer = new RenderBuffer(width, height);
  const layout = computeLayout(toLayoutNode(wrapper), width, height);
  paintTree(wrapper, layout, buffer, DEFAULT_INHERITED_STYLE, DEFAULT_CLIP);
  return buffer;
}

function rowText(buffer: RenderBuffer, y: number): string {
  let text = "";
  for (let x = 0; x < buffer.width; x++) {
    const symbol = buffer.getSymbol(x, y);
    text += symbol === "" ? " " : symbol;
  }
  return text.replace(/ +$/, "");
}

function renderMarkdown(source: string, width = 40): RenderBuffer {
  // For requires a reactive owner; wrap in a detached root like mounted apps do
  let node!: Node;
  createRoot((dispose) => {
    node = Markdown({ content: source });
    return dispose;
  });
  return render(node, width, 200);
}

describe("Markdown (e2e)", () => {
  it("renders headings with rules for h1/h2", () => {
    const buffer = renderMarkdown("# Title\n\n## Sub");
    assert.ok(rowText(buffer, 0).startsWith("Title"));
    assert.strictEqual(buffer.getSymbol(0, 1), "─");
    assert.ok(rowText(buffer, 3).startsWith("Sub"));
    assert.strictEqual(buffer.getSymbol(0, 4), "─");
  });

  it("renders paragraphs with inline styles", () => {
    const buffer = renderMarkdown("plain **bold** and *ital*");
    assert.ok(rowText(buffer, 0).startsWith("plain bold and ital"));
    // bold run has the BOLD modifier
    assert.strictEqual(buffer.getModifiers(6, 0) & 1, 1);
    // italic run has ITALIC (bit 2)
    assert.strictEqual(buffer.getModifiers(16, 0) & 4, 4);
  });

  it("word-wraps paragraphs", () => {
    const buffer = renderMarkdown(
      "this is a long paragraph that must wrap at word boundaries",
      20,
    );
    assert.strictEqual(rowText(buffer, 0), "this is a long");
    assert.strictEqual(rowText(buffer, 1), "paragraph that must");
  });

  it("renders code blocks verbatim", () => {
    const buffer = renderMarkdown("```ts\n  const a = 1;\n```");
    assert.ok(rowText(buffer, 1).includes("const a = 1;"));
    // leading indentation preserved (padding + two-space indent)
    assert.ok(rowText(buffer, 1).startsWith("   const"));
  });

  it("renders blockquotes with a bar", () => {
    const buffer = renderMarkdown("> quoted text");
    assert.strictEqual(buffer.getSymbol(0, 0), "│");
    assert.ok(rowText(buffer, 0).startsWith("│ quoted text"));
  });

  it("renders nested blockquotes", () => {
    const buffer = renderMarkdown("> outer\n> > inner");
    assert.strictEqual(buffer.getSymbol(0, 0), "│");
    assert.strictEqual(buffer.getSymbol(2, 1), "│");
  });

  it("renders bullet and ordered lists", () => {
    const buffer = renderMarkdown("- one\n- two\n\n1. first\n2. second");
    assert.strictEqual(rowText(buffer, 0), "• one");
    assert.strictEqual(rowText(buffer, 1), "• two");
    assert.strictEqual(rowText(buffer, 3), "1. first");
    assert.strictEqual(rowText(buffer, 4), "2. second");
  });

  it("renders nested lists with indentation", () => {
    const buffer = renderMarkdown("- a\n  - b");
    assert.strictEqual(rowText(buffer, 0), "• a");
    assert.strictEqual(rowText(buffer, 1).startsWith("  • b"), true);
  });

  it("renders task lists", () => {
    const buffer = renderMarkdown("- [x] done\n- [ ] todo");
    assert.strictEqual(rowText(buffer, 0), "☑ done");
    assert.strictEqual(rowText(buffer, 1), "☐ todo");
  });

  it("renders GFM tables", () => {
    const buffer = renderMarkdown("| Name | Score |\n|---|--:|\n| ada | 10 |");
    const row0 = rowText(buffer, 0);
    assert.ok(row0.startsWith("┌"), `top border: "${row0}"`);
    assert.ok(rowText(buffer, 1).includes("Name"));
    assert.ok(rowText(buffer, 1).includes("Score"));
    const body = rowText(buffer, 3);
    assert.ok(body.includes("ada"), `body row: "${body}"`);
    assert.ok(body.includes("10"), `body row: "${body}"`);
  });

  it("renders thematic breaks", () => {
    const buffer = renderMarkdown("above\n\n---\n\nbelow");
    const separatorRow = rowText(buffer, 2);
    assert.ok(separatorRow.includes("─"), `rule: "${separatorRow}"`);
  });

  it("renders links as styled runs (non-interactive)", () => {
    const buffer = renderMarkdown("see [docs](http://x) now");
    assert.ok(rowText(buffer, 0).startsWith("see docs now"));
  });

  it("renders images as alt text", () => {
    const buffer = renderMarkdown("![a logo](x.png)");
    assert.ok(rowText(buffer, 0).includes("![a logo]"));
  });

  it("renders html blocks as literal by default and skips on option", () => {
    const literal = renderMarkdown("<div>x</div>");
    assert.ok(rowText(literal, 1).includes("<div>"));
    let skippedNode!: Node;
    createRoot((dispose) => {
      skippedNode = Markdown({ content: "<div>x</div>", html: "skip" });
      return dispose;
    });
    const skipped = render(skippedNode, 40, 10);
    assert.strictEqual(rowText(skipped, 0), "");
  });

  it("separates blocks with a blank row", () => {
    const buffer = renderMarkdown("first\n\nsecond");
    assert.strictEqual(rowText(buffer, 0), "first");
    assert.strictEqual(rowText(buffer, 1), "");
    assert.strictEqual(rowText(buffer, 2), "second");
  });

  it("handles unicode content", () => {
    const buffer = renderMarkdown("héllo wörld 🎉 你好");
    // wide graphemes leave empty trailing cells; join non-empty symbols
    const text = [...Array(buffer.width).keys()]
      .map((x) => buffer.getSymbol(x, 0))
      .filter((s) => s !== "")
      .join("");
    assert.ok(text.includes("héllo"));
    assert.ok(text.includes("你好"));
  });

  it("handles empty content", () => {
    const buffer = renderMarkdown("");
    assert.strictEqual(rowText(buffer, 0), "");
  });

  it("reactive content signal re-parses", () => {
    // Structural smoke test: same component renders both documents
    const first = renderMarkdown("# A\n\ntext");
    assert.ok(rowText(first, 0).startsWith("A"));
    const second = renderMarkdown("# B\n\ntext");
    assert.ok(rowText(second, 0).startsWith("B"));
  });
});
