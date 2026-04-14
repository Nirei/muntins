import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer, DEFAULT_COLOR } from "../../src/core/buffer.ts";
import type { Rect, ScreenRect } from "../../src/core/rects.ts";
import {
  DEFAULT_INHERITED_STYLE,
  type TextRenderProps,
  renderText,
} from "../../src/core/render.ts";
import type { VisualLine } from "../../src/core/text.ts";

describe("renderText", () => {
  const noProps: TextRenderProps = {};

  function makeVisualLine(text: string): VisualLine {
    const segments: { grapheme: string; displayWidth: number }[] = [];
    let totalWidth = 0;
    for (const ch of text) {
      const dw = ch.charCodeAt(0) > 0x7f ? 2 : 1;
      segments.push({ grapheme: ch, displayWidth: dw });
      totalWidth += dw;
    }
    return { text, displayWidth: totalWidth, segments };
  }

  it("clips wide character that overflows the right clip boundary", () => {
    const buffer = new Buffer(10, 3);

    const rect: ScreenRect = {
      x: 0,
      y: 0,
      screenX: 0,
      screenY: 0,
      width: 4,
      height: 1,
    };
    const clip: Rect = { x: 0, y: 0, width: 4, height: 1 };

    const lines: VisualLine[] = [makeVisualLine("abc中")];

    renderText(buffer, rect, lines, noProps, DEFAULT_INHERITED_STYLE, clip);

    assert.strictEqual(buffer.getSymbol(0, 0), "a", "col 0 should be 'a'");
    assert.strictEqual(buffer.getSymbol(1, 0), "b", "col 1 should be 'b'");
    assert.strictEqual(buffer.getSymbol(2, 0), "c", "col 2 should be 'c'");
    assert.strictEqual(
      buffer.getSymbol(3, 0),
      " ",
      "col 3 (last in clip) should be empty — wide char overflows",
    );
    assert.strictEqual(
      buffer.getSymbol(4, 0),
      " ",
      "col 4 (outside clip) should be empty",
    );
  });

  it("renders wide character that fully fits inside clip", () => {
    const buffer = new Buffer(10, 3);

    const rect: ScreenRect = {
      x: 0,
      y: 0,
      screenX: 0,
      screenY: 0,
      width: 5,
      height: 1,
    };
    const clip: Rect = { x: 0, y: 0, width: 5, height: 1 };

    const lines: VisualLine[] = [makeVisualLine("ab中d")];

    renderText(buffer, rect, lines, noProps, DEFAULT_INHERITED_STYLE, clip);

    assert.strictEqual(buffer.getSymbol(0, 0), "a");
    assert.strictEqual(buffer.getSymbol(1, 0), "b");
    assert.strictEqual(buffer.getSymbol(2, 0), "中");
    assert.strictEqual(buffer.getSymbol(3, 0), "", "continuation cell");
    assert.strictEqual(buffer.getSymbol(4, 0), "d");
  });

  it("clips wide character at right edge of non-zero-x clip", () => {
    const buffer = new Buffer(10, 3);

    const rect: ScreenRect = {
      x: 2,
      y: 0,
      screenX: 2,
      screenY: 0,
      width: 2,
      height: 1,
    };
    const clip: Rect = { x: 2, y: 0, width: 2, height: 1 };

    const lines: VisualLine[] = [makeVisualLine("a中b")];

    renderText(buffer, rect, lines, noProps, DEFAULT_INHERITED_STYLE, clip);

    assert.strictEqual(buffer.getSymbol(2, 0), "a", "col 2 should be 'a'");
    assert.strictEqual(
      buffer.getSymbol(3, 0),
      " ",
      "col 3 should be empty — wide char starts here but only 1 col left in clip",
    );
    assert.strictEqual(
      buffer.getSymbol(4, 0),
      " ",
      "col 4 (outside clip) should be empty",
    );
  });
});
