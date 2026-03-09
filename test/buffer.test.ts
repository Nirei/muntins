import assert from "node:assert";
import { describe, it } from "node:test";
import {
  BLINK,
  BOLD,
  type Cell,
  type Color,
  DEFAULT_CELL,
  DIM,
  HIDDEN,
  INVERSE,
  ITALIC,
  STRIKETHROUGH,
  UNDERLINE,
  cellsEqual,
  colorsEqual,
  createCell,
} from "../src/core/buffer.ts";

describe("buffer core types", () => {
  it("style modifiers are distinct powers of 2", () => {
    const mods = [
      BOLD,
      DIM,
      ITALIC,
      UNDERLINE,
      BLINK,
      INVERSE,
      HIDDEN,
      STRIKETHROUGH,
    ];
    for (let i = 0; i < mods.length; i++) {
      for (let j = i + 1; j < mods.length; j++) {
        assert.strictEqual(mods[i] & mods[j], 0);
      }
    }
  });

  it("modifiers can be combined with bitwise OR", () => {
    const combined = BOLD | ITALIC | UNDERLINE;
    assert.ok(combined & BOLD);
    assert.ok(combined & ITALIC);
    assert.ok(combined & UNDERLINE);
    assert.ok(!(combined & DIM));
  });

  it("DEFAULT_CELL has expected values", () => {
    assert.strictEqual(DEFAULT_CELL.symbol, " ");
    assert.deepStrictEqual(DEFAULT_CELL.fg, { type: "default" });
    assert.deepStrictEqual(DEFAULT_CELL.bg, { type: "default" });
    assert.strictEqual(DEFAULT_CELL.modifiers, 0);
  });

  it("colorsEqual compares default colors", () => {
    assert.ok(colorsEqual({ type: "default" }, { type: "default" }));
  });

  it("colorsEqual compares named colors", () => {
    assert.ok(
      colorsEqual({ type: "named", index: 1 }, { type: "named", index: 1 }),
    );
    assert.ok(
      !colorsEqual({ type: "named", index: 1 }, { type: "named", index: 2 }),
    );
  });

  it("colorsEqual compares rgb colors", () => {
    assert.ok(
      colorsEqual(
        { type: "rgb", r: 255, g: 0, b: 0 },
        { type: "rgb", r: 255, g: 0, b: 0 },
      ),
    );
    assert.ok(
      !colorsEqual(
        { type: "rgb", r: 255, g: 0, b: 0 },
        { type: "rgb", r: 0, g: 255, b: 0 },
      ),
    );
  });

  it("colorsEqual returns false for different types", () => {
    assert.ok(!colorsEqual({ type: "default" }, { type: "named", index: 0 }));
  });

  it("colorsEqual compares bright colors", () => {
    assert.ok(
      colorsEqual({ type: "bright", index: 1 }, { type: "bright", index: 1 }),
    );
    assert.ok(
      !colorsEqual({ type: "bright", index: 1 }, { type: "bright", index: 2 }),
    );
  });

  it("colorsEqual compares palette colors", () => {
    assert.ok(
      colorsEqual(
        { type: "palette", index: 100 },
        { type: "palette", index: 100 },
      ),
    );
    assert.ok(
      !colorsEqual(
        { type: "palette", index: 100 },
        { type: "palette", index: 200 },
      ),
    );
  });

  it("colorsEqual returns true for identical colors of each type", () => {
    const colors: Color[] = [
      { type: "default" },
      { type: "named", index: 0 },
      { type: "bright", index: 0 },
      { type: "palette", index: 0 },
      { type: "rgb", r: 0, g: 0, b: 0 },
    ];

    for (const c of colors) {
      assert.ok(colorsEqual(c, c));
    }
  });

  it("cellsEqual compares all fields", () => {
    const a: Cell = {
      symbol: "x",
      fg: { type: "default" },
      bg: { type: "default" },
      modifiers: BOLD,
    };
    const b: Cell = {
      symbol: "x",
      fg: { type: "default" },
      bg: { type: "default" },
      modifiers: BOLD,
    };
    const c: Cell = {
      symbol: "y",
      fg: { type: "default" },
      bg: { type: "default" },
      modifiers: BOLD,
    };

    assert.ok(cellsEqual(a, b));
    assert.ok(!cellsEqual(a, c));
  });

  it("createCell returns cell with defaults", () => {
    const cell = createCell();
    assert.strictEqual(cell.symbol, " ");
    assert.deepStrictEqual(cell.fg, { type: "default" });
    assert.deepStrictEqual(cell.bg, { type: "default" });
    assert.strictEqual(cell.modifiers, 0);
  });

  it("createCell applies overrides", () => {
    const cell = createCell({
      symbol: "A",
      fg: { type: "named", index: 1 },
      modifiers: BOLD | UNDERLINE,
    });
    assert.strictEqual(cell.symbol, "A");
    assert.deepStrictEqual(cell.fg, { type: "named", index: 1 });
    assert.deepStrictEqual(cell.bg, { type: "default" });
    assert.strictEqual(cell.modifiers, BOLD | UNDERLINE);
  });
});
