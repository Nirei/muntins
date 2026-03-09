import assert from "node:assert";
import { describe, it } from "node:test";
import {
  BLINK,
  BOLD,
  Buffer,
  type Cell,
  type Color,
  DEFAULT_CELL,
  DEFAULT_COLOR,
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

describe("Buffer class", () => {
  it("creates buffer with correct dimensions", () => {
    const buf = new Buffer(80, 24);
    assert.strictEqual(buf.width, 80);
    assert.strictEqual(buf.height, 24);
  });

  it("initializes cells to DEFAULT_CELL", () => {
    const buf = new Buffer(10, 10);
    const cell = buf.get(5, 5);
    assert.strictEqual(cell.symbol, " ");
    assert.deepStrictEqual(cell.fg, { type: "default" });
  });

  it("get returns DEFAULT_CELL for out-of-bounds", () => {
    const buf = new Buffer(10, 10);
    assert.strictEqual(buf.get(-1, 0).symbol, " ");
    assert.strictEqual(buf.get(100, 0).symbol, " ");
    assert.strictEqual(buf.get(0, -1).symbol, " ");
    assert.strictEqual(buf.get(0, 100).symbol, " ");
  });

  it("set writes cell at position", () => {
    const buf = new Buffer(10, 10);
    const cell: Cell = {
      symbol: "X",
      fg: { type: "named", index: 1 },
      bg: { type: "default" },
      modifiers: BOLD,
    };
    buf.set(3, 4, cell);

    const retrieved = buf.get(3, 4);
    assert.strictEqual(retrieved.symbol, "X");
    assert.deepStrictEqual(retrieved.fg, { type: "named", index: 1 });
    assert.strictEqual(retrieved.modifiers, BOLD);
  });

  it("set ignores out-of-bounds", () => {
    const buf = new Buffer(10, 10);
    buf.set(-1, 0, {
      symbol: "X",
      fg: DEFAULT_COLOR,
      bg: DEFAULT_COLOR,
      modifiers: 0,
    });
    buf.set(100, 0, {
      symbol: "X",
      fg: DEFAULT_COLOR,
      bg: DEFAULT_COLOR,
      modifiers: 0,
    });
    // Should not throw
  });

  it("clear resets all cells", () => {
    const buf = new Buffer(10, 10);
    buf.set(5, 5, {
      symbol: "X",
      fg: DEFAULT_COLOR,
      bg: DEFAULT_COLOR,
      modifiers: 0,
    });
    buf.clear();
    assert.strictEqual(buf.get(5, 5).symbol, " ");
  });

  it("resize grows buffer", () => {
    const buf = new Buffer(5, 5);
    buf.set(2, 2, {
      symbol: "X",
      fg: DEFAULT_COLOR,
      bg: DEFAULT_COLOR,
      modifiers: 0,
    });

    buf.resize(10, 10);

    assert.strictEqual(buf.width, 10);
    assert.strictEqual(buf.height, 10);
    assert.strictEqual(buf.get(2, 2).symbol, "X"); // preserved
    assert.strictEqual(buf.get(8, 8).symbol, " "); // new area
  });

  it("resize shrinks buffer", () => {
    const buf = new Buffer(10, 10);
    buf.set(2, 2, {
      symbol: "X",
      fg: DEFAULT_COLOR,
      bg: DEFAULT_COLOR,
      modifiers: 0,
    });
    buf.set(8, 8, {
      symbol: "Y",
      fg: DEFAULT_COLOR,
      bg: DEFAULT_COLOR,
      modifiers: 0,
    });

    buf.resize(5, 5);

    assert.strictEqual(buf.width, 5);
    assert.strictEqual(buf.height, 5);
    assert.strictEqual(buf.get(2, 2).symbol, "X"); // preserved
    // (8, 8) is now out of bounds
  });

  it("resize with same dimensions is no-op", () => {
    const buf = new Buffer(10, 10);
    buf.set(5, 5, {
      symbol: "X",
      fg: DEFAULT_COLOR,
      bg: DEFAULT_COLOR,
      modifiers: 0,
    });
    buf.resize(10, 10);
    assert.strictEqual(buf.get(5, 5).symbol, "X");
  });

  it("fillRect fills area", () => {
    const buf = new Buffer(10, 10);
    const cell: Cell = {
      symbol: "#",
      fg: { type: "named", index: 2 },
      bg: { type: "default" },
      modifiers: 0,
    };

    buf.fillRect(2, 2, 3, 3, cell);

    assert.strictEqual(buf.get(2, 2).symbol, "#");
    assert.strictEqual(buf.get(4, 4).symbol, "#");
    assert.strictEqual(buf.get(1, 1).symbol, " "); // outside
    assert.strictEqual(buf.get(5, 5).symbol, " "); // outside
  });

  it("fillRect clips to bounds", () => {
    const buf = new Buffer(10, 10);
    const cell: Cell = {
      symbol: "#",
      fg: DEFAULT_COLOR,
      bg: DEFAULT_COLOR,
      modifiers: 0,
    };

    buf.fillRect(-2, -2, 5, 5, cell);

    assert.strictEqual(buf.get(0, 0).symbol, "#");
    assert.strictEqual(buf.get(2, 2).symbol, "#");
    assert.strictEqual(buf.get(3, 3).symbol, " "); // outside rect
  });

  it("cells are independent objects", () => {
    const buf = new Buffer(10, 10);
    const cell: Cell = {
      symbol: "A",
      fg: DEFAULT_COLOR,
      bg: DEFAULT_COLOR,
      modifiers: 0,
    };

    buf.set(0, 0, cell);
    buf.set(1, 0, cell);

    // Modifying one shouldn't affect the other
    const retrieved = buf.get(0, 0);
    retrieved.symbol = "B";

    assert.strictEqual(buf.get(0, 0).symbol, "A");
    assert.strictEqual(buf.get(1, 0).symbol, "A");
  });

  it("fillRect entirely outside bounds is no-op", () => {
    const buf = new Buffer(10, 10);
    const cell: Cell = {
      symbol: "#",
      fg: DEFAULT_COLOR,
      bg: DEFAULT_COLOR,
      modifiers: 0,
    };

    // Completely outside buffer
    buf.fillRect(100, 100, 5, 5, cell);

    // All cells should still be default
    assert.strictEqual(buf.get(0, 0).symbol, " ");
  });
});

describe("dirty region tracking", () => {
  it("set expands dirty region", () => {
    const buf = new Buffer(10, 10);
    buf.clearDirtyRegion();

    assert.strictEqual(buf.hasDirtyRegion(), false);

    buf.set(5, 5, {
      symbol: "X",
      fg: DEFAULT_COLOR,
      bg: DEFAULT_COLOR,
      modifiers: 0,
    });

    assert.strictEqual(buf.hasDirtyRegion(), true);
    assert.strictEqual(buf.dirtyMinX, 5);
    assert.strictEqual(buf.dirtyMinY, 5);
    assert.strictEqual(buf.dirtyMaxX, 5);
    assert.strictEqual(buf.dirtyMaxY, 5);
  });

  it("multiple sets expand dirty region bounds", () => {
    const buf = new Buffer(10, 10);
    buf.clearDirtyRegion();

    buf.set(2, 3, {
      symbol: "A",
      fg: DEFAULT_COLOR,
      bg: DEFAULT_COLOR,
      modifiers: 0,
    });
    buf.set(7, 8, {
      symbol: "B",
      fg: DEFAULT_COLOR,
      bg: DEFAULT_COLOR,
      modifiers: 0,
    });

    assert.strictEqual(buf.dirtyMinX, 2);
    assert.strictEqual(buf.dirtyMinY, 3);
    assert.strictEqual(buf.dirtyMaxX, 7);
    assert.strictEqual(buf.dirtyMaxY, 8);
  });

  it("clear marks entire buffer dirty", () => {
    const buf = new Buffer(10, 10);
    buf.clearDirtyRegion();
    buf.clear();

    assert.strictEqual(buf.dirtyMinX, 0);
    assert.strictEqual(buf.dirtyMinY, 0);
    assert.strictEqual(buf.dirtyMaxX, 9);
    assert.strictEqual(buf.dirtyMaxY, 9);
  });

  it("fillRect marks filled region dirty", () => {
    const buf = new Buffer(10, 10);
    buf.clearDirtyRegion();

    buf.fillRect(2, 3, 4, 5, {
      symbol: "#",
      fg: DEFAULT_COLOR,
      bg: DEFAULT_COLOR,
      modifiers: 0,
    });

    assert.strictEqual(buf.dirtyMinX, 2);
    assert.strictEqual(buf.dirtyMinY, 3);
    assert.strictEqual(buf.dirtyMaxX, 5); // 2 + 4 - 1
    assert.strictEqual(buf.dirtyMaxY, 7); // 3 + 5 - 1
  });

  it("clearDirtyRegion resets to empty", () => {
    const buf = new Buffer(10, 10);
    buf.set(5, 5, {
      symbol: "X",
      fg: DEFAULT_COLOR,
      bg: DEFAULT_COLOR,
      modifiers: 0,
    });

    assert.strictEqual(buf.hasDirtyRegion(), true);

    buf.clearDirtyRegion();

    assert.strictEqual(buf.hasDirtyRegion(), false);
  });

  it("resize marks entire buffer dirty", () => {
    const buf = new Buffer(5, 5);
    buf.clearDirtyRegion();

    buf.resize(10, 10);

    assert.strictEqual(buf.dirtyMinX, 0);
    assert.strictEqual(buf.dirtyMinY, 0);
    assert.strictEqual(buf.dirtyMaxX, 9);
    assert.strictEqual(buf.dirtyMaxY, 9);
  });

  it("out-of-bounds set does not expand dirty region", () => {
    const buf = new Buffer(10, 10);
    buf.clearDirtyRegion();

    buf.set(-1, -1, {
      symbol: "X",
      fg: DEFAULT_COLOR,
      bg: DEFAULT_COLOR,
      modifiers: 0,
    });
    buf.set(100, 100, {
      symbol: "X",
      fg: DEFAULT_COLOR,
      bg: DEFAULT_COLOR,
      modifiers: 0,
    });

    assert.strictEqual(buf.hasDirtyRegion(), false);
  });
});
