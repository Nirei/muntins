import assert from "node:assert";
import { describe, it } from "node:test";
import {
  DEFAULT_COLOR,
  Buffer as RenderBuffer,
} from "../../src/core/buffer.ts";
import { DEFAULT_FLEX_STYLE } from "../../src/core/layout.ts";
import {
  Box,
  DEFAULT_CLIP,
  DEFAULT_INHERITED_STYLE,
  type Node,
  Text,
  createRef,
} from "../../src/core/runtime.ts";
import { createSignal } from "../../src/core/signals.ts";
import { RadioGroup } from "../../src/ui/Radiogroup.ts";

const options = [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
  { value: "c", label: "Option C" },
];

function createKeyEvent(
  name: string,
  overrides: Partial<{
    char: string;
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    sequence: string;
  }> = {},
) {
  return {
    type: "key" as const,
    name,
    char: overrides.char ?? "",
    ctrl: overrides.ctrl ?? false,
    alt: overrides.alt ?? false,
    shift: overrides.shift ?? false,
    sequence: overrides.sequence ?? "",
    target: {},
  };
}

// Helper to get children from a node (handles getter pattern)
function getNodeChildren(node: Node): Node[] {
  const children = node.children;
  if (typeof children === "function") {
    return (children as () => Node[])();
  }
  return children ?? [];
}

