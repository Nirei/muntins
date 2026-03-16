import assert from "node:assert";
import { describe, it } from "node:test";
import { DIM, Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import { DEFAULT_FLEX_STYLE, computeLayout } from "../../src/core/layout.ts";
import type { LayoutNode } from "../../src/core/layout.ts";
import {
  Box,
  DEFAULT_INHERITED_STYLE,
  createRef,
  mount,
} from "../../src/core/runtime.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Switch } from "../../src/ui/switch.ts";

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

describe("Switch", () => {
  describe("rendering", () => {
    it("renders off state (■ ) when checked: false", () => {
      const node = Switch({ checked: false });

      // Get the Text child node
      const textNode = node.children?.[0];
      assert.ok(textNode?.render);

      const buffer = new RenderBuffer(2, 1);
      textNode.render(0, 0, 2, 1, buffer, DEFAULT_INHERITED_STYLE);

      assert.strictEqual(buffer.getSymbol(0, 0), "■");
      assert.strictEqual(buffer.getSymbol(1, 0), " ");
    });

    it("renders on state ( ■) when checked: true", () => {
      const node = Switch({ checked: true });

      const textNode = node.children?.[0];
      assert.ok(textNode?.render);

      const buffer = new RenderBuffer(2, 1);
      textNode.render(0, 0, 2, 1, buffer, DEFAULT_INHERITED_STYLE);

      assert.strictEqual(buffer.getSymbol(0, 0), " ");
      assert.strictEqual(buffer.getSymbol(1, 0), "■");
    });

    it("reactive checked prop updates visual", () => {
      const [checked, setChecked] = createSignal(false);
      const node = Switch({ checked });

      const textNode = node.children?.[0];
      assert.ok(textNode?.render);

      const buffer = new RenderBuffer(2, 1);

      // Initial: off
      textNode.render(0, 0, 2, 1, buffer, DEFAULT_INHERITED_STYLE);
      assert.strictEqual(buffer.getSymbol(0, 0), "■");
      assert.strictEqual(buffer.getSymbol(1, 0), " ");

      // Update to on
      setChecked(true);
      buffer.flush();
      textNode.render(0, 0, 2, 1, buffer, DEFAULT_INHERITED_STYLE);
      assert.strictEqual(buffer.getSymbol(0, 0), " ");
      assert.strictEqual(buffer.getSymbol(1, 0), "■");
    });
  });

  describe("keyboard handling", () => {
    it("onChange fires with true on Enter when off", () => {
      let receivedValue: boolean | undefined;
      const node = Switch({
        checked: false,
        onChange: (v) => {
          receivedValue = v;
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
      });

      assert.strictEqual(result, true);
      assert.strictEqual(receivedValue, true);
    });

    it("onChange fires with false on Space when on", () => {
      let receivedValue: boolean | undefined;
      const node = Switch({
        checked: true,
        onChange: (v) => {
          receivedValue = v;
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
      });

      assert.strictEqual(result, true);
      assert.strictEqual(receivedValue, false);
    });

    it("other keys do not trigger onChange", () => {
      let called = false;
      const node = Switch({
        checked: false,
        onChange: () => {
          called = true;
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
      });

      assert.strictEqual(result, false);
      assert.strictEqual(called, false);
    });
  });

  describe("disabled state", () => {
    it("disabled switch does not fire onChange", () => {
      let called = false;
      const node = Switch({
        checked: false,
        disabled: true,
        onChange: () => {
          called = true;
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
      });

      assert.strictEqual(result, false);
      assert.strictEqual(called, false);
    });

    it("disabled switch renders with dim", () => {
      const node = Switch({ checked: false, disabled: true });

      const textNode = node.children?.[0];
      assert.ok(textNode?._inheritableProps?.dim);

      // The dim prop should be a getter that returns true
      const dimValue =
        typeof textNode._inheritableProps.dim === "function"
          ? textNode._inheritableProps.dim()
          : textNode._inheritableProps.dim;
      assert.strictEqual(dimValue, true);
    });

    it("reactive disabled prop updates behavior", () => {
      const [disabled, setDisabled] = createSignal(false);
      let callCount = 0;
      const node = Switch({
        checked: false,
        disabled,
        onChange: () => {
          callCount++;
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
      });
      assert.strictEqual(callCount, 1);

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
      });
      assert.strictEqual(callCount, 1); // Should not have increased
    });
  });

  describe("focus", () => {
    it("is focusable by default", () => {
      const node = Switch({ checked: false });
      assert.strictEqual(node.focusable, true);
    });

    it("focusable: false makes it not focusable", () => {
      const node = Switch({ checked: false, focusable: false });
      assert.strictEqual(node.focusable, false);
    });

    it("autoFocus prop is passed through", () => {
      const node = Switch({ checked: false, autoFocus: true });
      assert.strictEqual(node.autoFocus, true);
    });

    it("ref is bound to the node", () => {
      const ref = createRef();
      const node = Switch({ checked: false, ref });
      assert.strictEqual(ref.current, node);
    });
  });

  describe("style overrides", () => {
    it("applies style overrides", () => {
      const node = Switch({
        checked: false,
        style: { marginTop: 2, marginStart: 1 },
      });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.marginTop, 2);
      assert.strictEqual(style.marginStart, 1);
    });
  });

  describe("measurement", () => {
    it("measures as width 2", () => {
      const node = Switch({ checked: false });

      const textNode = node.children?.[0];
      assert.ok(textNode?.measure);

      const size = textNode.measure(100, 100);
      assert.strictEqual(size.width, 2);
      assert.strictEqual(size.height, 1);
    });
  });

  describe("integration", () => {
    it("works within mounted app", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const [checked, setChecked] = createSignal(false);
      let lastValue: boolean | undefined;

      const app = mount(
        () =>
          Box({
            children: [
              Switch({
                checked,
                onChange: (v) => {
                  lastValue = v;
                  setChecked(v);
                },
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Initial state
      assert.strictEqual(checked(), false);

      // Simulate key press through runtime would require more setup
      // Instead verify component structure is correct
      assert.ok(app.unmount);

      app.unmount();
    });
  });
});
