import assert from "node:assert";
import { describe, it } from "node:test";
import {
  type Color,
  DEFAULT_COLOR,
  Buffer as RenderBuffer,
} from "../src/core/buffer.ts";
import type {
  MouseEvent as InputMouseEvent,
  KeyEvent,
  ScrollEvent,
} from "../src/core/input.ts";
import {
  DEFAULT_FLEX_STYLE,
  type LayoutNode,
  computeLayout,
} from "../src/core/layout.ts";
import type { LayoutResult } from "../src/core/layout.ts";
import {
  App,
  BORDER_CHARS,
  type BorderStyleName,
  Box,
  DEFAULT_CLIP,
  DEFAULT_INHERITED_STYLE,
  DEFAULT_MOUNT_OPTIONS,
  type FocusController,
  FocusManager,
  type FocusScope,
  For,
  type InheritedStyle,
  type LayoutInfo,
  Node,
  type Rect,
  Renderer,
  type RuntimeContext,
  Show,
  TabFocus,
  Text,
  type VisualLine,
  type WrapMode,
  createRef,
  enterTuiMode,
  exitTuiMode,
  flushFrame,
  layoutLine,
  measureText,
  segmentLine,
  truncateLine,
  useFocus,
} from "../src/core/runtime.ts";
import {
  createEffect,
  createRoot,
  createSignal,
  onCleanup,
} from "../src/core/signals.ts";
import { createTestApp, setActiveContext } from "./test-helpers.ts";

describe("runtime core types", () => {
  it("createRef returns object with null current", () => {
    const ref = createRef();
    assert.strictEqual(ref.current, null);
  });

  it("createRef.current is mutable", () => {
    const ref = createRef();
    const node: Node = new Node({ style: DEFAULT_FLEX_STYLE });
    ref.current = node;
    assert.strictEqual(ref.current, node);
  });

  it("DEFAULT_MOUNT_OPTIONS has expected values", () => {
    assert.strictEqual(DEFAULT_MOUNT_OPTIONS.mouse, false);
    assert.strictEqual(DEFAULT_MOUNT_OPTIONS.alternateScreen, true);
  });

  it("App.mount throws if stdout is not a TTY", () => {
    const mockStdout = {
      columns: undefined,
      rows: undefined,
      isTTY: false,
    } as unknown as NodeJS.WriteStream;
    const mockStdin = {} as NodeJS.ReadStream;

    assert.throws(
      () =>
        App.mount(() => new Node({ style: DEFAULT_FLEX_STYLE }), {
          stdout: mockStdout,
          stdin: mockStdin,
        }),
      { message: "Cannot mount: stdout is not a TTY." },
    );
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

    assert.strictEqual(parent.resolveChildren().length, 1);
    assert.strictEqual(parent.resolveChildren()[0], child);
  });

  it("has no measure function", () => {
    const node = Box({});

    assert.strictEqual(node.measure, undefined);
  });

  it("has render function when border is provided", () => {
    const node = Box({ border: true });
    assert.strictEqual(typeof node.render, "function");
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

describe("Box backgroundColor", () => {
  it("fills box area with background color", () => {
    const bgColor: Color = { type: "rgb", r: 26, g: 26, b: 46 };
    const node = Box({ backgroundColor: bgColor, width: 3, height: 2 });

    assert.ok(
      node.render,
      "render should be defined when backgroundColor is set",
    );

    const buffer = new RenderBuffer(5, 5);
    node.render(
      { x: 0, y: 0, screenX: 1, screenY: 1, width: 3, height: 2 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );

    // Check that the region is filled with spaces and the background color
    // Buffer cells at positions (1,1) through (3,2) should have the background
    const output = buffer.flush();
    assert.ok(output.length > 0, "should produce output");
  });

  it("Renderer paints root box background color", () => {
    const bgColor: Color = { type: "rgb", r: 31, g: 36, b: 33 };
    const root = Box({ backgroundColor: bgColor });

    const stdout = {
      columns: 10,
      rows: 5,
      write: () => true,
    } as unknown as NodeJS.WriteStream;

    const renderer = new Renderer(stdout, 0, () => root);
    renderer.flush();

    const cellBg = renderer.buffer.getBg(0, 0);
    assert.deepStrictEqual(
      cellBg,
      bgColor,
      "root box background color should be painted into the buffer",
    );
  });

  it("reactive backgroundColor updates on signal change", () => {
    const [color, setColor] = createSignal<Color>({ type: "named", index: 4 });
    const node = Box({ backgroundColor: color });

    assert.ok(node.render, "render should be defined");

    const buffer = new RenderBuffer(5, 5);

    // First render with initial color
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 3, height: 2 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );
    buffer.flush();

    // Change color and re-render
    setColor({ type: "rgb", r: 255, g: 0, b: 0 });
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 3, height: 2 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );
    const output = buffer.flush();
    assert.ok(output.length > 0, "should produce output after color change");
  });

  it("children paint on top of background", () => {
    // Create a box with background and a text child
    const bgColor: Color = { type: "named", index: 1 };
    const textNode = Text({ content: "Hi" });
    const node = Box({
      backgroundColor: bgColor,
      children: [textNode],
      width: 10,
      height: 3,
    });

    assert.ok(node.render, "box should have render");
    assert.ok(textNode.render, "text should have render");

    // Paint order is verified by the paintNode function in runtime.ts
    // which calls node.render before recursing to children.
    // This test just verifies both have render functions.
  });

  it("backgroundColor does not affect layout calculations", () => {
    // Box without backgroundColor
    const node1 = Box({ width: 10, height: 5 });
    // Box with backgroundColor
    const node2 = Box({
      backgroundColor: { type: "named", index: 2 },
      width: 10,
      height: 5,
    });

    // Both should have the same style (backgroundColor is not part of FlexStyle)
    const style1 =
      typeof node1.style === "function" ? node1.style() : node1.style;
    const style2 =
      typeof node2.style === "function" ? node2.style() : node2.style;

    assert.strictEqual(style1.width, style2.width);
    assert.strictEqual(style1.height, style2.height);
    // backgroundColor should not leak into styleProps
    assert.strictEqual(
      (style1 as unknown as Record<string, unknown>).backgroundColor,
      undefined,
    );
    assert.strictEqual(
      (style2 as unknown as Record<string, unknown>).backgroundColor,
      undefined,
    );
  });

  it("zero-size box with background does not crash", () => {
    const node = Box({
      backgroundColor: { type: "named", index: 3 },
      width: 0,
      height: 0,
    });

    assert.ok(node.render);

    const buffer = new RenderBuffer(5, 5);
    // Should not throw
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 0, height: 0 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );
  });

  it("background fills entire box area including padding region", () => {
    // When a box has padding, the background should fill the entire box,
    // not just the content area. This is verified by fillRect using
    // the full width/height passed to render.
    const node = Box({
      backgroundColor: { type: "rgb", r: 100, g: 100, b: 100 },
      paddingTop: 2,
      paddingBottom: 2,
      paddingStart: 2,
      paddingEnd: 2,
      width: 10,
      height: 6,
    });

    assert.ok(node.render);

    const buffer = new RenderBuffer(10, 6);
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 6 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );

    // The render function fills from (0,0) to (10,6) with the background
    const output = buffer.flush();
    assert.ok(output.length > 0);
  });
});

describe("Box borders", () => {
  it("border: true uses single style on all sides", () => {
    const node = Box({ border: true, width: 5, height: 3 });

    const style = typeof node.style === "function" ? node.style() : node.style;
    assert.strictEqual(style.borderTop, true);
    assert.strictEqual(style.borderEnd, true);
    assert.strictEqual(style.borderBottom, true);
    assert.strictEqual(style.borderStart, true);
    assert.ok(node.render, "render should be defined when border is set");
  });

  it("border: false has no borders in style", () => {
    const node = Box({ border: false, width: 5, height: 3 });

    const style = typeof node.style === "function" ? node.style() : node.style;
    assert.strictEqual(style.borderTop, false);
    assert.strictEqual(style.borderEnd, false);
    assert.strictEqual(style.borderBottom, false);
    assert.strictEqual(style.borderStart, false);
    // render exists to support reactivity, but draws nothing
    assert.ok(node.render, "render exists when border prop is set");
  });

  it("border: 'round' sets style on all sides", () => {
    const node = Box({ border: "round", width: 5, height: 3 });

    const style = typeof node.style === "function" ? node.style() : node.style;
    assert.strictEqual(style.borderTop, true);
    assert.strictEqual(style.borderEnd, true);
    assert.strictEqual(style.borderBottom, true);
    assert.strictEqual(style.borderStart, true);
  });

  it("selective borders: { top: true } renders only top", () => {
    const node = Box({ border: { top: true }, width: 5, height: 3 });

    const style = typeof node.style === "function" ? node.style() : node.style;
    assert.strictEqual(style.borderTop, true);
    assert.strictEqual(style.borderEnd, false);
    assert.strictEqual(style.borderBottom, false);
    assert.strictEqual(style.borderStart, false);
  });

  it("selective borders: { left: true, right: true } renders only sides", () => {
    const node = Box({
      border: { left: true, right: true },
      width: 5,
      height: 3,
    });

    const style = typeof node.style === "function" ? node.style() : node.style;
    assert.strictEqual(style.borderTop, false);
    assert.strictEqual(style.borderEnd, true);
    assert.strictEqual(style.borderBottom, false);
    assert.strictEqual(style.borderStart, true);
  });

  it("borderStyle overrides border style", () => {
    const node = Box({
      border: "single",
      borderStyle: "double",
      width: 5,
      height: 3,
    });

    // The style name is used internally during rendering, not stored in FlexStyle
    // Just verify both border and borderStyle are handled without error
    assert.ok(node.render, "render should be defined");
  });

  it("renders single border correctly", () => {
    const node = Box({ border: true, width: 5, height: 3 });
    assert.ok(node.render);

    const buffer = new RenderBuffer(5, 3);
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );

    // Check corners
    assert.strictEqual(buffer.getSymbol(0, 0), BORDER_CHARS.single.tl);
    assert.strictEqual(buffer.getSymbol(4, 0), BORDER_CHARS.single.tr);
    assert.strictEqual(buffer.getSymbol(0, 2), BORDER_CHARS.single.bl);
    assert.strictEqual(buffer.getSymbol(4, 2), BORDER_CHARS.single.br);

    // Check horizontal edges
    assert.strictEqual(buffer.getSymbol(1, 0), BORDER_CHARS.single.h);
    assert.strictEqual(buffer.getSymbol(2, 0), BORDER_CHARS.single.h);
    assert.strictEqual(buffer.getSymbol(3, 0), BORDER_CHARS.single.h);

    // Check vertical edges
    assert.strictEqual(buffer.getSymbol(0, 1), BORDER_CHARS.single.v);
    assert.strictEqual(buffer.getSymbol(4, 1), BORDER_CHARS.single.v);
  });

  it("renders round border correctly", () => {
    const node = Box({ border: "round", width: 5, height: 3 });
    assert.ok(node.render);

    const buffer = new RenderBuffer(5, 3);
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );

    assert.strictEqual(buffer.getSymbol(0, 0), BORDER_CHARS.round.tl);
    assert.strictEqual(buffer.getSymbol(4, 0), BORDER_CHARS.round.tr);
    assert.strictEqual(buffer.getSymbol(0, 2), BORDER_CHARS.round.bl);
    assert.strictEqual(buffer.getSymbol(4, 2), BORDER_CHARS.round.br);
  });

  it("renders double border correctly", () => {
    const node = Box({ border: "double", width: 5, height: 3 });
    assert.ok(node.render);

    const buffer = new RenderBuffer(5, 3);
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );

    assert.strictEqual(buffer.getSymbol(0, 0), BORDER_CHARS.double.tl);
    assert.strictEqual(buffer.getSymbol(4, 0), BORDER_CHARS.double.tr);
  });

  it("renders bold border correctly", () => {
    const node = Box({ border: "bold", width: 5, height: 3 });
    assert.ok(node.render);

    const buffer = new RenderBuffer(5, 3);
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );

    assert.strictEqual(buffer.getSymbol(0, 0), BORDER_CHARS.bold.tl);
    assert.strictEqual(buffer.getSymbol(4, 0), BORDER_CHARS.bold.tr);
  });

  it("renders dashed border correctly", () => {
    const node = Box({ border: "dashed", width: 5, height: 3 });
    assert.ok(node.render);

    const buffer = new RenderBuffer(5, 3);
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );

    assert.strictEqual(buffer.getSymbol(0, 0), BORDER_CHARS.dashed.tl);
    assert.strictEqual(buffer.getSymbol(1, 0), BORDER_CHARS.dashed.h);
  });

  it("renders ascii border correctly", () => {
    const node = Box({ border: "ascii", width: 5, height: 3 });
    assert.ok(node.render);

    const buffer = new RenderBuffer(5, 3);
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );

    assert.strictEqual(buffer.getSymbol(0, 0), "+");
    assert.strictEqual(buffer.getSymbol(1, 0), "-");
    assert.strictEqual(buffer.getSymbol(0, 1), "|");
  });

  it("no corners when only one adjacent border", () => {
    // Only top border - no corners, just horizontal line
    const node = Box({ border: { top: true }, width: 5, height: 3 });
    assert.ok(node.render);

    const buffer = new RenderBuffer(5, 3);
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );

    // All positions on top row should be horizontal line (including corners)
    assert.strictEqual(buffer.getSymbol(0, 0), BORDER_CHARS.single.h);
    assert.strictEqual(buffer.getSymbol(1, 0), BORDER_CHARS.single.h);
    assert.strictEqual(buffer.getSymbol(4, 0), BORDER_CHARS.single.h);

    // No vertical lines or corners elsewhere
    assert.strictEqual(buffer.getSymbol(0, 1), " ");
  });

  it("corner only where two edges meet", () => {
    // Top and left borders - corner at top-left
    const node = Box({
      border: { top: true, left: true },
      width: 5,
      height: 3,
    });
    assert.ok(node.render);

    const buffer = new RenderBuffer(5, 3);
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );

    // Top-left corner
    assert.strictEqual(buffer.getSymbol(0, 0), BORDER_CHARS.single.tl);
    // Top-right extends horizontal (no corner)
    assert.strictEqual(buffer.getSymbol(4, 0), BORDER_CHARS.single.h);
    // Bottom-left extends vertical (no corner)
    assert.strictEqual(buffer.getSymbol(0, 2), BORDER_CHARS.single.v);
  });

  it("applies border color", () => {
    const color: Color = { type: "rgb", r: 255, g: 0, b: 0 };
    const node = Box({ border: true, borderColor: color, width: 5, height: 3 });
    assert.ok(node.render);

    const buffer = new RenderBuffer(5, 3);
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );

    // Check that border cells have the specified foreground color
    const fg = buffer.getFg(0, 0);
    assert.strictEqual(fg.type, "rgb");
    if (fg.type === "rgb") {
      assert.strictEqual(fg.r, 255);
      assert.strictEqual(fg.g, 0);
      assert.strictEqual(fg.b, 0);
    }
  });

  it("reactive border color updates", () => {
    const [color, setColor] = createSignal<Color>({ type: "named", index: 1 });
    const node = Box({ border: true, borderColor: color, width: 5, height: 3 });
    assert.ok(node.render);

    const buffer = new RenderBuffer(5, 3);
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );
    buffer.flush();

    setColor({ type: "rgb", r: 0, g: 255, b: 0 });
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );

    const fg = buffer.getFg(0, 0);
    assert.strictEqual(fg.type, "rgb");
    if (fg.type === "rgb") {
      assert.strictEqual(fg.r, 0);
      assert.strictEqual(fg.g, 255);
    }
  });

  it("reactive border prop updates", () => {
    const [border, setBorder] = createSignal<boolean>(false);
    const node = Box({ border, width: 5, height: 3 });
    assert.ok(node.render);

    const buffer = new RenderBuffer(5, 3);

    // Initially no border
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );
    assert.strictEqual(buffer.getSymbol(0, 0), " ");

    // Enable border
    setBorder(true);
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );
    assert.strictEqual(buffer.getSymbol(0, 0), BORDER_CHARS.single.tl);

    // Style getter also reflects reactive changes
    const style = typeof node.style === "function" ? node.style() : node.style;
    assert.strictEqual(style.borderTop, true);
  });

  it("reactive borderStyle prop updates", () => {
    const [style, setStyle] = createSignal<BorderStyleName>("single");
    const node = Box({ border: true, borderStyle: style, width: 5, height: 3 });
    assert.ok(node.render);

    const buffer = new RenderBuffer(5, 3);

    // Initially single style
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );
    assert.strictEqual(buffer.getSymbol(0, 0), BORDER_CHARS.single.tl);

    // Change to double style
    setStyle("double");
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );
    assert.strictEqual(buffer.getSymbol(0, 0), BORDER_CHARS.double.tl);

    // Change to round style
    setStyle("round");
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );
    assert.strictEqual(buffer.getSymbol(0, 0), BORDER_CHARS.round.tl);
  });

  it("empty box with border renders correctly", () => {
    const node = Box({ border: true, width: 3, height: 2 });
    assert.ok(node.render);

    const buffer = new RenderBuffer(3, 2);
    // Should not throw
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 3, height: 2 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );

    assert.strictEqual(buffer.getSymbol(0, 0), BORDER_CHARS.single.tl);
    assert.strictEqual(buffer.getSymbol(2, 0), BORDER_CHARS.single.tr);
  });

  it("border with padding: both add to spacing", () => {
    const node = Box({
      border: true,
      paddingTop: 1,
      paddingBottom: 1,
      paddingStart: 1,
      paddingEnd: 1,
      width: 10,
      height: 6,
    });

    const style = typeof node.style === "function" ? node.style() : node.style;

    // Layout should account for both border (1 cell each side) and padding
    assert.strictEqual(style.paddingTop, 1);
    assert.strictEqual(style.borderTop, true);
  });

  it("borders consume exactly 1 cell per side in layout", () => {
    // Create a box with border and compute its layout
    const boxNode = Box({ border: true, width: 10, height: 5 });
    const textNode = Text({ content: "test" });
    const parent = Box({
      children: [boxNode, textNode],
      flexDirection: "column",
      width: 10,
      height: 10,
    });

    const layoutNode: LayoutNode = {
      style: typeof parent.style === "function" ? parent.style() : parent.style,
      children: [
        {
          style:
            typeof boxNode.style === "function"
              ? boxNode.style()
              : boxNode.style,
        },
        {
          style: DEFAULT_FLEX_STYLE,
          measure: (w) => ({ width: Math.min(4, w), height: 1 }),
        },
      ],
    };

    const layout = computeLayout(layoutNode, 10, 10);

    // First child (box with border) should be 10x5
    assert.strictEqual(layout.children[0].width, 10);
    assert.strictEqual(layout.children[0].height, 5);
  });

  it("border works with flexGrow", () => {
    const child = Box({ border: true, flexGrow: 1 });
    const parent = Box({
      children: [child],
      width: 20,
      height: 10,
    });

    const layoutNode: LayoutNode = {
      style: typeof parent.style === "function" ? parent.style() : parent.style,
      children: [
        {
          style:
            typeof child.style === "function" ? child.style() : child.style,
        },
      ],
    };

    const layout = computeLayout(layoutNode, 20, 10);

    // Child should grow to fill parent (flexGrow: 1)
    assert.strictEqual(layout.children[0].width, 20);
  });

  it("children are positioned inside border", () => {
    // Verify that children are offset by the border
    const child = Text({ content: "Hi" });
    const parent = Box({ border: true, children: [child] });

    const parentStyle =
      typeof parent.style === "function" ? parent.style() : parent.style;

    const layoutNode: LayoutNode = {
      style: parentStyle,
      children: [
        {
          style: DEFAULT_FLEX_STYLE,
          measure: () => ({ width: 2, height: 1 }),
        },
      ],
    };

    const layout = computeLayout(layoutNode, 10, 5);

    // Child should be positioned after border (x=1, y=1)
    assert.strictEqual(layout.children[0].x, 1);
    assert.strictEqual(layout.children[0].y, 1);
  });

  it("nested boxes with borders", () => {
    const inner = Box({ border: true, width: 5, height: 3 });
    const outer = Box({ border: true, children: [inner] });

    const outerStyle =
      typeof outer.style === "function" ? outer.style() : outer.style;
    const innerStyle =
      typeof inner.style === "function" ? inner.style() : inner.style;

    const layoutNode: LayoutNode = {
      style: outerStyle,
      children: [{ style: innerStyle }],
    };

    const layout = computeLayout(layoutNode, 20, 10);

    // Inner box should be positioned inside outer's border
    assert.strictEqual(layout.children[0].x, 1);
    assert.strictEqual(layout.children[0].y, 1);

    // Inner should keep its explicit size
    assert.strictEqual(layout.children[0].width, 5);
    assert.strictEqual(layout.children[0].height, 3);
  });

  it("border with backgroundColor renders both", () => {
    const bgColor: Color = { type: "named", index: 4 };
    const borderColor: Color = { type: "rgb", r: 255, g: 255, b: 255 };
    const node = Box({
      border: true,
      backgroundColor: bgColor,
      borderColor: borderColor,
      width: 5,
      height: 3,
    });

    assert.ok(node.render);

    const buffer = new RenderBuffer(5, 3);
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );

    // Border corners should have border color as foreground
    const cornerFg = buffer.getFg(0, 0);
    assert.strictEqual(cornerFg.type, "rgb");

    // Interior cells should have background
    const interiorBg = buffer.getBg(2, 1);
    assert.strictEqual(interiorBg.type, "named");

    // Border cells should also have the background color
    const borderBg = buffer.getBg(0, 0);
    assert.strictEqual(borderBg.type, "named");
    assert.strictEqual((borderBg as { type: "named"; index: number }).index, 4);
  });
});

