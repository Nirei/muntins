import assert from "node:assert";
import { describe, it } from "node:test";
import {
  textDelete,
  textInsert,
  textLength,
  textSlice,
} from "../src/core/text.ts";

describe("textLength", () => {
  it("counts ASCII characters", () => {
    assert.strictEqual(textLength("hello"), 5);
  });

  it("counts empty string as 0", () => {
    assert.strictEqual(textLength(""), 0);
  });

  it("counts emoji as single grapheme", () => {
    assert.strictEqual(textLength("👨‍👩‍👧"), 1);
    assert.strictEqual(textLength("🎉"), 1);
  });

  it("counts emoji with skin tone as single grapheme", () => {
    assert.strictEqual(textLength("👋🏽"), 1);
  });

  it("counts combining marks correctly", () => {
    // café with combining acute accent (e + combining acute = single grapheme)
    assert.strictEqual(textLength("cafe\u0301"), 4);
  });

  it("counts mixed content", () => {
    assert.strictEqual(textLength("hi👋🏽!"), 4);
  });
});

describe("textSlice", () => {
  it("slices ASCII string", () => {
    assert.strictEqual(textSlice("hello", 1, 3), "el");
  });

  it("slices from start when start is 0", () => {
    assert.strictEqual(textSlice("hello", 0, 2), "he");
  });

  it("slices to end when end is omitted", () => {
    assert.strictEqual(textSlice("hello", 2), "llo");
  });

  it("slices emoji correctly", () => {
    assert.strictEqual(textSlice("👨‍👩‍👧🎉", 0, 1), "👨‍👩‍👧");
    assert.strictEqual(textSlice("👨‍👩‍👧🎉", 1, 2), "🎉");
  });

  it("returns empty string for out-of-bounds start", () => {
    assert.strictEqual(textSlice("hello", 10, 12), "");
  });

  it("handles emoji with skin tone", () => {
    assert.strictEqual(textSlice("a👋🏽b", 1, 2), "👋🏽");
  });
});

describe("textInsert", () => {
  it("inserts at beginning", () => {
    assert.strictEqual(textInsert("world", 0, "hello "), "hello world");
  });

  it("inserts at end", () => {
    assert.strictEqual(textInsert("hello", 5, " world"), "hello world");
  });

  it("inserts in middle", () => {
    assert.strictEqual(textInsert("helo", 2, "l"), "hello");
  });

  it("inserts emoji", () => {
    assert.strictEqual(textInsert("ab", 1, "👨‍👩‍👧"), "a👨‍👩‍👧b");
  });

  it("inserts into string with emoji", () => {
    assert.strictEqual(textInsert("👋🏽!", 1, "hi"), "👋🏽hi!");
  });
});

describe("textDelete", () => {
  it("deletes from beginning", () => {
    assert.strictEqual(textDelete("hello", 0, 2), "llo");
  });

  it("deletes from end", () => {
    assert.strictEqual(textDelete("hello", 3, 5), "hel");
  });

  it("deletes from middle", () => {
    assert.strictEqual(textDelete("hello", 1, 3), "hlo");
  });

  it("deletes single character", () => {
    assert.strictEqual(textDelete("hello", 2, 3), "helo");
  });

  it("deletes emoji", () => {
    assert.strictEqual(textDelete("a👨‍👩‍👧b", 1, 2), "ab");
  });

  it("deletes around emoji", () => {
    assert.strictEqual(textDelete("👋🏽hi👋🏽", 0, 1), "hi👋🏽");
    assert.strictEqual(textDelete("👋🏽hi👋🏽", 3, 4), "👋🏽hi");
  });
});
