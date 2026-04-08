import assert from "node:assert";
import { describe, it } from "node:test";
import { type Color, Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import { computeLayout } from "../../src/core/layout.ts";
import {
  DEFAULT_CLIP,
  DEFAULT_INHERITED_STYLE,
  type Node,
} from "../../src/core/runtime.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Progress } from "../../src/ui/Progress.ts";
import { paintTree, toLayoutNode } from "../test-helpers.ts";

function renderProgress(node: Node, width: number): RenderBuffer {
  const buffer = new RenderBuffer(width + 5, 1);
  const layoutNode = toLayoutNode(node);
  const layout = computeLayout(layoutNode, width + 5, 1);
  paintTree(node, layout, buffer, DEFAULT_INHERITED_STYLE, DEFAULT_CLIP);
  return buffer;
}

// Block characters indexed by eighths (0-8)
const BLOCKS = [
  " ", // 0/8
  "\u258F", // ▏ 1/8
  "\u258E", // ▎ 2/8
  "\u258D", // ▍ 3/8
  "\u258C", // ▌ 4/8
  "\u258B", // ▋ 5/8
  "\u258A", // ▊ 6/8
  "\u2589", // ▉ 7/8
  "\u2588", // █ 8/8
];

describe("Progress", () => {
  describe("basic rendering", () => {
    it("renders empty bar at value=0", () => {
      const node = Progress({ value: 0 });
      const buffer = renderProgress(node, 20);

      // All cells should be spaces
      for (let x = 0; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), " ");
      }
    });

    it("renders full bar at value=100", () => {
      const node = Progress({ value: 100 });
      const buffer = renderProgress(node, 20);

      // All cells should be full blocks
      for (let x = 0; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), BLOCKS[8]); // █
      }
    });

    it("renders half fill at value=50", () => {
      const node = Progress({ value: 50 });
      const buffer = renderProgress(node, 20);

      // 50% of 20 cells = 10 full cells, 10 empty
      for (let x = 0; x < 10; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), BLOCKS[8]); // █
      }
      for (let x = 10; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), " ");
      }
    });
  });

  describe("sub-cell precision", () => {
    it("renders partial block for fractional fill", () => {
      // 12.5% of 20 cells = 20 eighths = 2 full cells + 4/8 partial
      // Actually: 0.125 * 20 * 8 = 20 eighths = 2 full + 4 remainder
      const node = Progress({ value: 12.5 });
      const buffer = renderProgress(node, 20);

      // 2 full cells
      assert.strictEqual(buffer.getSymbol(0, 0), BLOCKS[8]); // █
      assert.strictEqual(buffer.getSymbol(1, 0), BLOCKS[8]); // █
      // 1 half cell
      assert.strictEqual(buffer.getSymbol(2, 0), BLOCKS[4]); // ▌
      // Rest empty
      for (let x = 3; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), " ");
      }
    });

    it("renders 1/8 partial block", () => {
      // 0.625% of 20 cells = 1 eighth
      // 0.00625 * 20 * 8 = 1
      const node = Progress({ value: 0.625 });
      const buffer = renderProgress(node, 20);

      assert.strictEqual(buffer.getSymbol(0, 0), BLOCKS[1]); // ▏
      for (let x = 1; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), " ");
      }
    });

    it("renders 7/8 partial block", () => {
      // We want: 0 full cells + 7/8 partial
      // 7 eighths out of 160 total = 7/160 = 4.375%
      const node = Progress({ value: 4.375 });
      const buffer = renderProgress(node, 20);

      assert.strictEqual(buffer.getSymbol(0, 0), BLOCKS[7]); // ▉
      for (let x = 1; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), " ");
      }
    });

    it("provides 160 visual states for width=20", () => {
      // Test that different percentages produce different visual states
      const seen = new Set<string>();

      for (let eighths = 0; eighths <= 160; eighths++) {
        const value = (eighths / 160) * 100;
        const node = Progress({ value });
        const buffer = renderProgress(node, 20);

        // Capture the visual state
        let state = "";
        for (let x = 0; x < 20; x++) {
          state += buffer.getSymbol(x, 0);
        }
        seen.add(state);
      }

      // Should have 161 unique states (0 through 160 eighths)
      assert.strictEqual(seen.size, 161);
    });
  });

  describe("value clamping", () => {
    it("clamps values below 0 to 0", () => {
      const node = Progress({ value: -50 });
      const buffer = renderProgress(node, 20);

      // All cells should be spaces
      for (let x = 0; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), " ");
      }
    });

    it("clamps values above 100 to 100", () => {
      const node = Progress({ value: 150 });
      const buffer = renderProgress(node, 20);

      // All cells should be full blocks
      for (let x = 0; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), BLOCKS[8]); // █
      }
    });
  });

  describe("custom width", () => {
    it("respects custom width", () => {
      const node = Progress({ value: 50, width: 10 });

      // Check style has the custom width
      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.width, 10);

      const buffer = renderProgress(node, 10);

      // 50% of 10 = 5 full cells
      for (let x = 0; x < 5; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), BLOCKS[8]); // █
      }
      for (let x = 5; x < 10; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), " ");
      }
    });

    it("sub-cell precision works with custom width", () => {
      // 10% of 10 cells = 8 eighths = 1 full cell
      const node = Progress({ value: 10, width: 10 });
      const buffer = renderProgress(node, 10);

      assert.strictEqual(buffer.getSymbol(0, 0), BLOCKS[8]); // █
      for (let x = 1; x < 10; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), " ");
      }
    });
  });

  describe("reactive values", () => {
    it("updates when value signal changes", () => {
      const [value, setValue] = createSignal(0);
      const node = Progress({ value });

      // Initial: empty bar
      let buffer = renderProgress(node, 20);
      for (let x = 0; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), " ");
      }

      // Update to 100 and re-render
      setValue(100);
      buffer = renderProgress(node, 20);
      for (let x = 0; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), BLOCKS[8]); // █
      }
    });

    it("updates when width signal changes", () => {
      const [width, setWidth] = createSignal(20);
      const node = Progress({ value: 100, width });

      // Initial render
      let buffer = renderProgress(node, 20);
      // At width 20, 100% should fill all 20 cells
      for (let x = 0; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), BLOCKS[8]); // █
      }

      // Change width and re-render - content adapts reactively
      setWidth(10);
      buffer = renderProgress(node, 10);
      // At width 10, 100% should fill all 10 cells
      for (let x = 0; x < 10; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), BLOCKS[8]); // █
      }
    });
  });

  describe("style", () => {
    it("has correct default style", () => {
      const node = Progress({ value: 50 });
      const style =
        typeof node.style === "function" ? node.style() : node.style;

      assert.strictEqual(style.width, 20);
      assert.strictEqual(style.height, 1);
    });

    it("applies style overrides", () => {
      const node = Progress({
        value: 50,
        style: { marginTop: 2, marginStart: 3 },
      });
      const style =
        typeof node.style === "function" ? node.style() : node.style;

      assert.strictEqual(style.marginTop, 2);
      assert.strictEqual(style.marginStart, 3);
      assert.strictEqual(style.height, 1);
    });
  });

  describe("measure", () => {
    it("returns fixed dimensions via layout", () => {
      const node = Progress({ value: 50 });

      // Layout should use the explicit width/height from style
      const layoutNode = toLayoutNode(node);
      const layout = computeLayout(layoutNode, 100, 100);
      assert.strictEqual(layout.width, 20);
      assert.strictEqual(layout.height, 1);
    });

    it("ignores available space", () => {
      const node = Progress({ value: 50 });

      // Should return same size regardless of available space
      const layoutNode = toLayoutNode(node);
      const layout1 = computeLayout(layoutNode, 10, 10);
      const layout2 = computeLayout(layoutNode, 1000, 1000);

      assert.strictEqual(layout1.width, layout2.width);
      assert.strictEqual(layout1.height, layout2.height);
    });
  });

  describe("non-focusable", () => {
    it("is not focusable by default", () => {
      const node = Progress({ value: 50 });
      assert.strictEqual(node.focusable, undefined);
    });
  });

  describe("edge cases", () => {
    it("handles width of 1", () => {
      const node = Progress({ value: 50, width: 1 });
      const buffer = renderProgress(node, 1);

      // 50% of 1 cell = 4 eighths = half block
      assert.strictEqual(buffer.getSymbol(0, 0), BLOCKS[4]); // ▌
    });

    it("handles width of 0", () => {
      const node = Progress({ value: 50, width: 0 });
      // Should not throw when rendering
      const buffer = renderProgress(node, 0);
      assert.ok(buffer);
    });

    it("rounds to nearest eighth", () => {
      // 1% of 20 cells = 1.6 eighths, rounds to 2
      const node = Progress({ value: 1 });
      const buffer = renderProgress(node, 20);

      // Should show 2/8 = 1/4 block
      assert.strictEqual(buffer.getSymbol(0, 0), BLOCKS[2]); // ▎
      for (let x = 1; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), " ");
      }
    });
  });

  describe("colors", () => {
    it("uses custom color for filled portion", () => {
      const green: Color = { type: "named", index: 2 };
      const node = Progress({ value: 100, color: green });

      // Color is passed to Text child via _inheritableProps on Box
      // The Text node inside has the color prop
      const children = node.children as Node[];
      assert.ok(children && children.length > 0);
      const textChild = children[0];
      assert.ok(textChild._inheritableProps);
      assert.deepStrictEqual(textChild._inheritableProps.color, green);
    });

    it("uses custom backgroundColor", () => {
      const black: Color = { type: "named", index: 0 };
      const node = Progress({ value: 0, backgroundColor: black });

      const children = node.children as Node[];
      assert.ok(children && children.length > 0);
      const textChild = children[0];
      assert.ok(textChild._inheritableProps);
      assert.deepStrictEqual(
        textChild._inheritableProps.backgroundColor,
        black,
      );
    });

    it("supports reactive color", () => {
      const [color, _setColor] = createSignal<Color>({
        type: "named",
        index: 1,
      });
      const node = Progress({ value: 50, color });

      const children = node.children as Node[];
      assert.ok(children && children.length > 0);
      const textChild = children[0];
      assert.ok(textChild._inheritableProps);
      assert.strictEqual(typeof textChild._inheritableProps.color, "function");
    });
  });
});
