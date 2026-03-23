import assert from "node:assert";
import { describe, it } from "node:test";
import {
  DEFAULT_FLEX_STYLE,
  type FlexStyle,
  type LayoutNode,
  type LayoutResult,
  clearLayoutCache,
  computeLayout,
  distribute,
  resolveStyle,
} from "../src/core/layout.ts";

describe("layout types", () => {
  it("resolveStyle merges with defaults", () => {
    const partial = { flexDirection: "column" as const, gap: 2 };
    const resolved = resolveStyle(partial);

    assert.strictEqual(resolved.flexDirection, "column");
    assert.strictEqual(resolved.gap, 2);
    assert.strictEqual(resolved.flexGrow, 0); // from default
  });

  it("DEFAULT_FLEX_STYLE has all required properties", () => {
    // Verify all flex properties are present
    assert.strictEqual(DEFAULT_FLEX_STYLE.display, "flex");
    assert.strictEqual(DEFAULT_FLEX_STYLE.flexDirection, "row");
    assert.strictEqual(DEFAULT_FLEX_STYLE.flexWrap, "nowrap");
    assert.strictEqual(DEFAULT_FLEX_STYLE.justifyContent, "flex-start");
    assert.strictEqual(DEFAULT_FLEX_STYLE.alignItems, "stretch");
    assert.strictEqual(DEFAULT_FLEX_STYLE.alignContent, "stretch");
    assert.strictEqual(DEFAULT_FLEX_STYLE.alignSelf, "auto");
    assert.strictEqual(DEFAULT_FLEX_STYLE.flexGrow, 0);
    assert.strictEqual(DEFAULT_FLEX_STYLE.flexShrink, 1);
    assert.strictEqual(DEFAULT_FLEX_STYLE.flexBasis, "auto");
    assert.strictEqual(DEFAULT_FLEX_STYLE.width, "auto");
    assert.strictEqual(DEFAULT_FLEX_STYLE.height, "auto");
    assert.strictEqual(DEFAULT_FLEX_STYLE.minWidth, 0);
    assert.strictEqual(DEFAULT_FLEX_STYLE.maxWidth, null);
    assert.strictEqual(DEFAULT_FLEX_STYLE.minHeight, 0);
    assert.strictEqual(DEFAULT_FLEX_STYLE.maxHeight, null);
    assert.strictEqual(DEFAULT_FLEX_STYLE.paddingTop, 0);
    assert.strictEqual(DEFAULT_FLEX_STYLE.paddingEnd, 0);
    assert.strictEqual(DEFAULT_FLEX_STYLE.paddingBottom, 0);
    assert.strictEqual(DEFAULT_FLEX_STYLE.paddingStart, 0);
    assert.strictEqual(DEFAULT_FLEX_STYLE.marginTop, 0);
    assert.strictEqual(DEFAULT_FLEX_STYLE.marginEnd, 0);
    assert.strictEqual(DEFAULT_FLEX_STYLE.marginBottom, 0);
    assert.strictEqual(DEFAULT_FLEX_STYLE.marginStart, 0);
    assert.strictEqual(DEFAULT_FLEX_STYLE.gap, 0);
    assert.strictEqual(DEFAULT_FLEX_STYLE.position, "relative");
    assert.strictEqual(DEFAULT_FLEX_STYLE.top, "auto");
    assert.strictEqual(DEFAULT_FLEX_STYLE.end, "auto");
    assert.strictEqual(DEFAULT_FLEX_STYLE.bottom, "auto");
    assert.strictEqual(DEFAULT_FLEX_STYLE.start, "auto");
  });

  it("resolveStyle preserves partial overrides", () => {
    const partial: Partial<FlexStyle> = {
      display: "none",
      flexDirection: "column",
      paddingTop: 1,
      paddingEnd: 2,
      paddingBottom: 3,
      paddingStart: 4,
      maxWidth: 100,
    };
    const resolved = resolveStyle(partial);

    assert.strictEqual(resolved.display, "none");
    assert.strictEqual(resolved.flexDirection, "column");
    assert.strictEqual(resolved.paddingTop, 1);
    assert.strictEqual(resolved.paddingEnd, 2);
    assert.strictEqual(resolved.paddingBottom, 3);
    assert.strictEqual(resolved.paddingStart, 4);
    assert.strictEqual(resolved.maxWidth, 100);
    // Defaults preserved
    assert.strictEqual(resolved.flexGrow, 0);
    assert.strictEqual(resolved.alignItems, "stretch");
  });

  it("resolveStyle with empty partial returns defaults", () => {
    const resolved = resolveStyle({});

    assert.deepStrictEqual(resolved, DEFAULT_FLEX_STYLE);
  });

  it("LayoutNode can have children or measure", () => {
    const container: LayoutNode = {
      style: { flexDirection: "column" },
      children: [{ style: { flexGrow: 1 } }, { style: { flexGrow: 2 } }],
    };

    assert.strictEqual(container.children?.length, 2);
    assert.strictEqual(container.measure, undefined);

    const leaf: LayoutNode = {
      style: {},
      measure: (availableWidth, availableHeight) => ({
        width: Math.min(10, availableWidth),
        height: Math.min(1, availableHeight),
      }),
    };

    assert.strictEqual(leaf.children, undefined);
    assert.strictEqual(typeof leaf.measure, "function");
  });

  it("measure function receives constraints", () => {
    const measureCalls: Array<{ width: number; height: number }> = [];

    const leaf: LayoutNode = {
      style: {},
      measure: (availableWidth, availableHeight) => {
        measureCalls.push({ width: availableWidth, height: availableHeight });
        return { width: 5, height: 1 };
      },
    };

    // Simulate measure calls
    leaf.measure?.(100, 50);
    leaf.measure?.(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);

    assert.deepStrictEqual(measureCalls, [
      { width: 100, height: 50 },
      { width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY },
    ]);
  });

  it("LayoutResult has relative and absolute coordinates", () => {
    const result: LayoutResult = {
      x: 5,
      y: 10,
      width: 20,
      height: 5,
      screenX: 15,
      screenY: 20,
      children: [],
    };

    assert.strictEqual(result.x, 5);
    assert.strictEqual(result.y, 10);
    assert.strictEqual(result.screenX, 15);
    assert.strictEqual(result.screenY, 20);
    assert.deepStrictEqual(result.children, []);
  });

  it("LayoutResult can have nested children", () => {
    const result: LayoutResult = {
      x: 0,
      y: 0,
      width: 80,
      height: 24,
      screenX: 0,
      screenY: 0,
      children: [
        {
          x: 0,
          y: 0,
          width: 40,
          height: 24,
          screenX: 0,
          screenY: 0,
          children: [],
        },
        {
          x: 40,
          y: 0,
          width: 40,
          height: 24,
          screenX: 40,
          screenY: 0,
          children: [],
        },
      ],
    };

    assert.strictEqual(result.children.length, 2);
    assert.strictEqual(result.children[0].width, 40);
    assert.strictEqual(result.children[1].x, 40);
  });
});

describe("computeLayout structure", () => {
  it("single node gets full available space", () => {
    const node: LayoutNode = { style: {} };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.x, 0);
    assert.strictEqual(result.y, 0);
    assert.strictEqual(result.width, 80);
    assert.strictEqual(result.height, 24);
    assert.deepStrictEqual(result.children, []);
  });

  it("node with explicit size respects it", () => {
    const node: LayoutNode = { style: { width: 40, height: 10 } };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.width, 40);
    assert.strictEqual(result.height, 10);
  });

  it("builds correct tree structure", () => {
    const node: LayoutNode = {
      style: {},
      children: [{ style: { width: 10 } }, { style: { width: 20 } }],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children.length, 2);
  });

  it("handles empty children array", () => {
    const node: LayoutNode = { style: {}, children: [] };
    const result = computeLayout(node, 80, 24);

    assert.deepStrictEqual(result.children, []);
  });

  it("root screenX/screenY are zero", () => {
    const node: LayoutNode = { style: {} };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.screenX, 0);
    assert.strictEqual(result.screenY, 0);
  });

  it("explicit width overrides available space", () => {
    const node: LayoutNode = { style: { width: 50 } };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.width, 50);
    assert.strictEqual(result.height, 24); // height still uses available
  });

  it("explicit height overrides available space", () => {
    const node: LayoutNode = { style: { height: 12 } };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.width, 80); // width still uses available
    assert.strictEqual(result.height, 12);
  });

  it("deeply nested tree has correct structure", () => {
    const node: LayoutNode = {
      style: {},
      children: [
        {
          style: {},
          children: [{ style: {} }, { style: {} }],
        },
        { style: {} },
      ],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children.length, 2);
    assert.strictEqual(result.children[0].children.length, 2);
    assert.strictEqual(result.children[1].children.length, 0);
  });
});