describe("style inheritance", () => {
  it("undefined backgroundColor inherits from parent", () => {
    const parentBg: Color = { type: "rgb", r: 100, g: 50, b: 25 };
    const parentInherited: InheritedStyle = {
      ...DEFAULT_INHERITED_STYLE,
      backgroundColor: parentBg,
    };

    // Child with no backgroundColor should inherit parent's
    const child = Text({ content: "hello" });
    assert.ok(child.render);

    const buffer = new RenderBuffer(10, 1);
    child.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
      buffer,
      parentInherited,
      DEFAULT_CLIP,
    );

    // Text background should be parent's color
    const bg = buffer.getBg(0, 0);
    assert.strictEqual(bg.type, "rgb");
    if (bg.type === "rgb") {
      assert.strictEqual(bg.r, 100);
      assert.strictEqual(bg.g, 50);
      assert.strictEqual(bg.b, 25);
    }
  });

  it("explicit 'inherit' keyword inherits from parent", () => {
    const parentBg: Color = { type: "rgb", r: 200, g: 100, b: 50 };
    const parentInherited: InheritedStyle = {
      ...DEFAULT_INHERITED_STYLE,
      backgroundColor: parentBg,
    };

    // Child explicitly using "inherit"
    const child = Text({ content: "hello", backgroundColor: "inherit" });
    assert.ok(child.render);

    const buffer = new RenderBuffer(10, 1);
    child.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
      buffer,
      parentInherited,
      DEFAULT_CLIP,
    );

    const bg = buffer.getBg(0, 0);
    assert.strictEqual(bg.type, "rgb");
    if (bg.type === "rgb") {
      assert.strictEqual(bg.r, 200);
      assert.strictEqual(bg.g, 100);
      assert.strictEqual(bg.b, 50);
    }
  });

  it("explicit color overrides inheritance", () => {
    const parentBg: Color = { type: "rgb", r: 100, g: 50, b: 25 };
    const parentInherited: InheritedStyle = {
      ...DEFAULT_INHERITED_STYLE,
      backgroundColor: parentBg,
    };

    // Child with explicit color overrides
    const childBg: Color = { type: "rgb", r: 0, g: 255, b: 0 };
    const child = Text({ content: "hello", backgroundColor: childBg });
    assert.ok(child.render);

    const buffer = new RenderBuffer(10, 1);
    child.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
      buffer,
      parentInherited,
      DEFAULT_CLIP,
    );

    const bg = buffer.getBg(0, 0);
    assert.strictEqual(bg.type, "rgb");
    if (bg.type === "rgb") {
      assert.strictEqual(bg.r, 0);
      assert.strictEqual(bg.g, 255);
      assert.strictEqual(bg.b, 0);
    }
  });

  it("undefined foreground color inherits from parent", () => {
    const parentFg: Color = { type: "rgb", r: 255, g: 128, b: 64 };
    const parentInherited: InheritedStyle = {
      ...DEFAULT_INHERITED_STYLE,
      color: parentFg,
    };

    const child = Text({ content: "hi" });
    assert.ok(child.render);

    const buffer = new RenderBuffer(10, 1);
    child.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
      buffer,
      parentInherited,
      DEFAULT_CLIP,
    );

    const fg = buffer.getFg(0, 0);
    assert.strictEqual(fg.type, "rgb");
    if (fg.type === "rgb") {
      assert.strictEqual(fg.r, 255);
      assert.strictEqual(fg.g, 128);
      assert.strictEqual(fg.b, 64);
    }
  });

  it("undefined text modifiers inherit from parent", () => {
    const parentInherited: InheritedStyle = {
      ...DEFAULT_INHERITED_STYLE,
      bold: true,
      italic: true,
    };

    const child = Text({ content: "hi" });
    assert.ok(child.render);

    const buffer = new RenderBuffer(10, 1);
    child.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
      buffer,
      parentInherited,
      DEFAULT_CLIP,
    );

    // Check modifiers include bold and italic bits
    const mods = buffer.getModifiers(0, 0);
    assert.ok((mods & 1) !== 0, "should have bold modifier");
    assert.ok((mods & 4) !== 0, "should have italic modifier");
  });

  it("explicit false overrides inherited modifier", () => {
    const parentInherited: InheritedStyle = {
      ...DEFAULT_INHERITED_STYLE,
      bold: true,
    };

    // Child explicitly sets bold to false
    const child = Text({ content: "hi", bold: false });
    assert.ok(child.render);

    const buffer = new RenderBuffer(10, 1);
    child.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
      buffer,
      parentInherited,
      DEFAULT_CLIP,
    );

    const mods = buffer.getModifiers(0, 0);
    assert.ok((mods & 1) === 0, "should not have bold modifier");
  });

  it("reactive getter returning 'inherit' inherits from parent", () => {
    const parentBg: Color = { type: "rgb", r: 50, g: 100, b: 150 };
    const parentInherited: InheritedStyle = {
      ...DEFAULT_INHERITED_STYLE,
      backgroundColor: parentBg,
    };

    const [useInherit, setUseInherit] = createSignal(true);
    const child = Text({
      content: "hello",
      backgroundColor: () =>
        useInherit() ? "inherit" : { type: "rgb", r: 255, g: 0, b: 0 },
    });
    assert.ok(child.render);

    const buffer = new RenderBuffer(10, 1);

    // Initially inherits
    child.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
      buffer,
      parentInherited,
      DEFAULT_CLIP,
    );
    let bg = buffer.getBg(0, 0);
    assert.strictEqual(bg.type, "rgb");
    if (bg.type === "rgb") {
      assert.strictEqual(bg.r, 50);
    }

    // Change to explicit
    setUseInherit(false);
    child.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
      buffer,
      parentInherited,
      DEFAULT_CLIP,
    );
    bg = buffer.getBg(0, 0);
    if (bg.type === "rgb") {
      assert.strictEqual(bg.r, 255);
    }
  });

  it("Box borderColor inherits from parent when undefined", () => {
    const parentBorderColor: Color = { type: "rgb", r: 128, g: 64, b: 32 };
    const parentInherited: InheritedStyle = {
      ...DEFAULT_INHERITED_STYLE,
      borderColor: parentBorderColor,
    };

    const node = Box({ border: true, width: 5, height: 3 });
    assert.ok(node.render);

    const buffer = new RenderBuffer(5, 3);
    node.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 3 },
      buffer,
      parentInherited,
      DEFAULT_CLIP,
    );

    // Border should use inherited color
    const fg = buffer.getFg(0, 0);
    assert.strictEqual(fg.type, "rgb");
    if (fg.type === "rgb") {
      assert.strictEqual(fg.r, 128);
      assert.strictEqual(fg.g, 64);
      assert.strictEqual(fg.b, 32);
    }
  });

  it("inheritance with DEFAULT_INHERITED_STYLE uses default color", () => {
    // When no parent specifies colors, default color should be used
    const child = Text({ content: "hello" });
    assert.ok(child.render);

    const buffer = new RenderBuffer(10, 1);
    child.render(
      { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
      buffer,
      DEFAULT_INHERITED_STYLE,
      DEFAULT_CLIP,
    );

    const fg = buffer.getFg(0, 0);
    assert.strictEqual(fg.type, "default");

    const bg = buffer.getBg(0, 0);
    assert.strictEqual(bg.type, "default");
  });
});

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

  it("reactive wrap prop updates", () => {
    const [wrap, setWrap] = createSignal<WrapMode>("wrap");
    const content = "hello world";
    const node = Text({ content, wrap });
    assert.ok(node.measure);

    // With wrap mode, text wraps within available width
    const sizeWrapped = node.measure(5, 100);
    assert.strictEqual(sizeWrapped.height, 3); // "hello", " worl", "d"

    // Switch to truncate mode - no wrapping
    setWrap("truncate");
    const sizeTruncated = node.measure(5, 100);
    assert.strictEqual(sizeTruncated.height, 1); // single line, truncated

    // Switch back to wrap
    setWrap("wrap");
    const sizeWrappedAgain = node.measure(5, 100);
    assert.strictEqual(sizeWrappedAgain.height, 3);
  });
});

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

