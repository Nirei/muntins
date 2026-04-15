import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import { Box } from "../../src/core/components/Box.ts";
import { Text } from "../../src/core/components/Text.ts";
import { useFocus } from "../../src/core/components/useFocus.ts";
import { DEFAULT_CLIP } from "../../src/core/rects.ts";
import { DEFAULT_INHERITED_STYLE } from "../../src/core/render.ts";
import { App } from "../../src/core/runtime/App.ts";
import type { FocusController } from "../../src/core/runtime/FocusManager.ts";
import { createRef } from "../../src/core/runtime/Node.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Label } from "../../src/ui/Label.ts";
import { Switch } from "../../src/ui/Switch.ts";
import { createMockStdin, createMockStdout } from "../test-helpers.ts";

describe("Label", () => {
  describe("text rendering", () => {
    it("renders static label text", () => {
      const node = Label({ children: "Username" });
      assert.ok(node.render);

      const buffer = new RenderBuffer(20, 1);
      node.render(
        { x: 0, y: 0, screenX: 0, screenY: 0, width: 20, height: 1 },
        buffer,
        DEFAULT_INHERITED_STYLE,
        DEFAULT_CLIP,
      );

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
    it("applies text style overrides to Text node", () => {
      const node = Label({
        children: "Label",
        style: { bold: true, dim: true },
      });

      // Label always returns a Text node with style props applied
      assert.ok(node.measure, "should have measure function (Text node)");
      // Check that inheritable props are set
      assert.strictEqual(node._inheritableProps?.bold, true);
      assert.strictEqual(node._inheritableProps?.dim, true);
    });

    it("returns Text node when no style provided", () => {
      const node = Label({ children: "Label" });

      // Label always returns Text directly (has measure)
      assert.ok(node.measure, "should have measure function (Text node)");
    });
  });

  describe("for association", () => {
    it("has onMousePress when for is provided", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      let labelNode: ReturnType<typeof Label> | undefined;
      const inputRef = createRef();

      const app = App.mount(
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
      let labelNode!: ReturnType<typeof Label>;

      const app = App.mount(
        () => {
          focusController = useFocus();
          labelNode = Label({ children: "Username", for: inputRef });
          return Box({
            children: [
              // Start with focus on another element
              Text({
                content: "Other",
                focusable: true,
                autoFocus: true,
                ref: otherRef,
              }),
              labelNode,
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
      assert.ok(labelNode.onMousePress);
      labelNode.onMousePress({
        type: "mouse",
        action: "press",
        button: 0,
        x: 0,
        y: 0,
        ctrl: false,
        alt: false,
        shift: false,
        target: labelNode,
      });

      // Input should now be focused
      assert.strictEqual(
        focusController.current(),
        inputRef.current,
        "Input should be focused after label click",
      );

      app.unmount();
    });

    it("clicking label activates associated checkbox", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const switchRef = createRef();
      let labelNode!: ReturnType<typeof Label>;
      let activated = false;

      const app = App.mount(
        () => {
          labelNode = Label({ children: "Enable feature", for: switchRef });
          return Box({
            children: [
              Switch({
                checked: false,
                ref: switchRef,
                onChange: () => {
                  activated = true;
                },
              }),
              labelNode,
            ],
          });
        },
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.strictEqual(activated, false, "should not be activated initially");

      // Click the label
      assert.ok(labelNode.onMousePress);
      labelNode.onMousePress({
        type: "mouse",
        action: "press",
        button: 0,
        x: 0,
        y: 0,
        ctrl: false,
        alt: false,
        shift: false,
        target: labelNode,
      });

      assert.strictEqual(
        activated,
        true,
        "checkbox should be activated when label is clicked",
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
      node.render(
        { x: 0, y: 0, screenX: 0, screenY: 0, width: 20, height: 1 },
        buffer,
        DEFAULT_INHERITED_STYLE,
        DEFAULT_CLIP,
      );

      assert.strictEqual(buffer.getSymbol(0, 0), "S");
    });
  });
});
