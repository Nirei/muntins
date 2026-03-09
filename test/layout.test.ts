import assert from "node:assert";
import { describe, it } from "node:test";
import {
  DEFAULT_FLEX_STYLE,
  type FlexStyle,
  type LayoutNode,
  type LayoutResult,
  computeLayout,
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
    const node: LayoutNode = {
      style: {},
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
    const node: LayoutNode = {
      style: {},
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
    const node: LayoutNode = {
      style: {},
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
    const node: LayoutNode = {
      style: {},
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
    const node: LayoutNode = {
      style: {},
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
    const node: LayoutNode = {
      style: {},
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
    const node: LayoutNode = {
      style: {},
      children: [
        {
          style: { flexDirection: "column", paddingTop: 1, paddingBottom: 1 },
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