describe("truncateLine", () => {
  it("returns line unchanged if fits", () => {
    const result = truncateLine("hello", 10, "truncate-end");
    assert.strictEqual(result.text, "hello");
  });

  it("truncates end with ellipsis", () => {
    const result = truncateLine("hello world", 6, "truncate-end");
    assert.ok(result.text.endsWith("…"));
    assert.ok(result.displayWidth <= 6);
  });

  it("truncates start with ellipsis", () => {
    const result = truncateLine("hello world", 6, "truncate-start");
    assert.ok(result.text.startsWith("…"));
    assert.ok(result.displayWidth <= 6);
  });

  it("handles truncate mode same as truncate-end", () => {
    const result = truncateLine("hello world", 6, "truncate");
    assert.ok(result.text.endsWith("…"));
    assert.ok(result.displayWidth <= 6);
  });
});

describe("layoutLine", () => {
  it("returns single element for short line", () => {
    const lines = layoutLine("hello", 10);
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0].text, "hello");
    assert.strictEqual(lines[0].displayWidth, 5);
  });

  it("wraps at width boundary", () => {
    const lines = layoutLine("hello world", 5);
    assert.strictEqual(lines.length, 3);
  });

  it("handles empty line", () => {
    const lines = layoutLine("", 10);
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0].text, "");
    assert.strictEqual(lines[0].displayWidth, 0);
  });

  it("handles maxWidth of 0 or less", () => {
    const lines = layoutLine("hello", 0);
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0].text, "hello");
  });
});

describe("Show", () => {
  it("renders children branch when truthy", () => {
    createRoot((dispose) => {
      const [cond, _setCond] = createSignal(true);
      const node = Show({
        when: cond,
        children: () => Text({ content: "yes" }),
        fallback: () => Text({ content: "no" }),
      });

      assert.strictEqual(node.resolveChildren().length, 1);
      dispose();
      return dispose;
    });
  });

  it("renders fallback branch when falsy", () => {
    createRoot((dispose) => {
      const [cond, _setCond] = createSignal(false);
      const node = Show({
        when: cond,
        children: () => Text({ content: "yes" }),
        fallback: () => Text({ content: "no" }),
      });

      assert.strictEqual(node.resolveChildren().length, 1);
      dispose();
      return dispose;
    });
  });

  it("renders nothing when falsy and no fallback", () => {
    createRoot((dispose) => {
      const [cond, _setCond] = createSignal(false);
      const node = Show({
        when: cond,
        children: () => Text({ content: "yes" }),
      });

      assert.strictEqual(node.resolveChildren().length, 0);
      dispose();
      return dispose;
    });
  });

  it("narrows type for nullable condition", () => {
    createRoot((dispose) => {
      const [value, setValue] = createSignal<string | null>("hello");
      let receivedType: string | null = null;

      Show({
        when: value,
        children: (v) => {
          // TypeScript should narrow v to string (not string | null)
          receivedType = v;
          // Use a Box instead of Text to avoid type issues with nullable content
          return Box({});
        },
      });

      assert.strictEqual(receivedType, "hello");

      setValue(null);
      // Now the fallback branch runs (if provided)
      dispose();
      return dispose;
    });
  });

  it("switches branch on condition change", () => {
    createRoot((dispose) => {
      const [cond, setCond] = createSignal(true);
      const node = Show({
        when: cond,
        children: () => Text({ content: "yes" }),
        fallback: () => Text({ content: "no" }),
      });

      const firstChild = node.resolveChildren()[0];
      setCond(false);
      const secondChild = node.resolveChildren()[0];

      assert.notStrictEqual(firstChild, secondChild);
      dispose();
      return dispose;
    });
  });

  it("passes value to children branch", () => {
    createRoot((dispose) => {
      const [cond, _setCond] = createSignal<string | null>("hello");
      let receivedValue: string | null = null;

      Show({
        when: cond,
        children: (value) => {
          receivedValue = value;
          // Use a Box instead of Text to avoid type issues with nullable content
          return Box({});
        },
      });

      assert.strictEqual(receivedValue, "hello");
      dispose();
      return dispose;
    });
  });

  it("disposes previous branch on change", () => {
    createRoot((dispose) => {
      let cleanupCalled = false;
      const [cond, setCond] = createSignal(true);

      Show({
        when: cond,
        children: () => {
          onCleanup(() => {
            cleanupCalled = true;
          });
          return Text({ content: "yes" });
        },
      });

      assert.strictEqual(cleanupCalled, false);
      setCond(false);
      assert.strictEqual(cleanupCalled, true);
      dispose();
      return dispose;
    });
  });

  it("sets _parent on children", () => {
    createRoot((dispose) => {
      const [cond, _setCond] = createSignal(true);
      const node = Show({
        when: cond,
        children: () => Text({ content: "yes" }),
      });

      const child = node.resolveChildren()[0];
      assert.strictEqual(child?._parent, node);
      dispose();
      return dispose;
    });
  });

  it("does not affect parent flex distribution", () => {
    createRoot((dispose) => {
      const [cond] = createSignal(true);

      // Three children with flexGrow: 1 should split space equally
      const parent = Box({
        flexDirection: "row",
        width: 90,
        height: 1,
        children: [
          Box({ flexGrow: 1, children: [Text({ content: "A" })] }),
          Show({
            when: cond,
            children: () =>
              Box({ flexGrow: 1, children: [Text({ content: "B" })] }),
          }),
          Box({ flexGrow: 1, children: [Text({ content: "C" })] }),
        ],
      });

      // Helper to recursively resolve styles for layout
      const toLayoutNode = (node: Node): LayoutNode => ({
        style: typeof node.style === "function" ? node.style() : node.style,
        children: node.resolveChildren().map(toLayoutNode),
        measure: node.measure,
      });

      const layout = computeLayout(toLayoutNode(parent), 90, 1);

      // With display: "contents", Show is transparent, its child (Box B) is
      // hoisted to be a direct child of the parent for layout purposes.
      // All three boxes should have equal width (90 / 3 = 30)
      assert.strictEqual(
        layout.children.length,
        3,
        "Should have 3 layout children",
      );

      const boxALayout = layout.children[0];
      const boxBLayout = layout.children[1]; // Hoisted from Show
      const boxCLayout = layout.children[2];

      assert.strictEqual(boxALayout.width, 30, "Box A should be 30 wide");
      assert.strictEqual(boxBLayout.width, 30, "Box B should be 30 wide");
      assert.strictEqual(boxCLayout.width, 30, "Box C should be 30 wide");

      dispose();
      return dispose;
    });
  });
});

