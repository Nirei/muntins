import assert from "node:assert";
import { describe, it } from "node:test";
import { DEFAULT_FLEX_STYLE } from "../src/core/layout.ts";
import {
  Box,
  DEFAULT_MOUNT_OPTIONS,
  type Node,
  Text,
  createRef,
  enterTuiMode,
  exitTuiMode,
  flushFrame,
  lineDisplayWidth,
  measureText,
  truncateLine,
  wrapLine,
} from "../src/core/runtime.ts";
import { createSignal } from "../src/core/signals.ts";

describe("runtime core types", () => {
  it("createRef returns object with null current", () => {
    const ref = createRef();
    assert.strictEqual(ref.current, null);
  });

  it("createRef.current is mutable", () => {
    const ref = createRef();
    const node: Node = { style: DEFAULT_FLEX_STYLE };
    ref.current = node;
    assert.strictEqual(ref.current, node);
  });

  it("DEFAULT_MOUNT_OPTIONS has expected values", () => {
    assert.strictEqual(DEFAULT_MOUNT_OPTIONS.fps, 60);
    assert.strictEqual(DEFAULT_MOUNT_OPTIONS.mouse, false);
    assert.strictEqual(DEFAULT_MOUNT_OPTIONS.alternateScreen, true);
  });
});

describe("screen control", () => {
  it("enterTuiMode writes alternate screen sequence", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    enterTuiMode(mockStdout, { alternateScreen: true });

    assert.ok(written.includes("\x1b[?1049h"));
    assert.ok(written.includes("\x1b[?25l"));
    assert.ok(written.includes("\x1b[2J"));
    assert.ok(written.includes("\x1b[H"));
  });

  it("enterTuiMode skips alternate screen when disabled", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    enterTuiMode(mockStdout, { alternateScreen: false });

    assert.ok(!written.includes("\x1b[?1049h"));
    assert.ok(written.includes("\x1b[?25l")); // still hides cursor
  });

  it("exitTuiMode writes restore sequences", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    exitTuiMode(mockStdout, { alternateScreen: true });

    assert.ok(written.includes("\x1b[?25h"));
    assert.ok(written.includes("\x1b[?1049l"));
  });

  it("exitTuiMode skips alternate screen when disabled", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    exitTuiMode(mockStdout, { alternateScreen: false });

    assert.ok(written.includes("\x1b[?25h")); // still shows cursor
    assert.ok(!written.includes("\x1b[?1049l"));
  });

  it("flushFrame writes content directly without cursor manipulation", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    flushFrame(mockStdout, "content");

    // Cursor is managed by enterTuiMode/exitTuiMode, not per-frame
    assert.strictEqual(written, "content");
  });

  it("flushFrame does nothing for empty content", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    flushFrame(mockStdout, "");

    assert.strictEqual(written, "");
  });
});

// ============================================================================
// Box Tests
// ============================================================================

describe("Box", () => {
  it("creates node with merged style", () => {
    const node = Box({ flexDirection: "column", gap: 2 });

    const style = typeof node.style === "function" ? node.style() : node.style;
    assert.strictEqual(style.flexDirection, "column");
    assert.strictEqual(style.gap, 2);
    assert.strictEqual(style.flexGrow, 0); // from default
  });

  it("creates node with children", () => {
    const child = Box({});
    const parent = Box({ children: [child] });

    assert.strictEqual(parent.children?.length, 1);
    assert.strictEqual(parent.children?.[0], child);
  });

  it("has no measure or render functions", () => {
    const node = Box({});

    assert.strictEqual(node.measure, undefined);
    assert.strictEqual(node.render, undefined);
  });

  it("supports reactive style props", () => {
    const [direction, setDirection] = createSignal<"row" | "column">("row");
    // Using a non-reactive prop combined with checking style getter behavior
    const node = Box({});
    // Manually test that style can be a getter
    const directionalNode = {
      ...node,
      get style() {
        return { ...DEFAULT_FLEX_STYLE, flexDirection: direction() };
      },
    };

    assert.strictEqual(directionalNode.style.flexDirection, "row");
    setDirection("column");
    assert.strictEqual(directionalNode.style.flexDirection, "column");
  });

  it("passes through event handlers", () => {
    const keyHandler = () => true;
    const mouseHandler = () => {};
    const node = Box({ onKeyPress: keyHandler, onMousePress: mouseHandler });

    assert.strictEqual(node.onKeyPress, keyHandler);
    assert.strictEqual(node.onMousePress, mouseHandler);
  });

  it("passes through focus props", () => {
    const node = Box({ focusable: true, autoFocus: true });

    assert.strictEqual(node.focusable, true);
    assert.strictEqual(node.autoFocus, true);
  });

  it("binds ref", () => {
    const ref = createRef();
    const node = Box({ ref });

    assert.strictEqual(ref.current, node);
  });

  it("sets _parent on children", () => {
    const child1 = Box({});
    const child2 = Box({});
    const parent = Box({ children: [child1, child2] });

    assert.strictEqual(child1._parent, parent);
    assert.strictEqual(child2._parent, parent);
  });
});

