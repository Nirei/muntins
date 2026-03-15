import assert from "node:assert";
import { describe, it } from "node:test";
import { type Color, Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import { DEFAULT_INHERITED_STYLE } from "../../src/core/runtime.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Progress } from "../../src/ui/progress.ts";

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
      assert.ok(node.render);

      const buffer = new RenderBuffer(25, 1);
      node.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE);

      // All cells should be spaces
      for (let x = 0; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), " ");
      }
    });

    it("renders full bar at value=100", () => {
      const node = Progress({ value: 100 });
      assert.ok(node.render);

      const buffer = new RenderBuffer(25, 1);
      node.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE);

      // All cells should be full blocks
      for (let x = 0; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), BLOCKS[8]); // █
      }
    });

    it("renders half fill at value=50", () => {
      const node = Progress({ value: 50 });
      assert.ok(node.render);

      const buffer = new RenderBuffer(25, 1);
      node.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE);

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
      assert.ok(node.render);

      const buffer = new RenderBuffer(25, 1);
      node.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE);

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
      assert.ok(node.render);

      const buffer = new RenderBuffer(25, 1);
      node.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE);

      assert.strictEqual(buffer.getSymbol(0, 0), BLOCKS[1]); // ▏
      for (let x = 1; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), " ");
      }
    });

    it("renders 7/8 partial block", () => {
      // We want: 0 full cells + 7/8 partial
      // 7 eighths out of 160 total = 7/160 = 4.375%
      const node = Progress({ value: 4.375 });
      assert.ok(node.render);

      const buffer = new RenderBuffer(25, 1);
      node.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE);

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
        assert.ok(node.render);

        const buffer = new RenderBuffer(25, 1);
        node.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE);

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
      assert.ok(node.render);

      const buffer = new RenderBuffer(25, 1);
      node.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE);

      // All cells should be spaces
      for (let x = 0; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), " ");
      }
    });

    it("clamps values above 100 to 100", () => {
      const node = Progress({ value: 150 });
      assert.ok(node.render);

      const buffer = new RenderBuffer(25, 1);
      node.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE);

      // All cells should be full blocks
      for (let x = 0; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), BLOCKS[8]); // █
      }
    });
  });

  describe("custom width", () => {
    it("respects custom width", () => {
      const node = Progress({ value: 50, width: 10 });
      assert.ok(node.measure);
      assert.ok(node.render);

      const size = node.measure(100, 100);
      assert.strictEqual(size.width, 10);

      const buffer = new RenderBuffer(15, 1);
      node.render(0, 0, 10, 1, buffer, DEFAULT_INHERITED_STYLE);

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
      assert.ok(node.render);

      const buffer = new RenderBuffer(15, 1);
      node.render(0, 0, 10, 1, buffer, DEFAULT_INHERITED_STYLE);

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
      assert.ok(node.render);

      const buffer = new RenderBuffer(25, 1);

      // Initial: empty bar
      node.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE);
      for (let x = 0; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), " ");
      }

      // Update to 100
      setValue(100);
      buffer.flush();
      node.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE);
      for (let x = 0; x < 20; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), BLOCKS[8]); // █
      }
    });

    it("updates when width signal changes", () => {
      const [width, setWidth] = createSignal(20);
      const node = Progress({ value: 100, width });
      assert.ok(node.measure);

      // Initial width
      let size = node.measure(100, 100);
      assert.strictEqual(size.width, 20);

      // Change width
      setWidth(30);
      size = node.measure(100, 100);
      assert.strictEqual(size.width, 30);
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
    it("returns fixed dimensions", () => {
      const node = Progress({ value: 50 });
      assert.ok(node.measure);

      const size = node.measure(100, 100);
      assert.strictEqual(size.width, 20);
      assert.strictEqual(size.height, 1);
    });

    it("ignores available space", () => {
      const node = Progress({ value: 50 });
      assert.ok(node.measure);

      // Should return same size regardless of available space
      const size1 = node.measure(10, 10);
      const size2 = node.measure(1000, 1000);

      assert.strictEqual(size1.width, size2.width);
      assert.strictEqual(size1.height, size2.height);
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
      assert.ok(node.render);

      const buffer = new RenderBuffer(5, 1);
      node.render(0, 0, 1, 1, buffer, DEFAULT_INHERITED_STYLE);

      // 50% of 1 cell = 4 eighths = half block
      assert.strictEqual(buffer.getSymbol(0, 0), BLOCKS[4]); // ▌
    });

    it("handles width of 0", () => {
      const node = Progress({ value: 50, width: 0 });
      assert.ok(node.render);

      const buffer = new RenderBuffer(5, 1);
      // Should not throw
      node.render(0, 0, 0, 1, buffer, DEFAULT_INHERITED_STYLE);
    });

    it("rounds to nearest eighth", () => {
      // 1% of 20 cells = 1.6 eighths, rounds to 2
      const node = Progress({ value: 1 });
      assert.ok(node.render);

      const buffer = new RenderBuffer(25, 1);
      node.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE);

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
      assert.ok(node.render);

      // Color is resolved via _inheritableProps by the runtime
      // Here we test that the prop is stored correctly
      assert.ok(node._inheritableProps);
      assert.deepStrictEqual(node._inheritableProps.color, green);
    });

    it("uses custom backgroundColor", () => {
      const black: Color = { type: "named", index: 0 };
      const node = Progress({ value: 0, backgroundColor: black });
      assert.ok(node.render);

      assert.ok(node._inheritableProps);
      assert.deepStrictEqual(node._inheritableProps.backgroundColor, black);
    });

    it("supports reactive color", () => {
      const [color, setColor] = createSignal<Color>({
        type: "named",
        index: 1,
      });
      const node = Progress({ value: 50, color });

      assert.ok(node._inheritableProps);
      assert.strictEqual(typeof node._inheritableProps.color, "function");
    });
  });
});
