import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import { Box } from "../../src/core/components/Box.ts";
import { Text } from "../../src/core/components/Text.ts";
import { DEFAULT_CLIP } from "../../src/core/rects.ts";
import { DEFAULT_INHERITED_STYLE } from "../../src/core/render.ts";
import { App } from "../../src/core/runtime/App.ts";
import type { Node } from "../../src/core/runtime/Node.ts";
import { createRef } from "../../src/core/runtime/Node.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Button, type ButtonProps } from "../../src/ui/Button.ts";
import { createMockStdin, createMockStdout } from "../test-helpers.ts";

/**
 * Button calls useFocus(), which requires a mount context, so tests
 * construct it inside a minimal mounted app and get the button node
 * back for direct handler/render/measurement assertions.
 */
function mountButton(props: ButtonProps): { app: App; node: Node } {
  let node!: Node;
  const app = App.mount(
    () => {
      node = Button(props);
      return Box({ children: [node] });
    },
    {
      stdin: createMockStdin() as unknown as NodeJS.ReadStream,
      stdout: createMockStdout() as unknown as NodeJS.WriteStream,
      fpsLimit: 0,
      scroll: false,
    },
  );
  return { app, node };
}

describe("Button", () => {
  describe("rendering", () => {
    it("renders string children as text", () => {
      const { app, node } = mountButton({ children: "Click me" });

      const textNode = node.resolveChildren()[0];
      assert.ok(textNode?.render);

      const buffer = new RenderBuffer(8, 1);
      textNode.render(
        { x: 0, y: 0, screenX: 0, screenY: 0, width: 8, height: 1 },
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

      app.unmount();
    });

    it("renders function children reactively", () => {
      const [label, setLabel] = createSignal("Hello");
      const { app, node } = mountButton({ children: label });

      const textNode = node.resolveChildren()[0];
      assert.ok(textNode?.render);

      const buffer = new RenderBuffer(5, 1);

      // Initial render
      textNode.render(
        { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 1 },
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
        { x: 0, y: 0, screenX: 0, screenY: 0, width: 5, height: 1 },
        buffer,
        DEFAULT_INHERITED_STYLE,
        DEFAULT_CLIP,
      );
      assert.strictEqual(buffer.getSymbol(0, 0), "W");
      assert.strictEqual(buffer.getSymbol(1, 0), "o");
      assert.strictEqual(buffer.getSymbol(2, 0), "r");
      assert.strictEqual(buffer.getSymbol(3, 0), "l");
      assert.strictEqual(buffer.getSymbol(4, 0), "d");

      app.unmount();
    });

    it("renders Node children directly", () => {
      const textChild = Text({ content: "Custom" });
      const { app, node } = mountButton({ children: textChild });

      // Should have the Text node directly as child
      assert.strictEqual(node.resolveChildren()[0], textChild);

      app.unmount();
    });

    it("renders array of Node children", () => {
      const child1 = Text({ content: "A" });
      const child2 = Text({ content: "B" });
      const { app, node } = mountButton({ children: [child1, child2] });

      assert.strictEqual(node.resolveChildren().length, 2);
      assert.strictEqual(node.resolveChildren()[0], child1);
      assert.strictEqual(node.resolveChildren()[1], child2);

      app.unmount();
    });
  });

  describe("keyboard handling", () => {
    it("onClick fires on Enter key", () => {
      let clicked = false;
      const { app, node } = mountButton({
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

      app.unmount();
    });

    it("onClick fires on Space key", () => {
      let clicked = false;
      const { app, node } = mountButton({
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

      app.unmount();
    });

    it("other keys do not trigger onClick", () => {
      let clicked = false;
      const { app, node } = mountButton({
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

      app.unmount();
    });
  });

  describe("mouse handling", () => {
    it("onClick fires on mouse click", () => {
      let clicked = false;
      const { app, node } = mountButton({
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

      app.unmount();
    });
  });

  describe("disabled state", () => {
    it("disabled button does not fire onClick on Enter", () => {
      let clicked = false;
      const { app, node } = mountButton({
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

      app.unmount();
    });

    it("disabled button does not fire onClick on Space", () => {
      let clicked = false;
      const { app, node } = mountButton({
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

      app.unmount();
    });

    it("disabled button does not fire onClick on mouse click", () => {
      let clicked = false;
      const { app, node } = mountButton({
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

      app.unmount();
    });

    it("disabled button does not prescribe styling on children", () => {
      // Button is intentionally unstyled - user controls disabled appearance
      const { app, node } = mountButton({
        children: "Disabled",
        disabled: true,
      });

      const textNode = node.resolveChildren()[0];
      // Text nodes wrapped by Box don't have dim applied automatically
      assert.ok(textNode);
      // No dim styling should be applied - that's up to the user
      const dim = textNode._inheritableProps?.dim;
      const dimValue = typeof dim === "function" ? dim() : dim;
      assert.strictEqual(dimValue, undefined);

      app.unmount();
    });

    it("reactive disabled prop updates behavior", () => {
      const [disabled, setDisabled] = createSignal(false);
      let clickCount = 0;
      const { app, node } = mountButton({
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

      app.unmount();
    });
  });

  describe("focus", () => {
    it("is focusable by default", () => {
      const { app, node } = mountButton({ children: "Test" });
      assert.strictEqual(node.focusable, true);
      app.unmount();
    });

    it("focusable: false makes it not focusable", () => {
      const { app, node } = mountButton({
        children: "Test",
        focusable: false,
      });
      assert.strictEqual(node.focusable, false);
      app.unmount();
    });

    it("autoFocus prop is passed through", () => {
      const { app, node } = mountButton({ children: "Test", autoFocus: true });
      assert.strictEqual(node.autoFocus, true);
      app.unmount();
    });

    it("ref is bound to the node", () => {
      const ref = createRef();
      const { app, node } = mountButton({ children: "Test", ref });
      assert.strictEqual(ref.current, node);
      app.unmount();
    });
  });

  describe("style overrides", () => {
    it("applies style overrides", () => {
      const { app, node } = mountButton({
        children: "Test",
        style: { marginTop: 2, marginStart: 1, paddingStart: 3 },
      });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.marginTop, 2);
      assert.strictEqual(style.marginStart, 1);
      assert.strictEqual(style.paddingStart, 3);

      app.unmount();
    });
  });

  describe("measurement", () => {
    it("string children measure correctly", () => {
      const { app, node } = mountButton({ children: "Hello" });

      const textNode = node.resolveChildren()[0];
      assert.ok(textNode?.measure);

      const size = textNode.measure(100, 100);
      assert.strictEqual(size.width, 5);
      assert.strictEqual(size.height, 1);

      app.unmount();
    });
  });

  describe("integration", () => {
    it("works within mounted app", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      let clicked = false;

      const app = App.mount(
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
