import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import { DEFAULT_FLEX_STYLE, computeLayout } from "../../src/core/layout.ts";
import type { LayoutNode } from "../../src/core/layout.ts";
import { Box, DEFAULT_INHERITED_STYLE } from "../../src/core/runtime.ts";
import { createSignal } from "../../src/core/signals.ts";
import {
  Separator,
  type SeparatorOrientation,
  type SeparatorProps,
} from "../../src/ui/separator.ts";

describe("Separator", () => {
  describe("horizontal (default)", () => {
    it("renders horizontal line across width", () => {
      const node = Separator({});
      assert.ok(node.render);

      const buffer = new RenderBuffer(10, 1);
      node.render(0, 0, 10, 1, buffer, DEFAULT_INHERITED_STYLE);

      // All cells should have horizontal line character
      for (let x = 0; x < 10; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), "\u2500"); // ─
      }
    });

    it("has height of 1", () => {
      const node = Separator({});
      assert.ok(node.measure);

      const size = node.measure(100, 100);
      assert.strictEqual(size.height, 1);
    });

    it("fills available width", () => {
      const node = Separator({});
      assert.ok(node.measure);

      const size = node.measure(50, 100);
      assert.strictEqual(size.width, 50);
    });

    it("style has fixed height of 1 for horizontal orientation", () => {
      const node = Separator({});
      const style =
        typeof node.style === "function" ? node.style() : node.style;

      assert.strictEqual(style.height, 1);
      assert.strictEqual(style.width, "auto");
    });
  });

  describe("vertical", () => {
    it("renders vertical line down height", () => {
      const node = Separator({ orientation: "vertical" });
      assert.ok(node.render);

      const buffer = new RenderBuffer(1, 5);
      node.render(0, 0, 1, 5, buffer, DEFAULT_INHERITED_STYLE);

      // All cells should have vertical line character
      for (let y = 0; y < 5; y++) {
        assert.strictEqual(buffer.getSymbol(0, y), "\u2502"); // │
      }
    });

    it("has width of 1", () => {
      const node = Separator({ orientation: "vertical" });
      assert.ok(node.measure);

      const size = node.measure(100, 100);
      assert.strictEqual(size.width, 1);
    });

    it("fills available height", () => {
      const node = Separator({ orientation: "vertical" });
      assert.ok(node.measure);

      const size = node.measure(100, 50);
      assert.strictEqual(size.height, 50);
    });

    it("style has fixed width of 1 for vertical orientation", () => {
      const node = Separator({ orientation: "vertical" });
      const style =
        typeof node.style === "function" ? node.style() : node.style;

      assert.strictEqual(style.width, 1);
      assert.strictEqual(style.height, "auto");
    });
  });

  describe("reactive orientation", () => {
    it("updates when orientation signal changes", () => {
      const [orientation, setOrientation] =
        createSignal<SeparatorOrientation>("horizontal");
      const node = Separator({ orientation });

      // Initially horizontal
      let style = typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.height, 1);
      assert.strictEqual(style.width, "auto");

      // Change to vertical
      setOrientation("vertical");
      style = typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.width, 1);
      assert.strictEqual(style.height, "auto");
    });

    it("render respects reactive orientation", () => {
      const [orientation, setOrientation] =
        createSignal<SeparatorOrientation>("horizontal");
      const node = Separator({ orientation });
      assert.ok(node.render);

      const buffer = new RenderBuffer(5, 5);

      // Horizontal render
      node.render(0, 0, 5, 1, buffer, DEFAULT_INHERITED_STYLE);
      assert.strictEqual(buffer.getSymbol(0, 0), "\u2500");
      assert.strictEqual(buffer.getSymbol(4, 0), "\u2500");

      // Clear buffer
      buffer.flush();

      // Change to vertical
      setOrientation("vertical");
      node.render(0, 0, 1, 5, buffer, DEFAULT_INHERITED_STYLE);
      assert.strictEqual(buffer.getSymbol(0, 0), "\u2502");
      assert.strictEqual(buffer.getSymbol(0, 4), "\u2502");
    });
  });

  describe("style overrides", () => {
    it("applies style overrides", () => {
      const node = Separator({ style: { marginTop: 2, marginBottom: 2 } });
      const style =
        typeof node.style === "function" ? node.style() : node.style;

      assert.strictEqual(style.marginTop, 2);
      assert.strictEqual(style.marginBottom, 2);
    });

    it("style override can set explicit width/height", () => {
      const node = Separator({ style: { width: 20, height: 3 } });
      const style =
        typeof node.style === "function" ? node.style() : node.style;

      assert.strictEqual(style.width, 20);
      assert.strictEqual(style.height, 3);
    });
  });

  describe("layout integration", () => {
    it("horizontal separator fills row layout", () => {
      const separator = Separator({});
      const sepStyle =
        typeof separator.style === "function"
          ? separator.style()
          : separator.style;

      const layoutNode: LayoutNode = {
        style: {
          ...DEFAULT_FLEX_STYLE,
          flexDirection: "column",
          width: 20,
          height: 10,
        },
        children: [
          {
            style: sepStyle,
            measure: separator.measure,
          },
        ],
      };

      const layout = computeLayout(layoutNode, 20, 10);

      // Separator should fill the width and have height 1
      assert.strictEqual(layout.children[0].width, 20);
      assert.strictEqual(layout.children[0].height, 1);
    });

    it("vertical separator fills column layout", () => {
      const separator = Separator({ orientation: "vertical" });
      const sepStyle =
        typeof separator.style === "function"
          ? separator.style()
          : separator.style;

      const layoutNode: LayoutNode = {
        style: {
          ...DEFAULT_FLEX_STYLE,
          flexDirection: "row",
          width: 20,
          height: 10,
        },
        children: [
          {
            style: sepStyle,
            measure: separator.measure,
          },
        ],
      };

      const layout = computeLayout(layoutNode, 20, 10);

      // Separator should fill the height and have width 1
      assert.strictEqual(layout.children[0].width, 1);
      assert.strictEqual(layout.children[0].height, 10);
    });
  });

  describe("non-focusable", () => {
    it("is not focusable by default", () => {
      const node = Separator({});
      assert.strictEqual(node.focusable, undefined);
    });
  });

  describe("edge cases", () => {
    it("handles zero width", () => {
      const node = Separator({});
      assert.ok(node.render);

      const buffer = new RenderBuffer(5, 5);
      // Should not throw
      node.render(0, 0, 0, 1, buffer, DEFAULT_INHERITED_STYLE);
    });

    it("handles zero height for vertical", () => {
      const node = Separator({ orientation: "vertical" });
      assert.ok(node.render);

      const buffer = new RenderBuffer(5, 5);
      // Should not throw
      node.render(0, 0, 1, 0, buffer, DEFAULT_INHERITED_STYLE);
    });

    it("measure with infinite width returns 1", () => {
      const node = Separator({});
      assert.ok(node.measure);

      const size = node.measure(Number.POSITIVE_INFINITY, 100);
      assert.strictEqual(size.width, 1);
      assert.strictEqual(size.height, 1);
    });

    it("measure with infinite height for vertical returns 1", () => {
      const node = Separator({ orientation: "vertical" });
      assert.ok(node.measure);

      const size = node.measure(100, Number.POSITIVE_INFINITY);
      assert.strictEqual(size.width, 1);
      assert.strictEqual(size.height, 1);
    });
  });
});
