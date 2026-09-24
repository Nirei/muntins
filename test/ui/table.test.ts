import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import { Box } from "../../src/core/components/Box.ts";
import { computeLayout } from "../../src/core/layout.ts";
import { DEFAULT_CLIP } from "../../src/core/rects.ts";
import { DEFAULT_INHERITED_STYLE } from "../../src/core/render.ts";
import type { Node } from "../../src/core/runtime/Node.ts";
import { Table } from "../../src/ui/Table.ts";
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

const COLUMNS = [
  { header: "Name" },
  { header: "Size", align: "right" },
] as const;

describe("Table", () => {
  it("renders grid, header, and rows", () => {
    const node = Table({
      columns: [{ header: "Name" }, { header: "Size" }],
      rows: [
        ["ada", "10"],
        ["grace", "9"],
      ],
    });
    const buffer = render(node, 20, 8);
    assert.strictEqual(rowText(buffer, 0), "┌───────┬──────┐");
    assert.strictEqual(rowText(buffer, 1), "│ Name  │ Size │");
    assert.strictEqual(rowText(buffer, 2), "├───────┼──────┤");
    assert.strictEqual(rowText(buffer, 3), "│ ada   │ 10   │");
    assert.strictEqual(rowText(buffer, 4), "│ grace │ 9    │");
    assert.strictEqual(rowText(buffer, 5), "└───────┴──────┘");
  });

  it("right-aligns cells per column", () => {
    const node = Table({
      columns: [{ header: "A" }, { header: "B", align: "right" }],
      rows: [
        ["x", "1"],
        ["yyyy", "22"],
      ],
    });
    const buffer = render(node, 20, 6);
    assert.strictEqual(rowText(buffer, 3), "│ x    │  1 │");
    assert.strictEqual(rowText(buffer, 4), "│ yyyy │ 22 │");
  });

  it("header is bold", () => {
    const node = Table({
      columns: [{ header: "A" }],
      rows: [["a"]],
    });
    const buffer = render(node, 10, 5);
    assert.strictEqual(buffer.getModifiers(2, 1) & 1, 1); // header
    assert.strictEqual(buffer.getModifiers(2, 3) & 1, 0); // body
  });

  it("wraps long cell content within its column", () => {
    const node = Table({
      columns: [{ header: "A" }, { header: "B" }],
      rows: [["a very long cell value here", "z"]],
    });
    const buffer = render(node, 18, 10);
    // Row grows taller than one line and stays inside the grid
    assert.ok(buffer.getSymbol(0, 4) !== "");
    const bottom = rowText(buffer, 6);
    assert.ok(bottom.startsWith("└"), `bottom border present: "${bottom}"`);
  });

  it("measures intrinsic width from max-content", () => {
    const node = Table({
      columns: [{ header: "Name" }, { header: "Size" }],
      rows: [["ada", "10"]],
    });
    const wrapper = Box({
      width: 100,
      height: 20,
      flexDirection: "column",
      alignItems: "flex-start",
      children: [node],
    });
    const layout = computeLayout(toLayoutNode(wrapper), 100, 20);
    const table = layout.children[0];
    // │ Name │ Size │ = 15 columns
    assert.strictEqual(table.width, 15);
    assert.strictEqual(table.height, 5);
  });

  it("renders styled-span cells", () => {
    const node = Table({
      columns: [{ header: "A" }],
      rows: [[[{ text: "bold", bold: true }]]],
    });
    const buffer = render(node, 10, 5);
    assert.strictEqual(buffer.getSymbol(2, 3), "b");
    assert.strictEqual(buffer.getModifiers(2, 3) & 1, 1);
  });

  it("handles ragged rows", () => {
    const node = Table({
      columns: [{ header: "A" }, { header: "B" }],
      rows: [["only-one"]],
    });
    const buffer = render(node, 14, 5);
    assert.ok(rowText(buffer, 3).startsWith("│ only-one"));
  });

  it("empty rows table still draws header", () => {
    const node = Table({
      columns: [{ header: "A" }],
      rows: [],
    });
    const buffer = render(node, 10, 5);
    assert.strictEqual(rowText(buffer, 0), "┌───┐");
    assert.strictEqual(rowText(buffer, 1), "│ A │");
    assert.strictEqual(rowText(buffer, 2), "├───┤");
    assert.strictEqual(rowText(buffer, 3), "└───┘");
  });
});

describe("Table borders with alignment", () => {
  it("right-aligned cells do not erase the right border", () => {
    const node = Table({
      columns: [{ header: "A" }, { header: "B", align: "right" }],
      rows: [["x", "1"]],
    });
    const buffer = render(node, 20, 5);
    for (const y of [1, 3]) {
      // content rows only — separator/border rows end with ├/┤ style chars
      const row = rowText(buffer, y);
      const last = row[row.length - 1];
      assert.strictEqual(
        last,
        "│",
        `row ${y} keeps its closing border (got "${row}")`,
      );
    }
  });

  it("center-aligned cells do not erase borders", () => {
    const node = Table({
      columns: [{ header: "A", align: "center" }],
      rows: [["x"]],
    });
    const buffer = render(node, 20, 5);
    for (const y of [1, 3]) {
      const row = rowText(buffer, y);
      assert.strictEqual(row[0], "│", `row ${y} start border`);
      assert.strictEqual(row[row.length - 1], "│", `row ${y} end border`);
    }
  });
});