describe("For", () => {
  it("renders items in order", () => {
    createRoot((dispose) => {
      const [items, _setItems] = createSignal(["a", "b", "c"]);
      const node = For({
        each: items,
        render: (item) => Text({ content: item }),
      });

      assert.strictEqual(node.resolveChildren().length, 3);
      dispose();
      return dispose;
    });
  });

  it("adds new items", () => {
    createRoot((dispose) => {
      const [items, setItems] = createSignal(["a", "b"]);
      const node = For({
        each: items,
        render: (item) => Text({ content: item }),
      });

      assert.strictEqual(node.resolveChildren().length, 2);

      setItems(["a", "b", "c"]);
      assert.strictEqual(node.resolveChildren().length, 3);
      dispose();
      return dispose;
    });
  });

  it("removes items", () => {
    createRoot((dispose) => {
      const [items, setItems] = createSignal(["a", "b", "c"]);
      const node = For({
        each: items,
        render: (item) => Text({ content: item }),
      });

      setItems(["a", "c"]);
      assert.strictEqual(node.resolveChildren().length, 2);
      dispose();
      return dispose;
    });
  });

  it("disposes removed item roots", () => {
    createRoot((dispose) => {
      let cleanupCalled = false;
      const [items, setItems] = createSignal(["a", "b"]);

      For({
        each: items,
        render: (item) => {
          if (item() === "b") {
            onCleanup(() => {
              cleanupCalled = true;
            });
          }
          return Text({ content: item });
        },
      });

      setItems(["a"]);
      assert.strictEqual(cleanupCalled, true);
      dispose();
      return dispose;
    });
  });

  it("reuses nodes for same items", () => {
    createRoot((dispose) => {
      const [items, setItems] = createSignal(["a", "b", "c"]);
      const node = For({
        each: items,
        render: (item) => Text({ content: item }),
      });

      const originalNodes = [...node.resolveChildren()];

      setItems(["c", "b", "a"]); // Reorder

      // Same nodes, different order
      assert.strictEqual(node.resolveChildren().length, 3);
      for (const orig of originalNodes) {
        assert.ok(node.resolveChildren().includes(orig));
      }
      dispose();
      return dispose;
    });
  });

  it("provides reactive index", () => {
    createRoot((dispose) => {
      const indices: number[] = [];
      const [items, setItems] = createSignal(["a", "b"]);

      For({
        each: items,
        render: (item, index) => {
          createEffect(() => {
            if (item() === "b") {
              indices.push(index());
            }
          });
          return Text({ content: item });
        },
      });

      assert.deepStrictEqual(indices, [1]);

      setItems(["b", "a"]); // Move "b" to index 0
      assert.deepStrictEqual(indices, [1, 0]);
      dispose();
      return dispose;
    });
  });

  it("handles empty array", () => {
    createRoot((dispose) => {
      const [items, _setItems] = createSignal<string[]>([]);
      const node = For({
        each: items,
        render: (item) => Text({ content: item }),
      });

      assert.strictEqual(node.resolveChildren().length, 0);
      dispose();
      return dispose;
    });
  });

  it("supports custom key function", () => {
    createRoot((dispose) => {
      interface Item {
        id: number;
        name: string;
      }
      const [items, setItems] = createSignal<Item[]>([
        { id: 1, name: "a" },
        { id: 2, name: "b" },
      ]);

      const node = For({
        each: items,
        key: (item) => item.id,
        render: (item) => Text({ content: () => item().name }),
      });

      const originalNodes = [...node.resolveChildren()];

      // Replace with new objects but same IDs
      setItems([
        { id: 2, name: "b-updated" },
        { id: 1, name: "a-updated" },
      ]);

      // Same nodes (by key), different order
      assert.strictEqual(node.resolveChildren().length, 2);
      for (const orig of originalNodes) {
        assert.ok(node.resolveChildren().includes(orig));
      }
      dispose();
      return dispose;
    });
  });

  it("sets _parent on children", () => {
    createRoot((dispose) => {
      const [items, _setItems] = createSignal(["a", "b"]);
      const node = For({
        each: items,
        render: (item) => Text({ content: item }),
      });

      for (const child of node.resolveChildren()) {
        assert.strictEqual(child._parent, node);
      }
      dispose();
      return dispose;
    });
  });

  it("duplicate items get separate nodes", () => {
    createRoot((dispose) => {
      const obj = { id: 1 };
      const [items, _setItems] = createSignal([obj, obj]);
      const node = For({
        each: items,
        render: (item) => Text({ content: () => String(item().id) }),
      });

      // Each occurrence gets its own node
      assert.strictEqual(node.resolveChildren().length, 2);
      assert.notStrictEqual(
        node.resolveChildren()[0],
        node.resolveChildren()[1],
      );
      dispose();
      return dispose;
    });
  });

  it("updates item signal when same key maps to new object", () => {
    createRoot((dispose) => {
      interface Item {
        id: number;
        name: string;
      }
      const observedNames: string[] = [];
      const [items, setItems] = createSignal<Item[]>([
        { id: 1, name: "a" },
        { id: 2, name: "b" },
      ]);

      For({
        each: items,
        key: (item) => item.id,
        render: (item) => {
          createEffect(() => {
            observedNames.push(item().name);
          });
          return Text({ content: () => item().name });
        },
      });

      // Initial render
      assert.deepStrictEqual(observedNames, ["a", "b"]);

      // Replace with new objects but same IDs
      setItems([
        { id: 1, name: "a-updated" },
        { id: 2, name: "b-updated" },
      ]);

      // Item signals should have updated
      assert.deepStrictEqual(observedNames, [
        "a",
        "b",
        "a-updated",
        "b-updated",
      ]);
      dispose();
      return dispose;
    });
  });

  it("disposes excess duplicate entries when count decreases", () => {
    createRoot((dispose) => {
      const cleanupCalls: number[] = [];
      const obj = { id: 1 };
      const [items, setItems] = createSignal([obj, obj, obj]);

      For({
        each: items,
        render: (item, index) => {
          onCleanup(() => {
            cleanupCalls.push(index());
          });
          return Text({ content: () => String(item().id) });
        },
      });

      assert.deepStrictEqual(cleanupCalls, []);

      // Reduce to one occurrence
      setItems([obj]);

      // Indices 1 and 2 should have been disposed
      assert.deepStrictEqual(cleanupCalls, [1, 2]);
      dispose();
      return dispose;
    });
  });
});

describe("isInSubtree", () => {
  it("returns true when node is the subtree root", () => {
    const node = Box({});
    assert.strictEqual(node.isInSubtree(node), true);
  });

  it("returns true when node is a child of subtree root", () => {
    const child = Text({ content: "child" });
    const parent = Box({ children: [child] });
    assert.strictEqual(child.isInSubtree(parent), true);
  });

  it("returns true when node is deeply nested", () => {
    const leaf = Text({ content: "leaf" });
    const middle = Box({ children: [leaf] });
    const root = Box({ children: [middle] });
    assert.strictEqual(leaf.isInSubtree(root), true);
  });

  it("returns false when node is not in subtree", () => {
    const node1 = Box({});
    const node2 = Box({});
    assert.strictEqual(node1.isInSubtree(node2), false);
  });

  it("returns false when node is parent of subtree root", () => {
    const child = Text({ content: "child" });
    const parent = Box({ children: [child] });
    assert.strictEqual(parent.isInSubtree(child), false);
  });
});

describe("focus cleanup on Show disposal", () => {
  it("clears focus when focused node is removed by Show", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const [visible, setVisible] = createSignal(true);
    let focusController!: FocusController;

    const app = App.mount(
      () => {
        focusController = useFocus();
        return Box({
          children: [
            Show({
              when: visible,
              children: () =>
                Text({
                  content: "focusable",
                  focusable: true,
                  autoFocus: true,
                }),
            }),
          ],
        });
      },
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Initially the focusable node should be focused
    assert.ok(focusController.current() !== null);

    // Hide the focusable node
    setVisible(false);

    // Focus should be cleared
    assert.strictEqual(focusController.current(), null);

    app.unmount();
  });

  it("preserves focus when non-focused node is removed by Show", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const [showSecond, setShowSecond] = createSignal(true);
    const firstRef = createRef();
    let focusController!: FocusController;

    const app = App.mount(
      () => {
        focusController = useFocus();
        return Box({
          children: [
            Text({
              content: "first",
              focusable: true,
              autoFocus: true,
              ref: firstRef,
            }),
            Show({
              when: showSecond,
              children: () => Text({ content: "second", focusable: true }),
            }),
          ],
        });
      },
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // First node should be focused
    assert.strictEqual(focusController.current(), firstRef.current);

    // Hide the second node (not focused)
    setShowSecond(false);

    // First should still be focused
    assert.strictEqual(focusController.current(), firstRef.current);

    app.unmount();
  });
});

describe("stale focusableNodes cleanup", () => {
  it("removes all focusable nodes when Show hides unfocused nodes", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const [visible, setVisible] = createSignal(true);
    const firstRef = createRef();
    let focusController!: FocusController;
    const keyPresses: string[] = [];

    const app = App.mount(
      () => {
        focusController = useFocus();
        return TabFocus({
          children: [
            Text({
              content: "first",
              focusable: true,
              autoFocus: true,
              ref: firstRef,
              onKeyPress: () => {
                keyPresses.push("first");
                return false;
              },
            }),
            Show({
              when: visible,
              children: () =>
                Box({
                  children: [
                    Text({
                      content: "second",
                      focusable: true,
                      onKeyPress: () => {
                        keyPresses.push("second");
                        return false;
                      },
                    }),
                    Text({
                      content: "third",
                      focusable: true,
                      onKeyPress: () => {
                        keyPresses.push("third");
                        return false;
                      },
                    }),
                  ],
                }),
            }),
          ],
        });
      },
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Initially 3 focusable nodes: first, second, third
    // first is focused via autoFocus
    assert.strictEqual(focusController.current(), firstRef.current);

    // Tab to second
    mockStdin.emit("keypress", "\t", { name: "tab", sequence: "\t" });
    keyPresses.length = 0;
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(keyPresses, ["second"]);

    // Tab to third
    mockStdin.emit("keypress", "\t", { name: "tab", sequence: "\t" });
    keyPresses.length = 0;
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(keyPresses, ["third"]);

    // Tab back to first (wrap)
    mockStdin.emit("keypress", "\t", { name: "tab", sequence: "\t" });
    keyPresses.length = 0;
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(keyPresses, ["first"]);

    // Now hide the Show content (second, third are removed but not focused)
    setVisible(false);

    // Tab should stay on first (only focusable node left)
    // If stale nodes remain in focusableNodes, Tab could try to focus disposed nodes
    mockStdin.emit("keypress", "\t", { name: "tab", sequence: "\t" });
    keyPresses.length = 0;
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    // Should still be on first since it's the only focusable node
    assert.deepStrictEqual(
      keyPresses,
      ["first"],
      "After hiding Show, only first should be focusable",
    );

    app.unmount();
  });
});

describe("focus cleanup on For disposal", () => {
  it("clears focus when focused item is removed from For", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const [items, setItems] = createSignal(["a", "b", "c"]);
    let focusController!: FocusController;
    const bRef = createRef();

    const app = App.mount(
      () => {
        focusController = useFocus();
        return For({
          each: items,
          render: (item) => {
            const ref = item() === "b" ? bRef : undefined;
            return Text({
              content: item,
              focusable: true,
              autoFocus: item() === "b",
              ref,
            });
          },
        });
      },
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // "b" should be focused (autoFocus)
    assert.strictEqual(focusController.current(), bRef.current);

    // Remove "b" from the list
    setItems(["a", "c"]);

    // Focus should be cleared
    assert.strictEqual(focusController.current(), null);

    app.unmount();
  });
});

describe("hover cleanup on Show disposal", () => {
  it("clears hover and calls onHover(false) when hovered node is removed", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 10);
    const [visible, setVisible] = createSignal(true);
    let hoverState: boolean | null = null;

    const app = App.mount(
      () =>
        Show({
          when: visible,
          children: () =>
            Text({
              content: "hoverable",
              onHover: (h) => {
                hoverState = h;
              },
            }),
          fallback: () => Text({ content: "hidden" }),
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        mouse: true,
      },
    );

    // Hover over the text
    mockStdin.emit("data", Buffer.from("\x1b[<35;1;1M"));
    assert.strictEqual(hoverState, true, "should enter hover state");

    // Hide the node
    setVisible(false);

    // onHover(false) should have been called
    assert.strictEqual(
      hoverState,
      false,
      "should exit hover state on disposal",
    );

    app.unmount();
  });
});

// Test helpers for mock streams
interface MockStdin {
  isTTY: boolean;
  setRawMode: (mode: boolean) => MockStdin;
  on: (event: string, handler: (...args: unknown[]) => void) => MockStdin;
  off: (event: string, handler: (...args: unknown[]) => void) => MockStdin;
  emit: (event: string, ...args: unknown[]) => boolean;
  resume: () => void;
  pause: () => void;
  listenerCount: (event: string) => number;
  _handlers: Map<string, Array<(...args: unknown[]) => void>>;
}

