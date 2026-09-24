import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import { RichText } from "../../src/core/components/RichText.ts";
import { computeLayout } from "../../src/core/layout.ts";
import { DEFAULT_CLIP } from "../../src/core/rects.ts";
import { DEFAULT_INHERITED_STYLE } from "../../src/core/render.ts";
import type { Node } from "../../src/core/runtime/Node.ts";
import { type StyledSpan, layoutStyledSpans } from "../../src/core/text.ts";
import { paintTree, toLayoutNode } from "../test-helpers.ts";

function renderNode(node: Node, width: number, height: number): RenderBuffer {
  const buffer = new RenderBuffer(width, height);
  const layout = computeLayout(toLayoutNode(node), width, height);
  paintTree(node, layout, buffer, DEFAULT_INHERITED_STYLE, DEFAULT_CLIP);
  return buffer;
}

function lineTexts(
  lines: readonly { segments: readonly { grapheme: string }[] }[],
): string[] {
  return lines.map((line) => line.segments.map((s) => s.grapheme).join(""));
}

describe("layoutStyledSpans", () => {
  it("keeps span indices attached to segments", () => {
    const spans: StyledSpan[] = [{ text: "ab", bold: true }, { text: "cd" }];
    const lines = layoutStyledSpans(spans, 10, "word");
    assert.deepEqual(lineTexts(lines), ["abcd"]);
    assert.deepEqual(
      lines[0].segments.map((s) => s.spanIndex),
      [0, 0, 1, 1],
    );
  });

  it("hard breaks split lines within a span", () => {
    const lines = layoutStyledSpans([{ text: "ab\ncd" }], 10, "word");
    assert.deepEqual(lineTexts(lines), ["ab", "cd"]);
  });

  it("word wraps across span boundaries", () => {
    const spans: StyledSpan[] = [
      { text: "hello " },
      { text: "bold", bold: true },
      { text: " tail" },
    ];
    const lines = layoutStyledSpans(spans, 6, "word");
    assert.deepEqual(lineTexts(lines), ["hello", "bold", "tail"]);
  });

  it("never wraps in none mode", () => {
    const lines = layoutStyledSpans([{ text: "abcdefgh" }], 3, "none");
    assert.deepEqual(lineTexts(lines), ["abcdefgh"]);
  });

  it("empty spans produce a single empty line", () => {
    const lines = layoutStyledSpans([], 10, "word");
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0].segments.length, 0);
  });
});

describe("RichText", () => {
  it("renders spans with per-span styles", () => {
    const node = RichText({
      spans: [
        { text: "plain " },
        { text: "bold", bold: true },
        { text: " rest" },
      ],
    });
    const buffer = renderNode(node, 40, 3);
    assert.strictEqual(buffer.getSymbol(0, 0), "p");
    assert.strictEqual(buffer.getSymbol(6, 0), "b");
    // modifiers differ per span (bit 0 = BOLD)
    assert.strictEqual(
      buffer.getModifiers(0, 0) & 1,
      0,
      "plain text is not bold",
    );
    assert.strictEqual(buffer.getModifiers(6, 0) & 1, 1, "span text is bold");
    assert.strictEqual(
      buffer.getModifiers(10, 0) & 1,
      0,
      "text after span is not bold",
    );
  });

  it("word wraps by default", () => {
    const node = RichText({
      spans: [{ text: "hello bold world" }, { text: "!" }],
    });
    const buffer = renderNode(node, 11, 3);
    assert.strictEqual(buffer.getSymbol(0, 0), "h");
    assert.strictEqual(buffer.getSymbol(0, 1), "w");
    assert.strictEqual(buffer.getSymbol(5, 1), "!");
  });

  it("applies node-level style as base inherited by spans", () => {
    const node = RichText({
      spans: [{ text: "dim then ", dim: false }, { text: "span" }],
      dim: true,
    });
    const buffer = renderNode(node, 40, 1);
    // DIM is bit 1 (value 2): first span overrides to not-dim,
    // second span inherits the node-level dim
    assert.strictEqual(buffer.getModifiers(0, 0) & 2, 0);
    assert.strictEqual(buffer.getModifiers(9, 0) & 2, 2);
  });

  it("renders hard breaks as new lines", () => {
    const node = RichText({ spans: [{ text: "one\ntwo" }] });
    const buffer = renderNode(node, 10, 2);
    assert.strictEqual(buffer.getSymbol(0, 0), "o");
    assert.strictEqual(buffer.getSymbol(0, 1), "t");
  });

  it("measures intrinsic size (word wrap)", () => {
    const node = RichText({ spans: [{ text: "aaa bbb" }] });
    const m = node.measure?.(
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ) as {
      width: number;
      height: number;
    };
    assert.strictEqual(m.width, 7);
    assert.strictEqual(m.height, 1);
  });

  it("measures wrapped size at constrained width", () => {
    const node = RichText({ spans: [{ text: "aaa bbb" }] });
    const m = node.measure?.(3, Number.POSITIVE_INFINITY) as {
      width: number;
      height: number;
    };
    assert.strictEqual(m.width, 3);
    assert.strictEqual(m.height, 2);
  });
});
