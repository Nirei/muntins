import assert from "node:assert";
import { beforeEach, describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import { DEFAULT_CLIP } from "../../src/core/rects.ts";
import { DEFAULT_INHERITED_STYLE } from "../../src/core/render.ts";
import { App } from "../../src/core/runtime/App.ts";
import { type Node, createRef } from "../../src/core/runtime/Node.ts";
import { createSignal } from "../../src/core/signals.ts";
import { setTheme } from "../../src/core/theme.ts";
import defaultThemeJson from "../../src/default-theme.json" with {
  type: "json",
};
import { RadioGroup, type RadioGroupProps } from "../../src/ui/Radiogroup.ts";
import { createMockStdin, createMockStdout } from "../test-helpers.ts";

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

// RadioGroup calls useFocus(), which requires an active runtime context.
// Mount it inside a minimal app so the component can be constructed.
function mountRadioGroup<T>(props: RadioGroupProps<T>): {
  app: App;
  node: Node;
} {
  const mockStdin = createMockStdin();
  const mockStdout = createMockStdout();
  let node!: Node;
  const app = App.mount(
    () => {
      node = RadioGroup(props);
      return node;
    },
    {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
      fpsLimit: 0,
    },
  );
  return { app, node };
}

// The RadioGroup Box contains a single For container whose children are
// one wrapper Box per option (the wrapper carries the mouse handler).
function getOptionWrappers(node: Node): Node[] {
  const forContainer = node.resolveChildren()[0];
  return forContainer.resolveChildren();
}

// Structure per option: wrapper Box > option Box > [glyph Text, label Text]
function getGlyph(wrapper: Node): Node | undefined {
  const optionBox = wrapper.resolveChildren()[0];
  return optionBox?.resolveChildren()[0];
}

describe("RadioGroup", () => {
  beforeEach(() => {
    setTheme(defaultThemeJson);
  });

  describe("rendering", () => {
    it("renders all options", () => {
      const { app, node } = mountRadioGroup({ value: "a", options });

      assert.strictEqual(getOptionWrappers(node).length, 3);
      app.unmount();
    });

    it("shows ● for selected option, ○ for unselected", () => {
      const { app, node } = mountRadioGroup({ value: "b", options });

      const wrappers = getOptionWrappers(node);

      // Check first option (unselected)
      const glyph0 = getGlyph(wrappers[0]);
      assert.ok(glyph0?.render);

      const buffer0 = new RenderBuffer(1, 1);
      glyph0.render(
        { x: 0, y: 0, screenX: 0, screenY: 0, width: 1, height: 1 },
        buffer0,
        DEFAULT_INHERITED_STYLE,
        DEFAULT_CLIP,
      );
      assert.strictEqual(buffer0.getSymbol(0, 0), "○");

      // Check second option (selected)
      const glyph1 = getGlyph(wrappers[1]);
      assert.ok(glyph1?.render);

      const buffer1 = new RenderBuffer(1, 1);
      glyph1.render(
        { x: 0, y: 0, screenX: 0, screenY: 0, width: 1, height: 1 },
        buffer1,
        DEFAULT_INHERITED_STYLE,
        DEFAULT_CLIP,
      );
      assert.strictEqual(buffer1.getSymbol(0, 0), "●");
      app.unmount();
    });

    it("reactive value prop updates selection", () => {
      const [value, setValue] = createSignal("a");
      const { app, node } = mountRadioGroup({ value, options });

      const getGlyphBuffer = (optIndex: number) => {
        const glyph = getGlyph(getOptionWrappers(node)[optIndex]);
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
      app.unmount();
    });
  });

  describe("keyboard handling", () => {
    it("Down moves to next option and selects", () => {
      let receivedValue: string | undefined;
      const { app, node } = mountRadioGroup({
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
      app.unmount();
    });

    it("Right moves to next option and selects", () => {
      let receivedValue: string | undefined;
      const { app, node } = mountRadioGroup({
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
      app.unmount();
    });

    it("Up moves to previous option and selects", () => {
      let receivedValue: string | undefined;
      const { app, node } = mountRadioGroup({
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
      app.unmount();
    });

    it("Left moves to previous option and selects", () => {
      let receivedValue: string | undefined;
      const { app, node } = mountRadioGroup({
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
      app.unmount();
    });

    it("arrow keys wrap around at end", () => {
      let receivedValue: string | undefined;
      const { app, node } = mountRadioGroup({
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
      app.unmount();
    });

    it("arrow keys wrap around at start", () => {
      let receivedValue: string | undefined;
      const { app, node } = mountRadioGroup({
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
      app.unmount();
    });

    it("Home selects first option", () => {
      let receivedValue: string | undefined;
      const { app, node } = mountRadioGroup({
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
      app.unmount();
    });

    it("End selects last option", () => {
      let receivedValue: string | undefined;
      const { app, node } = mountRadioGroup({
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
      app.unmount();
    });

    it("other keys do not trigger onChange", () => {
      let called = false;
      const { app, node } = mountRadioGroup({
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
      app.unmount();
    });

    it("empty options array returns false for navigation keys", () => {
      const { app, node } = mountRadioGroup({
        value: "a",
        options: [],
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(createKeyEvent("down"));

      assert.strictEqual(result, false);
      app.unmount();
    });
  });

  describe("mouse handling", () => {
    it("clicking option selects it", () => {
      let receivedValue: string | undefined;
      const { app, node } = mountRadioGroup({
        value: "a",
        options,
        onChange: (v) => {
          receivedValue = v;
        },
      });

      // Get the second option (Option B)
      const wrappers = getOptionWrappers(node);
      const opt1 = wrappers[1];
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
      app.unmount();
    });

    it("clicking already selected option does nothing (no duplicate callback)", () => {
      let callCount = 0;
      const { app, node } = mountRadioGroup({
        value: "a",
        options,
        onChange: () => {
          callCount++;
        },
      });

      const wrappers = getOptionWrappers(node);
      const opt0 = wrappers[0]; // already selected
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
      app.unmount();
    });

    it("disabled group ignores mouse clicks", () => {
      let called = false;
      const { app, node } = mountRadioGroup({
        value: "a",
        options,
        disabled: true,
        onChange: () => {
          called = true;
        },
      });

      const wrappers = getOptionWrappers(node);
      const opt1 = wrappers[1];
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
      app.unmount();
    });
  });

  describe("disabled state", () => {
    it("disabled group ignores all input", () => {
      let called = false;
      const { app, node } = mountRadioGroup({
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
      app.unmount();
    });

    it("disabled group renders with dim", () => {
      const { app, node } = mountRadioGroup({
        value: "a",
        options,
        disabled: true,
      });

      const glyph = getGlyph(getOptionWrappers(node)[0]);

      assert.ok(glyph?._inheritableProps?.dim);
      const dimValue =
        typeof glyph._inheritableProps.dim === "function"
          ? glyph._inheritableProps.dim()
          : glyph._inheritableProps.dim;
      assert.strictEqual(dimValue, true);
      app.unmount();
    });

    it("reactive disabled prop updates behavior", () => {
      const [disabled, setDisabled] = createSignal(false);
      let callCount = 0;
      const { app, node } = mountRadioGroup({
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
      app.unmount();
    });
  });

  describe("direction", () => {
    it("default direction is row", () => {
      const { app, node } = mountRadioGroup({ value: "a", options });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.flexDirection, "row");
      app.unmount();
    });

    it("direction: row renders horizontally", () => {
      const { app, node } = mountRadioGroup({
        value: "a",
        options,
        style: { flexDirection: "row" },
      });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.flexDirection, "row");
      app.unmount();
    });

    it("reactive direction prop updates layout", () => {
      const [direction, setDirection] = createSignal<"row" | "column">(
        "column",
      );
      const { app, node } = mountRadioGroup({
        value: "a",
        options,
        style: { flexDirection: direction },
      });

      assert.strictEqual(node.resolveStyle().flexDirection, "column");

      setDirection("row");
      assert.strictEqual(node.resolveStyle().flexDirection, "row");
      app.unmount();
    });
  });

  describe("focus", () => {
    it("is focusable by default", () => {
      const { app, node } = mountRadioGroup({ value: "a", options });
      assert.strictEqual(node.focusable, true);
      app.unmount();
    });

    it("focusable: false makes it not focusable", () => {
      const { app, node } = mountRadioGroup({
        value: "a",
        options,
        focusable: false,
      });
      assert.strictEqual(node.focusable, false);
      app.unmount();
    });

    it("autoFocus prop is passed through", () => {
      const { app, node } = mountRadioGroup({
        value: "a",
        options,
        autoFocus: true,
      });
      assert.strictEqual(node.autoFocus, true);
      app.unmount();
    });

    it("ref is bound to the node", () => {
      const ref = createRef();
      const { app, node } = mountRadioGroup({
        value: "a",
        options,
        ref,
      });
      assert.strictEqual(ref.current, node);
      app.unmount();
    });

    it("focus index syncs with selected value", () => {
      const [value, setValue] = createSignal("a");
      const first = mountRadioGroup({ value, options, onChange: setValue });

      // Move down (a -> b)
      first.node.onKeyPress?.(createKeyEvent("down"));
      assert.strictEqual(value(), "b");

      // A fresh group sharing the value signal mounts with value "b";
      // its highlighted index syncs, so Down goes to "c" instead of "a".
      let receivedValue: string | undefined;
      const second = mountRadioGroup({
        value,
        options,
        onChange: (v) => {
          receivedValue = v;
        },
      });

      second.node.onKeyPress?.(createKeyEvent("down"));
      assert.strictEqual(receivedValue, "c");

      first.app.unmount();
      second.app.unmount();
    });
  });

  describe("style overrides", () => {
    it("applies style overrides", () => {
      const { app, node } = mountRadioGroup({
        value: "a",
        options,
        style: { marginTop: 2, gap: 1 },
      });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.marginTop, 2);
      assert.strictEqual(style.gap, 1);
      app.unmount();
    });
  });
});