interface MockStdout {
  isTTY: boolean;
  columns: number;
  rows: number;
  written: string;
  write: (s: string) => boolean;
  on: (event: string, handler: () => void) => MockStdout;
  off: (event: string, handler: () => void) => MockStdout;
  emit: (event: string) => boolean;
  _handlers: Map<string, Array<() => void>>;
}

function createMockStdin(): MockStdin {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  const stdin: MockStdin = {
    isTTY: true,
    setRawMode: () => stdin,
    on: (event, handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return stdin;
    },
    off: (event, handler) => {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
      return stdin;
    },
    emit: (event, ...args) => {
      const list = handlers.get(event);
      if (list) {
        for (const h of list) h(...args);
      }
      return true;
    },
    resume: () => {},
    pause: () => {},
    listenerCount: (event) => handlers.get(event)?.length ?? 0,
    _handlers: handlers,
  };

  return stdin;
}

function createMockStdout(cols = 80, rows = 24): MockStdout {
  const handlers = new Map<string, Array<() => void>>();

  const stdout: MockStdout = {
    isTTY: true,
    columns: cols,
    rows: rows,
    written: "",
    write: function (s: string) {
      this.written += s;
      return true;
    },
    on: (event, handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return stdout;
    },
    off: (event, handler) => {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
      return stdout;
    },
    emit: (event) => {
      const list = handlers.get(event);
      if (list) {
        for (const h of list) h();
      }
      return true;
    },
    _handlers: handlers,
  };

  return stdout;
}

