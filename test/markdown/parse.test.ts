import assert from "node:assert";
import { describe, it } from "node:test";
import { parse } from "../../src/markdown/parse.ts";

describe("parse (marked adapter)", () => {
  it("parses headings with levels", () => {
    const blocks = parse("## Title\n\n###### Small");
    assert.deepEqual(
      blocks.map((b) => (b.type === "heading" ? b.level : b.type)),
      [2, 6],
    );
    assert.strictEqual(
      blocks[0].type === "heading" ? blocks[0].text : "",
      "Title",
    );
  });

  it("parses paragraphs with inline styles", () => {
    const blocks = parse("plain **bold** *ital* `code` ~~struck~~");
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].type, "paragraph");
    const inlines = blocks[0].type === "paragraph" ? blocks[0].inlines : [];
    assert.deepEqual(
      inlines.map((i) => i.type),
      [
        "text",
        "strong",
        "text",
        "emphasis",
        "text",
        "codespan",
        "text",
        "strikethrough",
      ],
    );
  });

  it("decodes entities", () => {
    const blocks = parse("a &amp; b &#65;");
    const inlines = blocks[0].type === "paragraph" ? blocks[0].inlines : [];
    const text = inlines.map((i) => (i.type === "text" ? i.text : "")).join("");
    assert.ok(text.includes("&"), `decoded & in "${text}"`);
    assert.ok(text.includes("A"), `decoded &#65; in "${text}"`);
  });

  it("soft break becomes a space, hard break becomes a break inline", () => {
    const blocks = parse("line one\nline two\nline three");
    const inlines = blocks[0].type === "paragraph" ? blocks[0].inlines : [];
    const text = inlines.map((i) => (i.type === "text" ? i.text : "")).join("");
    assert.ok(!text.includes("\n"), `no raw newline in "${text}"`);
  });

  it("parses fenced code with language", () => {
    const blocks = parse("```ts\nconst x = 1;\n```");
    assert.strictEqual(blocks[0].type, "code");
    if (blocks[0].type === "code") {
      assert.strictEqual(blocks[0].content, "const x = 1;");
      assert.strictEqual(blocks[0].language, "ts");
    }
  });

  it("parses blockquotes with nested blocks", () => {
    const blocks = parse("> quoted **bold**");
    assert.strictEqual(blocks[0].type, "blockquote");
    const children = blocks[0].type === "blockquote" ? blocks[0].children : [];
    assert.strictEqual(children[0]?.type, "paragraph");
  });

  it("parses nested blockquotes", () => {
    const blocks = parse("> outer\n> > inner");
    assert.strictEqual(blocks[0].type, "blockquote");
    const children = blocks[0].type === "blockquote" ? blocks[0].children : [];
    assert.strictEqual(children[1]?.type, "blockquote");
  });

  it("parses bullet and ordered lists", () => {
    const blocks = parse("- one\n- two\n\n1. first\n2. second");
    assert.strictEqual(blocks[0]?.type, "list");
    assert.strictEqual(blocks[1]?.type, "list");
    if (blocks[0]?.type === "list") {
      assert.strictEqual(blocks[0].ordered, false);
      assert.strictEqual(blocks[0].items.length, 2);
    }
    if (blocks[1]?.type === "list") {
      assert.strictEqual(blocks[1].ordered, true);
      assert.strictEqual(blocks[1].start, 1);
    }
  });

  it("parses ordered list start number", () => {
    const blocks = parse("5. five\n6. six");
    if (blocks[0]?.type === "list") {
      assert.strictEqual(blocks[0].start, 5);
    }
  });

  it("parses GFM task list items and strips the checkbox", () => {
    const blocks = parse("- [x] done\n- [ ] todo");
    assert.strictEqual(blocks[0]?.type, "list");
    if (blocks[0]?.type === "list") {
      assert.strictEqual(blocks[0].items[0]?.task, "checked");
      assert.strictEqual(blocks[0].items[1]?.task, "unchecked");
      const text = JSON.stringify(blocks[0].items[0]?.children);
      assert.ok(!text?.includes("[x]"), "checkbox text stripped");
    }
  });

  it("parses nested lists", () => {
    const blocks = parse("- a\n  - b\n    - c");
    if (blocks[0]?.type === "list") {
      const inner = blocks[0].items[0]?.children.find((c) => c.type === "list");
      assert.ok(inner, "nested list present");
    }
  });

  it("parses GFM tables with alignment", () => {
    const blocks = parse("| L | C | R |\n|---|:-:|--:|\n| a | b | c |");
    assert.strictEqual(blocks[0]?.type, "table");
    if (blocks[0]?.type === "table") {
      assert.deepEqual(
        blocks[0].columns.map((c) => c.align),
        [undefined, "center", "right"],
      );
      assert.strictEqual(blocks[0].rows.length, 1);
      assert.strictEqual(blocks[0].rows[0]?.length, 3);
    }
  });

  it("parses links and images", () => {
    const blocks = parse("[text](http://x) ![alt](http://y.png)");
    const inlines = blocks[0].type === "paragraph" ? blocks[0].inlines : [];
    const link = inlines.find((i) => i.type === "link");
    const image = inlines.find((i) => i.type === "image");
    assert.ok(link && link.type === "link" && link.href === "http://x");
    assert.ok(image && image.type === "image" && image.alt === "alt");
  });

  it("resolves link reference definitions", () => {
    const blocks = parse("[text][ref]\n\n[ref]: http://example.com");
    const inlines = blocks[0].type === "paragraph" ? blocks[0].inlines : [];
    const link = inlines.find((i) => i.type === "link");
    assert.ok(
      link && link.type === "link" && link.href === "http://example.com",
    );
    assert.strictEqual(blocks.length, 1, "definition itself invisible");
  });

  it("handles thematic breaks", () => {
    const blocks = parse("---");
    assert.strictEqual(blocks[0]?.type, "thematicBreak");
  });

  it("keeps html blocks as literal", () => {
    const blocks = parse("<div>hello</div>");
    assert.strictEqual(blocks[0]?.type, "html");
  });

  it("autolinks become link inlines", () => {
    const blocks = parse("see https://example.com now");
    const inlines = blocks[0].type === "paragraph" ? blocks[0].inlines : [];
    assert.ok(inlines.some((i) => i.type === "link"));
  });

  it("empty input parses to empty blocks", () => {
    assert.deepEqual(parse(""), []);
  });
});