describe("intrinsic size resolution", () => {
  // Note: Root node uses available space for auto dimensions, not intrinsic size.
  // To test intrinsic sizing, we wrap test nodes in a parent container.

  it("uses explicit width/height", () => {
    const node: LayoutNode = {
      style: { width: 50, height: 20 },
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.width, 50);
    assert.strictEqual(result.height, 20);
  });

  it("uses measure function for leaf", () => {
    // Wrap in parent to test non-root intrinsic sizing
    // Use alignItems: "flex-start" to prevent stretch from overriding intrinsic height
    const node: LayoutNode = {
      style: { alignItems: "flex-start" },
      children: [
        {
          style: {},
          measure: () => ({ width: 15, height: 3 }),
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].width, 15);
    assert.strictEqual(result.children[0].height, 3);
  });

  it("row container width = sum of children + gaps", () => {
    const node: LayoutNode = {
      style: {},
      children: [
        {
          style: { flexDirection: "row", gap: 1 },
          children: [
            { style: { width: 10, height: 5 } },
            { style: { width: 20, height: 5 } },
          ],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // 10 + 20 + 1 gap = 31
    assert.strictEqual(result.children[0].width, 31);
  });

  it("column container height = sum of children + gaps", () => {
    // Use alignItems: "flex-start" to prevent stretch from overriding intrinsic height
    const node: LayoutNode = {
      style: { alignItems: "flex-start" },
      children: [
        {
          style: { flexDirection: "column", gap: 1 },
          children: [
            { style: { width: 10, height: 5 } },
            { style: { width: 10, height: 10 } },
          ],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // 5 + 10 + 1 gap = 16
    assert.strictEqual(result.children[0].height, 16);
  });

  it("row container height = max of children", () => {
    // Use alignItems: "flex-start" to prevent stretch from overriding intrinsic height
    const node: LayoutNode = {
      style: { alignItems: "flex-start" },
      children: [
        {
          style: { flexDirection: "row" },
          children: [
            { style: { width: 10, height: 5 } },
            { style: { width: 10, height: 15 } },
          ],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].height, 15);
  });

  it("column container width = max of children", () => {
    const node: LayoutNode = {
      style: {},
      children: [
        {
          style: { flexDirection: "column" },
          children: [
            { style: { width: 10, height: 5 } },
            { style: { width: 25, height: 5 } },
          ],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].width, 25);
  });

  it("padding adds to intrinsic size", () => {
    // Use alignItems: "flex-start" to prevent stretch from overriding intrinsic height
    const node: LayoutNode = {
      style: { alignItems: "flex-start" },
      children: [
        {
          style: {
            paddingTop: 2,
            paddingEnd: 3,
            paddingBottom: 2,
            paddingStart: 3,
          },
          children: [{ style: { width: 10, height: 5 } }],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].width, 10 + 3 + 3); // 16
    assert.strictEqual(result.children[0].height, 5 + 2 + 2); // 9
  });

  it("respects minWidth/maxWidth", () => {
    const node: LayoutNode = {
      style: {},
      children: [
        {
          style: { minWidth: 20, maxWidth: 50 },
          children: [{ style: { width: 10 } }],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].width, 20); // clamped to min
  });

  it("respects maxWidth constraint", () => {
    const node: LayoutNode = {
      style: {},
      children: [
        {
          style: { maxWidth: 30 },
          children: [{ style: { width: 50 } }],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].width, 30); // clamped to max
  });

  it("respects minHeight/maxHeight", () => {
    // Use alignItems: "flex-start" to prevent stretch from overriding intrinsic height
    const node: LayoutNode = {
      style: { alignItems: "flex-start" },
      children: [
        {
          style: { minHeight: 15 },
          children: [{ style: { width: 10, height: 5 } }],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].height, 15); // clamped to min
  });

  it("skips display:none children in intrinsic calculation", () => {
    const node: LayoutNode = {
      style: {},
      children: [
        {
          style: { flexDirection: "row" },
          children: [
            { style: { width: 10, height: 5 } },
            { style: { width: 20, height: 5, display: "none" } },
            { style: { width: 15, height: 5 } },
          ],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Only visible children: 10 + 15 = 25
    assert.strictEqual(result.children[0].width, 25);
  });

  it("includes child margins in intrinsic size (row)", () => {
    const node: LayoutNode = {
      style: {},
      children: [
        {
          style: { flexDirection: "row" },
          children: [
            { style: { width: 10, height: 5, marginStart: 2, marginEnd: 3 } },
          ],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // 10 + 2 + 3 = 15
    assert.strictEqual(result.children[0].width, 15);
  });

  it("includes child margins in intrinsic size (column)", () => {
    // Use alignItems: "flex-start" to prevent stretch from overriding intrinsic height
    const node: LayoutNode = {
      style: { alignItems: "flex-start" },
      children: [
        {
          style: { flexDirection: "column" },
          children: [
            { style: { width: 10, height: 5, marginTop: 2, marginBottom: 3 } },
          ],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // 5 + 2 + 3 = 10
    assert.strictEqual(result.children[0].height, 10);
  });

  it("skips display:none at edges correctly for gap calculation", () => {
    const node: LayoutNode = {
      style: {},
      children: [
        {
          style: { flexDirection: "row", gap: 2 },
          children: [
            { style: { width: 10, height: 5, display: "none" } },
            { style: { width: 10, height: 5 } },
            { style: { width: 10, height: 5 } },
            { style: { width: 10, height: 5, display: "none" } },
          ],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Only 2 visible children: 10 + 10 + 2 gap = 22
    assert.strictEqual(result.children[0].width, 22);
  });

  it("measure function receives available space constraints", () => {
    const measureCalls: Array<{ w: number; h: number }> = [];
    const node: LayoutNode = {
      style: { width: 40, height: 20, paddingStart: 5, paddingTop: 3 },
      children: [
        {
          style: {},
          measure: (w, h) => {
            measureCalls.push({ w, h });
            return { width: 10, height: 5 };
          },
        },
      ],
    };
    computeLayout(node, 80, 24);

    // Child with auto size gets Infinity for unconstrained dimensions
    assert.strictEqual(measureCalls.length, 1);
    assert.strictEqual(measureCalls[0].w, Number.POSITIVE_INFINITY);
    assert.strictEqual(measureCalls[0].h, Number.POSITIVE_INFINITY);
  });

  it("measure with explicit size on measured node uses size for constraints", () => {
    const measureCalls: Array<{ w: number; h: number }> = [];
    const node: LayoutNode = {
      style: {},
      children: [
        {
          style: { width: 50, height: 30, paddingStart: 5, paddingEnd: 5 },
          measure: (w, h) => {
            measureCalls.push({ w, h });
            return { width: 20, height: 10 };
          },
        },
      ],
    };
    computeLayout(node, 80, 24);

    // Node has explicit width 50 with padding 5+5, so available = 40
    // Node has explicit height 30 with no top/bottom padding, so available = 30
    assert.strictEqual(measureCalls.length, 1);
    assert.strictEqual(measureCalls[0].w, 40);
    assert.strictEqual(measureCalls[0].h, 30);
  });

  it("nested intrinsic sizes bubble up correctly", () => {
    // Use alignItems: "flex-start" to prevent stretch from overriding intrinsic height
    const node: LayoutNode = {
      style: { alignItems: "flex-start" },
      children: [
        {
          style: {
            flexDirection: "column",
            paddingTop: 1,
            paddingBottom: 1,
            alignItems: "flex-start",
          },
          children: [
            {
              style: { flexDirection: "row", paddingStart: 2, paddingEnd: 2 },
              children: [
                { style: { width: 8, height: 4 } },
                { style: { width: 6, height: 4 } },
              ],
            },
          ],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Inner row: width = 8 + 6 + 4 (padding) = 18, height = 4
    // Outer column: width = 18, height = 4 + 2 (padding) = 6
    const outerColumn = result.children[0];
    const innerRow = outerColumn.children[0];
    assert.strictEqual(innerRow.width, 18);
    assert.strictEqual(innerRow.height, 4);
    assert.strictEqual(outerColumn.width, 18);
    assert.strictEqual(outerColumn.height, 6);
  });

  it("root with auto size uses available space, not intrinsic", () => {
    const node: LayoutNode = {
      style: {},
      children: [{ style: { width: 10, height: 5 } }],
    };
    const result = computeLayout(node, 80, 24);

    // Root uses available space even with children
    assert.strictEqual(result.width, 80);
    assert.strictEqual(result.height, 24);
    // Child uses intrinsic
    assert.strictEqual(result.children[0].width, 10);
    assert.strictEqual(result.children[0].height, 5);
  });
});

describe("distribute helper", () => {
  it("distributes evenly with equal weights", () => {
    const sizes = distribute(30, [1, 1, 1]);
    assert.deepStrictEqual(sizes, [10, 10, 10]);
  });

  it("distributes proportionally with different weights", () => {
    const sizes = distribute(30, [1, 2]);
    // 1/3 * 30 = 10, 2/3 * 30 = 20
    assert.deepStrictEqual(sizes, [10, 20]);
  });

  it("distributes remainder to first items", () => {
    const sizes = distribute(10, [1, 1, 1]);
    // 10/3 = 3.33, floor = 3 each = 9, remainder 1 goes to first
    assert.deepStrictEqual(sizes, [4, 3, 3]);
  });

  it("returns zeros when total is zero", () => {
    const sizes = distribute(0, [1, 2, 3]);
    assert.deepStrictEqual(sizes, [0, 0, 0]);
  });

  it("returns zeros when total is negative", () => {
    const sizes = distribute(-10, [1, 1]);
    assert.deepStrictEqual(sizes, [0, 0]);
  });

  it("returns zeros when weights sum to zero", () => {
    const sizes = distribute(100, [0, 0, 0]);
    assert.deepStrictEqual(sizes, [0, 0, 0]);
  });

  it("handles single weight", () => {
    const sizes = distribute(50, [1]);
    assert.deepStrictEqual(sizes, [50]);
  });
});

describe("flex distribution", () => {
  it("two flex:1 items split space equally", () => {
    const node: LayoutNode = {
      style: { width: 20 },
      children: [{ style: { flexGrow: 1 } }, { style: { flexGrow: 1 } }],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].width, 10);
    assert.strictEqual(result.children[1].width, 10);
  });

  it("flex:2 gets twice as much as flex:1", () => {
    const node: LayoutNode = {
      style: { width: 30 },
      children: [{ style: { flexGrow: 1 } }, { style: { flexGrow: 2 } }],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].width, 10);
    assert.strictEqual(result.children[1].width, 20);
  });

  it("flex:0 items keep their size", () => {
    const node: LayoutNode = {
      style: { width: 30 },
      children: [
        { style: { width: 10, flexGrow: 0 } },
        { style: { flexGrow: 1 } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].width, 10);
    assert.strictEqual(result.children[1].width, 20);
  });

  it("flexGrow adds to base size, not replaces", () => {
    const node: LayoutNode = {
      style: { width: 100 },
      children: [
        { style: { width: 20, flexGrow: 1 } },
        { style: { width: 30, flexGrow: 1 } },
      ],
    };
    const result = computeLayout(node, 100, 24);

    // Available: 100, used: 50, remaining: 50
    // Each gets 25 extra (50 / 2)
    // Final: 20+25=45, 30+25=55
    assert.strictEqual(result.children[0].width, 45);
    assert.strictEqual(result.children[1].width, 55);
  });

  it("shrink reduces oversized items", () => {
    const node: LayoutNode = {
      style: { width: 20 },
      children: [
        { style: { width: 15, flexShrink: 1 } },
        { style: { width: 15, flexShrink: 1 } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Total 30 needs to fit in 20, shrink by 10
    // Both shrink equally (same base size, same shrink factor)
    assert.strictEqual(result.children[0].width, 10);
    assert.strictEqual(result.children[1].width, 10);
  });

  it("shrink weighted by base size", () => {
    const node: LayoutNode = {
      style: { width: 20 },
      children: [
        { style: { width: 10, flexShrink: 1 } },
        { style: { width: 20, flexShrink: 1 } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Total 30 needs to fit in 20, overflow = 10
    // Weights: 10*1=10, 20*1=20, total=30
    // Item 1 shrinks: 10/30 * 10 = 3.33 -> 3
    // Item 2 shrinks: 20/30 * 10 = 6.66 -> 7 (largest fractional part gets remainder)
    assert.strictEqual(result.children[0].width, 7); // 10 - 3
    assert.strictEqual(result.children[1].width, 13); // 20 - 7
  });

  it("shrink removes exact overflow amount", () => {
    const node: LayoutNode = {
      style: { width: 20 },
      children: [
        { style: { width: 15, flexShrink: 1 } },
        { style: { width: 15, flexShrink: 1 } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Children should sum to exactly the container width
    const totalChildWidth = result.children[0].width + result.children[1].width;
    assert.strictEqual(totalChildWidth, 20);
  });

  it("minWidth prevents over-shrinking", () => {
    const node: LayoutNode = {
      style: { width: 10 },
      children: [
        { style: { width: 15, flexShrink: 1, minWidth: 8 } },
        { style: { width: 15, flexShrink: 1 } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    assert.ok(result.children[0].width >= 8);
  });

  it("flexGrow works in column direction", () => {
    const node: LayoutNode = {
      style: { height: 30, flexDirection: "column" },
      children: [{ style: { flexGrow: 1 } }, { style: { flexGrow: 2 } }],
    };
    const result = computeLayout(node, 80, 30);

    assert.strictEqual(result.children[0].height, 10);
    assert.strictEqual(result.children[1].height, 20);
  });

  it("flexShrink works in column direction", () => {
    const node: LayoutNode = {
      style: { height: 20, flexDirection: "column" },
      children: [
        { style: { height: 15, flexShrink: 1 } },
        { style: { height: 15, flexShrink: 1 } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Total 30 needs to fit in 20, shrink by 10
    assert.strictEqual(result.children[0].height, 10);
    assert.strictEqual(result.children[1].height, 10);
  });

  it("respects gap when calculating available space for grow", () => {
    const node: LayoutNode = {
      style: { width: 32, gap: 2 },
      children: [{ style: { flexGrow: 1 } }, { style: { flexGrow: 1 } }],
    };
    const result = computeLayout(node, 80, 24);

    // 32 - 2 gap = 30 available, split evenly
    assert.strictEqual(result.children[0].width, 15);
    assert.strictEqual(result.children[1].width, 15);
  });

  it("respects padding when calculating available space", () => {
    const node: LayoutNode = {
      style: { width: 30, paddingStart: 5, paddingEnd: 5 },
      children: [{ style: { flexGrow: 1 } }, { style: { flexGrow: 1 } }],
    };
    const result = computeLayout(node, 80, 24);

    // 30 - 10 padding = 20 available, split evenly
    assert.strictEqual(result.children[0].width, 10);
    assert.strictEqual(result.children[1].width, 10);
  });

  it("skips display:none children in flex distribution", () => {
    const node: LayoutNode = {
      style: { width: 30 },
      children: [
        { style: { flexGrow: 1 } },
        { style: { flexGrow: 1, display: "none" } },
        { style: { flexGrow: 1 } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Only 2 visible children share 30
    assert.strictEqual(result.children[0].width, 15);
    assert.strictEqual(result.children[2].width, 15);
  });
});

describe("justifyContent", () => {
  it("flex-start packs items at start", () => {
    const node: LayoutNode = {
      style: { width: 30, justifyContent: "flex-start" },
      children: [{ style: { width: 5 } }, { style: { width: 5 } }],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].x, 0);
    assert.strictEqual(result.children[1].x, 5);
  });

  it("flex-end packs items at end", () => {
    const node: LayoutNode = {
      style: { width: 30, justifyContent: "flex-end" },
      children: [{ style: { width: 5 } }, { style: { width: 5 } }],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].x, 20);
    assert.strictEqual(result.children[1].x, 25);
  });

  it("center centers items", () => {
    const node: LayoutNode = {
      style: { width: 30, justifyContent: "center" },
      children: [{ style: { width: 10 } }],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].x, 10);
  });

  it("center centers multiple items", () => {
    const node: LayoutNode = {
      style: { width: 30, justifyContent: "center" },
      children: [{ style: { width: 5 } }, { style: { width: 5 } }],
    };
    const result = computeLayout(node, 80, 24);

    // 30 - 10 = 20 extra space, centered means 10 offset
    assert.strictEqual(result.children[0].x, 10);
    assert.strictEqual(result.children[1].x, 15);
  });

  it("space-between distributes gaps", () => {
    const node: LayoutNode = {
      style: { width: 30, justifyContent: "space-between" },
      children: [
        { style: { width: 5 } },
        { style: { width: 5 } },
        { style: { width: 5 } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // 30 - 15 = 15 space, 2 gaps = 7.5 each
    assert.strictEqual(result.children[0].x, 0);
    assert.strictEqual(result.children[1].x, 13); // 5 + 7.5 rounded
    assert.strictEqual(result.children[2].x, 25);
  });

  it("space-between with single child places at start", () => {
    const node: LayoutNode = {
      style: { width: 30, justifyContent: "space-between" },
      children: [{ style: { width: 5 } }],
    };
    const result = computeLayout(node, 80, 24);

    // Single child: no "between" space, place at start
    assert.strictEqual(result.children[0].x, 0);
  });

  it("space-between does not add style.gap on top", () => {
    const node: LayoutNode = {
      style: { width: 30, justifyContent: "space-between", gap: 100 },
      children: [{ style: { width: 5 } }, { style: { width: 5 } }],
    };
    const result = computeLayout(node, 80, 24);

    // space-between: first at 0, last at 25 (30 - 5)
    // gap:100 should be IGNORED for space-between
    assert.strictEqual(result.children[0].x, 0);
    assert.strictEqual(result.children[1].x, 25);
  });

  it("space-around distributes equal space around items", () => {
    const node: LayoutNode = {
      style: { width: 30, justifyContent: "space-around" },
      children: [{ style: { width: 5 } }, { style: { width: 5 } }],
    };
    const result = computeLayout(node, 80, 24);

    // 30 - 10 = 20 space, 2 items = 10 per item
    // First offset = 10/2 = 5, gap between = 10
    assert.strictEqual(result.children[0].x, 5);
    assert.strictEqual(result.children[1].x, 20); // 5 + 5 + 10
  });

  it("space-evenly distributes equal space including edges", () => {
    const node: LayoutNode = {
      style: { width: 30, justifyContent: "space-evenly" },
      children: [{ style: { width: 5 } }, { style: { width: 5 } }],
    };
    const result = computeLayout(node, 80, 24);

    // 30 - 10 = 20 space, 3 gaps (edges + between) = 6.67 each
    // First at round(6.67) = 7
    // Second at round(6.67 + 5 + 6.67) = round(18.34) = 18
    assert.strictEqual(result.children[0].x, 7);
    assert.strictEqual(result.children[1].x, 18);
  });

  it("justifyContent works in column direction", () => {
    const node: LayoutNode = {
      style: {
        height: 30,
        flexDirection: "column",
        justifyContent: "flex-end",
      },
      children: [{ style: { height: 5 } }, { style: { height: 5 } }],
    };
    const result = computeLayout(node, 80, 30);

    assert.strictEqual(result.children[0].y, 20);
    assert.strictEqual(result.children[1].y, 25);
  });

  it("justifyContent respects padding", () => {
    const node: LayoutNode = {
      style: {
        width: 30,
        paddingStart: 5,
        paddingEnd: 5,
        justifyContent: "flex-end",
      },
      children: [{ style: { width: 5 } }],
    };
    const result = computeLayout(node, 80, 24);

    // Content area: 30 - 5 - 5 = 20, flex-end puts child at end
    // x = paddingStart + (20 - 5) = 5 + 15 = 20
    assert.strictEqual(result.children[0].x, 20);
  });

  it("flex-start with gap adds space between items", () => {
    const node: LayoutNode = {
      style: { width: 30, justifyContent: "flex-start", gap: 2 },
      children: [{ style: { width: 5 } }, { style: { width: 5 } }],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].x, 0);
    assert.strictEqual(result.children[1].x, 7); // 5 + 2
  });

  it("center with gap keeps gap between items", () => {
    const node: LayoutNode = {
      style: { width: 30, justifyContent: "center", gap: 2 },
      children: [{ style: { width: 5 } }, { style: { width: 5 } }],
    };
    const result = computeLayout(node, 80, 24);

    // Total content: 5 + 2 + 5 = 12, remaining = 18, offset = 9
    assert.strictEqual(result.children[0].x, 9);
    assert.strictEqual(result.children[1].x, 16); // 9 + 5 + 2
  });

  it("space-evenly positions last child correctly despite fractional gaps", () => {
    // Regression test: fractional gaps should not accumulate rounding errors.
    // With 100 width, 10 children of 5 width each = 50 used, 50 remaining.
    // space-evenly: 11 gaps of 50/11 = 4.545... each
    // Last child should be at round(10 * 4.545 + 9 * 5) = round(90.45) = 90
    const node: LayoutNode = {
      style: { width: 100, justifyContent: "space-evenly" },
      children: Array.from({ length: 10 }, () => ({ style: { width: 5 } })),
    };
    const result = computeLayout(node, 100, 24);

    // First child: round(50/11) = round(4.545) = 5
    assert.strictEqual(result.children[0].x, 5);
    // Last child: should be exactly at 90 (100 - 5 - 5 for final gap)
    // Computed: round(10 * 4.545... + 9 * 5) = round(45.45 + 45) = 90
    assert.strictEqual(result.children[9].x, 90);
  });
});

describe("alignItems", () => {
  it("flex-start aligns at top (row)", () => {
    const node: LayoutNode = {
      style: { height: 20, alignItems: "flex-start" },
      children: [{ style: { width: 10, height: 5 } }],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].y, 0);
  });

  it("flex-end aligns at bottom (row)", () => {
    const node: LayoutNode = {
      style: { height: 20, alignItems: "flex-end" },
      children: [{ style: { width: 10, height: 5 } }],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].y, 15);
  });

  it("center aligns in middle", () => {
    const node: LayoutNode = {
      style: { height: 20, alignItems: "center" },
      children: [{ style: { width: 10, height: 10 } }],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].y, 5);
  });

  it("stretch fills cross axis when height is auto", () => {
    const node: LayoutNode = {
      style: { height: 20, alignItems: "stretch" },
      children: [{ style: { width: 10 } }], // no explicit height
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].height, 20);
    assert.strictEqual(result.children[0].y, 0);
  });

  it("stretch does not override explicit height", () => {
    const node: LayoutNode = {
      style: { height: 20, alignItems: "stretch" },
      children: [{ style: { width: 10, height: 8 } }],
    };
    const result = computeLayout(node, 80, 24);

    // Explicit height is preserved
    assert.strictEqual(result.children[0].height, 8);
  });

  it("alignItems works in column direction", () => {
    const node: LayoutNode = {
      style: { width: 20, flexDirection: "column", alignItems: "flex-end" },
      children: [{ style: { width: 5, height: 10 } }],
    };
    const result = computeLayout(node, 80, 24);

    // Cross axis is horizontal for column, flex-end = right side
    assert.strictEqual(result.children[0].x, 15);
  });

  it("stretch in column fills width when auto", () => {
    const node: LayoutNode = {
      style: { width: 20, flexDirection: "column", alignItems: "stretch" },
      children: [{ style: { height: 10 } }], // no explicit width
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].width, 20);
  });

  it("alignItems respects padding", () => {
    const node: LayoutNode = {
      style: {
        height: 20,
        paddingTop: 3,
        paddingBottom: 3,
        alignItems: "center",
      },
      children: [{ style: { width: 10, height: 6 } }],
    };
    const result = computeLayout(node, 80, 24);

    // Content area: 20 - 3 - 3 = 14, center: (14 - 6) / 2 = 4
    // y = paddingTop + 4 = 7
    assert.strictEqual(result.children[0].y, 7);
  });

  it("alignSelf overrides alignItems", () => {
    const node: LayoutNode = {
      style: { height: 20, alignItems: "flex-start" },
      children: [{ style: { width: 10, height: 5, alignSelf: "flex-end" } }],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].y, 15);
  });

  it("alignSelf auto uses parent alignItems", () => {
    const node: LayoutNode = {
      style: { height: 20, alignItems: "center" },
      children: [{ style: { width: 10, height: 10, alignSelf: "auto" } }],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].y, 5);
  });

  it("multiple children can have different alignSelf", () => {
    const node: LayoutNode = {
      style: { height: 20, alignItems: "flex-start" },
      children: [
        { style: { width: 10, height: 5 } },
        { style: { width: 10, height: 5, alignSelf: "center" } },
        { style: { width: 10, height: 5, alignSelf: "flex-end" } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].y, 0); // flex-start (from parent)
    assert.strictEqual(result.children[1].y, 8); // center: (20 - 5) / 2 = 7.5 rounded
    assert.strictEqual(result.children[2].y, 15); // flex-end
  });

  it("alignItems respects child margins", () => {
    const node: LayoutNode = {
      style: { height: 20, alignItems: "flex-start" },
      children: [{ style: { width: 10, height: 5, marginTop: 3 } }],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].y, 3);
  });

  it("flex-end respects marginBottom", () => {
    const node: LayoutNode = {
      style: { height: 20, alignItems: "flex-end" },
      children: [{ style: { width: 10, height: 5, marginBottom: 3 } }],
    };
    const result = computeLayout(node, 80, 24);

    // y = 20 - 5 - 3 = 12
    assert.strictEqual(result.children[0].y, 12);
  });

  it("stretch respects margins", () => {
    const node: LayoutNode = {
      style: { height: 20, alignItems: "stretch" },
      children: [{ style: { width: 10, marginTop: 2, marginBottom: 3 } }],
    };
    const result = computeLayout(node, 80, 24);

    // height = 20 - 2 - 3 = 15
    assert.strictEqual(result.children[0].height, 15);
    assert.strictEqual(result.children[0].y, 2);
  });
});

describe("flex wrap", () => {
  it("nowrap keeps all items on one line", () => {
    const node: LayoutNode = {
      style: { width: 20, flexWrap: "nowrap" },
      children: [{ style: { width: 15 } }, { style: { width: 15 } }],
    };
    const result = computeLayout(node, 80, 24);

    // Items should overflow, not wrap (same y position)
    assert.strictEqual(result.children[0].y, result.children[1].y);
  });

  it("wrap creates multiple lines", () => {
    const node: LayoutNode = {
      style: {
        width: 20,
        flexWrap: "wrap",
        alignItems: "flex-start",
        alignContent: "flex-start",
      },
      children: [
        { style: { width: 15, height: 5 } },
        { style: { width: 15, height: 5 } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Second item should be on a new line (different y)
    assert.strictEqual(result.children[0].y, 0);
    assert.strictEqual(result.children[1].y, 5);
  });

  it("each line distributes flex independently", () => {
    const node: LayoutNode = {
      style: {
        width: 20,
        flexWrap: "wrap",
        alignItems: "flex-start",
        alignContent: "flex-start",
      },
      children: [
        { style: { width: 10, height: 5, flexGrow: 1 } }, // line 1
        { style: { width: 15, height: 5, flexGrow: 1 } }, // line 2
      ],
    };
    const result = computeLayout(node, 80, 24);

    // First item grows to fill line 1
    assert.strictEqual(result.children[0].width, 20);
    // Second item grows to fill line 2
    assert.strictEqual(result.children[1].width, 20);
  });

  it("alignItems applies within each line", () => {
    const node: LayoutNode = {
      style: {
        width: 20,
        height: 20,
        flexWrap: "wrap",
        alignItems: "center",
        alignContent: "flex-start",
      },
      children: [
        { style: { width: 15, height: 3 } },
        { style: { width: 15, height: 5 } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Each item centered within its line's cross size
    // With alignContent: flex-start, line 1 cross size = 3, line 2 cross size = 5
    // Item 1 (height 3) centered in line 1 = at y=0 (fills line)
    // Item 2 (height 5) centered in line 2 = at y=3 (fills line)
    assert.strictEqual(result.children[0].y, 0);
    assert.strictEqual(result.children[1].y, 3);
  });

  it("container auto-height with wrap = sum of lines", () => {
    const node: LayoutNode = {
      style: { alignItems: "flex-start" },
      children: [
        {
          style: { width: 20, flexWrap: "wrap", alignItems: "flex-start" },
          children: [
            { style: { width: 15, height: 5 } },
            { style: { width: 15, height: 10 } },
          ],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Container height = 5 + 10 = 15
    assert.strictEqual(result.children[0].height, 15);
  });

  it("gap applies between wrapped lines", () => {
    const node: LayoutNode = {
      style: { alignItems: "flex-start" },
      children: [
        {
          style: {
            width: 20,
            flexWrap: "wrap",
            gap: 2,
            alignItems: "flex-start",
          },
          children: [
            { style: { width: 15, height: 5 } },
            { style: { width: 15, height: 5 } },
          ],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Line 1 at y=0, Line 2 at y=5+2(gap)=7
    assert.strictEqual(result.children[0].children[0].y, 0);
    assert.strictEqual(result.children[0].children[1].y, 7);

    // Container height = 5 + 2 + 5 = 12
    assert.strictEqual(result.children[0].height, 12);
  });

  it("oversized item gets its own line (no infinite loop)", () => {
    const node: LayoutNode = {
      style: {
        width: 20,
        flexWrap: "wrap",
        alignItems: "flex-start",
        alignContent: "flex-start",
      },
      children: [
        { style: { width: 50, height: 5 } }, // larger than container!
        { style: { width: 10, height: 5 } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Should complete without hanging
    // First item on line 1 (overflows), second on line 2
    assert.strictEqual(result.children[0].y, 0);
    assert.strictEqual(result.children[1].y, 5);
  });

  it("wrap with column direction wraps vertically", () => {
    const node: LayoutNode = {
      style: {
        height: 20,
        flexDirection: "column",
        flexWrap: "wrap",
        alignItems: "flex-start",
        alignContent: "flex-start",
      },
      children: [
        { style: { width: 5, height: 15 } },
        { style: { width: 5, height: 15 } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Second item should be on a new column (different x)
    assert.strictEqual(result.children[0].x, 0);
    assert.strictEqual(result.children[1].x, 5);
  });

  it("wrap respects padding", () => {
    const node: LayoutNode = {
      style: {
        width: 30,
        flexWrap: "wrap",
        paddingStart: 5,
        paddingEnd: 5,
        alignItems: "flex-start",
        alignContent: "flex-start",
      },
      children: [
        { style: { width: 15, height: 5 } },
        { style: { width: 15, height: 5 } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Available main space = 30 - 5 - 5 = 20
    // First item fits, second wraps
    assert.strictEqual(result.children[0].y, 0);
    assert.strictEqual(result.children[1].y, 5);
    // First item positioned after padding
    assert.strictEqual(result.children[0].x, 5);
  });

  it("items with margins wrap correctly", () => {
    const node: LayoutNode = {
      style: {
        width: 20,
        flexWrap: "wrap",
        alignItems: "flex-start",
        alignContent: "flex-start",
      },
      children: [
        { style: { width: 8, height: 5, marginStart: 2, marginEnd: 2 } },
        { style: { width: 8, height: 5, marginStart: 2, marginEnd: 2 } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Each item with margins takes 12 (8 + 2 + 2)
    // 12 + 12 = 24 > 20, so second wraps
    assert.strictEqual(result.children[0].y, 0);
    assert.strictEqual(result.children[1].y, 5);
  });

  it("multiple items fit on same line before wrapping", () => {
    const node: LayoutNode = {
      style: {
        width: 30,
        flexWrap: "wrap",
        alignItems: "flex-start",
        alignContent: "flex-start",
      },
      children: [
        { style: { width: 10, height: 5 } },
        { style: { width: 10, height: 5 } },
        { style: { width: 10, height: 5 } },
        { style: { width: 10, height: 5 } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // First 3 fit on line 1 (10*3=30), fourth wraps
    assert.strictEqual(result.children[0].y, 0);
    assert.strictEqual(result.children[1].y, 0);
    assert.strictEqual(result.children[2].y, 0);
    assert.strictEqual(result.children[3].y, 5);
  });
});

describe("nested containers", () => {
  it("nested flex container computes correctly", () => {
    const node: LayoutNode = {
      style: { width: 40, height: 20 },
      children: [
        {
          // Inner container: use flexGrow to take parent's full width
          style: { flexDirection: "column", flexGrow: 1 },
          children: [{ style: { height: 5 } }, { style: { flexGrow: 1 } }],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Outer container: 40x20
    // Inner container: grows to 40 width, stretches to 20 height
    // Inner child 1: 5 height
    // Inner child 2: grows to fill remaining 15
    assert.strictEqual(result.children[0].width, 40);
    assert.strictEqual(result.children[0].height, 20);
    assert.strictEqual(result.children[0].children[0].height, 5);
    assert.strictEqual(result.children[0].children[1].height, 15);
  });

  it("deeply nested (3 levels) works", () => {
    const node: LayoutNode = {
      style: { width: 60, height: 30 },
      children: [
        {
          style: { flexGrow: 1 },
          children: [
            {
              style: { flexGrow: 1 },
              children: [{ style: { width: 10, height: 10 } }],
            },
          ],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // All levels should fill available space
    assert.strictEqual(result.children[0].width, 60);
    assert.strictEqual(result.children[0].height, 30);
    assert.strictEqual(result.children[0].children[0].width, 60);
    assert.strictEqual(result.children[0].children[0].height, 30);
  });

  it("nested containers compute screen coordinates correctly", () => {
    const node: LayoutNode = {
      style: {
        width: 80,
        height: 24,
        paddingTop: 2,
        paddingStart: 3,
      },
      children: [
        {
          style: {
            width: 40,
            height: 10,
            paddingTop: 1,
            paddingStart: 2,
          },
          children: [{ style: { width: 10, height: 5 } }],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Root: screenX=0, screenY=0
    // First child: relative x=0, y=0, screenX=0+3=3, screenY=0+2=2
    // Nested child: relative x=0, y=0, screenX=3+2=5, screenY=2+1=3
    assert.strictEqual(result.screenX, 0);
    assert.strictEqual(result.screenY, 0);
    assert.strictEqual(result.children[0].screenX, 3);
    assert.strictEqual(result.children[0].screenY, 2);
    assert.strictEqual(result.children[0].children[0].screenX, 5);
    assert.strictEqual(result.children[0].children[0].screenY, 3);
  });
});

describe("complete layout scenarios", () => {
  it("toolbar with flexible middle", () => {
    // [Logo] [-----Search-----] [Avatar]
    const node: LayoutNode = {
      style: { width: 80, height: 3 },
      children: [
        { style: { width: 10 } }, // Logo
        { style: { flexGrow: 1 } }, // Search
        { style: { width: 8 } }, // Avatar
      ],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].width, 10);
    assert.strictEqual(result.children[1].width, 62); // 80 - 10 - 8
    assert.strictEqual(result.children[2].width, 8);
    assert.strictEqual(result.children[2].x, 72); // 10 + 62
  });

  it("sidebar layout", () => {
    // Sidebar | Main content
    const node: LayoutNode = {
      style: { width: 80, height: 24 },
      children: [
        { style: { width: 20 } }, // Sidebar
        { style: { flexGrow: 1 } }, // Main
      ],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].width, 20);
    assert.strictEqual(result.children[0].height, 24); // stretch
    assert.strictEqual(result.children[1].width, 60);
    assert.strictEqual(result.children[1].x, 20);
  });

  it("centered modal", () => {
    const node: LayoutNode = {
      style: {
        width: 80,
        height: 24,
        justifyContent: "center",
        alignItems: "center",
      },
      children: [{ style: { width: 40, height: 10 } }],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].x, 20); // (80-40)/2
    assert.strictEqual(result.children[0].y, 7); // (24-10)/2
  });

  it("list with padding and gap", () => {
    // Wrap in a parent to test intrinsic sizing (root uses available space)
    const node: LayoutNode = {
      style: { alignItems: "flex-start" },
      children: [
        {
          style: {
            flexDirection: "column",
            paddingTop: 1,
            paddingEnd: 2,
            paddingBottom: 1,
            paddingStart: 2,
            gap: 1,
          },
          children: [
            { style: { height: 3 } },
            { style: { height: 3 } },
            { style: { height: 3 } },
          ],
        },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Intrinsic height: 1 + 3 + 1 + 3 + 1 + 3 + 1 = 13 (padding + items + gaps)
    assert.strictEqual(result.children[0].height, 13);

    // First item at y = 1 (top padding)
    assert.strictEqual(result.children[0].children[0].y, 1);
    // Second item at y = 1 + 3 + 1 = 5
    assert.strictEqual(result.children[0].children[1].y, 5);
  });

  it("header-content-footer layout", () => {
    const node: LayoutNode = {
      style: { width: 80, height: 24, flexDirection: "column" },
      children: [
        { style: { height: 3 } }, // Header
        { style: { flexGrow: 1 } }, // Content
        { style: { height: 2 } }, // Footer
      ],
    };
    const result = computeLayout(node, 80, 24);

    assert.strictEqual(result.children[0].height, 3);
    assert.strictEqual(result.children[1].height, 19); // 24 - 3 - 2
    assert.strictEqual(result.children[2].height, 2);
    assert.strictEqual(result.children[2].y, 22); // 3 + 19
  });
});

describe("layout caching", () => {
  it("returns cached result for same dimensions", () => {
    const node: LayoutNode = {
      style: {},
      children: [{ style: { width: 10 } }],
    };

    const result1 = computeLayout(node, 80, 24);
    const result2 = computeLayout(node, 80, 24);

    // Same object reference (cached)
    assert.strictEqual(result1, result2);
  });

  it("recomputes for different dimensions", () => {
    const node: LayoutNode = {
      style: {},
      children: [{ style: { flexGrow: 1 } }],
    };

    const result1 = computeLayout(node, 80, 24);
    const result2 = computeLayout(node, 100, 24);

    assert.notStrictEqual(result1.children[0].width, result2.children[0].width);
    assert.strictEqual(result1.children[0].width, 80);
    assert.strictEqual(result2.children[0].width, 100);
  });

  it("new node object bypasses cache", () => {
    const node1: LayoutNode = {
      style: {},
      children: [{ style: { width: 10 } }],
    };
    const node2: LayoutNode = {
      style: {},
      children: [{ style: { width: 10 } }],
    };

    const result1 = computeLayout(node1, 80, 24);
    const result2 = computeLayout(node2, 80, 24);

    // Different node objects = different cache entries
    assert.notStrictEqual(result1, result2);
    // But same computed values
    assert.strictEqual(result1.children[0].width, result2.children[0].width);
  });

  it("clearLayoutCache removes cached results", () => {
    const node: LayoutNode = {
      style: {},
      children: [{ style: { width: 10 } }],
    };

    const result1 = computeLayout(node, 80, 24);
    clearLayoutCache(node);
    const result2 = computeLayout(node, 80, 24);

    // After clearing, we get a new result object
    assert.notStrictEqual(result1, result2);
    // But same computed values
    assert.strictEqual(result1.children[0].width, result2.children[0].width);
  });
});

describe("flexBasis", () => {
  it("numeric flexBasis sets initial width in row direction", () => {
    const node: LayoutNode = {
      style: { width: 100, flexDirection: "row" },
      children: [{ style: { flexBasis: 30 } }, { style: { flexBasis: 20 } }],
    };
    const result = computeLayout(node, 100, 24);

    assert.strictEqual(result.children[0].width, 30);
    assert.strictEqual(result.children[1].width, 20);
  });

  it("numeric flexBasis sets initial height in column direction", () => {
    const node: LayoutNode = {
      style: { height: 100, flexDirection: "column" },
      children: [{ style: { flexBasis: 30 } }, { style: { flexBasis: 20 } }],
    };
    const result = computeLayout(node, 80, 100);

    assert.strictEqual(result.children[0].height, 30);
    assert.strictEqual(result.children[1].height, 20);
  });

  it("flexBasis: 'auto' uses explicit width/height", () => {
    const node: LayoutNode = {
      style: { width: 100, flexDirection: "row" },
      children: [
        { style: { flexBasis: "auto", width: 25 } },
        { style: { flexBasis: "auto", width: 15 } },
      ],
    };
    const result = computeLayout(node, 100, 24);

    assert.strictEqual(result.children[0].width, 25);
    assert.strictEqual(result.children[1].width, 15);
  });

  it("flexBasis with flexGrow distributes extra space", () => {
    const node: LayoutNode = {
      style: { width: 100, flexDirection: "row" },
      children: [
        { style: { flexBasis: 20, flexGrow: 1 } },
        { style: { flexBasis: 30, flexGrow: 1 } },
      ],
    };
    const result = computeLayout(node, 100, 24);

    // Basis: 20 + 30 = 50, remaining: 50, each gets 25 extra
    assert.strictEqual(result.children[0].width, 45); // 20 + 25
    assert.strictEqual(result.children[1].width, 55); // 30 + 25
  });

  it("flexBasis with flexShrink shrinks proportionally", () => {
    const node: LayoutNode = {
      style: { width: 50, flexDirection: "row" },
      children: [
        { style: { flexBasis: 40, flexShrink: 1 } },
        { style: { flexBasis: 40, flexShrink: 1 } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // Basis: 40 + 40 = 80, overflow: 30, shrink equally (same basis, same factor)
    assert.strictEqual(result.children[0].width, 25);
    assert.strictEqual(result.children[1].width, 25);
  });

  it("flexBasis respects minWidth constraint", () => {
    const node: LayoutNode = {
      style: { width: 50, flexDirection: "row" },
      children: [
        { style: { flexBasis: 40, flexShrink: 1, minWidth: 30 } },
        { style: { flexBasis: 40, flexShrink: 1 } },
      ],
    };
    const result = computeLayout(node, 80, 24);

    // First child clamped to minWidth 30
    assert.ok(result.children[0].width >= 30);
  });

  it("flexBasis respects maxWidth constraint", () => {
    const node: LayoutNode = {
      style: { width: 100, flexDirection: "row" },
      children: [{ style: { flexBasis: 60, maxWidth: 40 } }],
    };
    const result = computeLayout(node, 100, 24);

    assert.strictEqual(result.children[0].width, 40);
  });

  it("explicit width overrides flexBasis", () => {
    const node: LayoutNode = {
      style: { width: 100, flexDirection: "row" },
      children: [{ style: { flexBasis: 50, width: 30 } }],
    };
    const result = computeLayout(node, 100, 24);

    // Explicit width takes precedence
    assert.strictEqual(result.children[0].width, 30);
  });

  it("flexBasis does not affect cross-axis sizing", () => {
    const node: LayoutNode = {
      style: {
        width: 100,
        height: 50,
        flexDirection: "row",
        alignItems: "flex-start",
      },
      children: [{ style: { flexBasis: 30, height: 20 } }],
    };
    const result = computeLayout(node, 100, 50);

    // flexBasis sets width, height is explicit
    assert.strictEqual(result.children[0].width, 30);
    assert.strictEqual(result.children[0].height, 20);
  });

  it("flexBasis with measure function for cross-axis", () => {
    const node: LayoutNode = {
      style: { width: 100, flexDirection: "row", alignItems: "flex-start" },
      children: [
        {
          style: { flexBasis: 40 },
          measure: () => ({ width: 10, height: 5 }),
        },
      ],
    };
    const result = computeLayout(node, 100, 24);

    // flexBasis sets width to 40, measure provides height
    assert.strictEqual(result.children[0].width, 40);
    assert.strictEqual(result.children[0].height, 5);
  });
});

describe("alignContent", () => {
  // alignContent only affects wrapped containers with multiple lines

  it("flex-start packs lines at start (default)", () => {
    const node: LayoutNode = {
      style: {
        width: 30,
        height: 50,
        flexWrap: "wrap",
        alignContent: "flex-start",
        alignItems: "flex-start",
      },
      children: [
        { style: { width: 20, height: 10 } },
        { style: { width: 20, height: 10 } },
      ],
    };
    const result = computeLayout(node, 80, 50);

    // Lines at top: y=0, y=10
    assert.strictEqual(result.children[0].y, 0);
    assert.strictEqual(result.children[1].y, 10);
  });

  it("flex-end packs lines at end", () => {
    const node: LayoutNode = {
      style: {
        width: 30,
        height: 50,
        flexWrap: "wrap",
        alignContent: "flex-end",
        alignItems: "flex-start",
      },
      children: [
        { style: { width: 20, height: 10 } },
        { style: { width: 20, height: 10 } },
      ],
    };
    const result = computeLayout(node, 80, 50);

    // Total lines height = 20, remaining = 30
    // Lines packed at bottom: y=30, y=40
    assert.strictEqual(result.children[0].y, 30);
    assert.strictEqual(result.children[1].y, 40);
  });

  it("center centers lines", () => {
    const node: LayoutNode = {
      style: {
        width: 30,
        height: 50,
        flexWrap: "wrap",
        alignContent: "center",
        alignItems: "flex-start",
      },
      children: [
        { style: { width: 20, height: 10 } },
        { style: { width: 20, height: 10 } },
      ],
    };
    const result = computeLayout(node, 80, 50);

    // Total lines height = 20, remaining = 30, offset = 15
    // Lines: y=15, y=25
    assert.strictEqual(result.children[0].y, 15);
    assert.strictEqual(result.children[1].y, 25);
  });

  it("stretch distributes extra space to lines", () => {
    const node: LayoutNode = {
      style: {
        width: 30,
        height: 50,
        flexWrap: "wrap",
        alignContent: "stretch",
        alignItems: "flex-start",
      },
      children: [
        { style: { width: 20, height: 10 } },
        { style: { width: 20, height: 10 } },
      ],
    };
    const result = computeLayout(node, 80, 50);

    // Total lines height = 20, remaining = 30, 15 per line
    // Line 1: y=0, lineCrossSize=25 (10+15)
    // Line 2: y=25, lineCrossSize=25
    assert.strictEqual(result.children[0].y, 0);
    assert.strictEqual(result.children[1].y, 25);
  });

  it("space-between distributes space between lines", () => {
    const node: LayoutNode = {
      style: {
        width: 30,
        height: 50,
        flexWrap: "wrap",
        alignContent: "space-between",
        alignItems: "flex-start",
      },
      children: [
        { style: { width: 20, height: 10 } },
        { style: { width: 20, height: 10 } },
      ],
    };
    const result = computeLayout(node, 80, 50);

    // Total lines height = 20, remaining = 30
    // First line at 0, last line at bottom (40)
    assert.strictEqual(result.children[0].y, 0);
    assert.strictEqual(result.children[1].y, 40);
  });

  it("space-around distributes equal space around lines", () => {
    const node: LayoutNode = {
      style: {
        width: 30,
        height: 50,
        flexWrap: "wrap",
        alignContent: "space-around",
        alignItems: "flex-start",
      },
      children: [
        { style: { width: 20, height: 10 } },
        { style: { width: 20, height: 10 } },
      ],
    };
    const result = computeLayout(node, 80, 50);

    // Total lines height = 20, remaining = 30, 2 lines = 15 per line
    // Half space before first = 7.5, then line 1 (10), then full space (15), then line 2 (10)
    // Line 1: y = 7.5 rounded = 8
    // Line 2: y = 7.5 + 10 + 15 = 32.5 rounded = 33
    assert.strictEqual(result.children[0].y, 8);
    assert.strictEqual(result.children[1].y, 33);
  });

  it("alignContent has no effect on single line", () => {
    const node: LayoutNode = {
      style: {
        width: 100,
        height: 50,
        flexWrap: "wrap",
        alignContent: "flex-end",
        alignItems: "flex-start",
      },
      children: [
        { style: { width: 20, height: 10 } },
        { style: { width: 20, height: 10 } },
      ],
    };
    const result = computeLayout(node, 100, 50);

    // Both items fit on one line, alignContent doesn't apply
    // alignItems flex-start puts them at y=0
    assert.strictEqual(result.children[0].y, 0);
    assert.strictEqual(result.children[1].y, 0);
  });

  it("alignContent has no effect on nowrap", () => {
    const node: LayoutNode = {
      style: {
        width: 30,
        height: 50,
        flexWrap: "nowrap",
        alignContent: "flex-end",
        alignItems: "flex-start",
      },
      children: [
        { style: { width: 20, height: 10 } },
        { style: { width: 20, height: 10 } },
      ],
    };
    const result = computeLayout(node, 80, 50);

    // nowrap: both on same line, alignContent doesn't apply
    assert.strictEqual(result.children[0].y, 0);
    assert.strictEqual(result.children[1].y, 0);
  });

  it("alignContent respects padding", () => {
    const node: LayoutNode = {
      style: {
        width: 30,
        height: 60,
        paddingTop: 5,
        paddingBottom: 5,
        flexWrap: "wrap",
        alignContent: "flex-end",
        alignItems: "flex-start",
      },
      children: [
        { style: { width: 20, height: 10 } },
        { style: { width: 20, height: 10 } },
      ],
    };
    const result = computeLayout(node, 80, 60);

    // Content area = 50, lines = 20, remaining = 30
    // flex-end: offset = 30, plus padding = 35
    // Line 1: y = 5 + 30 = 35, Line 2: y = 45
    assert.strictEqual(result.children[0].y, 35);
    assert.strictEqual(result.children[1].y, 45);
  });

  it("alignContent with three lines", () => {
    const node: LayoutNode = {
      style: {
        width: 30,
        height: 60,
        flexWrap: "wrap",
        alignContent: "space-between",
        alignItems: "flex-start",
      },
      children: [
        { style: { width: 20, height: 10 } },
        { style: { width: 20, height: 10 } },
        { style: { width: 20, height: 10 } },
      ],
    };
    const result = computeLayout(node, 80, 60);

    // 3 lines of 10 each = 30, remaining = 30, 2 gaps = 15 each
    // Line 1: y=0, Line 2: y=25, Line 3: y=50
    assert.strictEqual(result.children[0].y, 0);
    assert.strictEqual(result.children[1].y, 25);
    assert.strictEqual(result.children[2].y, 50);
  });

  it("alignContent works with column direction", () => {
    const node: LayoutNode = {
      style: {
        width: 50,
        height: 30,
        flexDirection: "column",
        flexWrap: "wrap",
        alignContent: "flex-end",
        alignItems: "flex-start",
      },
      children: [
        { style: { width: 10, height: 20 } },
        { style: { width: 10, height: 20 } },
      ],
    };
    const result = computeLayout(node, 50, 80);

    // Column wrap: cross axis is horizontal (x)
    // Total lines width = 20, remaining = 30
    // flex-end: lines packed at right (x=30, x=40)
    assert.strictEqual(result.children[0].x, 30);
    assert.strictEqual(result.children[1].x, 40);
  });
});

describe("absolute positioning", () => {
  it("position: absolute removes child from normal flow", () => {
    const node: LayoutNode = {
      style: { width: 100, height: 50 },
      children: [
        { style: { width: 20, height: 10 } },
        { style: { width: 20, height: 10, position: "absolute" } },
        { style: { width: 20, height: 10 } },
      ],
    };
    const result = computeLayout(node, 100, 50);

    // Absolute child is out of flow, so third child is at x=20 (not x=40)
    assert.strictEqual(result.children[0].x, 0);
    assert.strictEqual(result.children[2].x, 20);
  });

  it("absolute child positioned at top-left by default", () => {
    const node: LayoutNode = {
      style: { width: 100, height: 50 },
      children: [{ style: { width: 20, height: 10, position: "absolute" } }],
    };
    const result = computeLayout(node, 100, 50);

    assert.strictEqual(result.children[0].x, 0);
    assert.strictEqual(result.children[0].y, 0);
  });

  it("top and start position from top-left", () => {
    const node: LayoutNode = {
      style: { width: 100, height: 50 },
      children: [
        {
          style: {
            width: 20,
            height: 10,
            position: "absolute",
            top: 5,
            start: 10,
          },
        },
      ],
    };
    const result = computeLayout(node, 100, 50);

    assert.strictEqual(result.children[0].x, 10);
    assert.strictEqual(result.children[0].y, 5);
  });

  it("bottom and end position from bottom-right", () => {
    const node: LayoutNode = {
      style: { width: 100, height: 50 },
      children: [
        {
          style: {
            width: 20,
            height: 10,
            position: "absolute",
            bottom: 5,
            end: 10,
          },
        },
      ],
    };
    const result = computeLayout(node, 100, 50);

    // x = 100 - 20 - 10 = 70
    // y = 50 - 10 - 5 = 35
    assert.strictEqual(result.children[0].x, 70);
    assert.strictEqual(result.children[0].y, 35);
  });

  it("top takes precedence over bottom", () => {
    const node: LayoutNode = {
      style: { width: 100, height: 50 },
      children: [
        {
          style: {
            width: 20,
            height: 10,
            position: "absolute",
            top: 3,
            bottom: 100,
          },
        },
      ],
    };
    const result = computeLayout(node, 100, 50);

    assert.strictEqual(result.children[0].y, 3);
  });

  it("start takes precedence over end", () => {
    const node: LayoutNode = {
      style: { width: 100, height: 50 },
      children: [
        {
          style: {
            width: 20,
            height: 10,
            position: "absolute",
            start: 5,
            end: 100,
          },
        },
      ],
    };
    const result = computeLayout(node, 100, 50);

    assert.strictEqual(result.children[0].x, 5);
  });

  it("absolute child respects parent padding", () => {
    const node: LayoutNode = {
      style: {
        width: 100,
        height: 50,
        paddingTop: 5,
        paddingStart: 10,
        paddingBottom: 5,
        paddingEnd: 10,
      },
      children: [
        {
          style: {
            width: 20,
            height: 10,
            position: "absolute",
            top: 0,
            start: 0,
          },
        },
      ],
    };
    const result = computeLayout(node, 100, 50);

    // Positioned relative to content area (after padding)
    assert.strictEqual(result.children[0].x, 10);
    assert.strictEqual(result.children[0].y, 5);
  });

  it("absolute child at bottom-end respects padding", () => {
    const node: LayoutNode = {
      style: {
        width: 100,
        height: 50,
        paddingTop: 5,
        paddingStart: 10,
        paddingBottom: 5,
        paddingEnd: 10,
      },
      children: [
        {
          style: {
            width: 20,
            height: 10,
            position: "absolute",
            bottom: 0,
            end: 0,
          },
        },
      ],
    };
    const result = computeLayout(node, 100, 50);

    // Content area: 80x40, child at bottom-right of content area
    // x = 10 + (80 - 20 - 0) = 70
    // y = 5 + (40 - 10 - 0) = 35
    assert.strictEqual(result.children[0].x, 70);
    assert.strictEqual(result.children[0].y, 35);
  });

  it("absolute child does not affect sibling positions", () => {
    const node: LayoutNode = {
      style: { width: 100, height: 50 },
      children: [
        { style: { width: 30 } },
        {
          style: {
            width: 50,
            height: 20,
            position: "absolute",
            top: 0,
            start: 0,
          },
        },
        { style: { width: 30 } },
      ],
    };
    const result = computeLayout(node, 100, 50);

    // First and third children are positioned as if absolute child doesn't exist
    assert.strictEqual(result.children[0].x, 0);
    assert.strictEqual(result.children[0].width, 30);
    assert.strictEqual(result.children[2].x, 30);
    assert.strictEqual(result.children[2].width, 30);
  });

  it("multiple absolute children can overlap", () => {
    const node: LayoutNode = {
      style: { width: 100, height: 50 },
      children: [
        {
          style: {
            width: 20,
            height: 10,
            position: "absolute",
            top: 5,
            start: 5,
          },
        },
        {
          style: {
            width: 20,
            height: 10,
            position: "absolute",
            top: 5,
            start: 5,
          },
        },
      ],
    };
    const result = computeLayout(node, 100, 50);

    // Both at same position
    assert.strictEqual(result.children[0].x, 5);
    assert.strictEqual(result.children[0].y, 5);
    assert.strictEqual(result.children[1].x, 5);
    assert.strictEqual(result.children[1].y, 5);
  });

  it("absolute child does not contribute to parent intrinsic size", () => {
    const node: LayoutNode = {
      style: { alignItems: "flex-start" },
      children: [
        {
          style: { flexDirection: "row" },
          children: [
            { style: { width: 10, height: 5 } },
            { style: { width: 100, height: 50, position: "absolute" } },
          ],
        },
      ],
    };
    const result = computeLayout(node, 200, 100);

    // Parent width should be 10 (only from relative child), not 110
    assert.strictEqual(result.children[0].width, 10);
  });

  it("absolute child with explicit size", () => {
    const node: LayoutNode = {
      style: { width: 100, height: 50 },
      children: [
        {
          style: {
            width: 30,
            height: 20,
            position: "absolute",
            top: 10,
            start: 15,
          },
        },
      ],
    };
    const result = computeLayout(node, 100, 50);

    assert.strictEqual(result.children[0].width, 30);
    assert.strictEqual(result.children[0].height, 20);
    assert.strictEqual(result.children[0].x, 15);
    assert.strictEqual(result.children[0].y, 10);
  });

  it("absolute child with measure function", () => {
    const node: LayoutNode = {
      style: { width: 100, height: 50 },
      children: [
        {
          style: { position: "absolute", top: 5, start: 5 },
          measure: () => ({ width: 25, height: 8 }),
        },
      ],
    };
    const result = computeLayout(node, 100, 50);

    assert.strictEqual(result.children[0].width, 25);
    assert.strictEqual(result.children[0].height, 8);
    assert.strictEqual(result.children[0].x, 5);
    assert.strictEqual(result.children[0].y, 5);
  });

  it("absolute child screen coordinates are computed correctly", () => {
    const node: LayoutNode = {
      style: { width: 100, height: 50, paddingTop: 5, paddingStart: 10 },
      children: [
        {
          style: {
            width: 20,
            height: 10,
            position: "absolute",
            top: 3,
            start: 7,
          },
        },
      ],
    };
    const result = computeLayout(node, 100, 50);

    // Relative position: x = 10 + 7 = 17, y = 5 + 3 = 8
    assert.strictEqual(result.children[0].x, 17);
    assert.strictEqual(result.children[0].y, 8);
    // Screen position should match for root's children
    assert.strictEqual(result.children[0].screenX, 17);
    assert.strictEqual(result.children[0].screenY, 8);
  });
});

describe("display contents", () => {
  it("hoists children to parent for layout", () => {
    const node: LayoutNode = {
      style: { width: 90, height: 10, flexDirection: "row" },
      children: [
        { style: { width: 10, height: 10 } },
        {
          style: { display: "contents" },
          children: [
            { style: { width: 20, height: 10 } },
            { style: { width: 30, height: 10 } },
          ],
        },
        { style: { width: 10, height: 10 } },
      ],
    };
    const result = computeLayout(node, 90, 10);

    // Contents node is skipped, its children hoisted
    // Layout should have 4 children: 10, 20, 30, 10
    assert.strictEqual(result.children.length, 4);
    assert.strictEqual(result.children[0].width, 10);
    assert.strictEqual(result.children[1].width, 20);
    assert.strictEqual(result.children[2].width, 30);
    assert.strictEqual(result.children[3].width, 10);

    // Positions should be sequential
    assert.strictEqual(result.children[0].x, 0);
    assert.strictEqual(result.children[1].x, 10);
    assert.strictEqual(result.children[2].x, 30);
    assert.strictEqual(result.children[3].x, 60);
  });

  it("nested contents nodes hoist recursively", () => {
    const node: LayoutNode = {
      style: { width: 60, height: 10, flexDirection: "row" },
      children: [
        {
          style: { display: "contents" },
          children: [
            {
              style: { display: "contents" },
              children: [{ style: { width: 20, height: 10 } }],
            },
            { style: { width: 20, height: 10 } },
          ],
        },
        { style: { width: 20, height: 10 } },
      ],
    };
    const result = computeLayout(node, 60, 10);

    // All contents nodes skipped, grandchildren hoisted
    assert.strictEqual(result.children.length, 3);
    assert.strictEqual(result.children[0].x, 0);
    assert.strictEqual(result.children[1].x, 20);
    assert.strictEqual(result.children[2].x, 40);
  });

  it("hoisted children participate in flex distribution", () => {
    const node: LayoutNode = {
      style: { width: 90, height: 10, flexDirection: "row" },
      children: [
        { style: { flexGrow: 1 } },
        {
          style: { display: "contents" },
          children: [{ style: { flexGrow: 1 } }],
        },
        { style: { flexGrow: 1 } },
      ],
    };
    const result = computeLayout(node, 90, 10);

    // Three children with flexGrow: 1 each get 30
    assert.strictEqual(result.children.length, 3);
    assert.strictEqual(result.children[0].width, 30);
    assert.strictEqual(result.children[1].width, 30);
    assert.strictEqual(result.children[2].width, 30);
  });

  it("gap applies between hoisted children", () => {
    // 4 children × 20 + 3 gaps × 10 = 110 total
    const node: LayoutNode = {
      style: { width: 110, height: 10, flexDirection: "row", gap: 10 },
      children: [
        { style: { width: 20, height: 10 } },
        {
          style: { display: "contents" },
          children: [
            { style: { width: 20, height: 10 } },
            { style: { width: 20, height: 10 } },
          ],
        },
        { style: { width: 20, height: 10 } },
      ],
    };
    const result = computeLayout(node, 110, 10);

    // 4 children with gap 10 between each: positions at 0, 30, 60, 90
    assert.strictEqual(result.children.length, 4);
    assert.strictEqual(result.children[0].x, 0);
    assert.strictEqual(result.children[1].x, 30);
    assert.strictEqual(result.children[2].x, 60);
    assert.strictEqual(result.children[3].x, 90);
  });

  it("hoisted children respect parent alignItems", () => {
    const node: LayoutNode = {
      style: {
        width: 60,
        height: 20,
        flexDirection: "row",
        alignItems: "center",
      },
      children: [
        { style: { width: 20, height: 10 } },
        {
          style: { display: "contents" },
          children: [{ style: { width: 20, height: 10 } }],
        },
        { style: { width: 20, height: 10 } },
      ],
    };
    const result = computeLayout(node, 60, 20);

    // All children centered: y = (20 - 10) / 2 = 5
    assert.strictEqual(result.children.length, 3);
    assert.strictEqual(result.children[0].y, 5);
    assert.strictEqual(result.children[1].y, 5);
    assert.strictEqual(result.children[2].y, 5);
  });

  it("hoisted children respect parent alignItems stretch", () => {
    const node: LayoutNode = {
      style: {
        width: 60,
        height: 20,
        flexDirection: "row",
        alignItems: "stretch",
      },
      children: [
        { style: { width: 20 } },
        {
          style: { display: "contents" },
          children: [{ style: { width: 20 } }],
        },
        { style: { width: 20 } },
      ],
    };
    const result = computeLayout(node, 60, 20);

    // All children stretched to parent height
    assert.strictEqual(result.children.length, 3);
    assert.strictEqual(result.children[0].height, 20);
    assert.strictEqual(result.children[1].height, 20);
    assert.strictEqual(result.children[2].height, 20);
  });

  it("contents with no children contributes nothing", () => {
    const node: LayoutNode = {
      style: { width: 40, height: 10, flexDirection: "row" },
      children: [
        { style: { width: 20, height: 10 } },
        { style: { display: "contents" } }, // No children
        { style: { width: 20, height: 10 } },
      ],
    };
    const result = computeLayout(node, 40, 10);

    // Empty contents node contributes nothing
    assert.strictEqual(result.children.length, 2);
    assert.strictEqual(result.children[0].x, 0);
    assert.strictEqual(result.children[1].x, 20);
  });

  it("contents in column direction", () => {
    const node: LayoutNode = {
      style: { width: 10, height: 60, flexDirection: "column" },
      children: [
        { style: { width: 10, height: 20 } },
        {
          style: { display: "contents" },
          children: [{ style: { width: 10, height: 20 } }],
        },
        { style: { width: 10, height: 20 } },
      ],
    };
    const result = computeLayout(node, 10, 60);

    assert.strictEqual(result.children.length, 3);
    assert.strictEqual(result.children[0].y, 0);
    assert.strictEqual(result.children[1].y, 20);
    assert.strictEqual(result.children[2].y, 40);
  });
});

describe("distribute", () => {
  it("gives remainder to items with largest fractional parts", () => {
    // Distributing 1 among weights [3, 20]:
    // Header: 3/23 * 1 = 0.130 → floor 0, fraction 0.130
    // Content: 20/23 * 1 = 0.869 → floor 0, fraction 0.869
    // Remainder (1) should go to content (largest fraction), not header
    const result = distribute(1, [3, 20]);
    assert.deepStrictEqual(result, [0, 1]);
  });
});

describe("flex shrink with padding", () => {
  it("shrinks the larger child rather than the small padded child", () => {
    // A column container with two children that overflow by 1 row.
    // The small child (header=3) should keep its size, while the large
    // child (content=20) absorbs the shrink.
    const node: LayoutNode = {
      style: { flexDirection: "column" },
      children: [
        {
          style: { paddingTop: 1, paddingBottom: 1 },
          children: [{ style: { width: 10, height: 1 } }],
        },
        {
          style: { flexDirection: "column", paddingBottom: 1 },
          children: Array.from({ length: 10 }, () => ({
            style: { width: 10, height: 1 },
          })),
        },
      ],
    };

    // Available height = 22, children need 3 + 20 = 23 → overflow 1
    const result = computeLayout(node, 50, 22);

    // Header should keep height 3 (padding preserved, text has room)
    assert.strictEqual(result.children[0].height, 3,
      `Header should be 3 rows (padTop:1 + text:1 + padBot:1), got ${result.children[0].height}`);
  });
});
