import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import {
  DEFAULT_CLIP,
  DEFAULT_INHERITED_STYLE,
  createRef,
} from "../../src/core/runtime.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Checkbox } from "../../src/ui/Checkbox.ts";

describe("Checkbox", () => {
  describe("rendering", () => {
    it("renders unchecked glyph (☐) when checked: false", () => {
      const node = Checkbox({ checked: false });

      const textNode = node.children?.[0];
      assert.ok(textNode?.render);

      const buffer = new RenderBuffer(1, 1);
      textNode.render(
        0,
        0,
        1,
        1,
        buffer,
        DEFAULT_INHERITED_STYLE,
        DEFAULT_CLIP,
      );

      assert.strictEqual(buffer.getSymbol(0, 0), "☐");
    });

    it("renders checked glyph (☑) when checked: true", () => {
      const node = Checkbox({ checked: true });

      const textNode = node.children?.[0];
      assert.ok(textNode?.render);

      const buffer = new RenderBuffer(1, 1);
      textNode.render(
        0,
        0,
        1,
        1,
        buffer,
        DEFAULT_INHERITED_STYLE,
        DEFAULT_CLIP,
      );

      assert.strictEqual(buffer.getSymbol(0, 0), "☑");
    });

    it("reactive checked prop updates glyph", () => {
      const [checked, setChecked] = createSignal(false);
      const node = Checkbox({ checked });

      const textNode = node.children?.[0];
      assert.ok(textNode?.render);

      const buffer = new RenderBuffer(1, 1);

      // Initial: unchecked
      textNode.render(
        0,
        0,
        1,
        1,
        buffer,
        DEFAULT_INHERITED_STYLE,
        DEFAULT_CLIP,
      );
      assert.strictEqual(buffer.getSymbol(0, 0), "☐");

      // Update to checked
      setChecked(true);
      buffer.flush();
      textNode.render(
        0,
        0,
        1,
        1,
        buffer,
        DEFAULT_INHERITED_STYLE,
        DEFAULT_CLIP,
      );
      assert.strictEqual(buffer.getSymbol(0, 0), "☑");
    });
  });

  describe("keyboard handling", () => {
    it("onChange fires with true on Enter when unchecked", () => {
      let receivedValue: boolean | undefined;
      const node = Checkbox({
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
        target: node,
      });

      assert.strictEqual(result, true);
      assert.strictEqual(receivedValue, true);
    });

    it("onChange fires with false on Space when checked", () => {
      let receivedValue: boolean | undefined;
      const node = Checkbox({
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
        target: node,
      });

      assert.strictEqual(result, true);
      assert.strictEqual(receivedValue, false);
    });

    it("other keys do not trigger onChange", () => {
      let called = false;
      const node = Checkbox({
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
        target: node,
      });

      assert.strictEqual(result, false);
      assert.strictEqual(called, false);
    });
  });

  describe("mouse handling", () => {
    it("onChange fires on mouse click when unchecked", () => {
      let receivedValue: boolean | undefined;
      const node = Checkbox({
        checked: false,
        onChange: (v) => {
          receivedValue = v;
        },
      });

      assert.ok(node.onMousePress, "Checkbox should have onMousePress handler");
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

      assert.strictEqual(receivedValue, true);
    });

    it("onChange fires on mouse click when checked", () => {
      let receivedValue: boolean | undefined;
      const node = Checkbox({
        checked: true,
        onChange: (v) => {
          receivedValue = v;
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

      assert.strictEqual(receivedValue, false);
    });

    it("disabled checkbox does not fire onChange on click", () => {
      let called = false;
      const node = Checkbox({
        checked: false,
        disabled: true,
        onChange: () => {
          called = true;
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

      assert.strictEqual(called, false);
    });
  });

  describe("disabled state", () => {
    it("disabled checkbox does not fire onChange", () => {
      let called = false;
      const node = Checkbox({
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
        target: node,
      });

      assert.strictEqual(result, false);
      assert.strictEqual(called, false);
    });

    it("disabled checkbox renders with dim", () => {
      const node = Checkbox({ checked: false, disabled: true });

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
      const node = Checkbox({
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
        target: node,
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
        target: node,
      });
      assert.strictEqual(callCount, 1); // Should not have increased
    });
  });

  describe("focus", () => {
    it("is focusable by default", () => {
      const node = Checkbox({ checked: false });
      assert.strictEqual(node.focusable, true);
    });

    it("focusable: false makes it not focusable", () => {
      const node = Checkbox({ checked: false, focusable: false });
      assert.strictEqual(node.focusable, false);
    });

    it("autoFocus prop is passed through", () => {
      const node = Checkbox({ checked: false, autoFocus: true });
      assert.strictEqual(node.autoFocus, true);
    });

    it("ref is bound to the node", () => {
      const ref = createRef();
      const node = Checkbox({ checked: false, ref });
      assert.strictEqual(ref.current, node);
    });
  });

  describe("style overrides", () => {
    it("applies style overrides", () => {
      const node = Checkbox({
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
    it("measures as width 1", () => {
      const node = Checkbox({ checked: false });

      const textNode = node.children?.[0];
      assert.ok(textNode?.measure);

      const size = textNode.measure(100, 100);
      assert.strictEqual(size.width, 1);
      assert.strictEqual(size.height, 1);
    });
  });
});