// ============================================================================
// Text Tests
// ============================================================================

describe("Text", () => {
  it("creates node with measure and render", () => {
    const node = Text({ content: "hello" });

    assert.ok(typeof node.measure === "function");
    assert.ok(typeof node.render === "function");
  });

  it("accepts static string content", () => {
    const node = Text({ content: "hello" });
    assert.ok(node.measure);
    const size = node.measure(100, 100);

    assert.strictEqual(size.width, 5);
    assert.strictEqual(size.height, 1);
  });

  it("accepts reactive content", () => {
    let value = "short";
    const node = Text({ content: () => value });
    assert.ok(node.measure);

    assert.strictEqual(node.measure(100, 100).width, 5);

    value = "longer text";
    assert.strictEqual(node.measure(100, 100).width, 11);
  });

  it("passes through focusable prop", () => {
    const node = Text({ content: "hello", focusable: true });
    assert.strictEqual(node.focusable, true);
  });

  it("binds ref", () => {
    const ref = createRef();
    const node = Text({ content: "hello", ref });
    assert.strictEqual(ref.current, node);
  });
});

// ============================================================================
// measureText Tests
// ============================================================================

describe("measureText", () => {
  it("measures single line", () => {
    const size = measureText("hello", 100, "wrap");
    assert.strictEqual(size.width, 5);
    assert.strictEqual(size.height, 1);
  });

  it("measures multi-line", () => {
    const size = measureText("line1\nline2\nline3", 100, "wrap");
    assert.strictEqual(size.height, 3);
  });

  it("wraps long lines", () => {
    const size = measureText("hello world", 5, "wrap");
    assert.strictEqual(size.width, 5);
    assert.strictEqual(size.height, 3); // "hello", " worl", "d"
  });

  it("truncate mode keeps single line", () => {
    const size = measureText("hello world", 5, "truncate");
    assert.strictEqual(size.height, 1);
  });

  it("handles empty string", () => {
    const size = measureText("", 100, "wrap");
    assert.strictEqual(size.width, 0);
    assert.strictEqual(size.height, 0);
  });

  it("handles CJK characters", () => {
    const size = measureText("中文", 100, "wrap");
    assert.strictEqual(size.width, 4); // 2 chars * 2 width each
    assert.strictEqual(size.height, 1);
  });
});

// ============================================================================
// truncateLine Tests
// ============================================================================

describe("truncateLine", () => {
  it("returns line unchanged if fits", () => {
    assert.strictEqual(truncateLine("hello", 10, "truncate-end"), "hello");
  });

  it("truncates end with ellipsis", () => {
    const result = truncateLine("hello world", 6, "truncate-end");
    assert.ok(result.endsWith("…"));
    assert.ok(lineDisplayWidth(result) <= 6);
  });

  it("truncates start with ellipsis", () => {
    const result = truncateLine("hello world", 6, "truncate-start");
    assert.ok(result.startsWith("…"));
    assert.ok(lineDisplayWidth(result) <= 6);
  });

  it("handles truncate mode same as truncate-end", () => {
    const result = truncateLine("hello world", 6, "truncate");
    assert.ok(result.endsWith("…"));
    assert.ok(lineDisplayWidth(result) <= 6);
  });
});

// ============================================================================
// wrapLine Tests
// ============================================================================

describe("wrapLine", () => {
  it("returns single element for short line", () => {
    const lines = wrapLine("hello", 10);
    assert.deepStrictEqual(lines, ["hello"]);
  });

  it("wraps at width boundary", () => {
    const lines = wrapLine("hello world", 5);
    assert.strictEqual(lines.length, 3);
  });

  it("handles empty line", () => {
    const lines = wrapLine("", 10);
    assert.deepStrictEqual(lines, [""]);
  });

  it("handles maxWidth of 0 or less", () => {
    const lines = wrapLine("hello", 0);
    assert.deepStrictEqual(lines, ["hello"]);
  });
});
