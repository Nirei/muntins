import assert from "node:assert";
import { describe, it } from "node:test";
import { computeColumnWidths } from "../../src/ui/Table.ts";

describe("computeColumnWidths", () => {
  it("returns max-content widths when everything fits", () => {
    const widths = computeColumnWidths([2, 3], [5, 7], 20);
    assert.deepEqual(widths, [5, 7]);
  });

  it("fits exactly at the boundary", () => {
    const widths = computeColumnWidths([2, 3], [5, 7], 12);
    assert.deepEqual(widths, [5, 7]);
  });

  it("shrinks columns proportionally toward min-content", () => {
    // deficit 4, shrinkable 12: losses 4/3 and 8/3, then rounding is fixed
    const widths = computeColumnWidths([1, 1], [5, 9], 10);
    const total = widths[0] + widths[1];
    assert.strictEqual(total, 10);
    assert.ok(widths[0] >= 1 && widths[0] <= 5);
    assert.ok(widths[1] >= 1 && widths[1] <= 9);
    // the column with more slack loses more
    assert.ok(widths[1] - 1 >= widths[0] - 0);
  });

  it("never shrinks below min-content", () => {
    const widths = computeColumnWidths([3, 4], [8, 9], 7);
    assert.deepEqual(widths, [3, 4]);
  });

  it("distributes rounding remainder to wider columns", () => {
    // deficit 3, shrinkable 9: proportional losses are 1/3 each (fractional)
    const widths = computeColumnWidths([1, 1, 1], [4, 4, 4], 9);
    assert.strictEqual(
      widths[0] + widths[1] + widths[2],
      9,
      "total equals available width",
    );
    for (const w of widths) {
      assert.ok(w >= 1 && w <= 4, `width ${w} within [min, max]`);
    }
  });

  it("handles zero available width", () => {
    const widths = computeColumnWidths([2, 2], [5, 5], 0);
    assert.deepEqual(widths, [2, 2]);
  });

  it("handles empty column list", () => {
    assert.deepEqual(computeColumnWidths([], [], 10), []);
  });

  it("handles single column", () => {
    assert.deepEqual(computeColumnWidths([3], [8], 5), [5]);
  });
});
