import assert from "node:assert";
import { describe, it } from "node:test";
import { DIM, Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import {
  Box,
  DEFAULT_CLIP,
  DEFAULT_INHERITED_STYLE,
  Text,
  createRef,
  mount,
} from "../../src/core/runtime.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Button } from "../../src/ui/button.ts";

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

describe("Button", () => {
  describe("rendering", () => {
    it("renders string children as text", () => {
      const node = Button({ children: "Click me" });

      const textNode = node.children?.[0];
      assert.ok(textNode?.render);

      const buffer = new RenderBuffer(8, 1);
      textNode.render(
        0,
        0,
        8,
        1,
        buffer,
        DEFAULT_INHERITED_STYLE,
        DEFAULT_CLIP,
      );

      assert.strictEqual(buffer.getSymbol(0, 0), "C");
      assert.strictEqual(buffer.getSymbol(1, 0), "l");
      assert.strictEqual(buffer.getSymbol(2, 0), "i");
      assert.strictEqual(buffer.getSymbol(3, 0), "c");
      assert.strictEqual(buffer.getSymbol(4, 0), "k");
      assert.strictEqual(buffer.getSymbol(5, 0), " ");
      assert.strictEqual(buffer.getSymbol(6, 0), "m");
      assert.strictEqual(buffer.getSymbol(7, 0), "e");
    });

    it("renders function children reactively", () => {
      const [label, setLabel] = createSignal("Hello");
      const node = Button({ children: label });

      const textNode = node.children?.[0];
      assert.ok(textNode?.render);

      const buffer = new RenderBuffer(5, 1);

      // Initial render
      textNode.render(
        0,
        0,
        5,
        1,
        buffer,
        DEFAULT_INHERITED_STYLE,
        DEFAULT_CLIP,
      );
      assert.strictEqual(buffer.getSymbol(0, 0), "H");
      assert.strictEqual(buffer.getSymbol(1, 0), "e");
      assert.strictEqual(buffer.getSymbol(2, 0), "l");
      assert.strictEqual(buffer.getSymbol(3, 0), "l");
      assert.strictEqual(buffer.getSymbol(4, 0), "o");

      // Update label
      setLabel("World");
      buffer.flush();
      textNode.render(
        0,
        0,
        5,
        1,
        buffer,
        DEFAULT_INHERITED_STYLE,
        DEFAULT_CLIP,
      );
      assert.strictEqual(buffer.getSymbol(0, 0), "W");
      assert.strictEqual(buffer.getSymbol(1, 0), "o");
      assert.strictEqual(buffer.getSymbol(2, 0), "r");
      assert.strictEqual(buffer.getSymbol(3, 0), "l");
      assert.strictEqual(buffer.getSymbol(4, 0), "d");
    });

    it("renders Node children directly", () => {
      const textChild = Text({ content: "Custom" });
      const node = Button({ children: textChild });

      // Should have the Text node directly as child
      assert.strictEqual(node.children?.[0], textChild);
    });

    it("renders array of Node children", () => {
      const child1 = Text({ content: "A" });
      const child2 = Text({ content: "B" });
      const node = Button({ children: [child1, child2] });

      assert.strictEqual(node.children?.length, 2);
      assert.strictEqual(node.children?.[0], child1);
      assert.strictEqual(node.children?.[1], child2);
    });
  });

  describe("keyboard handling", () => {
    it("onClick fires on Enter key", () => {
      let clicked = false;
      const node = Button({
        children: "Test",
        onClick: () => {
          clicked = true;
        },
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress({
        type: "key",
        name: "enter",
        char: "",
        ctrl: false,
        alt: false,
        shift: false,
        sequence: "\r",
        target: node,
      });

      assert.strictEqual(result, true);
      assert.strictEqual(clicked, true);
    });

    it("onClick fires on Space key", () => {
      let clicked = false;
      const node = Button({
        children: "Test",
        onClick: () => {
          clicked = true;
        },
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress({
        type: "key",
        name: "space",
        char: " ",
        ctrl: false,
        alt: false,
        shift: false,
        sequence: " ",
        target: node,
      });

      assert.strictEqual(result, true);
      assert.strictEqual(clicked, true);
    });

    it("other keys do not trigger onClick", () => {
      let clicked = false;
      const node = Button({
        children: "Test",
        onClick: () => {
          clicked = true;
        },
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress({
        type: "key",
        name: "a",
        char: "a",
        ctrl: false,
        alt: false,
        shift: false,
        sequence: "a",
        target: node,
      });

      assert.strictEqual(result, false);
      assert.strictEqual(clicked, false);
    });
  });

  describe("mouse handling", () => {
    it("onClick fires on mouse click", () => {
      let clicked = false;
      const node = Button({
        children: "Test",
        onClick: () => {
          clicked = true;
        },
      });

      assert.ok(node.onMousePress);
      node.onMousePress({
        type: "mouse",
        action: "press",
        button: 0,
        x: 0,
        y: 0,
        ctrl: false,
        alt: false,
        shift: false,
        target: node,
      });

      assert.strictEqual(clicked, true);
    });
  });

  describe("disabled state", () => {
    it("disabled button does not fire onClick on Enter", () => {
      let clicked = false;
      const node = Button({
        children: "Test",
        disabled: true,
        onClick: () => {
          clicked = true;
        },
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress({
        type: "key",
        name: "enter",
        char: "",
        ctrl: false,
        alt: false,
        shift: false,
        sequence: "\r",
        target: node,
      });

      assert.strictEqual(result, false);
      assert.strictEqual(clicked, false);
    });

    it("disabled button does not fire onClick on Space", () => {
      let clicked = false;
      const node = Button({
        children: "Test",
        disabled: true,
        onClick: () => {
          clicked = true;
        },
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress({
        type: "key",
        name: "space",
        char: " ",
        ctrl: false,
        alt: false,
        shift: false,
        sequence: " ",
        target: node,
      });

      assert.strictEqual(result, false);
      assert.strictEqual(clicked, false);
    });

    it("disabled button does not fire onClick on mouse click", () => {
      let clicked = false;
      const node = Button({
        children: "Test",
        disabled: true,
        onClick: () => {
          clicked = true;
        },
      });

      assert.ok(node.onMousePress);
      node.onMousePress({
        type: "mouse",
        action: "press",
        button: 0,
        x: 0,
        y: 0,
        ctrl: false,
        alt: false,
        shift: false,
        target: node,
      });

      assert.strictEqual(clicked, false);
    });

    it("disabled button does not prescribe styling on children", () => {
      // Button is intentionally unstyled - user controls disabled appearance
      const node = Button({ children: "Disabled", disabled: true });

      const textNode = node.children?.[0];
      // Text nodes wrapped by Box don't have dim applied automatically
      assert.ok(textNode);
      // No dim styling should be applied - that's up to the user
      const dim = textNode._inheritableProps?.dim;
      const dimValue = typeof dim === "function" ? dim() : dim;
      assert.strictEqual(dimValue, undefined);
    });

    it("reactive disabled prop updates behavior", () => {
      const [disabled, setDisabled] = createSignal(false);
      let clickCount = 0;
      const node = Button({
        children: "Test",
        disabled,
        onClick: () => {
          clickCount++;
        },
      });

      assert.ok(node.onKeyPress);

      // Not disabled - should fire
      node.onKeyPress({
        type: "key",
        name: "enter",
        char: "",
        ctrl: false,
        alt: false,
        shift: false,
        sequence: "\r",
        target: node,
      });
      assert.strictEqual(clickCount, 1);

      // Now disable
      setDisabled(true);
      node.onKeyPress({
        type: "key",
        name: "enter",
        char: "",
        ctrl: false,
        alt: false,
        shift: false,
        sequence: "\r",
        target: node,
      });
      assert.strictEqual(clickCount, 1); // Should not have increased
    });
  });

  describe("focus", () => {
    it("is focusable by default", () => {
      const node = Button({ children: "Test" });
      assert.strictEqual(node.focusable, true);
    });

    it("focusable: false makes it not focusable", () => {
      const node = Button({ children: "Test", focusable: false });
      assert.strictEqual(node.focusable, false);
    });

    it("autoFocus prop is passed through", () => {
      const node = Button({ children: "Test", autoFocus: true });
      assert.strictEqual(node.autoFocus, true);
    });

    it("ref is bound to the node", () => {
      const ref = createRef();
      const node = Button({ children: "Test", ref });
      assert.strictEqual(ref.current, node);
    });
  });

  describe("style overrides", () => {
    it("applies style overrides", () => {
      const node = Button({
        children: "Test",
        style: { marginTop: 2, marginStart: 1, paddingStart: 3 },
      });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.marginTop, 2);
      assert.strictEqual(style.marginStart, 1);
      assert.strictEqual(style.paddingStart, 3);
    });
  });

  describe("measurement", () => {
    it("string children measure correctly", () => {
      const node = Button({ children: "Hello" });

      const textNode = node.children?.[0];
      assert.ok(textNode?.measure);

      const size = textNode.measure(100, 100);
      assert.strictEqual(size.width, 5);
      assert.strictEqual(size.height, 1);
    });
  });

  describe("integration", () => {
    it("works within mounted app", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      let clicked = false;

      const app = mount(
        () =>
          Box({
            children: [
              Button({
                children: "Click",
                onClick: () => {
                  clicked = true;
                },
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
      assert.strictEqual(clicked, false);

      app.unmount();
    });
  });
});
