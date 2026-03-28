import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import {
  type LayoutNode,
  type LayoutResult,
  computeLayout,
} from "../../src/core/layout.ts";
import {
  App,
  Box,
  DEFAULT_CLIP,
  DEFAULT_INHERITED_STYLE,
  type InheritedStyle,
  type Node,
  type Rect,
  createRef,
} from "../../src/core/runtime.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Input } from "../../src/ui/Input.ts";

// Helper to convert Node tree to LayoutNode tree for computeLayout
function toLayoutNode(node: Node): LayoutNode {
  const style = typeof node.style === "function" ? node.style() : node.style;
  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : node.children;
  return {
    style,
    measure: node.measure,
    children: children?.map(toLayoutNode),
  };
}

// Helper to paint a node tree recursively (simplified version of runtime's paintNode)
function paintTree(
  node: Node,
  layout: LayoutResult,
  buffer: RenderBuffer,
  inherited: InheritedStyle,
  clip: Rect,
): void {
  // Paint this node if it has a render function
  if (node.render) {
    node.render(layout, buffer, inherited, clip);
  }

  // Paint children
  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : (node.children ?? []);
  const childLayouts = layout.children ?? [];

  for (let i = 0; i < children.length && i < childLayouts.length; i++) {
    paintTree(children[i], childLayouts[i], buffer, inherited, clip);
  }
}

// Helper to render an Input node to a buffer
function renderInput(node: Node, width: number, height: number): RenderBuffer {
  const buffer = new RenderBuffer(width, height);
  const layoutNode = toLayoutNode(node);
  const layout = computeLayout(layoutNode, width, height);
  paintTree(node, layout, buffer, DEFAULT_INHERITED_STYLE, DEFAULT_CLIP);
  return buffer;
}

// Helper to create mock stdin for mount tests
function createMockStdin() {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    isTTY: true,
    setRawMode: function () {
      return this;
    },
    on: function (event: string, handler: (...args: unknown[]) => void) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return this;
    },
    off: function (event: string, handler: (...args: unknown[]) => void) {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
      return this;
    },
    emit: (event: string, ...args: unknown[]) => {
      const list = handlers.get(event);
      if (list) {
        for (const h of list) h(...args);
      }
      return true;
    },
    resume: () => {},
    pause: () => {},
    listenerCount: (event: string) => handlers.get(event)?.length ?? 0,
    _handlers: handlers,
  };
}

function createMockStdout(cols = 80, rows = 24) {
  const handlers = new Map<string, Array<() => void>>();
  return {
    isTTY: true,
    columns: cols,
    rows: rows,
    written: "",
    write: function (s: string) {
      this.written += s;
      return true;
    },
    on: function (event: string, handler: () => void) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return this;
    },
    off: function (event: string, handler: () => void) {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
      return this;
    },
    emit: (event: string) => {
      const list = handlers.get(event);
      if (list) {
        for (const h of list) h();
      }
      return true;
    },
    _handlers: handlers,
  };
}

// Helper to create a mouse press event
function mousePress(x: number, y: number, target: object = {}) {
  return {
    type: "mouse" as const,
    action: "press" as const,
    button: 0,
    x,
    y,
    ctrl: false,
    alt: false,
    shift: false,
    target,
  };
}

// Helper to create a basic key event
function keyEvent(
  name: string,
  char = "",
  modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {},
) {
  return {
    type: "key" as const,
    name,
    char,
    ctrl: modifiers.ctrl ?? false,
    alt: modifiers.alt ?? false,
    shift: modifiers.shift ?? false,
    sequence: char || name,
    target: {},
  };
}

// Default theme has paddingStart:1 on input. Text starts at column 1 in the buffer.
const p = 1;

