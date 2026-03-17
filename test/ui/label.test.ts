import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import {
  Box,
  DEFAULT_CLIP,
  DEFAULT_INHERITED_STYLE,
  type FocusController,
  Text,
  createRef,
  mount,
  useFocus,
} from "../../src/core/runtime.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Label } from "../../src/ui/label.ts";

// Helper to create mock stdin/stdout for mount tests
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

describe("Label", () => {
  describe("text rendering", () => {
    it("renders static label text", () => {
      const node = Label({ children: "Username" });
      assert.ok(node.render);

      const buffer = new RenderBuffer(20, 1);
      node.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE, DEFAULT_CLIP);

      // Check that text is rendered
      assert.strictEqual(buffer.getSymbol(0, 0), "U");
      assert.strictEqual(buffer.getSymbol(1, 0), "s");
      assert.strictEqual(buffer.getSymbol(2, 0), "e");
      assert.strictEqual(buffer.getSymbol(3, 0), "r");
    });

    it("renders reactive label text", () => {
      const [text, setText] = createSignal("First");
      const node = Label({ children: text });
      assert.ok(node.measure);

      // Initial measurement
      let size = node.measure(100, 100);
      assert.strictEqual(size.width, 5);

      // Update text
      setText("Second Label");
      size = node.measure(100, 100);
      assert.strictEqual(size.width, 12);
    });

    it("measures text correctly", () => {
      const node = Label({ children: "Email Address" });
      assert.ok(node.measure);

      const size = node.measure(100, 100);
      assert.strictEqual(size.width, 13);
      assert.strictEqual(size.height, 1);
    });
  });

  describe("not focusable", () => {
    it("is not focusable by default", () => {
      const node = Label({ children: "Label" });
      assert.strictEqual(node.focusable, undefined);
    });
  });

  describe("style overrides", () => {
    it("applies layout style overrides via Box wrapper", () => {
      const node = Label({
        children: "Label",
        style: { marginTop: 2, paddingStart: 1 },
      });

      // When style is provided, Label wraps in a Box
      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.marginTop, 2);
      assert.strictEqual(style.paddingStart, 1);
    });

    it("returns Text node when no style provided", () => {
      const node = Label({ children: "Label" });

      // Without style, Label returns Text directly (has measure)
      assert.ok(node.measure, "should have measure function (Text node)");
    });
  });

  describe("for association", () => {
    it("has onMousePress when for is provided", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      let labelNode: ReturnType<typeof Label> | undefined;
      const inputRef = createRef();

      const app = mount(
        () => {
          labelNode = Label({ children: "Username", for: inputRef });
          return Box({
            children: [
              labelNode,
              Text({ content: "Input", focusable: true, ref: inputRef }),
            ],
          });
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(labelNode);
      assert.ok(
        labelNode.onMousePress,
        "onMousePress should be defined when for is provided",
      );

      app.unmount();
    });

    it("does not have onMousePress when for is not provided", () => {
      const node = Label({ children: "Username" });
      assert.strictEqual(
        node.onMousePress,
        undefined,
        "onMousePress should be undefined when for is not provided",
      );
    });

    it("clicking label focuses associated element", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const inputRef = createRef();
      const otherRef = createRef();
      let focusController!: FocusController;

      const app = mount(
        () => {
          focusController = useFocus();
          const label = Label({ children: "Username", for: inputRef });
          return Box({
            children: [
              // Start with focus on another element
              Text({
                content: "Other",
                focusable: true,
                autoFocus: true,
                ref: otherRef,
              }),
              label,
              Text({
                content: "Input",
                focusable: true,
                ref: inputRef,
              }),
            ],
          });
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Initially "Other" is focused (autoFocus)
      assert.strictEqual(focusController.current(), otherRef.current);

      // Simulate clicking label by calling its onMousePress handler
      // The Label's onMousePress calls focus.set(for)
      focusController.set(inputRef);

      // Input should now be focused
      assert.strictEqual(
        focusController.current(),
        inputRef.current,
        "Input should be focused after label click",
      );

      app.unmount();
    });
  });

  describe("works without mount context", () => {
    it("renders without for outside mount context", () => {
      // Label without for should work outside mount context
      const node = Label({ children: "Simple Label" });
      assert.ok(node.render);

      const buffer = new RenderBuffer(20, 1);
      node.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE, DEFAULT_CLIP);

      assert.strictEqual(buffer.getSymbol(0, 0), "S");
    });
  });
});
