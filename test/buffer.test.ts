import assert from "node:assert";
import { describe, it } from "node:test";
import {
  BLINK,
  BOLD,
  Buffer,
  type Color,
  DEFAULT_COLOR,
  DIM,
  HIDDEN,
  INVERSE,
  ITALIC,
  STRIKETHROUGH,
  UNDERLINE,
  displayWidth,
  graphemeDisplayWidth,
  graphemes,
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
});

describe("displayWidth", () => {
  it("ASCII characters are width 1", () => {
    assert.strictEqual(displayWidth("a"), 1);
    assert.strictEqual(displayWidth("Z"), 1);
    assert.strictEqual(displayWidth("5"), 1);
    assert.strictEqual(displayWidth("@"), 1);
  });

  it("CJK characters are width 2", () => {
    assert.strictEqual(displayWidth("中"), 2);
    assert.strictEqual(displayWidth("日"), 2);
    assert.strictEqual(displayWidth("한"), 2);
  });

  it("fullwidth ASCII are width 2", () => {
    assert.strictEqual(displayWidth("Ａ"), 2); // U+FF21
    assert.strictEqual(displayWidth("１"), 2); // U+FF11
  });

  it("control characters are width 0", () => {
    assert.strictEqual(displayWidth("\x00"), 0);
    assert.strictEqual(displayWidth("\x1b"), 0);
    assert.strictEqual(displayWidth("\x7f"), 0);
  });

  it("combining marks are width 0", () => {
    assert.strictEqual(displayWidth("\u0301"), 0); // Combining acute
  });

  it("empty string is width 0", () => {
    assert.strictEqual(displayWidth(""), 0);
  });
});

describe("graphemeDisplayWidth", () => {
  it("single codepoint delegates to displayWidth", () => {
    assert.strictEqual(graphemeDisplayWidth("a"), 1);
    assert.strictEqual(graphemeDisplayWidth("中"), 2);
  });

  it("base + combining diacritical = width 1", () => {
    const combined = "e\u0301"; // e + combining acute
    assert.strictEqual(graphemeDisplayWidth(combined), 1);
  });

  it("emoji with variation selector = width 2", () => {
    const heart = "\u2764\uFE0F"; // heart
    assert.strictEqual(graphemeDisplayWidth(heart), 2);
  });

  it("emoji with skin tone = width 2", () => {
    assert.strictEqual(graphemeDisplayWidth("👋🏽"), 2);
  });

  it("flag emoji = width 2", () => {
    assert.strictEqual(graphemeDisplayWidth("🇯🇵"), 2);
    assert.strictEqual(graphemeDisplayWidth("🇺🇸"), 2);
  });

  it("empty string is width 0", () => {
    assert.strictEqual(graphemeDisplayWidth(""), 0);
  });

  it("ZWJ emoji sequences = width 2", () => {
    // Family emoji (multiple people joined with ZWJ)
    assert.strictEqual(graphemeDisplayWidth("👨‍👩‍👧"), 2);
    // Person with profession
    assert.strictEqual(graphemeDisplayWidth("👩‍🔬"), 2);
  });

  it("keycap sequences = width 1", () => {
    // Digit + variation selector + combining enclosing keycap
    const keycap1 = "1\uFE0F\u20E3";
    assert.strictEqual(graphemeDisplayWidth(keycap1), 1);
    // Hash keycap
    const hashKeycap = "#\uFE0F\u20E3";
    assert.strictEqual(graphemeDisplayWidth(hashKeycap), 1);
  });
});

describe("graphemes", () => {
  it("segments ASCII string", () => {
    const segs = [...graphemes("abc")];
    assert.deepStrictEqual(segs, ["a", "b", "c"]);
  });

  it("segments emoji with skin tone as single grapheme", () => {
    const segs = [...graphemes("👋🏽")];
    assert.strictEqual(segs.length, 1);
    assert.strictEqual(segs[0], "👋🏽");
  });

  it("segments flag emoji as single grapheme", () => {
    const segs = [...graphemes("🇯🇵")];
    assert.strictEqual(segs.length, 1);
  });

  it("segments mixed content correctly", () => {
    const segs = [...graphemes("a中🇺🇸")];
    assert.strictEqual(segs.length, 3);
    assert.strictEqual(segs[0], "a");
    assert.strictEqual(segs[1], "中");
    assert.strictEqual(segs[2], "🇺🇸");
  });

  it("handles combining marks", () => {
    const segs = [...graphemes("e\u0301")]; // e with combining acute
    assert.strictEqual(segs.length, 1);
  });
});

