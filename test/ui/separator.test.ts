import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import {
  DEFAULT_FLEX_STYLE,
  type LayoutNode,
  type LayoutResult,
  computeLayout,
} from "../../src/core/layout.ts";
import {
  Box,
  type ClipRect,
  DEFAULT_CLIP,
  DEFAULT_INHERITED_STYLE,
  type InheritedStyle,
  type Node,
} from "../../src/core/runtime.ts";
import { createSignal } from "../../src/core/signals.ts";
import {
  Separator,
  type SeparatorOrientation,
  type SeparatorProps,
} from "../../src/ui/separator.ts";

// Helper to convert Node tree to LayoutNode tree for computeLayout
function toLayoutNode(node: Node): LayoutNode {
  const style = typeof node.style === "function" ? node.style() : node.style;
  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : node.children;
  return {
    style,
    measure: node.measure,
    children: children?.map(toLayoutNode),
  };
}

// Helper to paint a node tree recursively
function paintTree(
  node: Node,
  layout: LayoutResult,
  buffer: RenderBuffer,
  inherited: InheritedStyle,
  clip: ClipRect,
): void {
  const { screenX, screenY, width, height } = layout;

  if (node.render) {
    node.render(screenX, screenY, width, height, buffer, inherited, clip);
  }

  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : (node.children ?? []);
  const childLayouts = layout.children ?? [];

  for (let i = 0; i < children.length && i < childLayouts.length; i++) {
    paintTree(children[i], childLayouts[i], buffer, inherited, clip);
  }
}

// Helper to render a Separator node to a buffer
function renderSeparator(
  node: Node,
  width: number,
  height: number,
): RenderBuffer {
  const buffer = new RenderBuffer(width, height);
  const layoutNode = toLayoutNode(node);
  const layout = computeLayout(layoutNode, width, height);
  paintTree(node, layout, buffer, DEFAULT_INHERITED_STYLE, DEFAULT_CLIP);
  return buffer;
}

describe("Separator", () => {
  describe("horizontal (default)", () => {
    it("renders horizontal line across width", () => {
      const node = Separator({});
      const buffer = renderSeparator(node, 10, 1);

      // All cells should have horizontal line character (top border)
      for (let x = 0; x < 10; x++) {
        assert.strictEqual(buffer.getSymbol(x, 0), "\u2500"); // ─
      }
    });

    it("has height of 1", () => {
      const node = Separator({});
      const layoutNode = toLayoutNode(node);
      const layout = computeLayout(layoutNode, 100, 100);

      assert.strictEqual(layout.height, 1);
    });

    it("fills available width", () => {
      const node = Separator({});
      const layoutNode = toLayoutNode(node);
      const layout = computeLayout(layoutNode, 50, 100);

      // With alignSelf: stretch, should fill parent width
      assert.strictEqual(layout.width, 50);
    });

    it("style has fixed height of 1 for horizontal orientation", () => {
      const node = Separator({});
      const style =
        typeof node.style === "function" ? node.style() : node.style;

      assert.strictEqual(style.height, 1);
      // width is 'auto' because it stretches to fill
      assert.strictEqual(style.width, "auto");
    });
  });

  describe("vertical", () => {
    it("renders vertical line down height", () => {
      const node = Separator({ orientation: "vertical" });
      const buffer = renderSeparator(node, 1, 5);

      // All cells should have vertical line character (left/start border)
      for (let y = 0; y < 5; y++) {
        assert.strictEqual(buffer.getSymbol(0, y), "\u2502"); // │
      }
    });

    it("has width of 1", () => {
      const node = Separator({ orientation: "vertical" });
      const layoutNode = toLayoutNode(node);
      const layout = computeLayout(layoutNode, 100, 100);

      assert.strictEqual(layout.width, 1);
    });

    it("fills available height", () => {
      const node = Separator({ orientation: "vertical" });
      const layoutNode = toLayoutNode(node);
      const layout = computeLayout(layoutNode, 100, 50);

      // With alignSelf: stretch, should fill parent height
      assert.strictEqual(layout.height, 50);
    });

    it("style has fixed width of 1 for vertical orientation", () => {
      const node = Separator({ orientation: "vertical" });
      const style =
        typeof node.style === "function" ? node.style() : node.style;

      assert.strictEqual(style.width, 1);
      // height is 'auto' because it stretches to fill
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

      // Horizontal render
      let buffer = renderSeparator(node, 5, 1);
      assert.strictEqual(buffer.getSymbol(0, 0), "\u2500");
      assert.strictEqual(buffer.getSymbol(4, 0), "\u2500");

      // Change to vertical and re-render
      setOrientation("vertical");
      buffer = renderSeparator(node, 1, 5);
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

      const parent = Box({
        flexDirection: "column",
        width: 20,
        height: 10,
        children: [separator],
      });

      const layoutNode = toLayoutNode(parent);
      const layout = computeLayout(layoutNode, 20, 10);

      // Separator should fill the width and have height 1
      assert.strictEqual(layout.children[0].width, 20);
      assert.strictEqual(layout.children[0].height, 1);
    });

    it("vertical separator fills column layout", () => {
      const separator = Separator({ orientation: "vertical" });

      const parent = Box({
        flexDirection: "row",
        width: 20,
        height: 10,
        children: [separator],
      });

      const layoutNode = toLayoutNode(parent);
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
      // Should not throw when rendering with zero width
      const buffer = renderSeparator(node, 0, 1);
      assert.ok(buffer);
    });

    it("handles zero height for vertical", () => {
      const node = Separator({ orientation: "vertical" });
      // Should not throw when rendering with zero height
      const buffer = renderSeparator(node, 1, 0);
      assert.ok(buffer);
    });

    it("layout computes sensible size even with unconstrained space", () => {
      const node = Separator({});
      const layoutNode = toLayoutNode(node);
      // With very large available space, separator should still have height 1
      const layout = computeLayout(layoutNode, 1000, 1000);
      assert.strictEqual(layout.height, 1);
    });

    it("layout computes sensible size for vertical with unconstrained space", () => {
      const node = Separator({ orientation: "vertical" });
      const layoutNode = toLayoutNode(node);
      // With very large available space, separator should still have width 1
      const layout = computeLayout(layoutNode, 1000, 1000);
      assert.strictEqual(layout.width, 1);
    });
  });
});