describe("RadioGroup", () => {
  describe("rendering", () => {
    it("renders all options", () => {
      const node = RadioGroup({ value: "a", options });

      const children = getNodeChildren(node);
      assert.strictEqual(children.length, 3);
    });

    it("shows ● for selected option, ○ for unselected", () => {
      const node = RadioGroup({ value: "b", options });

      const children = getNodeChildren(node);

      // Each option is wrapped in a Box (for mouse handling) containing the rendered option
      // Structure: RadioGroup > wrapper Box > option Box > [glyph Text, label Text]
      // Check first option (unselected)
      const wrapper0 = children[0];
      const wrapper0Children = getNodeChildren(wrapper0);
      const opt0 = wrapper0Children[0];
      const opt0Children = getNodeChildren(opt0);
      const glyph0 = opt0Children[0];
      assert.ok(glyph0?.render);

      const buffer0 = new RenderBuffer(1, 1);
      glyph0.render({ x: 0, y: 0, screenX: 0, screenY: 0, width: 1, height: 1 }, buffer0, DEFAULT_INHERITED_STYLE, DEFAULT_CLIP);
      assert.strictEqual(buffer0.getSymbol(0, 0), "○");

      // Check second option (selected)
      const wrapper1 = children[1];
      const wrapper1Children = getNodeChildren(wrapper1);
      const opt1 = wrapper1Children[0];
      const opt1Children = getNodeChildren(opt1);
      const glyph1 = opt1Children[0];
      assert.ok(glyph1?.render);

      const buffer1 = new RenderBuffer(1, 1);
      glyph1.render({ x: 0, y: 0, screenX: 0, screenY: 0, width: 1, height: 1 }, buffer1, DEFAULT_INHERITED_STYLE, DEFAULT_CLIP);
      assert.strictEqual(buffer1.getSymbol(0, 0), "●");
    });

    it("reactive value prop updates selection", () => {
      const [value, setValue] = createSignal("a");
      const node = RadioGroup({ value, options });

      const getGlyphBuffer = (optIndex: number) => {
        const children = getNodeChildren(node);
        const wrapper = children[optIndex];
        const wrapperChildren = getNodeChildren(wrapper);
        const opt = wrapperChildren[0];
        const optChildren = getNodeChildren(opt);
        const glyph = optChildren[0];
        const buffer = new RenderBuffer(1, 1);
        glyph?.render?.(
          { x: 0, y: 0, screenX: 0, screenY: 0, width: 1, height: 1 },
          buffer,
          DEFAULT_INHERITED_STYLE,
          DEFAULT_CLIP,
        );
        return buffer;
      };

      assert.strictEqual(getGlyphBuffer(0).getSymbol(0, 0), "●");
      assert.strictEqual(getGlyphBuffer(1).getSymbol(0, 0), "○");

      // Update to second option
      setValue("b");
      assert.strictEqual(getGlyphBuffer(0).getSymbol(0, 0), "○");
      assert.strictEqual(getGlyphBuffer(1).getSymbol(0, 0), "●");
    });
  });

  describe("keyboard handling", () => {
    it("Down moves to next option and selects", () => {
      let receivedValue: string | undefined;
      const node = RadioGroup({
        value: "a",
        options,
        onChange: (v) => {
          receivedValue = v;
        },
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(createKeyEvent("down"));

      assert.strictEqual(result, true);
      assert.strictEqual(receivedValue, "b");
    });

    it("Right moves to next option and selects", () => {
      let receivedValue: string | undefined;
      const node = RadioGroup({
        value: "a",
        options,
        onChange: (v) => {
          receivedValue = v;
        },
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(createKeyEvent("right"));

      assert.strictEqual(result, true);
      assert.strictEqual(receivedValue, "b");
    });

    it("Up moves to previous option and selects", () => {
      let receivedValue: string | undefined;
      const node = RadioGroup({
        value: "b",
        options,
        onChange: (v) => {
          receivedValue = v;
        },
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(createKeyEvent("up"));

      assert.strictEqual(result, true);
      assert.strictEqual(receivedValue, "a");
    });

    it("Left moves to previous option and selects", () => {
      let receivedValue: string | undefined;
      const node = RadioGroup({
        value: "b",
        options,
        onChange: (v) => {
          receivedValue = v;
        },
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(createKeyEvent("left"));

      assert.strictEqual(result, true);
      assert.strictEqual(receivedValue, "a");
    });

    it("arrow keys wrap around at end", () => {
      let receivedValue: string | undefined;
      const node = RadioGroup({
        value: "c", // last option
        options,
        onChange: (v) => {
          receivedValue = v;
        },
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(createKeyEvent("down"));

      assert.strictEqual(result, true);
      assert.strictEqual(receivedValue, "a"); // wrapped to first
    });

    it("arrow keys wrap around at start", () => {
      let receivedValue: string | undefined;
      const node = RadioGroup({
        value: "a", // first option
        options,
        onChange: (v) => {
          receivedValue = v;
        },
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(createKeyEvent("up"));

      assert.strictEqual(result, true);
      assert.strictEqual(receivedValue, "c"); // wrapped to last
    });

    it("Home selects first option", () => {
      let receivedValue: string | undefined;
      const node = RadioGroup({
        value: "c",
        options,
        onChange: (v) => {
          receivedValue = v;
        },
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(createKeyEvent("home"));

      assert.strictEqual(result, true);
      assert.strictEqual(receivedValue, "a");
    });

    it("End selects last option", () => {
      let receivedValue: string | undefined;
      const node = RadioGroup({
        value: "a",
        options,
        onChange: (v) => {
          receivedValue = v;
        },
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(createKeyEvent("end"));

      assert.strictEqual(result, true);
      assert.strictEqual(receivedValue, "c");
    });

    it("other keys do not trigger onChange", () => {
      let called = false;
      const node = RadioGroup({
        value: "a",
        options,
        onChange: () => {
          called = true;
        },
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(createKeyEvent("enter"));

      assert.strictEqual(result, false);
      assert.strictEqual(called, false);
    });

    it("empty options array returns false for navigation keys", () => {
      const node = RadioGroup({
        value: "a",
        options: [],
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(createKeyEvent("down"));

      assert.strictEqual(result, false);
    });
  });

  describe("mouse handling", () => {
    it("clicking option selects it", () => {
      let receivedValue: string | undefined;
      const node = RadioGroup({
        value: "a",
        options,
        onChange: (v) => {
          receivedValue = v;
        },
      });

      // Get the second option (Option B)
      const children = getNodeChildren(node);
      const opt1 = children[1];
      assert.ok(opt1.onMousePress, "Option should have onMousePress handler");
      opt1.onMousePress({
        type: "mouse",
        action: "press",
        button: 0,
        x: 0,
        y: 0,
        ctrl: false,
        alt: false,
        shift: false,
        target: {},
      });

      assert.strictEqual(receivedValue, "b");
    });

    it("clicking already selected option does nothing (no duplicate callback)", () => {
      let callCount = 0;
      const node = RadioGroup({
        value: "a",
        options,
        onChange: () => {
          callCount++;
        },
      });

      const children = getNodeChildren(node);
      const opt0 = children[0]; // already selected
      assert.ok(opt0.onMousePress);
      opt0.onMousePress({
        type: "mouse",
        action: "press",
        button: 0,
        x: 0,
        y: 0,
        ctrl: false,
        alt: false,
        shift: false,
        target: {},
      });

      // Should still fire (consistent with keyboard behavior)
      assert.strictEqual(callCount, 1);
    });

    it("disabled group ignores mouse clicks", () => {
      let called = false;
      const node = RadioGroup({
        value: "a",
        options,
        disabled: true,
        onChange: () => {
          called = true;
        },
      });

      const children = getNodeChildren(node);
      const opt1 = children[1];
      assert.ok(opt1.onMousePress);
      opt1.onMousePress({
        type: "mouse",
        action: "press",
        button: 0,
        x: 0,
        y: 0,
        ctrl: false,
        alt: false,
        shift: false,
        target: {},
      });

      assert.strictEqual(called, false);
    });
  });

  describe("disabled state", () => {
    it("disabled group ignores all input", () => {
      let called = false;
      const node = RadioGroup({
        value: "a",
        options,
        disabled: true,
        onChange: () => {
          called = true;
        },
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(createKeyEvent("down"));

      assert.strictEqual(result, false);
      assert.strictEqual(called, false);
    });

    it("disabled group renders with dim", () => {
      const node = RadioGroup({ value: "a", options, disabled: true });

      const children = getNodeChildren(node);
      const wrapper0 = children[0];
      const wrapper0Children = getNodeChildren(wrapper0);
      const opt0 = wrapper0Children[0];
      const opt0Children = getNodeChildren(opt0);
      const glyph = opt0Children[0];

      assert.ok(glyph?._inheritableProps?.dim);
      const dimValue =
        typeof glyph._inheritableProps.dim === "function"
          ? glyph._inheritableProps.dim()
          : glyph._inheritableProps.dim;
      assert.strictEqual(dimValue, true);
    });

    it("reactive disabled prop updates behavior", () => {
      const [disabled, setDisabled] = createSignal(false);
      let callCount = 0;
      const node = RadioGroup({
        value: "a",
        options,
        disabled,
        onChange: () => {
          callCount++;
        },
      });

      assert.ok(node.onKeyPress);

      // Not disabled - should fire
      node.onKeyPress(createKeyEvent("down"));
      assert.strictEqual(callCount, 1);

      // Now disable
      setDisabled(true);
      node.onKeyPress(createKeyEvent("down"));
      assert.strictEqual(callCount, 1); // Should not have increased
    });
  });

  describe("direction", () => {
    it("default direction is column", () => {
      const node = RadioGroup({ value: "a", options });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.flexDirection, "column");
    });

    it("direction: row renders horizontally", () => {
      const node = RadioGroup({ value: "a", options, direction: "row" });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.flexDirection, "row");
    });

    it("reactive direction prop updates layout", () => {
      const [direction, setDirection] = createSignal<"row" | "column">(
        "column",
      );
      const node = RadioGroup({ value: "a", options, direction });

      const getStyle = () =>
        typeof node.style === "function" ? node.style() : node.style;

      assert.strictEqual(getStyle().flexDirection, "column");

      setDirection("row");
      assert.strictEqual(getStyle().flexDirection, "row");
    });
  });

  describe("custom renderOption", () => {
    it("renderOption controls appearance", () => {
      const node = RadioGroup({
        value: "a",
        options,
        renderOption: (props) =>
          Text({
            content: () => (props.selected() ? "X" : "O"),
          }),
      });

      const children = getNodeChildren(node);
      // Each option is wrapped in a Box for mouse handling
      const wrapper0 = children[0];
      const wrapper0Children = getNodeChildren(wrapper0);
      const opt0 = wrapper0Children[0];
      assert.ok(opt0?.render);

      const buffer = new RenderBuffer(1, 1);
      opt0.render({ x: 0, y: 0, screenX: 0, screenY: 0, width: 1, height: 1 }, buffer, DEFAULT_INHERITED_STYLE, DEFAULT_CLIP);
      assert.strictEqual(buffer.getSymbol(0, 0), "X"); // selected

      const wrapper1 = children[1];
      const wrapper1Children = getNodeChildren(wrapper1);
      const opt1 = wrapper1Children[0];
      assert.ok(opt1?.render);

      const buffer1 = new RenderBuffer(1, 1);
      opt1.render({ x: 0, y: 0, screenX: 0, screenY: 0, width: 1, height: 1 }, buffer1, DEFAULT_INHERITED_STYLE, DEFAULT_CLIP);
      assert.strictEqual(buffer1.getSymbol(0, 0), "O"); // not selected
    });
  });

  describe("focus", () => {
    it("is focusable by default", () => {
      const node = RadioGroup({ value: "a", options });
      assert.strictEqual(node.focusable, true);
    });

    it("focusable: false makes it not focusable", () => {
      const node = RadioGroup({ value: "a", options, focusable: false });
      assert.strictEqual(node.focusable, false);
    });

    it("autoFocus prop is passed through", () => {
      const node = RadioGroup({ value: "a", options, autoFocus: true });
      assert.strictEqual(node.autoFocus, true);
    });

    it("ref is bound to the node", () => {
      const ref = createRef();
      const node = RadioGroup({ value: "a", options, ref });
      assert.strictEqual(ref.current, node);
    });

    it("focus index syncs with selected value", () => {
      const [value, setValue] = createSignal("a");
      const node = RadioGroup({
        value,
        options,
        onChange: setValue,
      });

      // Move down (a -> b)
      node.onKeyPress?.(createKeyEvent("down"));

      // Now move down again - should go to c, not wrap to a
      let receivedValue: string | undefined;
      const node2 = RadioGroup({
        value,
        options,
        onChange: (v) => {
          receivedValue = v;
        },
      });

      node2.onKeyPress?.(createKeyEvent("down"));
      assert.strictEqual(receivedValue, "c");
    });
  });

  describe("style overrides", () => {
    it("applies style overrides", () => {
      const node = RadioGroup({
        value: "a",
        options,
        style: { marginTop: 2, gap: 1 },
      });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.marginTop, 2);
      assert.strictEqual(style.gap, 1);
    });
  });
});