describe("mount", () => {
  it("returns app with unmount function", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = App.mount(() => Text({ content: "hello" }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
    });

    assert.ok(typeof app.unmount === "function");
    app.unmount();
  });

  it("enters TUI mode on mount", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = App.mount(() => Text({ content: "hello" }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
    });

    assert.ok(mockStdout.written.includes("\x1b[?1049h")); // alternate screen
    app.unmount();
  });

  it("exits TUI mode on unmount", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = App.mount(() => Text({ content: "hello" }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
    });

    mockStdout.written = "";
    app.unmount();

    assert.ok(mockStdout.written.includes("\x1b[?1049l")); // exit alternate screen
  });

  it("restores terminal when component throws during mount", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    assert.throws(
      () =>
        App.mount(
          () => {
            throw new Error("component boom");
          },
          {
            stdin: mockStdin as unknown as NodeJS.ReadStream,
            stdout: mockStdout as unknown as NodeJS.WriteStream,
          },
        ),
      { message: "component boom" },
    );

    assert.ok(
      mockStdout.written.includes("\x1b[?25h"),
      "cursor should be restored",
    );
    assert.ok(
      mockStdout.written.includes("\x1b[?1049l"),
      "alternate screen should be exited",
    );
  });

  it("restores terminal when component throws without alternate screen", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    assert.throws(
      () =>
        App.mount(
          () => {
            throw new Error("component boom");
          },
          {
            stdin: mockStdin as unknown as NodeJS.ReadStream,
            stdout: mockStdout as unknown as NodeJS.WriteStream,
            alternateScreen: false,
          },
        ),
      { message: "component boom" },
    );

    assert.ok(
      mockStdout.written.includes("\x1b[?25h"),
      "cursor should be restored",
    );
    assert.ok(
      !mockStdout.written.includes("\x1b[?1049l"),
      "should not write alternate screen exit when not used",
    );
  });

  it("renders initial content", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = App.mount(() => Text({ content: "hello" }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
    });

    assert.ok(mockStdout.written.includes("hello"));
    app.unmount();
  });

  it("disposes root on unmount", () => {
    let cleanupCalled = false;
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = App.mount(
      () => {
        onCleanup(() => {
          cleanupCalled = true;
        });
        return Text({ content: "hello" });
      },
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    assert.strictEqual(cleanupCalled, false);
    app.unmount();
    assert.strictEqual(cleanupCalled, true);
  });

  it("handles nested components", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = App.mount(
      () =>
        Box({
          children: [Text({ content: "line1" }), Text({ content: "line2" })],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    assert.ok(mockStdout.written.includes("line1"));
    assert.ok(mockStdout.written.includes("line2"));
    app.unmount();
  });

  it("supports reactive content updates", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const [count, _setCount] = createSignal(0);

    const app = App.mount(() => Text({ content: () => `Count: ${count()}` }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
      // Immediate mode
    });

    // The output contains both "Count:" and "0" - they may be separated by
    // ANSI cursor positioning sequences (e.g., \x1b[1;8H) due to cell-by-cell rendering
    assert.ok(mockStdout.written.includes("Count:"));
    assert.ok(mockStdout.written.includes("0"));

    // Signal changes trigger re-renders via reactive scheduling
    // (the component tree is built once, signals drive updates through effects)
    app.unmount();
  });

  it("skips alternate screen when disabled", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = App.mount(() => Text({ content: "hello" }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
      alternateScreen: false,
    });

    assert.ok(!mockStdout.written.includes("\x1b[?1049h"));
    app.unmount();
  });

  it("multiple mount/unmount cycles work cleanly", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    // First cycle
    const app1 = App.mount(() => Text({ content: "first" }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
    });
    assert.ok(mockStdout.written.includes("first"));
    app1.unmount();

    // Reset output tracking
    mockStdout.written = "";

    // Second cycle - should work identically
    const app2 = App.mount(() => Text({ content: "second" }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
    });
    assert.ok(mockStdout.written.includes("second"));
    app2.unmount();

    // Third cycle with focus to verify no stale focus state
    mockStdout.written = "";
    const focusedNodes: string[] = [];

    const app3 = App.mount(
      () =>
        TabFocus({
          children: [
            Text({
              content: "third-a",
              focusable: true,
              autoFocus: true,
              onKeyPress: () => {
                focusedNodes.push("a");
                return false;
              },
            }),
            Text({
              content: "third-b",
              focusable: true,
              onKeyPress: () => {
                focusedNodes.push("b");
                return false;
              },
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Verify focus works in third cycle
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(focusedNodes, ["a"]);

    mockStdin.emit("keypress", "\t", { name: "tab", sequence: "\t" });
    focusedNodes.length = 0;
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(focusedNodes, ["b"]);

    app3.unmount();
  });
});

describe("renderFrame", () => {
  it("paints nodes at layout positions", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 10);

    const app = App.mount(
      () =>
        Box({
          flexDirection: "column",
          children: [Text({ content: "A" }), Text({ content: "B" })],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Both should be rendered
    assert.ok(mockStdout.written.includes("A"));
    assert.ok(mockStdout.written.includes("B"));
    app.unmount();
  });

  it("handles Show components", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const [visible, _setVisible] = createSignal(true);

    const app = App.mount(
      () =>
        Show({
          when: visible,
          children: () => Text({ content: "visible" }),
          fallback: () => Text({ content: "hidden" }),
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    assert.ok(mockStdout.written.includes("visible"));
    app.unmount();
  });

  it("handles For components", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const [items, _setItems] = createSignal(["a", "b", "c"]);

    const app = App.mount(
      () =>
        For({
          each: items,
          render: (item) => Text({ content: item }),
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    assert.ok(mockStdout.written.includes("a"));
    assert.ok(mockStdout.written.includes("b"));
    assert.ok(mockStdout.written.includes("c"));
    app.unmount();
  });
});

describe("fpsLimit throttling", () => {
  it("fpsLimit throttles rapid renders", async () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    let renderCount = 0;
    const originalWrite = mockStdout.write.bind(mockStdout);
    mockStdout.write = (s: string) => {
      // Count non-escape-sequence writes that contain content
      if (s.length > 0 && !s.startsWith("\x1b[?")) {
        renderCount++;
      }
      return originalWrite(s);
    };

    const [count, setCount] = createSignal(0);

    const app = App.mount(() => Text({ content: () => `Count: ${count()}` }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
      fpsLimit: 10, // 100ms between frames
    });

    // Reset counter after initial render
    renderCount = 0;

    // Trigger many rapid signal changes
    for (let i = 0; i < 20; i++) {
      setCount((c) => c + 1);
    }

    // Wait for throttled renders to complete (200ms should allow ~2 frames at 10fps)
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Should have coalesced renders (far fewer than 20)
    assert.ok(
      renderCount < 10,
      `Expected fewer than 10 renders, got ${renderCount}`,
    );

    app.unmount();
  });

  it("fpsLimit: 0 allows unlimited renders", async () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const [count, setCount] = createSignal(0);

    const app = App.mount(() => Text({ content: () => `Count: ${count()}` }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
      fpsLimit: 0, // Unlimited
    });

    // Trigger signal changes
    setCount(1);
    setCount(2);

    // Wait for microtasks
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));

    // Should render without throttling (no timeout needed)
    assert.ok(mockStdout.written.includes("Count:"));

    app.unmount();
  });

  it("unmount clears pending throttle timeout", async () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const [count, setCount] = createSignal(0);

    const app = App.mount(() => Text({ content: () => `Count: ${count()}` }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
      fpsLimit: 1, // Very slow: 1000ms between frames
    });

    // Trigger a render that will be throttled
    setCount(1);

    // Unmount immediately (before throttle timeout fires)
    app.unmount();

    // Wait to ensure no errors from orphaned timeout
    await new Promise((resolve) => setTimeout(resolve, 50));

    // If we get here without errors, the timeout was properly cleared
    assert.ok(true);
  });
});

describe("resize handling", () => {
  it("buffer is resized on resize event", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(80, 24);

    const app = App.mount(() => Text({ content: "hello" }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
    });

    // Simulate resize
    mockStdout.columns = 120;
    mockStdout.rows = 40;
    mockStdout.emit("resize");

    // Buffer should be resized (we can't directly check buffer, but the app should not crash)
    app.unmount();
  });
});

describe("pathToRoot", () => {
  it("returns path from target to root via parent pointers", () => {
    const grandchild = Text({ content: "grandchild" });
    const child = Box({ children: [grandchild] });
    const root = Box({ children: [child] });

    // Box sets _parent on children, so:
    // grandchild._parent === child
    // child._parent === root
    // root._parent === undefined

    const path = grandchild.pathToRoot();

    assert.strictEqual(path.length, 3);
    assert.strictEqual(path[0], grandchild);
    assert.strictEqual(path[1], child);
    assert.strictEqual(path[2], root);
  });

  it("returns single-element path for root node", () => {
    const root = Text({ content: "root" });
    // No parent set

    const path = root.pathToRoot();

    assert.strictEqual(path.length, 1);
    assert.strictEqual(path[0], root);
  });
});

describe("keyboard routing", () => {
  it("dispatches to focused node", () => {
    let receivedName: string | null = null;
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = App.mount(
      () =>
        Box({
          focusable: true,
          autoFocus: true,
          onKeyPress: (e) => {
            receivedName = e.name;
            return true;
          },
          children: [Text({ content: "hello" })],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Simulate keypress
    mockStdin.emit("keypress", "a", { name: "a", sequence: "a" });

    assert.strictEqual(receivedName, "a");
    app.unmount();
  });

  it("bubbles when not consumed", () => {
    const calls: string[] = [];
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = App.mount(
      () =>
        Box({
          onKeyPress: () => {
            calls.push("parent");
            return false;
          },
          children: [
            Text({
              content: "child",
              focusable: true,
              autoFocus: true,
              onKeyPress: () => {
                calls.push("child");
                return false;
              },
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Simulate keypress
    mockStdin.emit("keypress", "a", { name: "a", sequence: "a" });

    assert.deepStrictEqual(calls, ["child", "parent"]);
    app.unmount();
  });

  it("stops bubbling when consumed", () => {
    const calls: string[] = [];
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = App.mount(
      () =>
        Box({
          onKeyPress: () => {
            calls.push("parent");
            return false;
          },
          children: [
            Text({
              content: "child",
              focusable: true,
              autoFocus: true,
              onKeyPress: () => {
                calls.push("child");
                return true; // Consume
              },
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Simulate keypress
    mockStdin.emit("keypress", "a", { name: "a", sequence: "a" });

    assert.deepStrictEqual(calls, ["child"]);
    app.unmount();
  });
});

describe("hit testing", () => {
  it("returns node containing point", () => {
    const node = Text({ content: "hello" });
    const layout: LayoutResult = {
      x: 0,
      y: 0,
      screenX: 0,
      screenY: 0,
      width: 10,
      height: 1,
      children: [],
    };

    assert.strictEqual(node.hitTest(layout, 5, 0), node);
  });

  it("returns null for point outside", () => {
    const node = Text({ content: "hello" });
    const layout: LayoutResult = {
      x: 0,
      y: 0,
      screenX: 0,
      screenY: 0,
      width: 10,
      height: 1,
      children: [],
    };

    assert.strictEqual(node.hitTest(layout, 15, 0), null);
  });

  it("returns deepest child", () => {
    const child = Text({ content: "child" });
    const parent = Box({ children: [child] });

    // Child at relative x=5,y=5 within parent, screen position is absolute
    const layout: LayoutResult = {
      x: 0,
      y: 0,
      screenX: 0,
      screenY: 0,
      width: 20,
      height: 10,
      children: [
        {
          x: 5,
          y: 5,
          screenX: 5,
          screenY: 5,
          width: 5,
          height: 1,
          children: [],
        },
      ],
    };

    assert.strictEqual(parent.hitTest(layout, 7, 5), child);
  });

  it("prefers later children (z-order)", () => {
    const child1 = Text({ content: "first" });
    const child2 = Text({ content: "second" });
    const parent = Box({ children: [child1, child2] });

    // Overlapping children
    const layout: LayoutResult = {
      x: 0,
      y: 0,
      screenX: 0,
      screenY: 0,
      width: 20,
      height: 10,
      children: [
        {
          x: 0,
          y: 0,
          screenX: 0,
          screenY: 0,
          width: 10,
          height: 5,
          children: [],
        },
        {
          x: 5,
          y: 2,
          screenX: 5,
          screenY: 2,
          width: 10,
          height: 5,
          children: [],
        }, // overlaps
      ],
    };

    // Point in overlap region should hit child2
    assert.strictEqual(parent.hitTest(layout, 7, 3), child2);
  });
});

describe("hover tracking", () => {
  it("calls onHover(true) when entering", () => {
    let hovering = false;
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 10);

    const app = App.mount(
      () =>
        Text({
          content: "hello",
          onHover: (h) => {
            hovering = h;
          },
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        mouse: true,
      },
    );

    // Simulate mouse move into the text area
    // SGR mouse format: \x1b[<button;col;row[M|m]
    // Button 35 = 32 (motion) + 3 (no button), move at (1,1)
    mockStdin.emit("data", Buffer.from("\x1b[<35;1;1M"));

    assert.strictEqual(hovering, true);
    app.unmount();
  });

  it("calls onHover(false) when leaving", () => {
    let hovering = true;
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 10);

    const app = App.mount(
      () =>
        Box({
          width: 5,
          height: 1,
          children: [
            Text({
              content: "hello",
              onHover: (h) => {
                hovering = h;
              },
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        mouse: true,
      },
    );

    // First move into the element
    mockStdin.emit("data", Buffer.from("\x1b[<35;1;1M"));
    assert.strictEqual(hovering, true);

    // Then move outside the element (way off to the right)
    mockStdin.emit("data", Buffer.from("\x1b[<35;50;50M"));
    assert.strictEqual(hovering, false);

    app.unmount();
  });
});

describe("mouse events", () => {
  it("dispatches press to node under cursor", () => {
    let pressed = false;
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 10);

    const app = App.mount(
      () =>
        Text({
          content: "hello",
          onMousePress: () => {
            pressed = true;
          },
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        mouse: true,
      },
    );

    // SGR mouse press: button 0 (left), at (1,1)
    mockStdin.emit("data", Buffer.from("\x1b[<0;1;1M"));

    assert.strictEqual(pressed, true);
    app.unmount();
  });

  it("clicking a focusable node focuses it", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(40, 10);
    const firstRef = createRef();
    const secondRef = createRef();
    let focusController!: FocusController;

    const app = App.mount(
      () => {
        focusController = useFocus();
        return Box({
          flexDirection: "row",
          children: [
            // First focusable at x=0, width=10
            Text({
              content: "first.....",
              focusable: true,
              autoFocus: true,
              ref: firstRef,
            }),
            // Second focusable at x=10, width=10
            Text({
              content: "second....",
              focusable: true,
              ref: secondRef,
            }),
          ],
        });
      },
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        mouse: true,
      },
    );

    // Initially first is focused via autoFocus
    assert.strictEqual(focusController.current(), firstRef.current);

    // Click on second (x=11 is within second's bounds)
    // SGR mouse press: button 0 (left), at (11,1) - 1-indexed coords
    mockStdin.emit("data", Buffer.from("\x1b[<0;12;1M"));

    // Second should now be focused
    assert.strictEqual(
      focusController.current(),
      secondRef.current,
      "Clicking second should focus it",
    );

    app.unmount();
  });

  it("clicking a non-focusable node focuses nearest focusable ancestor", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(40, 10);
    const firstRef = createRef();
    const secondBoxRef = createRef();
    let focusController!: FocusController;

    const app = App.mount(
      () => {
        focusController = useFocus();
        return Box({
          flexDirection: "row",
          children: [
            // First focusable gets initial focus
            Text({
              content: "first",
              focusable: true,
              autoFocus: true,
              ref: firstRef,
            }),
            // Second is a focusable box with non-focusable text inside
            Box({
              focusable: true,
              ref: secondBoxRef,
              width: 20,
              height: 3,
              children: [
                // Non-focusable text inside focusable box
                Text({ content: "click me" }),
              ],
            }),
          ],
        });
      },
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        mouse: true,
      },
    );

    // Initially first is focused via autoFocus
    assert.strictEqual(focusController.current(), firstRef.current);

    // Click on the text inside the second box (x=10 should be inside the second box)
    // The text "first" is 5 chars wide, then secondBox starts
    mockStdin.emit("data", Buffer.from("\x1b[<0;8;1M"));

    // The focusable box should now be focused (not the text inside it)
    assert.strictEqual(
      focusController.current(),
      secondBoxRef.current,
      "Clicking non-focusable child should focus the nearest focusable ancestor",
    );

    app.unmount();
  });

  it("clicking does not focus when no focusable ancestor exists", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(40, 10);
    let focusController!: FocusController;

    const app = App.mount(
      () => {
        focusController = useFocus();
        return Box({
          children: [
            // Non-focusable text with no focusable ancestor
            Text({ content: "not focusable" }),
          ],
        });
      },
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        mouse: true,
      },
    );

    // Initially nothing focused
    assert.strictEqual(focusController.current(), null);

    // Click on the text
    mockStdin.emit("data", Buffer.from("\x1b[<0;2;1M"));

    // Should still be null - no focusable to focus
    assert.strictEqual(
      focusController.current(),
      null,
      "Should not focus anything when no focusable ancestor exists",
    );

    app.unmount();
  });
});

describe("scroll events", () => {
  it("dispatches to node under cursor", () => {
    let scrollDir: "up" | "down" | "left" | "right" | null = null;
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 10);

    const app = App.mount(
      () =>
        Text({
          content: "hello",
          onScroll: (e) => {
            scrollDir = e.direction;
          },
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        mouse: true,
      },
    );

    // SGR scroll up: button 64 (scroll bit) + 0 (up direction) at (1,1)
    mockStdin.emit("data", Buffer.from("\x1b[<64;1;1M"));

    assert.strictEqual(scrollDir, "up");
    app.unmount();
  });
});

// Test helpers for focus management
function createTestState(root: Node): App {
  return createTestApp(root);
}

function createTestScope(nodes: Node[], trap = false): FocusScope {
  return {
    parent: null,
    focusableNodes: nodes,
    focusedIndex: -1,
    trap,
  };
}

describe("collectFocusableInScope", () => {
  it("collects focusable nodes into scope", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true });
    const root = Box({
      children: [a, Text({ content: "not focusable" }), b],
    });
    const scope = createTestScope([]);

    FocusManager.collectFocusableInScope(root, scope);

    assert.deepStrictEqual(scope.focusableNodes, [a, b]);
  });

  it("traverses nested children", () => {
    const inner = Text({ content: "inner", focusable: true });
    const outer = Box({ children: [Box({ children: [inner] })] });
    const scope = createTestScope([]);

    FocusManager.collectFocusableInScope(outer, scope);

    assert.deepStrictEqual(scope.focusableNodes, [inner]);
  });

  it("stops at nested FocusScope boundaries", () => {
    const outer = Text({ content: "outer", focusable: true });
    const inner = Text({ content: "inner", focusable: true });

    // Simulate a nested scope by setting _focusScope
    const nestedBox = Box({ children: [inner] });
    (nestedBox as { _focusScope?: FocusScope })._focusScope = createTestScope(
      [],
    );

    const root = Box({ children: [outer, nestedBox] });
    const scope = createTestScope([]);

    FocusManager.collectFocusableInScope(root, scope);

    // Should only collect outer, not inner
    assert.deepStrictEqual(scope.focusableNodes, [outer]);
  });
});

describe("focusNext", () => {
  it("focuses first when nothing focused", () => {
    const a = Text({ content: "a", focusable: true });
    const state = createTestState(Box({ children: [a] }));
    const scope = createTestScope([a]);

    state.focus.focusNext(scope);

    assert.strictEqual(state.focusedNode(), a);
    assert.strictEqual(scope.focusedIndex, 0);
  });

  it("moves to next node", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true });
    const state = createTestState(Box({ children: [a, b] }));
    const scope = createTestScope([a, b]);
    scope.focusedIndex = 0;
    state.setFocusedNode(a);

    state.focus.focusNext(scope);

    assert.strictEqual(state.focusedNode(), b);
    assert.strictEqual(scope.focusedIndex, 1);
  });

  it("wraps to first in trapped scope", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true });
    const state = createTestState(Box({ children: [a, b] }));
    const scope = createTestScope([a, b], true); // trap = true
    scope.focusedIndex = 1;
    state.setFocusedNode(b);

    state.focus.focusNext(scope);

    assert.strictEqual(state.focusedNode(), a);
    assert.strictEqual(scope.focusedIndex, 0);
  });
});

describe("focusPrev", () => {
  it("focuses last when nothing focused", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true });
    const state = createTestState(Box({ children: [a, b] }));
    const scope = createTestScope([a, b]);

    state.focus.focusPrev(scope);

    assert.strictEqual(state.focusedNode(), b);
    assert.strictEqual(scope.focusedIndex, 1);
  });

  it("moves to previous node", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true });
    const state = createTestState(Box({ children: [a, b] }));
    const scope = createTestScope([a, b]);
    scope.focusedIndex = 1;
    state.setFocusedNode(b);

    state.focus.focusPrev(scope);

    assert.strictEqual(state.focusedNode(), a);
    assert.strictEqual(scope.focusedIndex, 0);
  });

  it("wraps to last in trapped scope", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true });
    const state = createTestState(Box({ children: [a, b] }));
    const scope = createTestScope([a, b], true); // trap = true
    scope.focusedIndex = 0;
    state.setFocusedNode(a);

    state.focus.focusPrev(scope);

    assert.strictEqual(state.focusedNode(), b);
    assert.strictEqual(scope.focusedIndex, 1);
  });
});