describe("Buffer class", () => {
  describe("dimensions and initialization", () => {
    it("creates buffer with correct dimensions", () => {
      const buf = new Buffer(80, 24);
      assert.strictEqual(buf.width, 80);
      assert.strictEqual(buf.height, 24);
    });

    it("initializes all cells to space with default colors", () => {
      const buf = new Buffer(10, 10);
      assert.strictEqual(buf.getSymbol(5, 5), " ");
      assert.deepStrictEqual(buf.getFg(5, 5), { type: "default" });
      assert.deepStrictEqual(buf.getBg(5, 5), { type: "default" });
      assert.strictEqual(buf.getModifiers(5, 5), 0);
    });
  });

  describe("set operations", () => {
    it("set() writes symbol and style to cell", () => {
      const buf = new Buffer(10, 10);
      buf.set(3, 4, "X", { type: "named", index: 1 }, DEFAULT_COLOR, BOLD);

      assert.strictEqual(buf.getSymbol(3, 4), "X");
      assert.deepStrictEqual(buf.getFg(3, 4), { type: "named", index: 1 });
      assert.strictEqual(buf.getModifiers(3, 4), BOLD);
    });

    it("set() out-of-bounds is silent no-op", () => {
      const buf = new Buffer(10, 10);
      buf.set(-1, 0, "X", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      buf.set(100, 0, "X", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      // Should not throw
    });

    it("clear() resets all cells to default", () => {
      const buf = new Buffer(10, 10);
      buf.set(5, 5, "X", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      buf.clear();
      assert.strictEqual(buf.getSymbol(5, 5), " ");
    });

    it("fillRect() fills region with given style", () => {
      const buf = new Buffer(10, 10);
      buf.fillRect(
        2,
        2,
        3,
        3,
        "#",
        { type: "named", index: 2 },
        DEFAULT_COLOR,
        0,
      );

      assert.strictEqual(buf.getSymbol(2, 2), "#");
      assert.strictEqual(buf.getSymbol(4, 4), "#");
      assert.strictEqual(buf.getSymbol(1, 1), " "); // outside
      assert.strictEqual(buf.getSymbol(5, 5), " "); // outside
    });

    it("fillRect() clips to buffer bounds", () => {
      const buf = new Buffer(10, 10);
      buf.fillRect(-2, -2, 5, 5, "#", DEFAULT_COLOR, DEFAULT_COLOR, 0);

      assert.strictEqual(buf.getSymbol(0, 0), "#");
      assert.strictEqual(buf.getSymbol(2, 2), "#");
      assert.strictEqual(buf.getSymbol(3, 3), " "); // outside rect
    });

    it("fillRect() entirely outside bounds is no-op", () => {
      const buf = new Buffer(10, 10);
      buf.fillRect(100, 100, 5, 5, "#", DEFAULT_COLOR, DEFAULT_COLOR, 0);

      // All cells should still be default
      assert.strictEqual(buf.getSymbol(0, 0), " ");
    });
  });

  describe("writeText", () => {
    it("writes string characters sequentially", () => {
      const buf = new Buffer(20, 10);
      buf.writeText(0, 0, "hello", DEFAULT_COLOR, DEFAULT_COLOR, 0);

      assert.strictEqual(buf.getSymbol(0, 0), "h");
      assert.strictEqual(buf.getSymbol(1, 0), "e");
      assert.strictEqual(buf.getSymbol(2, 0), "l");
      assert.strictEqual(buf.getSymbol(3, 0), "l");
      assert.strictEqual(buf.getSymbol(4, 0), "o");
    });

    it("handles double-width characters with continuation cells", () => {
      const buf = new Buffer(20, 10);
      buf.writeText(0, 0, "中", DEFAULT_COLOR, DEFAULT_COLOR, 0);

      assert.strictEqual(buf.getSymbol(0, 0), "中");
      assert.strictEqual(buf.getSymbol(1, 0), ""); // continuation
    });

    it("advances position by display width", () => {
      const buf = new Buffer(20, 10);
      const cols = buf.writeText(0, 0, "中a", DEFAULT_COLOR, DEFAULT_COLOR, 0);

      assert.strictEqual(cols, 3); // 2 for 中 + 1 for a
      assert.strictEqual(buf.getSymbol(2, 0), "a");
    });

    it("applies style to all characters", () => {
      const buf = new Buffer(20, 10);
      const fg: Color = { type: "named", index: 1 };
      buf.writeText(0, 0, "ab", fg, DEFAULT_COLOR, BOLD);

      assert.deepStrictEqual(buf.getFg(0, 0), fg);
      assert.deepStrictEqual(buf.getFg(1, 0), fg);
      assert.strictEqual(buf.getModifiers(0, 0), BOLD);
      assert.strictEqual(buf.getModifiers(1, 0), BOLD);
    });

    it("stops at buffer edge", () => {
      const buf = new Buffer(5, 10);
      const cols = buf.writeText(
        0,
        0,
        "abcdefgh",
        DEFAULT_COLOR,
        DEFAULT_COLOR,
        0,
      );

      assert.strictEqual(cols, 5);
      assert.strictEqual(buf.getSymbol(4, 0), "e");
    });

    it("skips double-width char that would overflow", () => {
      const buf = new Buffer(4, 10);
      buf.writeText(0, 0, "ab中", DEFAULT_COLOR, DEFAULT_COLOR, 0); // 中 needs 2 cols, only 1 left

      // ab takes 2 cols (0, 1), only 2 remain (2, 3), but 中 needs positions 2 AND 3 (width=2)
      // Wait, that fits. Let me use a smaller buffer.
      // Actually 中 at col 2 uses cols 2,3 which is fine for width 4.
      // Let's try: ab takes cols 0,1, leaving 2,3. 中 uses 2,3. That fits!
      // To test overflow, use buffer width 3: ab uses 0,1, only col 2 left, 中 needs 2 cols.
      const buf2 = new Buffer(3, 10);
      buf2.writeText(0, 0, "a中", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      // a at col 0, 中 needs cols 1,2 which fits (width 3, valid cols 0,1,2)

      // Use width 2 buffer: a at col 0, 中 needs cols 1,2 but col 2 doesn't exist
      const buf3 = new Buffer(2, 10);
      buf3.writeText(0, 0, "a中", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      assert.strictEqual(buf3.getSymbol(0, 0), "a");
      assert.strictEqual(buf3.getSymbol(1, 0), " "); // 中 didn't fit, position still space
    });

    it("returns number of columns consumed", () => {
      const buf = new Buffer(20, 10);
      const cols = buf.writeText(
        5,
        0,
        "hello",
        DEFAULT_COLOR,
        DEFAULT_COLOR,
        0,
      );
      assert.strictEqual(cols, 5);
    });

    it("out-of-bounds y is silent no-op returning 0", () => {
      const buf = new Buffer(20, 10);
      const cols = buf.writeText(
        0,
        100,
        "hello",
        DEFAULT_COLOR,
        DEFAULT_COLOR,
        0,
      );
      assert.strictEqual(cols, 0);
    });

    it("out-of-bounds x (>= width) is silent no-op returning 0", () => {
      const buf = new Buffer(20, 10);
      const cols = buf.writeText(
        20,
        0,
        "hello",
        DEFAULT_COLOR,
        DEFAULT_COLOR,
        0,
      );
      assert.strictEqual(cols, 0);
    });

    it("negative x clamps to 0", () => {
      const buf = new Buffer(20, 10);
      const cols = buf.writeText(
        -2,
        0,
        "hello",
        DEFAULT_COLOR,
        DEFAULT_COLOR,
        0,
      );
      // Should write starting at col 0
      assert.strictEqual(buf.getSymbol(0, 0), "h");
      assert.strictEqual(cols, 5);
    });
  });

  describe("set() with wide characters", () => {
    it("set() creates continuation cell for wide character", () => {
      const buf = new Buffer(20, 10);
      buf.set(0, 0, "中", DEFAULT_COLOR, DEFAULT_COLOR, 0);

      assert.strictEqual(buf.getSymbol(0, 0), "中");
      assert.strictEqual(buf.getSymbol(1, 0), "");
    });

    it("set() propagates style to continuation cell", () => {
      const buf = new Buffer(20, 10);
      const fg: Color = { type: "named", index: 1 };
      buf.set(0, 0, "中", fg, DEFAULT_COLOR, BOLD);

      assert.deepStrictEqual(buf.getFg(1, 0), fg);
      assert.strictEqual(buf.getModifiers(1, 0), BOLD);
    });

    it("set() wide char at buffer edge does not overflow", () => {
      const buf = new Buffer(5, 5);
      buf.set(4, 0, "中", DEFAULT_COLOR, DEFAULT_COLOR, 0);

      assert.strictEqual(buf.getSymbol(4, 0), "中");
      assert.strictEqual(buf.getSymbol(5, 0), " ");
    });

    it("mixed writeText then set with wide chars produces correct output", () => {
      const buf = new Buffer(20, 10);
      buf.flush();

      buf.writeText(0, 0, "中", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      buf.flush();

      buf.set(0, 0, "日", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      const output = buf.flush();

      assert.ok(output.includes("日"));
      assert.strictEqual(buf.getSymbol(0, 0), "日");
      assert.strictEqual(buf.getSymbol(1, 0), "");
    });

    it("set() wide char overwriting another wide char cleans up old continuation", () => {
      const buf = new Buffer(20, 10);
      buf.writeText(0, 0, "中", DEFAULT_COLOR, DEFAULT_COLOR, 0);

      buf.set(0, 0, "日", DEFAULT_COLOR, DEFAULT_COLOR, 0);

      assert.strictEqual(buf.getSymbol(0, 0), "日");
      assert.strictEqual(buf.getSymbol(1, 0), "");
      assert.strictEqual(buf.getSymbol(2, 0), " ");
    });
  });

  describe("double-width overwrite handling", () => {
    it("overwriting first column of wide char clears continuation cell", () => {
      const buf = new Buffer(20, 10);
      buf.writeText(0, 0, "中", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      // Now overwrite col 0
      buf.set(0, 0, "X", DEFAULT_COLOR, DEFAULT_COLOR, 0);

      assert.strictEqual(buf.getSymbol(0, 0), "X");
      assert.strictEqual(buf.getSymbol(1, 0), " "); // Continuation cleared
    });

    it("overwriting continuation cell clears base character", () => {
      const buf = new Buffer(20, 10);
      buf.writeText(0, 0, "中", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      // Now overwrite col 1 (the continuation)
      buf.set(1, 0, "X", DEFAULT_COLOR, DEFAULT_COLOR, 0);

      assert.strictEqual(buf.getSymbol(0, 0), " "); // Base cleared
      assert.strictEqual(buf.getSymbol(1, 0), "X");
    });

    it("overwriting with another wide char clears old continuation", () => {
      const buf = new Buffer(20, 10);
      buf.writeText(0, 0, "中", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      buf.writeText(0, 0, "日", DEFAULT_COLOR, DEFAULT_COLOR, 0);

      assert.strictEqual(buf.getSymbol(0, 0), "日");
      assert.strictEqual(buf.getSymbol(1, 0), ""); // New continuation
    });

    it("overwriting base of wide char resets orphaned continuation style", () => {
      const buf = new Buffer(20, 10);
      const wideBg: Color = { type: "named", index: 1 };
      const wideFg: Color = { type: "named", index: 2 };
      buf.writeText(0, 0, "中", wideFg, wideBg, BOLD);

      buf.set(0, 0, "X", DEFAULT_COLOR, DEFAULT_COLOR, 0);

      assert.strictEqual(buf.getSymbol(1, 0), " ");
      assert.deepStrictEqual(buf.getFg(1, 0), DEFAULT_COLOR);
      assert.deepStrictEqual(buf.getBg(1, 0), DEFAULT_COLOR);
      assert.strictEqual(buf.getModifiers(1, 0), 0);
    });

    it("overwriting continuation of wide char resets orphaned base style", () => {
      const buf = new Buffer(20, 10);
      const wideBg: Color = { type: "named", index: 1 };
      const wideFg: Color = { type: "named", index: 2 };
      buf.writeText(0, 0, "中", wideFg, wideBg, BOLD);

      buf.set(1, 0, "X", DEFAULT_COLOR, DEFAULT_COLOR, 0);

      assert.strictEqual(buf.getSymbol(0, 0), " ");
      assert.deepStrictEqual(buf.getFg(0, 0), DEFAULT_COLOR);
      assert.deepStrictEqual(buf.getBg(0, 0), DEFAULT_COLOR);
      assert.strictEqual(buf.getModifiers(0, 0), 0);
    });

    it("orphaned wide char cell does not emit stale style in flush output", () => {
      const buf = new Buffer(20, 10);
      buf.flush();

      const redBg: Color = { type: "named", index: 1 };
      buf.writeText(0, 0, "中", DEFAULT_COLOR, redBg, 0);
      buf.flush();

      buf.set(0, 0, "X", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      const output = buf.flush();

      // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences
      const redBgMatches = output.match(/\x1b\[41m|\[41m|;41m/g) || [];
      assert.strictEqual(
        redBgMatches.length,
        0,
        "orphaned cell should not retain red background",
      );
    });
  });

  describe("read operations", () => {
    it("getSymbol() returns cell symbol", () => {
      const buf = new Buffer(10, 10);
      buf.set(5, 5, "X", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      assert.strictEqual(buf.getSymbol(5, 5), "X");
    });

    it("getFg() returns cell foreground color as Color object", () => {
      const buf = new Buffer(10, 10);
      const fg: Color = { type: "rgb", r: 255, g: 128, b: 64 };
      buf.set(5, 5, "X", fg, DEFAULT_COLOR, 0);
      assert.deepStrictEqual(buf.getFg(5, 5), fg);
    });

    it("getBg() returns cell background color as Color object", () => {
      const buf = new Buffer(10, 10);
      const bg: Color = { type: "palette", index: 200 };
      buf.set(5, 5, "X", DEFAULT_COLOR, bg, 0);
      assert.deepStrictEqual(buf.getBg(5, 5), bg);
    });

    it("getModifiers() returns cell modifiers", () => {
      const buf = new Buffer(10, 10);
      buf.set(5, 5, "X", DEFAULT_COLOR, DEFAULT_COLOR, BOLD | ITALIC);
      assert.strictEqual(buf.getModifiers(5, 5), BOLD | ITALIC);
    });

    it("getters out-of-bounds return defaults", () => {
      const buf = new Buffer(10, 10);
      assert.strictEqual(buf.getSymbol(-1, 0), " ");
      assert.strictEqual(buf.getSymbol(100, 0), " ");
      assert.deepStrictEqual(buf.getFg(-1, 0), DEFAULT_COLOR);
      assert.deepStrictEqual(buf.getBg(-1, 0), DEFAULT_COLOR);
      assert.strictEqual(buf.getModifiers(-1, 0), 0);
    });
  });

  describe("flush and double-buffering", () => {
    it("flush() returns empty string when nothing changed", () => {
      const buf = new Buffer(10, 10);
      buf.flush(); // First flush syncs initial state
      const output = buf.flush(); // Second flush with no changes
      assert.strictEqual(output, "");
    });

    it("flush() returns ANSI for changed cells", () => {
      const buf = new Buffer(10, 10);
      buf.flush(); // Sync initial state
      // Set at non-zero position to require cursor movement ANSI
      buf.set(5, 5, "X", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      const output = buf.flush();

      assert.ok(output.includes("X"));
      assert.ok(output.includes("\x1b[")); // Contains ANSI for cursor positioning
    });

    it("flush() syncs buffers - second flush with no changes returns empty", () => {
      const buf = new Buffer(10, 10);
      buf.flush();
      buf.set(0, 0, "X", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      buf.flush();
      const output = buf.flush();
      assert.strictEqual(output, "");
    });

    it("sequential cells skip cursor positioning", () => {
      const buf = new Buffer(10, 10);
      buf.flush();
      // Write at non-zero position to require cursor positioning for first char
      buf.writeText(5, 5, "AB", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      const output = buf.flush();

      // Should only have one cursor positioning for the start
      // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences
      const cursorMatches = output.match(/\x1b\[\d+;\d+H/g) || [];
      assert.strictEqual(cursorMatches.length, 1);
    });

    it("gaps in row emit cursor positioning", () => {
      const buf = new Buffer(10, 10);
      buf.flush();
      // First char at (2,0) needs positioning, second at (5,0) also needs positioning due to gap
      buf.set(2, 0, "A", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      buf.set(5, 0, "B", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      const output = buf.flush();

      // Should have cursor positioning for both (initial + gap)
      // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences
      const cursorMatches = output.match(/\x1b\[\d+;\d+H/g) || [];
      assert.strictEqual(cursorMatches.length, 2);
    });

    it("continuation cells are skipped in output", () => {
      const buf = new Buffer(10, 10);
      buf.flush();
      buf.writeText(0, 0, "中", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      const output = buf.flush();

      // Should contain the character, not the empty continuation
      assert.ok(output.includes("中"));
      // Empty string should not be explicitly output
    });

    it("double-width character advances cursor by 2", () => {
      const buf = new Buffer(10, 10);
      buf.flush();
      // Start at non-zero position to force initial cursor positioning
      buf.writeText(3, 3, "中a", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      const output = buf.flush();

      // After 中 (width 2), cursor is at col 5, so 'a' at col 5 needs no repositioning
      // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences
      const cursorMatches = output.match(/\x1b\[\d+;\d+H/g) || [];
      assert.strictEqual(cursorMatches.length, 1); // Only initial positioning
    });
  });

  describe("style tracking across frames", () => {
    it("persists foreground color across flush calls", () => {
      const buf = new Buffer(10, 10);
      buf.flush();

      // First cell with red foreground
      buf.set(0, 0, "A", { type: "named", index: 1 }, DEFAULT_COLOR, 0);
      const output1 = buf.flush();
      assert.ok(output1.includes("31")); // Red foreground

      // Second cell with same color - should not re-emit
      buf.set(1, 0, "B", { type: "named", index: 1 }, DEFAULT_COLOR, 0);
      const output2 = buf.flush();
      // Should not contain another color code for red
      assert.ok(!output2.includes(";31m") && !output2.includes("[31m"));
    });

    it("removing modifier emits SGR 0 then reapplies remaining", () => {
      const buf = new Buffer(10, 10);
      buf.flush();

      buf.set(0, 0, "A", DEFAULT_COLOR, DEFAULT_COLOR, BOLD | ITALIC);
      buf.flush();

      // Remove BOLD, keep ITALIC
      buf.set(1, 0, "B", DEFAULT_COLOR, DEFAULT_COLOR, ITALIC);
      const output = buf.flush();

      // Should contain SGR 0 (reset) followed by 3 (italic)
      assert.ok(output.includes("\x1b[0;3m") || output.includes("0;3"));
    });

    it("adding modifier emits only the new modifier code", () => {
      const buf = new Buffer(10, 10);
      buf.flush();

      buf.set(0, 0, "A", DEFAULT_COLOR, DEFAULT_COLOR, BOLD);
      buf.flush();

      // Add ITALIC
      buf.set(1, 0, "B", DEFAULT_COLOR, DEFAULT_COLOR, BOLD | ITALIC);
      const output = buf.flush();

      // Should only emit 3 (italic), not 1 (bold) again
      assert.ok(output.includes("3m") || output.includes(";3m"));
      // And should NOT re-emit 1 for bold
      const boldMatches = output.match(/\[1m|\[1;|;1m|;1;/g) || [];
      assert.strictEqual(boldMatches.length, 0);
    });
  });

  describe("forceFullRedraw", () => {
    it("resets front buffer to defaults", () => {
      const buf = new Buffer(10, 10);
      buf.set(0, 0, "X", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      buf.flush();

      // Now force full redraw
      buf.forceFullRedraw();
      const output = buf.flush();

      // Should re-emit X since front was reset
      assert.ok(output.includes("X"));
    });

    it("next flush emits all non-default cells", () => {
      const buf = new Buffer(10, 10);
      buf.set(5, 5, "Y", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      buf.flush();

      buf.forceFullRedraw();
      const output = buf.flush();

      assert.ok(output.includes("Y"));
    });
  });

  describe("resize", () => {
    it("resize changes dimensions", () => {
      const buf = new Buffer(5, 5);
      buf.resize(10, 10);

      assert.strictEqual(buf.width, 10);
      assert.strictEqual(buf.height, 10);
    });

    it("resize reinitializes all cells", () => {
      const buf = new Buffer(5, 5);
      buf.set(2, 2, "X", DEFAULT_COLOR, DEFAULT_COLOR, 0);

      buf.resize(10, 10);

      // Content is NOT preserved in new design
      assert.strictEqual(buf.getSymbol(2, 2), " ");
    });

    it("resize with same dimensions is no-op", () => {
      const buf = new Buffer(10, 10);
      buf.set(5, 5, "X", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      buf.resize(10, 10);
      assert.strictEqual(buf.getSymbol(5, 5), "X");
    });

    it("resize forces full redraw on next flush", () => {
      const buf = new Buffer(5, 5);

      // Write content and sync front buffer
      buf.set(0, 0, "A", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      buf.flush();

      // Resize — terminal still has old content but buffer is fresh
      buf.resize(5, 3);

      // Write only to cell (0,0), leaving (1,0) as a space
      buf.set(0, 0, "B", DEFAULT_COLOR, DEFAULT_COLOR, 0);
      const output = buf.flush();

      // Both "B" and the blank space at (1,0) must be output to
      // overwrite whatever the terminal had before the resize.
      assert.ok(output.includes("B"), "should output the painted cell");
      // Count total cells emitted: all 5*3=15 cells should be output
      // since front was invalidated. Check that spaces are emitted too.
      assert.ok(
        output.includes(" "),
        "should output spaces to clear stale terminal content",
      );
    });
  });
});

describe("ANSI output correctness", () => {
  it("cursor positioning is 1-indexed", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    // Set at position (2, 3) to force cursor positioning
    buf.set(2, 3, "X", DEFAULT_COLOR, DEFAULT_COLOR, 0);
    const output = buf.flush();

    // Position (2,3) should be \x1b[4;3H (row 4, col 3 - 1-indexed)
    assert.ok(output.includes("\x1b[4;3H"));
  });

  it("named foreground colors emit 30-37", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(0, 0, "X", { type: "named", index: 1 }, DEFAULT_COLOR, 0); // Red
    const output = buf.flush();

    assert.ok(output.includes("31")); // 30 + 1
  });

  it("named background colors emit 40-47", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(0, 0, "X", DEFAULT_COLOR, { type: "named", index: 2 }, 0); // Green bg
    const output = buf.flush();

    assert.ok(output.includes("42")); // 40 + 2
  });

  it("bright foreground colors emit 90-97", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(0, 0, "X", { type: "bright", index: 1 }, DEFAULT_COLOR, 0);
    const output = buf.flush();

    assert.ok(output.includes("91")); // 90 + 1
  });

  it("bright background colors emit 100-107", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(0, 0, "X", DEFAULT_COLOR, { type: "bright", index: 1 }, 0);
    const output = buf.flush();

    assert.ok(output.includes("101")); // 100 + 1
  });

  it("palette colors emit 38;5;N / 48;5;N", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(0, 0, "X", { type: "palette", index: 200 }, DEFAULT_COLOR, 0);
    const output = buf.flush();

    assert.ok(output.includes("38;5;200"));
  });

  it("RGB colors emit 38;2;R;G;B / 48;2;R;G;B", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(
      0,
      0,
      "X",
      { type: "rgb", r: 255, g: 128, b: 64 },
      DEFAULT_COLOR,
      0,
    );
    const output = buf.flush();

    assert.ok(output.includes("38;2;255;128;64"));
  });

  it("default colors emit 39 / 49", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    // Set a non-default color first
    buf.set(0, 0, "X", { type: "named", index: 1 }, DEFAULT_COLOR, 0);
    buf.flush();

    // Now reset to default
    buf.set(1, 0, "Y", DEFAULT_COLOR, DEFAULT_COLOR, 0);
    const output = buf.flush();

    assert.ok(output.includes("39")); // Default fg
  });

  it("modifiers emit correct SGR codes (1-9)", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(0, 0, "X", DEFAULT_COLOR, DEFAULT_COLOR, BOLD);
    const output = buf.flush();

    assert.ok(output.includes("1m") || output.includes("[1m"));
  });

  it("multiple modifiers combined in single SGR sequence", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(0, 0, "X", DEFAULT_COLOR, DEFAULT_COLOR, BOLD | ITALIC);
    const output = buf.flush();

    // Should contain both 1 and 3 in a single sequence
    assert.ok(output.includes("1;3m") || output.includes("1;3;"));
  });
});

describe("edge cases", () => {
  it("empty buffer (0x0) handles flush gracefully", () => {
    const buf = new Buffer(0, 0);
    assert.strictEqual(buf.width, 0);
    assert.strictEqual(buf.height, 0);
    const output = buf.flush();
    assert.strictEqual(output, "");
  });

  it("1x1 buffer works correctly", () => {
    const buf = new Buffer(1, 1);
    buf.set(0, 0, "X", DEFAULT_COLOR, DEFAULT_COLOR, 0);
    assert.strictEqual(buf.getSymbol(0, 0), "X");
    const output = buf.flush();
    assert.ok(output.includes("X"));
  });

  it("control characters (< 32) are handled", () => {
    const buf = new Buffer(10, 10);
    buf.set(0, 0, "\x00", DEFAULT_COLOR, DEFAULT_COLOR, 0);
    assert.strictEqual(buf.getSymbol(0, 0), "\x00");
  });
});

describe("Color types and serialization", () => {
  it("named color index 0 (black) emits SGR 30", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(0, 0, "X", { type: "named", index: 0 }, DEFAULT_COLOR, 0);
    const output = buf.flush();
    assert.ok(output.includes("30"));
  });

  it("named color index 7 (white) emits SGR 37", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(0, 0, "X", { type: "named", index: 7 }, DEFAULT_COLOR, 0);
    const output = buf.flush();
    assert.ok(output.includes("37"));
  });

  it("bright color index 0 emits SGR 90", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(0, 0, "X", { type: "bright", index: 0 }, DEFAULT_COLOR, 0);
    const output = buf.flush();
    assert.ok(output.includes("90"));
  });

  it("bright color index 7 emits SGR 97", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(0, 0, "X", { type: "bright", index: 7 }, DEFAULT_COLOR, 0);
    const output = buf.flush();
    assert.ok(output.includes("97"));
  });

  it("bright background index 0 emits SGR 100", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(0, 0, "X", DEFAULT_COLOR, { type: "bright", index: 0 }, 0);
    const output = buf.flush();
    assert.ok(output.includes("100"));
  });

  it("bright background index 7 emits SGR 107", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(0, 0, "X", DEFAULT_COLOR, { type: "bright", index: 7 }, 0);
    const output = buf.flush();
    assert.ok(output.includes("107"));
  });

  it("palette color index 0 emits correct sequence", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(0, 0, "X", { type: "palette", index: 0 }, DEFAULT_COLOR, 0);
    const output = buf.flush();
    assert.ok(output.includes("38;5;0"));
  });

  it("palette color index 255 emits correct sequence", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(0, 0, "X", { type: "palette", index: 255 }, DEFAULT_COLOR, 0);
    const output = buf.flush();
    assert.ok(output.includes("38;5;255"));
  });

  it("rgb color at boundary 0,0,0 emits correct sequence", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(0, 0, "X", { type: "rgb", r: 0, g: 0, b: 0 }, DEFAULT_COLOR, 0);
    const output = buf.flush();
    assert.ok(output.includes("38;2;0;0;0"));
  });

  it("rgb color at boundary 255,255,255 emits correct sequence", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(
      0,
      0,
      "X",
      { type: "rgb", r: 255, g: 255, b: 255 },
      DEFAULT_COLOR,
      0,
    );
    const output = buf.flush();
    assert.ok(output.includes("38;2;255;255;255"));
  });

  it("round-trip: named colors preserve index through set/getFg", () => {
    const buf = new Buffer(10, 10);
    for (let i = 0; i <= 7; i++) {
      buf.set(
        0,
        0,
        "X",
        { type: "named", index: i as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 },
        DEFAULT_COLOR,
        0,
      );
      const fg = buf.getFg(0, 0);
      assert.strictEqual(fg.type, "named");
      if (fg.type === "named") {
        assert.strictEqual(fg.index, i);
      }
    }
  });

  it("round-trip: bright colors preserve index through set/getFg", () => {
    const buf = new Buffer(10, 10);
    for (let i = 0; i <= 7; i++) {
      buf.set(
        0,
        0,
        "X",
        { type: "bright", index: i as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 },
        DEFAULT_COLOR,
        0,
      );
      const fg = buf.getFg(0, 0);
      assert.strictEqual(fg.type, "bright");
      if (fg.type === "bright") {
        assert.strictEqual(fg.index, i);
      }
    }
  });

  it("round-trip: palette colors preserve index through set/getFg", () => {
    const buf = new Buffer(10, 10);
    for (const idx of [0, 127, 255]) {
      buf.set(0, 0, "X", { type: "palette", index: idx }, DEFAULT_COLOR, 0);
      const fg = buf.getFg(0, 0);
      assert.strictEqual(fg.type, "palette");
      if (fg.type === "palette") {
        assert.strictEqual(fg.index, idx);
      }
    }
  });

  it("round-trip: rgb colors preserve components through set/getFg", () => {
    const buf = new Buffer(10, 10);
    buf.set(0, 0, "X", { type: "rgb", r: 128, g: 64, b: 32 }, DEFAULT_COLOR, 0);
    const fg = buf.getFg(0, 0);
    assert.strictEqual(fg.type, "rgb");
    if (fg.type === "rgb") {
      assert.strictEqual(fg.r, 128);
      assert.strictEqual(fg.g, 64);
      assert.strictEqual(fg.b, 32);
    }
  });

  it("simultaneous color and modifier change produces correct ANSI", () => {
    const buf = new Buffer(10, 10);
    buf.flush();
    buf.set(0, 0, "A", { type: "named", index: 1 }, DEFAULT_COLOR, BOLD);
    buf.flush();
    buf.set(
      1,
      0,
      "B",
      { type: "rgb", r: 0, g: 255, b: 0 },
      DEFAULT_COLOR,
      ITALIC,
    );
    const output = buf.flush();
    assert.ok(
      output.includes("38;2;0;255;0"),
      "should include RGB green fg code",
    );
    assert.ok(output.includes("3"), "should include italic SGR code");
  });
});
