import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import { Box } from "../../src/core/components/Box.ts";
import { Text } from "../../src/core/components/Text.ts";
import { computeLayout } from "../../src/core/layout.ts";
import { DEFAULT_CLIP } from "../../src/core/rects.ts";
import { DEFAULT_INHERITED_STYLE } from "../../src/core/render.ts";
import type { Node } from "../../src/core/runtime/Node.ts";
import { List, ListItem } from "../../src/ui/List.ts";
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

describe("List", () => {
  it("renders bullet markers", () => {
    const node = List({
      gap: 0,
      children: [ListItem({ children: "one" }), ListItem({ children: "two" })],
    });
    const buffer = render(node, 20, 5);
    assert.strictEqual(rowText(buffer, 0), "• one");
    assert.strictEqual(rowText(buffer, 1), "• two");
  });

  it("renders right-aligned ordered numbers", () => {
    const node = List({
      ordered: true,
      start: 9,
      gap: 0,
      children: [ListItem({ children: "nine" }), ListItem({ children: "ten" })],
    });
    const buffer = render(node, 20, 5);
    assert.strictEqual(rowText(buffer, 0), " 9. nine");
    assert.strictEqual(rowText(buffer, 1), "10. ten");
  });

  it("ordered markers align wrapped content under the text", () => {
    const node = List({
      ordered: true,
      children: [
        ListItem({ children: "a long item that wraps around" }),
        ListItem({ children: "b" }),
      ],
    });
    const buffer = render(node, 12, 6);
    assert.ok(rowText(buffer, 0).startsWith("1. a"));
    // continuation aligns at marker width (3), not under the number
    assert.strictEqual(buffer.getSymbol(2, 1), " ");
    assert.notStrictEqual(buffer.getSymbol(3, 1), " ");
  });

  it("renders task checkbox markers", () => {
    const node = List({
      gap: 0,
      children: [
        ListItem({ task: "checked", children: "done" }),
        ListItem({ task: "unchecked", children: "todo" }),
        ListItem({ children: "plain" }),
      ],
    });
    const buffer = render(node, 20, 5);
    assert.strictEqual(rowText(buffer, 0), "☑ done");
    assert.strictEqual(rowText(buffer, 1), "☐ todo");
    assert.strictEqual(rowText(buffer, 2), "• plain");
  });

  it("loose list separates items by one blank row (default gap)", () => {
    const node = List({
      children: [ListItem({ children: "one" }), ListItem({ children: "two" })],
    });
    const buffer = render(node, 20, 5);
    assert.strictEqual(rowText(buffer, 1), "");
    assert.strictEqual(rowText(buffer, 2), "• two");
  });

  it("tight list has no blank rows (gap 0)", () => {
    const node = List({
      gap: 0,
      children: [ListItem({ children: "one" }), ListItem({ children: "two" })],
    });
    const buffer = render(node, 20, 5);
    assert.strictEqual(rowText(buffer, 1), "• two");
  });

  it("accepts string children directly", () => {
    const node = List({
      gap: 0,
      children: [ListItem({ children: "one" }), "raw string"],
    });
    const buffer = render(node, 20, 5);
    assert.strictEqual(rowText(buffer, 0), "• one");
    assert.strictEqual(rowText(buffer, 1), "raw string");
  });

  it("multi-line item content stays aligned", () => {
    const node = List({
      gap: 0,
      children: [ListItem({ children: Text({ content: "l1\nl2" }) })],
    });
    const buffer = render(node, 20, 5);
    assert.strictEqual(rowText(buffer, 0), "• l1");
    assert.strictEqual(buffer.getSymbol(2, 1), "l");
  });
});
