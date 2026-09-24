import assert from "node:assert";
import { describe, it } from "node:test";
import {
  layoutWordWrapFromSegments,
  measureText,
  segmentLine,
} from "../src/core/text.ts";

function wordWrap(text: string, maxWidth: number): string[] {
  return layoutWordWrapFromSegments(segmentLine(text), maxWidth).map(
    (line) => line.text,
  );
}

describe("word wrap mode", () => {
  it("wraps at word boundaries and trims break-point spaces", () => {
    assert.deepEqual(wordWrap("hello world foo", 11), ["hello world", "foo"]);
  });

  it("does not wrap text that fits", () => {
    assert.deepEqual(wordWrap("hello world", 20), ["hello world"]);
  });

  it("breaks long words at grapheme boundaries", () => {
    assert.deepEqual(wordWrap("abcdefghij", 4), ["abcd", "efgh", "ij"]);
  });

  it("keeps short word after an oversized word", () => {
    assert.deepEqual(wordWrap("abcdefgh foo", 4), ["abcd", "efgh", "foo"]);
  });

  it("handles multiple spaces between words", () => {
    assert.deepEqual(wordWrap("a   b", 1), ["a", "b"]);
  });

  it("wraps CJK text between wide graphemes", () => {
    // 4 CJK chars, width 2 each; maxWidth 4 fits 2 per line
    assert.deepEqual(wordWrap("你好世界", 4), ["你好", "世界"]);
  });

  it("wraps mixed CJK and ASCII", () => {
    assert.deepEqual(wordWrap("hello你好world", 5), ["hello", "你好", "world"]);
  });

  it("handles emoji (double-width graphemes)", () => {
    assert.deepEqual(wordWrap("🎉🎉🎉", 4), ["🎉🎉", "🎉"]);
  });

  it("handles empty text", () => {
    assert.deepEqual(wordWrap("", 10), [""]);
  });

  it("handles maxWidth <= 0 without hanging", () => {
    const lines = layoutWordWrapFromSegments(segmentLine("ab cd"), 0);
    assert.strictEqual(lines.length >= 1, true);
  });

  it("handles explicit newlines via per-line wrapping by caller", () => {
    // layoutWordWrapFromSegments wraps a single line; newline splitting is
    // the caller's job (same contract as layoutLineFromSegments)
    assert.deepEqual(wordWrap("one two", 7), ["one two"]);
  });

  it("preserves leading spaces only on first line of a word", () => {
    // Leading spaces on continuation lines are skipped
    assert.deepEqual(wordWrap("ab   cd", 2), ["ab", "cd"]);
  });
});

describe("none wrap mode (measureText)", () => {
  it("returns full intrinsic width beyond availableWidth", () => {
    const m = measureText("hello world", 5, "none");
    assert.strictEqual(m.width, 11);
  });

  it("counts explicit newlines as separate lines", () => {
    const m = measureText("aaa\nbbbb", 100, "none");
    assert.strictEqual(m.width, 4);
    assert.strictEqual(m.height, 2);
  });

  it("returns zero size for empty text", () => {
    const m = measureText("", 10, "none");
    assert.strictEqual(m.width, 0);
    assert.strictEqual(m.height, 0);
  });
});
