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
import { Button } from "../../src/ui/button.ts";

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

describe("Button", () => {
  describe("rendering", () => {
    it("renders label text", () => {
      let node: ReturnType<typeof Button> | undefined;

      createRoot((dispose) => {
        node = Button({ label: "Click me" });
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.ok(node.children);
      assert.strictEqual(node.children.length, 1);

      // Check the text child can measure
      const textNode = node.children[0];
      assert.ok(textNode.measure);
      const size = textNode.measure(100, 100);
      assert.strictEqual(size.width, 8); // "Click me" is 8 chars
    });

    it("renders with border by default", () => {
      let node: ReturnType<typeof Button> | undefined;

      createRoot((dispose) => {
        node = Button({ label: "OK" });
        dispose();
        return dispose;
      });

      assert.ok(node);
      // Default variant has border
      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.borderTop, true);
      assert.strictEqual(style.borderEnd, true);
      assert.strictEqual(style.borderBottom, true);
      assert.strictEqual(style.borderStart, true);
    });

    it("renders outline variant without border", () => {
      let node: ReturnType<typeof Button> | undefined;

      createRoot((dispose) => {
        node = Button({ label: "Cancel", variant: "outline" });
        dispose();
        return dispose;
      });

      assert.ok(node);
      // Outline variant wraps label in brackets
      assert.ok(node.children);
      const textNode = node.children[0];
      assert.ok(textNode.render);

      const buffer = new RenderBuffer(20, 1);
      textNode.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE);

      // Check that bracket style is rendered
      assert.strictEqual(buffer.getSymbol(0, 0), "[");
      assert.strictEqual(buffer.getSymbol(1, 0), " ");
      assert.strictEqual(buffer.getSymbol(2, 0), "C");
    });

    it("reactive label updates", () => {
      const [label, setLabel] = createSignal("First");
      let node: ReturnType<typeof Button> | undefined;

      createRoot((dispose) => {
        node = Button({ label });

        assert.ok(node);
        assert.ok(node.children);
        const textNode = node.children[0];
        assert.ok(textNode.measure);

        // Initial label
        let size = textNode.measure(100, 100);
        assert.strictEqual(size.width, 5);

        // Update label
        setLabel("Second Label");
        size = textNode.measure(100, 100);
        assert.strictEqual(size.width, 12);

        dispose();
        return dispose;
      });
    });
  });

  describe("focus", () => {
    it("is focusable by default", () => {
      let node: ReturnType<typeof Button> | undefined;

      createRoot((dispose) => {
        node = Button({ label: "Button" });
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.strictEqual(node.focusable, true);
    });

    it("focusable can be disabled", () => {
      let node: ReturnType<typeof Button> | undefined;

      createRoot((dispose) => {
        node = Button({ label: "Button", focusable: false });
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.strictEqual(node.focusable, false);
    });

    it("autoFocus is passed through", () => {
      let node: ReturnType<typeof Button> | undefined;

      createRoot((dispose) => {
        node = Button({ label: "Button", autoFocus: true });
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.strictEqual(node.autoFocus, true);
    });

    it("receives focus on autoFocus in mounted app", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const buttonRef = createRef();
      let focusController!: FocusController;

      const app = mount(
        () => {
          focusController = useFocus();
          return Button({
            label: "Auto Focus",
            autoFocus: true,
            ref: buttonRef,
          });
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Button should be focused
      assert.strictEqual(focusController.current(), buttonRef.current);

      app.unmount();
    });
  });

  describe("activation", () => {
    it("onClick fires on Enter key", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      let clicked = false;
      let buttonNode: ReturnType<typeof Button> | undefined;

      const app = mount(
        () => {
          buttonNode = Button({
            label: "Click me",
            onClick: () => {
              clicked = true;
            },
            autoFocus: true,
          });
          return buttonNode;
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Simulate Enter key press via onKeyPress handler
      assert.ok(buttonNode);
      assert.ok(buttonNode.onKeyPress);
      const consumed = buttonNode.onKeyPress(createKeyEvent("enter"));

      assert.strictEqual(clicked, true, "onClick should have fired");
      assert.strictEqual(consumed, true, "Event should be consumed");

      app.unmount();
    });

    it("onClick fires on Space key", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      let clicked = false;
      let buttonNode: ReturnType<typeof Button> | undefined;

      const app = mount(
        () => {
          buttonNode = Button({
            label: "Click me",
            onClick: () => {
              clicked = true;
            },
            autoFocus: true,
          });
          return buttonNode;
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Simulate Space key press
      assert.ok(buttonNode);
      assert.ok(buttonNode.onKeyPress);
      const consumed = buttonNode.onKeyPress(createKeyEvent("space"));

      assert.strictEqual(clicked, true, "onClick should have fired");
      assert.strictEqual(consumed, true, "Event should be consumed");

      app.unmount();
    });

    it("other keys do not fire onClick", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      let clicked = false;
      let buttonNode: ReturnType<typeof Button> | undefined;

      const app = mount(
        () => {
          buttonNode = Button({
            label: "Click me",
            onClick: () => {
              clicked = true;
            },
            autoFocus: true,
          });
          return buttonNode;
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Simulate other key presses
      assert.ok(buttonNode);
      assert.ok(buttonNode.onKeyPress);

      buttonNode.onKeyPress(createKeyEvent("a"));
      assert.strictEqual(clicked, false, "onClick should not fire on 'a'");

      buttonNode.onKeyPress(createKeyEvent("escape"));
      assert.strictEqual(clicked, false, "onClick should not fire on 'escape'");

      buttonNode.onKeyPress(createKeyEvent("tab"));
      assert.strictEqual(clicked, false, "onClick should not fire on 'tab'");

      app.unmount();
    });
  });

  describe("disabled state", () => {
    it("disabled button does not fire onClick on Enter", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      let clicked = false;
      let buttonNode: ReturnType<typeof Button> | undefined;

      const app = mount(
        () => {
          buttonNode = Button({
            label: "Disabled",
            disabled: true,
            onClick: () => {
              clicked = true;
            },
            autoFocus: true,
          });
          return buttonNode;
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Simulate Enter key press
      assert.ok(buttonNode);
      assert.ok(buttonNode.onKeyPress);
      const consumed = buttonNode.onKeyPress(createKeyEvent("enter"));

      assert.strictEqual(
        clicked,
        false,
        "onClick should not fire when disabled",
      );
      assert.strictEqual(consumed, false, "Event should not be consumed");

      app.unmount();
    });

    it("disabled button does not fire onClick on Space", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      let clicked = false;
      let buttonNode: ReturnType<typeof Button> | undefined;

      const app = mount(
        () => {
          buttonNode = Button({
            label: "Disabled",
            disabled: true,
            onClick: () => {
              clicked = true;
            },
            autoFocus: true,
          });
          return buttonNode;
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Simulate Space key press
      assert.ok(buttonNode);
      assert.ok(buttonNode.onKeyPress);
      const consumed = buttonNode.onKeyPress(createKeyEvent("space"));

      assert.strictEqual(
        clicked,
        false,
        "onClick should not fire when disabled",
      );
      assert.strictEqual(consumed, false, "Event should not be consumed");

      app.unmount();
    });

    it("reactive disabled state prevents activation", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const [disabled, setDisabled] = createSignal(false);
      let clickCount = 0;
      let buttonNode: ReturnType<typeof Button> | undefined;

      const app = mount(
        () => {
          buttonNode = Button({
            label: "Toggle",
            disabled,
            onClick: () => {
              clickCount++;
            },
            autoFocus: true,
          });
          return buttonNode;
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(buttonNode);
      assert.ok(buttonNode.onKeyPress);

      // Button is enabled, should fire
      buttonNode.onKeyPress(createKeyEvent("enter"));
      assert.strictEqual(clickCount, 1);

      // Disable button
      setDisabled(true);

      // Button is disabled, should not fire
      buttonNode.onKeyPress(createKeyEvent("enter"));
      assert.strictEqual(clickCount, 1, "Click count should not increase");

      // Re-enable button
      setDisabled(false);

      // Button is enabled again, should fire
      buttonNode.onKeyPress(createKeyEvent("enter"));
      assert.strictEqual(clickCount, 2);

      app.unmount();
    });

    it("disabled button renders with dim text", () => {
      let node: ReturnType<typeof Button> | undefined;

      createRoot((dispose) => {
        node = Button({ label: "Disabled", disabled: true });
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

  describe("variants", () => {
    it("default variant has round border", () => {
      let node: ReturnType<typeof Button> | undefined;

      createRoot((dispose) => {
        node = Button({ label: "Default" });
        dispose();
        return dispose;
      });

      assert.ok(node);
      const style =
        typeof node.style === "function" ? node.style() : node.style;
      // Check border is enabled (default variant)
      assert.strictEqual(style.borderTop, true);
    });

    it("outline variant renders brackets in text", () => {
      let node: ReturnType<typeof Button> | undefined;

      createRoot((dispose) => {
        node = Button({ label: "Outline", variant: "outline" });
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.ok(node.children);
      const textNode = node.children[0];
      assert.ok(textNode.measure);

      // Outline adds "[ " and " ]" = 4 extra chars
      const size = textNode.measure(100, 100);
      assert.strictEqual(size.width, 7 + 4); // "Outline" (7) + "[ " + " ]" (4)
    });

    it("reactive variant changes rendering", () => {
      const [variant, setVariant] = createSignal<"default" | "outline">(
        "default",
      );
      let node: ReturnType<typeof Button> | undefined;

      createRoot((dispose) => {
        node = Button({ label: "Toggle", variant });

        assert.ok(node);

        // Initially default variant with border
        let style =
          typeof node.style === "function" ? node.style() : node.style;
        assert.strictEqual(style.borderTop, true, "Default should have border");

        // Change to outline variant
        setVariant("outline");

        // Now should not have border
        style = typeof node.style === "function" ? node.style() : node.style;
        assert.strictEqual(
          style.borderTop,
          false,
          "Outline should not have border",
        );

        dispose();
        return dispose;
      });
    });
  });

  describe("style overrides", () => {
    it("applies style overrides", () => {
      let node: ReturnType<typeof Button> | undefined;

      createRoot((dispose) => {
        node = Button({
          label: "Styled",
          style: { marginTop: 2, paddingStart: 4 },
        });
        dispose();
        return dispose;
      });

      assert.ok(node);
      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.marginTop, 2);
      // Note: paddingStart is overridden by style prop, but default is 2
      assert.strictEqual(style.paddingStart, 4);
    });
  });

  describe("ref binding", () => {
    it("binds ref to node", () => {
      const buttonRef = createRef();
      let node: ReturnType<typeof Button> | undefined;

      createRoot((dispose) => {
        node = Button({ label: "Ref Test", ref: buttonRef });
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.strictEqual(buttonRef.current, node);
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
              Button({ label: "Submit", onClick: () => {} }),
              Button({ label: "Cancel", variant: "outline" }),
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

    it("multiple buttons can be focused in sequence", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const button1Ref = createRef();
      const button2Ref = createRef();
      let focusController!: FocusController;

      const app = mount(
        () => {
          focusController = useFocus();
          return Box({
            children: [
              Button({ label: "First", ref: button1Ref, autoFocus: true }),
              Button({ label: "Second", ref: button2Ref }),
            ],
          });
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // First button should be focused
      assert.strictEqual(focusController.current(), button1Ref.current);

      // Move focus to next
      focusController.next();
      assert.strictEqual(focusController.current(), button2Ref.current);

      // Move focus back
      focusController.prev();
      assert.strictEqual(focusController.current(), button1Ref.current);

      app.unmount();
    });
  });
});
