import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import { Box } from "../../src/core/components/Box.ts";
import { Text } from "../../src/core/components/Text.ts";
import { computeLayout } from "../../src/core/layout.ts";
import { DEFAULT_CLIP } from "../../src/core/rects.ts";
import { DEFAULT_INHERITED_STYLE } from "../../src/core/render.ts";
import type { Node } from "../../src/core/runtime/Node.ts";
import { Blockquote } from "../../src/ui/Blockquote.ts";
import { CodeBlock } from "../../src/ui/CodeBlock.ts";
import { Heading } from "../../src/ui/Heading.ts";
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

function childLayout(node: Node, width: number, height: number) {
  const wrapper = Box({
    width,
    height,
    flexDirection: "column",
    alignItems: "flex-start",
    children: [node],
  });
  return computeLayout(toLayoutNode(wrapper), width, height).children[0];
}

function rowText(buffer: RenderBuffer, y: number): string {
  let text = "";
  for (let x = 0; x < buffer.width; x++) {
    const symbol = buffer.getSymbol(x, y);
    text += symbol === "" ? " " : symbol;
  }
  return text.replace(/ +$/, "");
}

describe("Heading", () => {
  it("renders the heading text", () => {
    const buffer = render(Heading({ level: 1, children: "Title" }), 20, 4);
    assert.ok(rowText(buffer, 0).startsWith("Title"));
  });

  it("renders a full-width bottom rule for h1 and h2", () => {
    for (const level of [1, 2] as const) {
      const buffer = render(Heading({ level, children: "Title" }), 10, 4);
      for (let x = 0; x < 10; x++) {
        assert.strictEqual(
          buffer.getSymbol(x, 1),
          "─",
          `level ${level} rule at column ${x}`,
        );
      }
    }
  });

  it("renders no bottom rule for h3-h6", () => {
    for (const level of [3, 4, 5, 6] as const) {
      const buffer = render(Heading({ level, children: "Title" }), 20, 2);
      assert.notStrictEqual(
        buffer.getSymbol(0, 1),
        "─",
        `level ${level} should not have a bottom rule`,
      );
    }
  });

  it("heading text is bold", () => {
    const buffer = render(Heading({ level: 3, children: "T" }), 10, 2);
    assert.strictEqual(buffer.getModifiers(0, 0) & 1, 1);
  });
});

describe("Blockquote", () => {
  it("renders a start bar with padded content", () => {
    const node = Blockquote({
      children: [Text({ content: "quoted" })],
    });
    const buffer = render(node, 20, 3);
    assert.strictEqual(buffer.getSymbol(0, 0), "│");
    assert.strictEqual(buffer.getSymbol(2, 0), "q");
    assert.ok(rowText(buffer, 0).startsWith("│ quoted"));
  });

  it("bar spans all content lines", () => {
    const node = Blockquote({
      children: [Text({ content: "one" }), Text({ content: "two" })],
    });
    const buffer = render(node, 20, 3);
    assert.strictEqual(buffer.getSymbol(0, 0), "│");
    assert.strictEqual(buffer.getSymbol(0, 1), "│");
  });

  it("nests by composition", () => {
    const node = Blockquote({
      children: [
        Text({ content: "outer" }),
        Blockquote({ children: [Text({ content: "inner" })] }),
      ],
    });
    const buffer = render(node, 20, 4);
    assert.strictEqual(buffer.getSymbol(0, 0), "│");
    assert.strictEqual(buffer.getSymbol(2, 1), "│");
    assert.strictEqual(buffer.getSymbol(4, 1), "i");
  });

  it("accepts a string child", () => {
    const node = Blockquote({ children: "hello" });
    const buffer = render(node, 20, 3);
    assert.ok(rowText(buffer, 0).startsWith("│ hello"));
  });
});

describe("CodeBlock", () => {
  it("renders preformatted lines verbatim with padding", () => {
    const buffer = render(CodeBlock({ content: "abc\n  def" }), 20, 4);
    assert.strictEqual(buffer.getSymbol(1, 1), "a");
    assert.strictEqual(buffer.getSymbol(3, 2), "d");
  });

  it("never wraps long lines (intrinsic width is full content)", () => {
    const node = CodeBlock({ content: "abcdefgh" });
    // Find the inner text leaf and measure it directly
    const findLeaf = (n: Node): Node =>
      n.children && (n.children as Node[]).length > 0
        ? findLeaf((n.children as Node[])[0])
        : n;
    const leaf = findLeaf(node);
    const m = leaf.measure?.(4, 100) as { width: number };
    assert.strictEqual(m.width, 8);
  });

  it("renders multi-line height", () => {
    const node = CodeBlock({ content: "a\nb\nc" });
    const layout = childLayout(node, 20, 20);
    assert.strictEqual(layout.height, 5); // 3 lines + top/bottom padding
  });
});
