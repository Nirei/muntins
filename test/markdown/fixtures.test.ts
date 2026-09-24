import assert from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import { Box } from "../../src/core/components/Box.ts";
import { computeLayout } from "../../src/core/layout.ts";
import { DEFAULT_CLIP } from "../../src/core/rects.ts";
import { DEFAULT_INHERITED_STYLE } from "../../src/core/render.ts";
import { createRoot } from "../../src/core/signals.ts";
import type { Node } from "../../src/core/runtime/Node.ts";
import { Markdown } from "../../src/ui/Markdown.ts";
import { paintTree, toLayoutNode } from "../test-helpers.ts";

const fixturePath = fileURLToPath(
  new URL("./fixtures/sample.md", import.meta.url),
);
const source = readFileSync(fixturePath, "utf8");

const WIDTH = 46;

function renderFixture(): RenderBuffer {
  let node!: Node;
  createRoot((dispose) => {
    node = Markdown({ content: source });
    return dispose;
  });
  const wrapper = Box({
    width: WIDTH,
    height: 400,
    flexDirection: "column",
    alignItems: "flex-start",
    children: [node],
  });
  const buffer = new RenderBuffer(WIDTH, 400);
  const layout = computeLayout(toLayoutNode(wrapper), WIDTH, 400);
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

function findRow(
  buffer: RenderBuffer,
  predicate: (row: string) => boolean,
  from = 0,
): number {
  for (let y = from; y < buffer.height; y++) {
    if (predicate(rowText(buffer, y))) return y;
  }
  return -1;
}

describe("Markdown fixture (golden)", () => {
  const buffer = renderFixture();

  it("renders the h1 and its rule", () => {
    const title = findRow(buffer, (row) => row.startsWith("Muntins Fixture"));
    assert.ok(title >= 0, "h1 text found");
    assert.ok(rowText(buffer, title + 1).includes("─"), "h1 rule");
  });

  it("renders inline styles in a paragraph", () => {
    const para = findRow(buffer, (row) =>
      row.startsWith("A paragraph with bold"),
    );
    assert.ok(para >= 0);
    assert.ok(rowText(buffer, para).includes("emphasis"));
    assert.ok(rowText(buffer, para).includes("struck"));
    // wrapped continuation carries the image alt text
    assert.ok(rowText(buffer, para + 1).includes("![image]"));
  });

  it("renders nested blockquotes", () => {
    const quote = findRow(buffer, (row) => row.startsWith("│ A quote"));
    assert.ok(quote >= 0);
    const nested = findRow(
      buffer,
      (row) => row.startsWith("│ │ Nested"),
      quote,
    );
    assert.ok(nested > quote, "nested quote after outer");
  });

  it("renders nested bullets and tasks", () => {
    assert.ok(findRow(buffer, (r) => r === "• bullet one") >= 0);
    assert.ok(findRow(buffer, (r) => r.startsWith("  • nested bullet")) >= 0);
    assert.ok(findRow(buffer, (r) => r.startsWith("☑ done task")) >= 0);
    assert.ok(findRow(buffer, (r) => r.startsWith("☐ open task")) >= 0);
  });

  it("renders ordered items", () => {
    assert.ok(findRow(buffer, (r) => r.startsWith("1. ordered alpha")) >= 0);
    assert.ok(findRow(buffer, (r) => r.startsWith("2. ordered beta")) >= 0);
  });

  it("renders the GFM table with alignment", () => {
    const top = findRow(buffer, (row) => row.startsWith("┌"));
    assert.ok(top >= 0, "table top border");
    const header = rowText(buffer, top + 1);
    assert.ok(header.includes("Feature"));
    assert.ok(header.includes("Status"));
    const body = rowText(buffer, top + 3);
    assert.ok(body.includes("tables"));
    assert.ok(body.includes("GFM"));
  });

  it("renders the code block with unicode", () => {
    const code = findRow(buffer, (row) => row.includes("const greeting"));
    assert.ok(code >= 0);
    assert.ok(rowText(buffer, code).includes("héllo"));
  });

  it("renders the thematic break", () => {
    const code = findRow(buffer, (row) => row.includes("const greeting"));
    const rule = findRow(
      buffer,
      (row) => row.length > 0 && /^[─ ]+$/.test(row) && row.includes("─"),
      code,
    );
    assert.ok(rule > code, "thematic break after code block");
  });

  it("renders html as literal and the trailing paragraph", () => {
    assert.ok(findRow(buffer, (row) => row.includes("<aside>")) >= 0);
    assert.ok(findRow(buffer, (row) => row.startsWith("Final paragraph")) >= 0);
  });
});