describe("Input", () => {
  describe("rendering", () => {
    it("renders value when provided", () => {
      const node = Input({ value: "Hello", width: 10 });
      const buffer = renderInput(node, 10, 1);

      assert.strictEqual(buffer.getSymbol(p, 0), "H");
      assert.strictEqual(buffer.getSymbol(p + 1, 0), "e");
      assert.strictEqual(buffer.getSymbol(p + 2, 0), "l");
      assert.strictEqual(buffer.getSymbol(p + 3, 0), "l");
      assert.strictEqual(buffer.getSymbol(p + 4, 0), "o");
    });

    it("renders placeholder when empty", () => {
      const node = Input({ value: "", placeholder: "Enter text", width: 15 });
      const buffer = renderInput(node, 15, 1);

      assert.strictEqual(buffer.getSymbol(p, 0), "E");
      assert.strictEqual(buffer.getSymbol(p + 1, 0), "n");
      assert.strictEqual(buffer.getSymbol(p + 2, 0), "t");
    });

    it("renders reactive value", () => {
      const [value, setValue] = createSignal("Hello");
      const node = Input({ value, width: 10 });

      let buffer = renderInput(node, 10, 1);
      assert.strictEqual(buffer.getSymbol(p, 0), "H");

      setValue("World");
      buffer = renderInput(node, 10, 1);
      assert.strictEqual(buffer.getSymbol(p, 0), "W");
    });
  });

  describe("keyboard handling", () => {
    it("character input inserts at cursor", () => {
      let received = "";
      const node = Input({
        value: "",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(keyEvent("a", "a"));

      assert.strictEqual(result, true);
      assert.strictEqual(received, "a");
    });

    it("character input inserts at cursor position", () => {
      let received = "";
      const node = Input({
        value: "ac",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move cursor to start, then right once (to position 1)
      node.onKeyPress(keyEvent("home"));
      node.onKeyPress(keyEvent("right"));

      // Insert 'b' at position 1
      node.onKeyPress(keyEvent("b", "b"));

      assert.strictEqual(received, "abc");
    });

    it("backspace removes character before cursor", () => {
      let received = "";
      const node = Input({
        value: "abc",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move cursor to end
      node.onKeyPress(keyEvent("end"));

      // Backspace
      const result = node.onKeyPress(keyEvent("backspace"));

      assert.strictEqual(result, true);
      assert.strictEqual(received, "ab");
    });

    it("backspace at start does nothing", () => {
      let received: string | undefined;
      const node = Input({
        value: "abc",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move cursor to start, backspace should do nothing
      node.onKeyPress(keyEvent("home"));
      const result = node.onKeyPress(keyEvent("backspace"));

      assert.strictEqual(result, false);
      assert.strictEqual(received, undefined);
    });

    it("delete removes character at cursor", () => {
      let received = "";
      const node = Input({
        value: "abc",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move cursor to start, delete first char
      node.onKeyPress(keyEvent("home"));
      const result = node.onKeyPress(keyEvent("delete"));

      assert.strictEqual(result, true);
      assert.strictEqual(received, "bc");
    });

    it("delete at end does nothing", () => {
      let received: string | undefined;
      const node = Input({
        value: "abc",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move cursor to end
      node.onKeyPress(keyEvent("end"));

      // Delete at end should do nothing
      const result = node.onKeyPress(keyEvent("delete"));

      assert.strictEqual(result, false);
      assert.strictEqual(received, undefined);
    });

    it("left arrow moves cursor left", () => {
      let received = "";
      const node = Input({
        value: "abc",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move to end
      node.onKeyPress(keyEvent("end"));

      // Move left
      const result = node.onKeyPress(keyEvent("left"));
      assert.strictEqual(result, true);

      // Insert character - should be before 'c'
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "abXc");
    });

    it("right arrow moves cursor right", () => {
      let received = "";
      const node = Input({
        value: "abc",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move to start, then right
      node.onKeyPress(keyEvent("home"));
      const result = node.onKeyPress(keyEvent("right"));
      assert.strictEqual(result, true);

      // Insert character - should be after 'a'
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "aXbc");
    });

    it("home moves cursor to start", () => {
      let received = "";
      const node = Input({
        value: "abc",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move to end first
      node.onKeyPress(keyEvent("end"));

      // Home
      const result = node.onKeyPress(keyEvent("home"));
      assert.strictEqual(result, true);

      // Insert at start
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "Xabc");
    });

    it("end moves cursor to end", () => {
      let received = "";
      const node = Input({
        value: "abc",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // End
      const result = node.onKeyPress(keyEvent("end"));
      assert.strictEqual(result, true);

      // Insert at end
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "abcX");
    });

    it("Ctrl+A moves cursor to start", () => {
      let received = "";
      const node = Input({
        value: "abc",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move to end first
      node.onKeyPress(keyEvent("end"));

      // Ctrl+A
      const result = node.onKeyPress(keyEvent("a", "", { ctrl: true }));
      assert.strictEqual(result, true);

      // Insert at start
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "Xabc");
    });

    it("Ctrl+E moves cursor to end", () => {
      let received = "";
      const node = Input({
        value: "abc",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Ctrl+E
      const result = node.onKeyPress(keyEvent("e", "", { ctrl: true }));
      assert.strictEqual(result, true);

      // Insert at end
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "abcX");
    });

    it("Ctrl+K deletes from cursor to end", () => {
      let received = "";
      const node = Input({
        value: "abcdef",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move to start, then right twice (cursor at position 2)
      node.onKeyPress(keyEvent("home"));
      node.onKeyPress(keyEvent("right"));
      node.onKeyPress(keyEvent("right"));

      // Ctrl+K
      const result = node.onKeyPress(keyEvent("k", "", { ctrl: true }));
      assert.strictEqual(result, true);
      assert.strictEqual(received, "ab");
    });

    it("Ctrl+U deletes from start to cursor", () => {
      let received = "";
      const node = Input({
        value: "abcdef",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move to start, then right twice (cursor at position 2)
      node.onKeyPress(keyEvent("home"));
      node.onKeyPress(keyEvent("right"));
      node.onKeyPress(keyEvent("right"));

      // Ctrl+U
      const result = node.onKeyPress(keyEvent("u", "", { ctrl: true }));
      assert.strictEqual(result, true);
      assert.strictEqual(received, "cdef");
    });

    it("Enter is not handled (returns false)", () => {
      const node = Input({
        value: "test value",
      });

      assert.ok(node.onKeyPress);

      // Enter should not be handled in single-line input
      const result = node.onKeyPress(keyEvent("enter"));
      assert.strictEqual(result, false);
    });

    it("onChange fires on edits", () => {
      const changes: string[] = [];
      const [value, setValue] = createSignal("");
      const node = Input({
        value,
        onChange: (v) => {
          changes.push(v);
          setValue(v); // Update value for controlled input
        },
      });

      assert.ok(node.onKeyPress);

      node.onKeyPress(keyEvent("a", "a"));
      node.onKeyPress(keyEvent("b", "b"));
      node.onKeyPress(keyEvent("c", "c"));

      assert.deepStrictEqual(changes, ["a", "ab", "abc"]);
    });
  });

  describe("disabled state", () => {
    it("disabled input ignores character input", () => {
      let received: string | undefined;
      const node = Input({
        value: "test",
        disabled: true,
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      const result = node.onKeyPress(keyEvent("a", "a"));
      assert.strictEqual(result, false);
      assert.strictEqual(received, undefined);
    });

    it("disabled input ignores navigation", () => {
      const node = Input({
        value: "test",
        disabled: true,
      });

      assert.ok(node.onKeyPress);

      const result = node.onKeyPress(keyEvent("left"));
      assert.strictEqual(result, false);
    });

    it("reactive disabled prop updates behavior", () => {
      const [disabled, setDisabled] = createSignal(false);
      const changes: string[] = [];
      const node = Input({
        value: "",
        disabled,
        onChange: (v) => changes.push(v),
      });

      assert.ok(node.onKeyPress);

      // Not disabled - should work
      node.onKeyPress(keyEvent("a", "a"));
      assert.deepStrictEqual(changes, ["a"]);

      // Now disable
      setDisabled(true);
      node.onKeyPress(keyEvent("b", "b"));
      assert.deepStrictEqual(changes, ["a"]); // Should not have changed
    });
  });

  describe("cursor position", () => {
    it("cursor starts at end of initial value", () => {
      let received = "";
      const node = Input({
        value: "hello",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Insert character without moving cursor - should append at end
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "helloX");
    });

    it("cursor stays within bounds", () => {
      let received = "";
      const node = Input({
        value: "ab",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Try to move left past start
      node.onKeyPress(keyEvent("left"));
      node.onKeyPress(keyEvent("left"));
      node.onKeyPress(keyEvent("left")); // Should stay at 0

      // Insert at start
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "Xab");
    });

    it("cursor position clamps on external value change", () => {
      const [value, setValue] = createSignal("abcdef");
      let received = "";
      const node = Input({
        value,
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move cursor to end (position 6)
      node.onKeyPress(keyEvent("end"));

      // External change to shorter value
      setValue("ab");

      // Cursor should be clamped to position 2 (end of new value)
      // Insert character - should be at end
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "abX");
    });
  });

  describe("focus", () => {
    it("is focusable by default", () => {
      const node = Input({ value: "" });
      assert.strictEqual(node.focusable, true);
    });

    it("focusable: false makes it not focusable", () => {
      const node = Input({ value: "", focusable: false });
      assert.strictEqual(node.focusable, false);
    });

    it("autoFocus prop is passed through", () => {
      const node = Input({ value: "", autoFocus: true });
      assert.strictEqual(node.autoFocus, true);
    });

    it("ref is bound to the node", () => {
      const ref = createRef();
      const node = Input({ value: "", ref });
      assert.strictEqual(ref.current, node);
    });
  });

  describe("style overrides", () => {
    it("applies style overrides", () => {
      const node = Input({
        value: "",
        style: { marginTop: 2, marginStart: 1 },
      });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.marginTop, 2);
      assert.strictEqual(style.marginStart, 1);
    });

    it("uses specified width", () => {
      const node = Input({ value: "", width: 30 });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.width, 30);
    });

    it("uses default width of 20", () => {
      const node = Input({ value: "" });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.width, 20);
    });
  });

  describe("measurement", () => {
    it("computes layout correctly", () => {
      const node = Input({ value: "Hello", width: 15 });

      const layoutNode = toLayoutNode(node);
      const layout = computeLayout(layoutNode, 100, 100);
      assert.strictEqual(layout.width, 15);
      // Height is 1 (single line) plus any padding from theme
      assert.ok(layout.height >= 1);
    });
  });

  describe("controlled input rendering", () => {
    it("renders newly typed character immediately", () => {
      // This test verifies that when typing a character, the rendered output
      // shows the new character immediately, not on the next keystroke.
      // This catches a bug where cursor position updates before the controlled
      // value propagates back, causing the new character to be invisible.
      const [value, setValue] = createSignal("");
      const node = Input({
        value,
        onChange: setValue,
        width: 10,
      });

      assert.ok(node.onKeyPress);

      // Type 'a'
      node.onKeyPress(keyEvent("a", "a"));

      // Render immediately after typing
      let buffer = renderInput(node, 10, 1);

      assert.strictEqual(buffer.getSymbol(p, 0), "a");

      // Type 'b'
      node.onKeyPress(keyEvent("b", "b"));
      buffer = renderInput(node, 10, 1);

      assert.strictEqual(buffer.getSymbol(p, 0), "a");
      assert.strictEqual(buffer.getSymbol(p + 1, 0), "b");

      // Type 'c'
      node.onKeyPress(keyEvent("c", "c"));
      buffer = renderInput(node, 10, 1);

      assert.strictEqual(buffer.getSymbol(p, 0), "a");
      assert.strictEqual(buffer.getSymbol(p + 1, 0), "b");
      assert.strictEqual(buffer.getSymbol(p + 2, 0), "c");
    });

    it("renders character inserted in middle immediately", () => {
      const [value, setValue] = createSignal("ac");
      const node = Input({
        value,
        onChange: setValue,
        width: 10,
      });

      assert.ok(node.onKeyPress);

      // Move cursor to position 1 (between 'a' and 'c')
      node.onKeyPress(keyEvent("home"));
      node.onKeyPress(keyEvent("right"));

      // Type 'b' in the middle
      node.onKeyPress(keyEvent("b", "b"));

      // Render immediately
      const buffer = renderInput(node, 10, 1);

      assert.strictEqual(buffer.getSymbol(p, 0), "a");
      assert.strictEqual(buffer.getSymbol(p + 1, 0), "b");
      assert.strictEqual(buffer.getSymbol(p + 2, 0), "c");
    });
  });

  describe("mouse click", () => {
    it("moves cursor to clicked position", () => {
      const [value, setValue] = createSignal("hello");
      let received = "";
      const node = Input({
        value,
        onChange: (v) => {
          received = v;
          setValue(v);
        },
        width: 10,
      });

      renderInput(node, 10, 1);

      assert.ok(node.onMousePress);
      // Click at screen column p+2; lastScreenX=p so relCol=2
      node.onMousePress(mousePress(p + 2, 0, node));

      assert.ok(node.onKeyPress);
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "heXllo");
    });

    it("clicking at column 0 moves cursor to start", () => {
      const [value, setValue] = createSignal("hello");
      let received = "";
      const node = Input({
        value,
        onChange: (v) => {
          received = v;
          setValue(v);
        },
        width: 10,
      });

      renderInput(node, 10, 1);

      assert.ok(node.onMousePress);
      node.onMousePress(mousePress(0, 0, node));

      assert.ok(node.onKeyPress);
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "Xhello");
    });

    it("clicking past end of text moves cursor to end", () => {
      const [value, setValue] = createSignal("hi");
      let received = "";
      const node = Input({
        value,
        onChange: (v) => {
          received = v;
          setValue(v);
        },
        width: 10,
      });

      renderInput(node, 10, 1);

      assert.ok(node.onMousePress);
      node.onMousePress(mousePress(8, 0, node));

      assert.ok(node.onKeyPress);
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "hiX");
    });
  });

  describe("integration", () => {
    it("works within mounted app", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const [value, setValue] = createSignal("");

      const app = App.mount(
        () =>
          Box({
            children: [
              Input({
                value,
                onChange: setValue,
                placeholder: "Enter text",
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Verify component structure is correct
      assert.ok(app.unmount);

      app.unmount();
    });
  });
});
