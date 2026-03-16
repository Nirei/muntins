import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import type { KeyEvent } from "../../src/core/input.ts";
import {
  Box,
  DEFAULT_INHERITED_STYLE,
  type FocusController,
  createRef,
  mount,
  useFocus,
} from "../../src/core/runtime.ts";
import { createRoot, createSignal } from "../../src/core/signals.ts";
import { Toggle } from "../../src/ui/toggle.ts";

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

// Helper to create a KeyEvent
function createKeyEvent(name: string, options?: Partial<KeyEvent>): KeyEvent {
  return {
    type: "key",
    name,
    char: name.length === 1 ? name : "",
    ctrl: false,
    alt: false,
    shift: false,
    sequence: name,
    ...options,
  };
}

describe("Toggle", () => {
  describe("rendering", () => {
    it("renders label text", () => {
      let node: ReturnType<typeof Toggle> | undefined;

      createRoot((dispose) => {
        node = Toggle({ label: "Bold", pressed: false });
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.ok(node.children);
      assert.strictEqual(node.children.length, 1);

      // Check the text child can measure
      const textNode = node.children[0];
      assert.ok(textNode.measure);
      // "[ Bold ]" is 8 chars
      const size = textNode.measure(100, 100);
      assert.strictEqual(size.width, 8);
    });

    it("renders unpressed state with brackets", () => {
      let node: ReturnType<typeof Toggle> | undefined;

      createRoot((dispose) => {
        node = Toggle({ label: "Test", pressed: false });
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.ok(node.children);
      const textNode = node.children[0];
      assert.ok(textNode.render);

      const buffer = new RenderBuffer(20, 1);
      textNode.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE);

      // Check bracket style "[ Test ]"
      assert.strictEqual(buffer.getSymbol(0, 0), "[");
      assert.strictEqual(buffer.getSymbol(1, 0), " ");
      assert.strictEqual(buffer.getSymbol(2, 0), "T");
    });

    it("renders pressed state with asterisks", () => {
      let node: ReturnType<typeof Toggle> | undefined;

      createRoot((dispose) => {
        node = Toggle({ label: "Test", pressed: true });
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.ok(node.children);
      const textNode = node.children[0];
      assert.ok(textNode.render);

      const buffer = new RenderBuffer(20, 1);
      textNode.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE);

      // Check pressed style "[*Test*]"
      assert.strictEqual(buffer.getSymbol(0, 0), "[");
      assert.strictEqual(buffer.getSymbol(1, 0), "*");
      assert.strictEqual(buffer.getSymbol(2, 0), "T");
    });

    it("reactive label updates", () => {
      const [label, setLabel] = createSignal("First");
      let node: ReturnType<typeof Toggle> | undefined;

      createRoot((dispose) => {
        node = Toggle({ label, pressed: false });

        assert.ok(node);
        assert.ok(node.children);
        const textNode = node.children[0];
        assert.ok(textNode.measure);

        // Initial label "[ First ]" = 9 chars
        let size = textNode.measure(100, 100);
        assert.strictEqual(size.width, 9);

        // Update label "[ Second Label ]" = 16 chars
        setLabel("Second Label");
        size = textNode.measure(100, 100);
        assert.strictEqual(size.width, 16);

        dispose();
        return dispose;
      });
    });

    it("reactive pressed prop updates visual state", () => {
      const [pressed, setPressed] = createSignal(false);
      let node: ReturnType<typeof Toggle> | undefined;

      createRoot((dispose) => {
        node = Toggle({ label: "Test", pressed });

        assert.ok(node);
        assert.ok(node.children);
        const textNode = node.children[0];
        assert.ok(textNode.render);

        // Initial unpressed state "[ Test ]" = 8 chars
        let buffer = new RenderBuffer(20, 1);
        textNode.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE);
        assert.strictEqual(buffer.getSymbol(1, 0), " ");

        // Update to pressed "[*Test*]" = 8 chars
        setPressed(true);
        buffer = new RenderBuffer(20, 1);
        textNode.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE);
        assert.strictEqual(buffer.getSymbol(1, 0), "*");

        dispose();
        return dispose;
      });
    });
  });

  describe("focus", () => {
    it("is focusable by default", () => {
      let node: ReturnType<typeof Toggle> | undefined;

      createRoot((dispose) => {
        node = Toggle({ label: "Toggle", pressed: false });
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.strictEqual(node.focusable, true);
    });

    it("focusable can be disabled", () => {
      let node: ReturnType<typeof Toggle> | undefined;

      createRoot((dispose) => {
        node = Toggle({ label: "Toggle", pressed: false, focusable: false });
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.strictEqual(node.focusable, false);
    });

    it("autoFocus is passed through", () => {
      let node: ReturnType<typeof Toggle> | undefined;

      createRoot((dispose) => {
        node = Toggle({ label: "Toggle", pressed: false, autoFocus: true });
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.strictEqual(node.autoFocus, true);
    });

    it("receives focus on autoFocus in mounted app", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const toggleRef = createRef();
      let focusController!: FocusController;

      const app = mount(
        () => {
          focusController = useFocus();
          return Toggle({
            label: "Auto Focus",
            pressed: false,
            autoFocus: true,
            ref: toggleRef,
          });
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Toggle should be focused
      assert.strictEqual(focusController.current(), toggleRef.current);

      app.unmount();
    });
  });

  describe("activation", () => {
    it("onChange fires with toggled value on Enter key", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      let receivedValue: boolean | undefined;
      let toggleNode: ReturnType<typeof Toggle> | undefined;

      const app = mount(
        () => {
          toggleNode = Toggle({
            label: "Toggle me",
            pressed: false,
            onChange: (value) => {
              receivedValue = value;
            },
            autoFocus: true,
          });
          return toggleNode;
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Simulate Enter key press via onKeyPress handler
      assert.ok(toggleNode);
      assert.ok(toggleNode.onKeyPress);
      const consumed = toggleNode.onKeyPress(createKeyEvent("enter"));

      assert.strictEqual(receivedValue, true, "onChange should fire with true");
      assert.strictEqual(consumed, true, "Event should be consumed");

      app.unmount();
    });

    it("onChange fires with toggled value on Space key", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      let receivedValue: boolean | undefined;
      let toggleNode: ReturnType<typeof Toggle> | undefined;

      const app = mount(
        () => {
          toggleNode = Toggle({
            label: "Toggle me",
            pressed: true,
            onChange: (value) => {
              receivedValue = value;
            },
            autoFocus: true,
          });
          return toggleNode;
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Simulate Space key press
      assert.ok(toggleNode);
      assert.ok(toggleNode.onKeyPress);
      const consumed = toggleNode.onKeyPress(createKeyEvent("space"));

      assert.strictEqual(
        receivedValue,
        false,
        "onChange should fire with false (toggled from true)",
      );
      assert.strictEqual(consumed, true, "Event should be consumed");

      app.unmount();
    });

    it("other keys do not fire onChange", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      let receivedValue: boolean | undefined;
      let toggleNode: ReturnType<typeof Toggle> | undefined;

      const app = mount(
        () => {
          toggleNode = Toggle({
            label: "Toggle me",
            pressed: false,
            onChange: (value) => {
              receivedValue = value;
            },
            autoFocus: true,
          });
          return toggleNode;
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Simulate other key presses
      assert.ok(toggleNode);
      assert.ok(toggleNode.onKeyPress);

      toggleNode.onKeyPress(createKeyEvent("a"));
      assert.strictEqual(
        receivedValue,
        undefined,
        "onChange should not fire on 'a'",
      );

      toggleNode.onKeyPress(createKeyEvent("escape"));
      assert.strictEqual(
        receivedValue,
        undefined,
        "onChange should not fire on 'escape'",
      );

      toggleNode.onKeyPress(createKeyEvent("tab"));
      assert.strictEqual(
        receivedValue,
        undefined,
        "onChange should not fire on 'tab'",
      );

      app.unmount();
    });
  });

  describe("disabled state", () => {
    it("disabled toggle does not fire onChange on Enter", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      let receivedValue: boolean | undefined;
      let toggleNode: ReturnType<typeof Toggle> | undefined;

      const app = mount(
        () => {
          toggleNode = Toggle({
            label: "Disabled",
            pressed: false,
            disabled: true,
            onChange: (value) => {
              receivedValue = value;
            },
            autoFocus: true,
          });
          return toggleNode;
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Simulate Enter key press
      assert.ok(toggleNode);
      assert.ok(toggleNode.onKeyPress);
      const consumed = toggleNode.onKeyPress(createKeyEvent("enter"));

      assert.strictEqual(
        receivedValue,
        undefined,
        "onChange should not fire when disabled",
      );
      assert.strictEqual(consumed, false, "Event should not be consumed");

      app.unmount();
    });

    it("disabled toggle does not fire onChange on Space", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      let receivedValue: boolean | undefined;
      let toggleNode: ReturnType<typeof Toggle> | undefined;

      const app = mount(
        () => {
          toggleNode = Toggle({
            label: "Disabled",
            pressed: false,
            disabled: true,
            onChange: (value) => {
              receivedValue = value;
            },
            autoFocus: true,
          });
          return toggleNode;
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Simulate Space key press
      assert.ok(toggleNode);
      assert.ok(toggleNode.onKeyPress);
      const consumed = toggleNode.onKeyPress(createKeyEvent("space"));

      assert.strictEqual(
        receivedValue,
        undefined,
        "onChange should not fire when disabled",
      );
      assert.strictEqual(consumed, false, "Event should not be consumed");

      app.unmount();
    });

    it("reactive disabled state prevents activation", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const [disabled, setDisabled] = createSignal(false);
      let changeCount = 0;
      let toggleNode: ReturnType<typeof Toggle> | undefined;

      const app = mount(
        () => {
          toggleNode = Toggle({
            label: "Toggle",
            pressed: false,
            disabled,
            onChange: () => {
              changeCount++;
            },
            autoFocus: true,
          });
          return toggleNode;
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(toggleNode);
      assert.ok(toggleNode.onKeyPress);

      // Toggle is enabled, should fire
      toggleNode.onKeyPress(createKeyEvent("enter"));
      assert.strictEqual(changeCount, 1);

      // Disable toggle
      setDisabled(true);

      // Toggle is disabled, should not fire
      toggleNode.onKeyPress(createKeyEvent("enter"));
      assert.strictEqual(changeCount, 1, "Change count should not increase");

      // Re-enable toggle
      setDisabled(false);

      // Toggle is enabled again, should fire
      toggleNode.onKeyPress(createKeyEvent("enter"));
      assert.strictEqual(changeCount, 2);

      app.unmount();
    });

    it("disabled toggle renders with dim text", () => {
      let node: ReturnType<typeof Toggle> | undefined;

      createRoot((dispose) => {
        node = Toggle({ label: "Disabled", pressed: false, disabled: true });
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.ok(node.children);
      const textNode = node.children[0];

      // Check inheritable props include dim
      assert.ok(textNode._inheritableProps);
      const dimValue =
        typeof textNode._inheritableProps.dim === "function"
          ? textNode._inheritableProps.dim()
          : textNode._inheritableProps.dim;
      assert.strictEqual(dimValue, true);
    });
  });

  describe("pressed state visual", () => {
    it("pressed toggle has inverse text", () => {
      let node: ReturnType<typeof Toggle> | undefined;

      createRoot((dispose) => {
        node = Toggle({ label: "Pressed", pressed: true });
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.ok(node.children);
      const textNode = node.children[0];

      // Check inheritable props include inverse
      assert.ok(textNode._inheritableProps);
      const inverseValue =
        typeof textNode._inheritableProps.inverse === "function"
          ? textNode._inheritableProps.inverse()
          : textNode._inheritableProps.inverse;
      assert.strictEqual(inverseValue, true);
    });

    it("unpressed toggle does not have inverse text", () => {
      let node: ReturnType<typeof Toggle> | undefined;

      createRoot((dispose) => {
        node = Toggle({ label: "Unpressed", pressed: false });
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.ok(node.children);
      const textNode = node.children[0];

      // Check inheritable props include inverse
      assert.ok(textNode._inheritableProps);
      const inverseValue =
        typeof textNode._inheritableProps.inverse === "function"
          ? textNode._inheritableProps.inverse()
          : textNode._inheritableProps.inverse;
      assert.strictEqual(inverseValue, false);
    });
  });

  describe("style overrides", () => {
    it("applies style overrides", () => {
      let node: ReturnType<typeof Toggle> | undefined;

      createRoot((dispose) => {
        node = Toggle({
          label: "Styled",
          pressed: false,
          style: { marginTop: 2, paddingStart: 4 },
        });
        dispose();
        return dispose;
      });

      assert.ok(node);
      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.marginTop, 2);
      assert.strictEqual(style.paddingStart, 4);
    });
  });

  describe("ref binding", () => {
    it("binds ref to node", () => {
      const toggleRef = createRef();
      let node: ReturnType<typeof Toggle> | undefined;

      createRoot((dispose) => {
        node = Toggle({ label: "Ref Test", pressed: false, ref: toggleRef });
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.strictEqual(toggleRef.current, node);
    });
  });

  describe("integration", () => {
    it("works within mounted application", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            children: [
              Toggle({ label: "Bold", pressed: false }),
              Toggle({ label: "Italic", pressed: true }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Should render without errors
      assert.ok(mockStdout.written.length > 0);

      app.unmount();
    });

    it("multiple toggles can be focused in sequence", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const toggle1Ref = createRef();
      const toggle2Ref = createRef();
      let focusController!: FocusController;

      const app = mount(
        () => {
          focusController = useFocus();
          return Box({
            children: [
              Toggle({
                label: "First",
                pressed: false,
                ref: toggle1Ref,
                autoFocus: true,
              }),
              Toggle({ label: "Second", pressed: false, ref: toggle2Ref }),
            ],
          });
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // First toggle should be focused
      assert.strictEqual(focusController.current(), toggle1Ref.current);

      // Move focus to next
      focusController.next();
      assert.strictEqual(focusController.current(), toggle2Ref.current);

      // Move focus back
      focusController.prev();
      assert.strictEqual(focusController.current(), toggle1Ref.current);

      app.unmount();
    });
  });
});