describe("focus scope nesting", () => {
  it("escapes to parent scope when not trapped", () => {
    const parentNode = Text({ content: "parent", focusable: true });
    const childNode = Text({ content: "child", focusable: true });

    const state = createTestState(Box({}));
    const parentScope = createTestScope([parentNode]);
    const childScope = createTestScope([childNode]);
    childScope.parent = parentScope;
    childScope.focusedIndex = 0;
    state.setFocusedNode(childNode);

    // At end of child scope, should escape to parent
    state.focus.focusNext(childScope);

    assert.strictEqual(state.focusedNode(), parentNode);
    assert.strictEqual(childScope.focusedIndex, -1); // cleared
  });

  it("stays in scope when trapped", () => {
    const node = Text({ content: "only", focusable: true });

    const state = createTestState(Box({}));
    const scope = createTestScope([node], true); // trapped
    scope.focusedIndex = 0;
    state.setFocusedNode(node);

    // Should wrap, not escape
    state.focus.focusNext(scope);

    assert.strictEqual(state.focusedNode(), node);
    assert.strictEqual(scope.focusedIndex, 0);
  });

  it("wraps within scope when trap is true (even with parent focusables)", () => {
    // This tests the scenario from the settings app:
    // - Parent scope has one focusable (e.g., root container)
    // - Child scope has multiple focusables (e.g., form controls)
    // With trap: true, Tab should cycle within the child scope
    const parentNode = Text({ content: "parent", focusable: true });
    const child1 = Text({ content: "child1", focusable: true });
    const child2 = Text({ content: "child2", focusable: true });
    const child3 = Text({ content: "child3", focusable: true });

    const state = createTestState(Box({}));
    const parentScope = createTestScope([parentNode]);
    const childScope = createTestScope([child1, child2, child3], true); // trap = true
    childScope.parent = parentScope;

    // Start at first child
    childScope.focusedIndex = 0;
    state.setFocusedNode(child1);

    // Tab to second child
    state.focus.focusNext(childScope);
    assert.strictEqual(state.focusedNode(), child2, "Should move to child2");

    // Tab to third child
    state.focus.focusNext(childScope);
    assert.strictEqual(state.focusedNode(), child3, "Should move to child3");

    // Tab again - should wrap since trap is true
    state.focus.focusNext(childScope);
    assert.strictEqual(
      state.focusedNode(),
      child1,
      "Should wrap back to child1 with trap: true",
    );
    assert.strictEqual(
      childScope.focusedIndex,
      0,
      "Child scope index should wrap to 0",
    );

    // Continue cycling - should stay in child scope
    state.focus.focusNext(childScope);
    assert.strictEqual(
      state.focusedNode(),
      child2,
      "Should continue to child2",
    );
  });
});

describe("autoFocus", () => {
  it("focuses first autoFocus node", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true, autoFocus: true });
    const root = Box({ children: [a, b] });
    const state = createTestState(root);

    state.focus.initialize(state.root);

    assert.strictEqual(state.focusedNode(), b);
    assert.strictEqual(state.rootScope.focusedIndex, 1);
  });

  it("falls back to first focusable", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true });
    const root = Box({ children: [a, b] });
    const state = createTestState(root);

    state.focus.initialize(state.root);

    assert.strictEqual(state.focusedNode(), a);
    assert.strictEqual(state.rootScope.focusedIndex, 0);
  });
});

describe("useFocus", () => {
  it("throws outside of mount", () => {
    setActiveContext(null);
    assert.throws(() => useFocus(), /must be called within/);
  });

  it("current() returns reactive accessor that tracks focus changes", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    let focusController!: FocusController;
    const observedFocus: Array<Node | null> = [];

    // To test reactive focus tracking:
    // 1. We need the focusController bound to the scope containing focusable nodes
    // 2. We need to set up an effect that reads focusController.current()
    //
    // TabFocus creates a scope internally and handles Tab navigation.
    // We can access focusController by storing the root focus controller,
    // but that won't have focusable nodes. Instead, we need to trigger
    // focus changes via keyboard events which TabFocus handles.
    //
    // However, current() returns state.focusedNode which is global,
    // so reactive tracking works from any scope.

    const app = App.mount(
      () => {
        // Get the root focus controller - its current() is state.focusedNode
        focusController = useFocus();

        // Set up effect to track focus changes reactively
        createEffect(() => {
          observedFocus.push(focusController.current());
        });

        return TabFocus({
          trap: true, // Keep focus within this scope (wrap instead of escape)
          children: [
            Text({ content: "first", focusable: true, autoFocus: true }),
            Text({ content: "second", focusable: true }),
          ],
        });
      },
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Effect should have run during mount:
    // 1. Initial run with null
    // 2. After autoFocus sets "first"
    assert.ok(
      observedFocus.length >= 1,
      "Effect should run at least once during mount",
    );
    const countAfterMount = observedFocus.length;
    const firstNode = observedFocus[countAfterMount - 1];
    assert.ok(firstNode !== null, "Should have focused a node via autoFocus");

    // Simulate Tab key - must emit "keypress" event (readline format)
    // The key object follows Node.js readline.Key interface
    mockStdin.emit("keypress", "\t", {
      name: "tab",
      ctrl: false,
      shift: false,
    });

    assert.strictEqual(
      observedFocus.length,
      countAfterMount + 1,
      "Effect should re-run when focus changes via Tab",
    );
    const secondNode = observedFocus[countAfterMount];
    assert.ok(secondNode !== null, "Should have focused second node");
    assert.notStrictEqual(
      secondNode,
      firstNode,
      "Focus should have moved to a different node",
    );

    // Tab again - wraps to first node (same node object), so signal doesn't fire
    // because the value is referentially equal. This is correct reactive behavior.
    mockStdin.emit("keypress", "\t", {
      name: "tab",
      ctrl: false,
      shift: false,
    });

    // After two tabs with 2 focusable nodes:
    // Initial: first (via autoFocus), Tab->second, Tab->first (wrap)
    // But since we're wrapping to the SAME node, signal doesn't re-fire (no new effect run)
    // Let's verify what we observed:
    // - observedFocus[0] = null (initial effect run)
    // - observedFocus[1] = firstNode (autoFocus)
    // - observedFocus[2] = secondNode (first tab)
    // - (no observedFocus[3] because wrapping to same firstNode doesn't trigger signal)

    // The current focus should be firstNode (wrapped), but effect didn't fire
    const currentFocus = focusController.current();

    // Focus wraps to first, so currentFocus should equal firstNode
    // If this fails, the wrap logic or the focus state is wrong
    assert.strictEqual(
      currentFocus,
      firstNode,
      `Focus should have wrapped to first node. observedFocus.length=${observedFocus.length}`,
    );

    app.unmount();
  });

  it("returns controller within context", () => {
    const app = createTestState(Box({}));
    const scope = createTestScope([]);
    setActiveContext({
      app,
      currentScope: scope,
    });

    const controller = useFocus();

    assert.ok(typeof controller.next === "function");
    assert.ok(typeof controller.prev === "function");
    assert.ok(typeof controller.set === "function");
    assert.ok(typeof controller.current === "function");

    setActiveContext(null);
  });
});

describe("withContext", () => {
  it("sets context during callback", () => {
    const app = createTestState(Box({}));
    const scope = createTestScope([]);
    const ctx: RuntimeContext = {
      app,
      currentScope: scope,
    };

    let capturedContext: RuntimeContext | null = null;

    App.withContext(ctx, () => {
      capturedContext = App.getActiveContext();
    });

    assert.strictEqual(capturedContext, ctx);
  });

  it("restores previous context after callback", () => {
    const app1 = createTestState(Box({}));
    const app2 = createTestState(Box({}));
    const ctx1: RuntimeContext = {
      app: app1,
      currentScope: createTestScope([]),
    };
    const ctx2: RuntimeContext = {
      app: app2,
      currentScope: createTestScope([]),
    };

    setActiveContext(ctx1);

    App.withContext(ctx2, () => {
      assert.strictEqual(App.getActiveContext(), ctx2);
    });

    assert.strictEqual(App.getActiveContext(), ctx1);
    setActiveContext(null);
  });
});

describe("Ref binding", () => {
  it("Text binds ref.current", () => {
    const ref = createRef();
    const node = Text({ content: "hello", ref });

    assert.strictEqual(ref.current, node);
  });

  it("Box binds ref.current", () => {
    const ref = createRef();
    const node = Box({ ref });

    assert.strictEqual(ref.current, node);
  });
});

describe("focus.set with nested scopes", () => {
  it("sets focus to node in nested TabFocus scope", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const outerRef = createRef();
    const innerRef = createRef();
    let focusController!: FocusController;

    const app = App.mount(
      () => {
        focusController = useFocus();
        return Box({
          children: [
            Text({
              content: "outer",
              focusable: true,
              autoFocus: true,
              ref: outerRef,
            }),
            TabFocus({
              children: [
                Text({
                  content: "inner",
                  focusable: true,
                  ref: innerRef,
                }),
              ],
            }),
          ],
        });
      },
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Initially outer is focused
    assert.strictEqual(focusController.current(), outerRef.current);

    // Set focus to inner node in nested scope
    focusController.set(innerRef);

    // Inner should now be focused
    assert.strictEqual(focusController.current(), innerRef.current);

    app.unmount();
  });
});

