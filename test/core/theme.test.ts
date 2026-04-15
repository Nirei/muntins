import assert from "node:assert";
import { describe, it } from "node:test";
import {
  parseColor,
  resolveTheme,
  setTheme,
  styleFallback,
  theme,
} from "../../src/core/theme.ts";

describe("parseColor", () => {
  it("parses 'default'", () => {
    assert.deepStrictEqual(parseColor("default", {}), { type: "default" });
  });

  it("parses named colors", () => {
    assert.deepStrictEqual(parseColor("red", {}), { type: "named", index: 1 });
    assert.deepStrictEqual(parseColor("cyan", {}), { type: "named", index: 6 });
  });

  it("parses bright colors", () => {
    assert.deepStrictEqual(parseColor("bright-green", {}), {
      type: "bright",
      index: 2,
    });
  });

  it("parses palette colors", () => {
    assert.deepStrictEqual(parseColor("palette:42", {}), {
      type: "palette",
      index: 42,
    });
  });

  it("parses hex colors", () => {
    assert.deepStrictEqual(parseColor("#ff8800", {}), {
      type: "rgb",
      r: 255,
      g: 136,
      b: 0,
    });
  });

  it("resolves token references", () => {
    const tokens = { primary: { type: "named" as const, index: 4 as const } };
    assert.deepStrictEqual(parseColor("$primary", tokens), {
      type: "named",
      index: 4,
    });
  });

  it("throws on unknown token", () => {
    assert.throws(() => parseColor("$nope", {}), /Unknown theme token/);
  });

  it("throws on unknown format", () => {
    assert.throws(() => parseColor("garbage", {}), /Unknown color format/);
  });

  it("throws on invalid hex length", () => {
    assert.throws(() => parseColor("#fff", {}), /Invalid hex color/);
  });

  it("throws on unknown bright color", () => {
    assert.throws(() => parseColor("bright-nope", {}), /Unknown bright color/);
  });
});

describe("resolveTheme", () => {
  it("resolves tokens", () => {
    const resolved = resolveTheme({
      tokens: { primary: "#aabbcc" },
    });
    assert.deepStrictEqual(resolved.tokens, {
      primary: { type: "rgb", r: 170, g: 187, b: 204 },
    });
  });

  it("resolves color strings in style slices", () => {
    const resolved = resolveTheme({
      tokens: {},
      "my-component": { backgroundColor: "red", width: 20 },
    });
    const slice = resolved["my-component"] as Record<string, unknown>;
    assert.deepStrictEqual(slice.backgroundColor, { type: "named", index: 1 });
    assert.strictEqual(slice.width, 20);
  });

  it("resolves token references in style slices", () => {
    const resolved = resolveTheme({
      tokens: { accent: "bright-cyan" },
      button: { color: "$accent", bold: true },
    });
    const slice = resolved.button as Record<string, unknown>;
    assert.deepStrictEqual(slice.color, { type: "bright", index: 6 });
    assert.strictEqual(slice.bold, true);
  });

  it("passes through non-object top-level values", () => {
    const resolved = resolveTheme({
      tokens: {},
      "some-string": "hello" as unknown,
    });
    // Non-object values are skipped, only tokens present
    assert.strictEqual(resolved["some-string"], undefined);
  });

  it("tokens can reference earlier tokens", () => {
    const resolved = resolveTheme({
      tokens: { base: "#112233", alias: "$base" },
    });
    assert.deepStrictEqual(resolved.tokens.alias, {
      type: "rgb",
      r: 17,
      g: 34,
      b: 51,
    });
  });
});

describe("setTheme / theme", () => {
  it("setTheme replaces the theme, theme() reads slices", () => {
    setTheme({
      tokens: {},
      "test-comp": { dim: true, width: 10 },
    });
    const slice = theme("test-comp");
    assert.strictEqual(slice.dim, true);
    assert.strictEqual(slice.width, 10);
  });

  it("theme() returns empty object for missing keys", () => {
    setTheme({ tokens: {} });
    const slice = theme("nonexistent");
    assert.deepStrictEqual(slice, {});
  });

  it("setTheme replaces entirely, no merging", () => {
    setTheme({
      tokens: {},
      foo: { a: 1 },
      bar: { b: 2 },
    });
    assert.strictEqual(theme("foo").a, 1);
    assert.strictEqual(theme("bar").b, 2);

    // Replace with theme that only has "foo"
    setTheme({
      tokens: {},
      foo: { a: 99 },
    });
    assert.strictEqual(theme("foo").a, 99);
    assert.deepStrictEqual(theme("bar"), {});
  });
});

describe("styleFallback", () => {
  it("returns theme values as reactive getters", () => {
    setTheme({
      tokens: {},
      widget: { paddingStart: 2, border: "single" },
    });
    const merged = styleFallback(undefined, "widget");
    // Values are getter functions
    assert.strictEqual(typeof merged.paddingStart, "function");
    assert.strictEqual((merged.paddingStart as () => unknown)(), 2);
    assert.strictEqual((merged.border as () => unknown)(), "single");
  });

  it("instance style overrides theme values (static, not getter)", () => {
    setTheme({
      tokens: {},
      widget: { paddingStart: 2, border: "single" },
    });
    const merged = styleFallback({ paddingStart: 5 }, "widget");
    // Instance value is static (not a getter)
    assert.strictEqual(merged.paddingStart, 5);
    // Theme value remains a getter
    assert.strictEqual((merged.border as () => unknown)(), "single");
  });

  it("passes through instance props even for missing theme key", () => {
    setTheme({ tokens: {} });
    const merged = styleFallback({ paddingStart: 1 }, "missing");
    assert.strictEqual(merged.paddingStart, 1);
  });

  it("returns empty object when no instance style and missing theme key", () => {
    setTheme({ tokens: {} });
    const merged = styleFallback(undefined, "missing");
    assert.deepStrictEqual(merged, {});
  });

  it("supports fallback chain across multiple theme keys", () => {
    setTheme({
      tokens: {},
      input: { backgroundColor: "red", width: 20 },
      "select--trigger": { border: "single", paddingStart: 1 },
    });
    const merged = styleFallback(undefined, "select--trigger", "input");
    // select--trigger properties
    assert.strictEqual((merged.border as () => unknown)(), "single");
    assert.strictEqual((merged.paddingStart as () => unknown)(), 1);
    // Falls back to input for properties not in select--trigger
    assert.strictEqual((merged.width as () => unknown)(), 20);
  });

  it("first theme key wins over later keys in fallback chain", () => {
    setTheme({
      tokens: {},
      base: { bold: true, gap: 1 },
      specific: { bold: false },
    });
    const merged = styleFallback(undefined, "specific", "base");
    // specific wins for bold
    assert.strictEqual((merged.bold as () => unknown)(), false);
    // base provides gap
    assert.strictEqual((merged.gap as () => unknown)(), 1);
  });

  it("instance props win over all theme keys in fallback chain", () => {
    setTheme({
      tokens: {},
      base: { color: "blue", gap: 1 },
      specific: { color: "red", border: "single" },
    });
    const merged = styleFallback({ color: "green" }, "specific", "base");
    assert.strictEqual(merged.color, "green");
    assert.strictEqual((merged.border as () => unknown)(), "single");
    assert.strictEqual((merged.gap as () => unknown)(), 1);
  });
});