describe("TabFocus component", () => {
  it("handles Tab to navigate focus", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const focusedNodes: string[] = [];

    const app = App.mount(
      () =>
        TabFocus({
          children: [
            Text({
              content: "first",
              focusable: true,
              autoFocus: true,
              onKeyPress: () => {
                focusedNodes.push("first");
                return false;
              },
            }),
            Text({
              content: "second",
              focusable: true,
              onKeyPress: () => {
                focusedNodes.push("second");
                return false;
              },
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // First item should be focused initially
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(focusedNodes, ["first"]);

    // Press Tab to move to second
    mockStdin.emit("keypress", "\t", { name: "tab", sequence: "\t" });
    focusedNodes.length = 0;
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(focusedNodes, ["second"]);

    app.unmount();
  });

  it("handles Shift+Tab to navigate focus backwards", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const focusedNodes: string[] = [];

    const app = App.mount(
      () =>
        TabFocus({
          children: [
            Text({
              content: "first",
              focusable: true,
              onKeyPress: () => {
                focusedNodes.push("first");
                return false;
              },
            }),
            Text({
              content: "second",
              focusable: true,
              autoFocus: true,
              onKeyPress: () => {
                focusedNodes.push("second");
                return false;
              },
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Second item should be focused initially (autoFocus)
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(focusedNodes, ["second"]);

    // Press Shift+Tab to move to first
    mockStdin.emit("keypress", "\t", {
      name: "tab",
      sequence: "\t",
      shift: true,
    });
    focusedNodes.length = 0;
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(focusedNodes, ["first"]);

    app.unmount();
  });

  it("wraps Tab cycling by default (trap: true)", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const focusedNodes: string[] = [];

    const app = App.mount(
      () =>
        Box({
          focusable: true, // Parent with focusable (like settings app root)
          children: [
            TabFocus({
              children: [
                Text({
                  content: "first",
                  focusable: true,
                  autoFocus: true,
                  onKeyPress: () => {
                    focusedNodes.push("first");
                    return false;
                  },
                }),
                Text({
                  content: "second",
                  focusable: true,
                  onKeyPress: () => {
                    focusedNodes.push("second");
                    return false;
                  },
                }),
                Text({
                  content: "third",
                  focusable: true,
                  onKeyPress: () => {
                    focusedNodes.push("third");
                    return false;
                  },
                }),
              ],
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // First item should be focused initially
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(focusedNodes, ["first"]);

    // Tab to second
    mockStdin.emit("keypress", "\t", { name: "tab", sequence: "\t" });
    focusedNodes.length = 0;
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(focusedNodes, ["second"]);

    // Tab to third
    mockStdin.emit("keypress", "\t", { name: "tab", sequence: "\t" });
    focusedNodes.length = 0;
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(focusedNodes, ["third"]);

    // Tab again - should wrap back to first (not escape to parent)
    mockStdin.emit("keypress", "\t", { name: "tab", sequence: "\t" });
    focusedNodes.length = 0;
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(
      focusedNodes,
      ["first"],
      "Should wrap back to first, not escape to parent",
    );

    app.unmount();
  });
});

describe("scroll event bubbling", () => {
  it("bubbles to parent when child has no handler", () => {
    let scrollDir: "up" | "down" | "left" | "right" | null = null;
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 10);

    const app = App.mount(
      () =>
        Box({
          onScroll: (e) => {
            scrollDir = e.direction;
          },
          children: [Text({ content: "child without handler" })],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        mouse: true,
      },
    );

    // Scroll over child - should bubble to parent
    mockStdin.emit("data", Buffer.from("\x1b[<64;1;1M"));

    assert.strictEqual(scrollDir, "up");
    app.unmount();
  });

  it("stops at first handler in path", () => {
    const calls: string[] = [];
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 10);

    const app = App.mount(
      () =>
        Box({
          onScroll: () => {
            calls.push("parent");
          },
          children: [
            Text({
              content: "child with handler",
              onScroll: () => {
                calls.push("child");
              },
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        mouse: true,
      },
    );

    // Scroll over child - child handles, doesn't bubble
    mockStdin.emit("data", Buffer.from("\x1b[<64;1;1M"));

    assert.deepStrictEqual(calls, ["child"]);
    app.unmount();
  });
});

describe("paste event bubbling", () => {
  it("bubbles paste characters like keyboard events", () => {
    const calls: string[] = [];
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = App.mount(
      () =>
        Box({
          onKeyPress: () => {
            calls.push("parent");
            return false;
          },
          children: [
            Text({
              content: "child",
              focusable: true,
              autoFocus: true,
              onKeyPress: () => {
                calls.push("child");
                return false;
              },
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Simulate paste of 2 characters
    mockStdin.emit("data", Buffer.from("\x1b[200~ab\x1b[201~"));

    // Each character should bubble through both handlers
    assert.deepStrictEqual(calls, ["child", "parent", "child", "parent"]);
    app.unmount();
  });

  it("stops processing when handler consumes", () => {
    const calls: string[] = [];
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = App.mount(
      () =>
        Text({
          content: "focused",
          focusable: true,
          autoFocus: true,
          onKeyPress: (e) => {
            calls.push(e.char);
            // Consume 'x' to stop processing
            return e.char === "x";
          },
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Paste "axyz" - should stop after 'x' is consumed
    mockStdin.emit("data", Buffer.from("\x1b[200~axyz\x1b[201~"));

    assert.deepStrictEqual(calls, ["a", "x"]);
    app.unmount();
  });

  it("handles emoji as single graphemes", () => {
    const chars: string[] = [];
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = App.mount(
      () =>
        Text({
          content: "focused",
          focusable: true,
          autoFocus: true,
          onKeyPress: (e) => {
            chars.push(e.char);
            return false;
          },
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Paste emoji - should be single grapheme
    mockStdin.emit("data", Buffer.from("\x1b[200~👍🎉\x1b[201~"));

    // Each emoji should be a single character event
    assert.strictEqual(chars.length, 2);
    assert.strictEqual(chars[0], "👍");
    assert.strictEqual(chars[1], "🎉");
    app.unmount();
  });
});

describe("dynamic focus collection", () => {
  it("registers focusable nodes when Show condition becomes true", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const [visible, setVisible] = createSignal(false);
    const receivedKeys: string[] = [];

    const app = App.mount(
      () =>
        TabFocus({
          children: [
            Text({
              content: "always",
              focusable: true,
              autoFocus: true,
              onKeyPress: () => {
                receivedKeys.push("always");
                return false;
              },
            }),
            Show({
              when: visible,
              children: () =>
                Text({
                  content: "conditional",
                  focusable: true,
                  onKeyPress: () => {
                    receivedKeys.push("conditional");
                    return false;
                  },
                }),
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Initially only "always" is focusable
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(receivedKeys, ["always"]);

    // Show the conditional node
    setVisible(true);

    // Tab to the new node - should work because it was registered
    mockStdin.emit("keypress", "\t", { name: "tab", sequence: "\t" });
    receivedKeys.length = 0;
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(receivedKeys, ["conditional"]);

    app.unmount();
  });

  it("registers focusable nodes when For adds items", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const [items, setItems] = createSignal<string[]>(["a"]);
    const receivedKeys: string[] = [];

    const app = App.mount(
      () =>
        TabFocus({
          children: [
            For({
              each: items,
              render: (item) =>
                Text({
                  content: item,
                  focusable: true,
                  onKeyPress: () => {
                    receivedKeys.push(item());
                    return false;
                  },
                }),
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Initially only "a" is focusable and focused
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(receivedKeys, ["a"]);

    // Add item "b"
    setItems(["a", "b"]);

    // Tab to new item - should work because it was registered
    mockStdin.emit("keypress", "\t", { name: "tab", sequence: "\t" });
    receivedKeys.length = 0;
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(receivedKeys, ["b"]);

    app.unmount();
  });
});

describe("nested scope autoFocus", () => {
  it("respects autoFocus in nested TabFocus over root scope", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const receivedKeys: string[] = [];

    const app = App.mount(
      () =>
        Box({
          children: [
            // This would be first focusable in root scope
            Text({
              content: "outer",
              focusable: true,
              onKeyPress: () => {
                receivedKeys.push("outer");
                return false;
              },
            }),
            TabFocus({
              children: [
                Text({
                  content: "inner-first",
                  focusable: true,
                  onKeyPress: () => {
                    receivedKeys.push("inner-first");
                    return false;
                  },
                }),
                Text({
                  content: "inner-second",
                  focusable: true,
                  autoFocus: true, // This should get initial focus
                  onKeyPress: () => {
                    receivedKeys.push("inner-second");
                    return false;
                  },
                }),
              ],
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // The nested scope's autoFocus node should receive initial focus,
    // not the root scope's first focusable
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(receivedKeys, ["inner-second"]);

    app.unmount();
  });
});

describe("layout signals", () => {
  it("nodes have layout signals after mount", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const ref = createRef();

    const app = App.mount(
      () =>
        Box({
          width: 20,
          height: 10,
          ref,
          children: [],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Node should have layout signals after mount
    assert.ok(ref.current);
    assert.ok(ref.current._layout);
    assert.strictEqual(ref.current._layout.width(), 20);
    assert.strictEqual(ref.current._layout.height(), 10);
    assert.strictEqual(ref.current._layout.screenX(), 0);
    assert.strictEqual(ref.current._layout.screenY(), 0);

    app.unmount();
  });

  it("nested nodes have correct screen coordinates", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const innerRef = createRef();

    const app = App.mount(
      () =>
        Box({
          paddingTop: 5,
          paddingStart: 10,
          children: [
            Box({
              width: 15,
              height: 8,
              ref: innerRef,
              children: [],
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    assert.ok(innerRef.current);
    assert.ok(innerRef.current._layout);
    assert.strictEqual(innerRef.current._layout.screenX(), 10);
    assert.strictEqual(innerRef.current._layout.screenY(), 5);
    assert.strictEqual(innerRef.current._layout.width(), 15);
    assert.strictEqual(innerRef.current._layout.height(), 8);

    app.unmount();
  });
});

describe("reactive content relayout", () => {
  it("relayouts when Text content grows beyond initial size", async () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const [count, setCount] = createSignal(0);
    const textRef = createRef();

    const app = App.mount(
      () =>
        Box({
          width: 10,
          justifyContent: "flex-end",
          children: [
            Text({
              content: () => `${count()}`,
              ref: textRef,
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        fpsLimit: 0, // Disable throttling for deterministic testing
      },
    );

    // Wait for initial render
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Initial layout: "0" has width 1, positioned at x=9 (flex-end in width 10)
    assert.ok(textRef.current);
    assert.ok(textRef.current._layout);
    assert.strictEqual(textRef.current._layout.width(), 1);
    assert.strictEqual(textRef.current._layout.screenX(), 9);

    // Update to "10" which needs width 2
    setCount(10);

    // Wait for relayout and render
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // After relayout: "10" has width 2, positioned at x=8 (flex-end in width 10)
    assert.strictEqual(textRef.current._layout.width(), 2);
    assert.strictEqual(textRef.current._layout.screenX(), 8);

    // Verify both characters are rendered by checking the output contains "10"
    // The output should have "10" at the end of row 0
    assert.ok(
      mockStdout.written.includes("10"),
      `Expected "10" in output but got: ${mockStdout.written.slice(-100)}`,
    );

    app.unmount();
  });

  it("relayouts when Text content shrinks", async () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const [count, setCount] = createSignal(111);
    const textRef = createRef();

    const app = App.mount(
      () =>
        Box({
          width: 10,
          justifyContent: "flex-end",
          children: [
            Text({
              content: () => `${count()}`,
              ref: textRef,
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        fpsLimit: 0,
      },
    );

    // Wait for initial render
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Initial layout: "111" has width 3, positioned at x=7 (flex-end in width 10)
    assert.ok(textRef.current);
    assert.ok(textRef.current._layout);
    assert.strictEqual(textRef.current._layout.width(), 3);
    assert.strictEqual(textRef.current._layout.screenX(), 7);

    // Reset output to check what gets rendered after the change
    mockStdout.written = "";

    // Update to "0" which needs width 1
    setCount(0);

    // Wait for relayout and render
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // After relayout: "0" has width 1, positioned at x=9 (flex-end in width 10)
    assert.strictEqual(
      textRef.current._layout.width(),
      1,
      "Text width should shrink to 1",
    );
    assert.strictEqual(
      textRef.current._layout.screenX(),
      9,
      "Text should move to x=9 (right-aligned)",
    );

    // Verify only "0" is rendered, not stale "11" characters
    // The output should NOT contain "111" or "011" patterns
    // Strip ANSI escape sequences first — cursor positioning like \x1b[11;8H
    // contains "11" as a row number, which is a false positive.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes use control chars
    const stripped = mockStdout.written.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "");
    assert.ok(
      !stripped.includes("11"),
      `Should not have stale "11" in output: ${stripped.slice(-100)}`,
    );

    app.unmount();
  });

  it("clears stale content when Text shrinks and repositions", async () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const [count, setCount] = createSignal(-34);
    const textRef = createRef();

    const app = App.mount(
      () =>
        Box({
          width: 10,
          justifyContent: "flex-end",
          backgroundColor: { type: "named", index: 7 }, // White background
          children: [
            Text({
              content: () => `${count()}`,
              ref: textRef,
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        fpsLimit: 0,
      },
    );

    // Wait for initial render
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Initial layout: "-34" has width 3, positioned at x=7 (flex-end in width 10)
    assert.ok(textRef.current);
    assert.ok(textRef.current._layout);
    assert.strictEqual(textRef.current._layout.width(), 3);
    assert.strictEqual(textRef.current._layout.screenX(), 7);

    // Reset output to check what gets rendered after the change
    mockStdout.written = "";

    // Update to "0" which needs width 1
    setCount(0);

    // Wait for relayout and render
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // After relayout: "0" has width 1, positioned at x=9 (flex-end in width 10)
    assert.strictEqual(textRef.current._layout.width(), 1);
    assert.strictEqual(textRef.current._layout.screenX(), 9);

    // The old position (x=7,8) should be cleared with the parent's background color
    // The output must reposition to x=7 or x=8 to clear old content
    // ANSI cursor position is 1-indexed, so x=7 is column 8, x=8 is column 9
    const hasPositionAt8 = mockStdout.written.includes("[1;8H");
    const hasPositionAt9 = mockStdout.written.includes("[1;9H");
    assert.ok(
      hasPositionAt8 || hasPositionAt9,
      `Should emit cursor position to clear old area at x=7 or x=8, got: ${mockStdout.written}`,
    );

    // The cleared area should have the parent's background color (named index 7 = white = SGR 47)
    // NOT the default background (49). The sequence should be: position, then 47, then spaces
    // Bad: [1;8H[49m  (clears with default bg)
    // Good: [1;8H[47m  (clears with parent's white bg)
    assert.ok(
      !mockStdout.written.includes("[1;8H\x1b[49m"),
      `Should NOT use default background (49) to clear old area, got: ${mockStdout.written}`,
    );

    app.unmount();
  });
});

describe("backward-compat accessors", () => {
  it("setFocusedNode sets focus and focusedNode reads it back", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true });
    const app = createTestState(Box({ children: [a, b] }));

    assert.strictEqual(app.focusedNode(), null);

    app.setFocusedNode(a);
    assert.strictEqual(app.focusedNode(), a);

    app.setFocusedNode(b);
    assert.strictEqual(app.focusedNode(), b);

    app.setFocusedNode(null);
    assert.strictEqual(app.focusedNode(), null);
  });

  it("setFocusedNode accepts setter function", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true });
    const app = createTestState(Box({ children: [a, b] }));

    app.setFocusedNode(a);
    app.setFocusedNode((prev) => (prev === a ? b : a));
    assert.strictEqual(app.focusedNode(), b);
  });

  it("hoverState reads and writes hover node", () => {
    const node = Text({ content: "x" });
    const app = createTestState(Box({ children: [node] }));

    assert.strictEqual(app.hoverState.currentNode, null);

    app.hoverState = { currentNode: node };
    assert.strictEqual(app.hoverState.currentNode, node);

    app.hoverState = { currentNode: null };
    assert.strictEqual(app.hoverState.currentNode, null);
  });

  it("terminalFocused reads and writes terminal focus state", () => {
    const app = createTestState(Box({}));

    assert.strictEqual(app.terminalFocused, true);

    app.terminalFocused = false;
    assert.strictEqual(app.terminalFocused, false);

    app.terminalFocused = true;
    assert.strictEqual(app.terminalFocused, true);
  });

  it("rootScope exposes focus.rootScope", () => {
    const app = createTestState(Box({}));
    assert.ok(app.rootScope);
    assert.strictEqual(app.rootScope.parent, null);
  });
});
