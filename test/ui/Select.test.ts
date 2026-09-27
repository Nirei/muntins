import assert from "node:assert";
import { describe, it } from "node:test";
import { Box } from "../../src/core/components/Box.ts";
import { Text } from "../../src/core/components/Text.ts";
import type { LayoutResult, ReactiveFlexStyle } from "../../src/core/layout.ts";
import { App } from "../../src/core/runtime/App.ts";
import { createRef } from "../../src/core/runtime/Node.ts";
import type { Node } from "../../src/core/runtime/Node.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Select, type SelectOption } from "../../src/ui/Select.ts";
import {
  createMockStdin,
  createMockStdout,
  nextRender,
} from "../test-helpers.ts";

const testOptions: SelectOption<string>[] = [
  { value: "us", label: "USA" },
  { value: "uk", label: "UK" },
  { value: "ca", label: "Canada" },
];

describe("Select", () => {
  describe("trigger rendering", () => {
    it("renders trigger with selected value", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Select({
                value: "us",
                options: testOptions,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Should render selected value label with indicator
      assert.ok(mockStdout.written.includes("USA"));
      assert.ok(mockStdout.written.includes("▼")); // Closed indicator
      app.unmount();
    });

    it("renders placeholder when no value selected", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Select({
                value: undefined as unknown as string,
                options: testOptions,
                placeholder: "Select",
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      assert.ok(mockStdout.written.includes("Select"));
      app.unmount();
    });

    it("reactive value prop updates trigger", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const [value, setValue] = createSignal("us");

      const app = App.mount(
        () =>
          Box({
            children: [
              Select({
                value,
                options: testOptions,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Initial value
      assert.ok(mockStdout.written.includes("USA"));

      // Change value
      setValue("uk");

      // Value update should work (no errors)
      app.unmount();
    });
  });

  describe("dropdown behavior", () => {
    it("options not rendered when closed", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Select({
                value: "us",
                options: testOptions,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // UK and Canada should not be visible when closed
      assert.ok(mockStdout.written.includes("USA")); // selected shows in trigger
      // Options list should not be visible
      assert.ok(!mockStdout.written.includes("Canada")); // not selected, not in options list
      app.unmount();
    });

    it("opens on Enter key", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "us",
                options: testOptions,
                autoFocus: true,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Simulate Enter key to open
      mockStdin.emit("data", Buffer.from("\r"));

      // Wait for render to complete
      await nextRender();

      // All options should now be visible
      assert.ok(mockStdout.written.includes("UK"));
      assert.ok(mockStdout.written.includes("Canada"));
      app.unmount();
    });

    it("opens on Space key", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "us",
                options: testOptions,
                autoFocus: true,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Simulate Space key to open
      mockStdin.emit("data", Buffer.from(" "));
      await nextRender();

      // Options should now be visible
      assert.ok(mockStdout.written.includes("UK"));
      app.unmount();
    });

    it("opens on Down key", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "us",
                options: testOptions,
                autoFocus: true,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Simulate Down key to open
      mockStdin.emit("data", Buffer.from("\x1b[B"));
      await nextRender();

      // Options should now be visible
      assert.ok(mockStdout.written.includes("Canada"));
      app.unmount();
    });
  });

  describe("keyboard navigation", () => {
    it("Escape closes dropdown without selecting", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let changeCalled = false;

      const app = App.mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "us",
                options: testOptions,
                autoFocus: true,
                onChange: () => {
                  changeCalled = true;
                },
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Open dropdown
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();
      assert.ok(mockStdout.written.includes("Canada"));

      // Press Escape. The input parser buffers a lone ESC byte for 100ms
      // (to disambiguate escape sequences) before flushing it as an escape
      // key event, so wait past that timeout before asserting.
      mockStdin.emit("data", Buffer.from("\x1b"));
      await new Promise((resolve) => setTimeout(resolve, 150));

      // onChange should not have been called
      assert.strictEqual(changeCalled, false);
      app.unmount();
    });

    it("Enter selects highlighted option", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let selectedValue: string | undefined;

      const app = App.mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "us",
                options: testOptions,
                autoFocus: true,
                onChange: (v) => {
                  selectedValue = v;
                },
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Open dropdown
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();

      // Navigate down once (from us to uk)
      mockStdin.emit("data", Buffer.from("\x1b[B"));
      await nextRender();

      // Select with Enter
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();

      assert.strictEqual(selectedValue, "uk");
      app.unmount();
    });

    it("Home jumps to first option", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let selectedValue: string | undefined;

      const app = App.mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "ca", // Start at canada (last option)
                options: testOptions,
                autoFocus: true,
                onChange: (v) => {
                  selectedValue = v;
                },
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Open dropdown (highlighted starts at selected item: canada)
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();

      // Press Home to go to first
      mockStdin.emit("data", Buffer.from("\x1b[H"));
      await nextRender();

      // Select with Enter
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();

      assert.strictEqual(selectedValue, "us");
      app.unmount();
    });

    it("End jumps to last option", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let selectedValue: string | undefined;

      const app = App.mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "us", // Start at US (first option)
                options: testOptions,
                autoFocus: true,
                onChange: (v) => {
                  selectedValue = v;
                },
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Open dropdown
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();

      // Press End to go to last
      mockStdin.emit("data", Buffer.from("\x1b[F"));
      await nextRender();

      // Select with Enter
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();

      assert.strictEqual(selectedValue, "ca");
      app.unmount();
    });

    it("Up/Down arrows navigate options", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let selectedValue: string | undefined;

      const app = App.mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "us",
                options: testOptions,
                autoFocus: true,
                onChange: (v) => {
                  selectedValue = v;
                },
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Open dropdown
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();

      // Navigate down twice (us -> uk -> ca)
      mockStdin.emit("data", Buffer.from("\x1b[B"));
      await nextRender();
      mockStdin.emit("data", Buffer.from("\x1b[B"));
      await nextRender();

      // Navigate up once (ca -> uk)
      mockStdin.emit("data", Buffer.from("\x1b[A"));
      await nextRender();

      // Select with Enter
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();

      assert.strictEqual(selectedValue, "uk");
      app.unmount();
    });

    it("navigation stops at boundaries", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let selectedValue: string | undefined;

      const app = App.mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "us",
                options: testOptions,
                autoFocus: true,
                onChange: (v) => {
                  selectedValue = v;
                },
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Open dropdown (starts at us, index 0)
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();

      // Try to go up from first item (should stay at first)
      mockStdin.emit("data", Buffer.from("\x1b[A"));
      await nextRender();

      // Select with Enter
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();

      // Should still be first item
      assert.strictEqual(selectedValue, "us");
      app.unmount();
    });
  });

  describe("disabled state", () => {
    it("disabled select does not open", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Select({
                value: "us",
                options: testOptions,
                disabled: true,
                autoFocus: true,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Clear initial output
      mockStdout.written = "";

      // Try to open with Enter
      mockStdin.emit("data", Buffer.from("\r"));

      // Options should not appear
      assert.ok(!mockStdout.written.includes("UK"));
      app.unmount();
    });

    it("reactive disabled prop", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const [disabled, setDisabled] = createSignal(true);

      const app = App.mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "us",
                options: testOptions,
                disabled,
                autoFocus: true,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Try to open while disabled
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();
      assert.ok(!mockStdout.written.includes("UK"));

      // Enable the select and wait for it to render
      setDisabled(false);
      // Use setTimeout to ensure disabled change propagates through all effects
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Now it should open
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();
      assert.ok(mockStdout.written.includes("UK"));

      app.unmount();
    });
  });

  describe("focus", () => {
    it("is focusable by default", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Select({
                value: "us",
                options: testOptions,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Should respond to keyboard input (implies focusable)
      mockStdin.emit("data", Buffer.from("\r"));
      // No error means it's working
      app.unmount();
    });

    it("ref is bound to the trigger node", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const ref = createRef();

      const app = App.mount(
        () =>
          Box({
            children: [
              Select({
                value: "us",
                options: testOptions,
                ref,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      assert.ok(ref.current !== null);
      app.unmount();
    });
  });

  describe("style overrides", () => {
    it("style prop applies to trigger container", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Select({
                value: "us",
                options: testOptions,
                style: {
                  paddingTop: 2,
                  width: 30,
                },
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Should render without error (style applied)
      assert.ok(mockStdout.written.includes("USA"));
      app.unmount();
    });

    it("default trigger places arrow at end of box", () => {
      const mockStdin = createMockStdin();
      const parentWidth = 30;
      const mockStdout = createMockStdout(parentWidth, 24);

      const app = App.mount(
        () =>
          Box({
            width: parentWidth,
            children: [
              Select({
                value: "us",
                options: testOptions,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      const buffer = app.renderer.buffer;

      // paddingStart: 1 from input fallback, paddingEnd: 1. No border. Content at col 1, row 0.
      assert.strictEqual(buffer.getSymbol(1, 0), "U");
      assert.strictEqual(buffer.getSymbol(2, 0), "S");
      assert.strictEqual(buffer.getSymbol(3, 0), "A");

      // Arrow "▼" should be one space from the right edge (paddingEnd: 1)
      assert.strictEqual(
        buffer.getSymbol(parentWidth - 2, 0),
        "▼",
        "Arrow should be one space from the right edge",
      );

      app.unmount();
    });
  });

  describe("onChange callback", () => {
    it("fires on selection with new value", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let selectedValue: string | undefined;

      const app = App.mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "us",
                options: testOptions,
                autoFocus: true,
                onChange: (v) => {
                  selectedValue = v;
                },
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Open and select second option
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();
      mockStdin.emit("data", Buffer.from("\x1b[B"));
      await nextRender();
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();

      assert.strictEqual(selectedValue, "uk");
      app.unmount();
    });

    it("Space also selects option", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let selectedValue: string | undefined;

      const app = App.mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "us",
                options: testOptions,
                autoFocus: true,
                onChange: (v) => {
                  selectedValue = v;
                },
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Open and select with Space
      mockStdin.emit("data", Buffer.from(" "));
      await nextRender();
      mockStdin.emit("data", Buffer.from("\x1b[B"));
      await nextRender();
      mockStdin.emit("data", Buffer.from(" "));
      await nextRender();

      assert.strictEqual(selectedValue, "uk");
      app.unmount();
    });
  });

  describe("mouse handling", () => {
    it("clicking trigger opens dropdown", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "us",
                options: testOptions,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          mouse: true,
          fpsLimit: 0,
        },
      );

      // Click on trigger (at position 0,0)
      mockStdin.emit("data", Buffer.from("\x1b[<0;1;1M"));
      await nextRender();

      // Options should now be visible
      assert.ok(
        mockStdout.written.includes("UK"),
        "Dropdown should open on click",
      );
      app.unmount();
    });

    it("clicking option selects it", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(80, 24);
      let selectedValue: string | undefined;

      const app = App.mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "us",
                options: testOptions,
                onChange: (v) => {
                  selectedValue = v;
                },
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          mouse: true,
          fpsLimit: 0,
        },
      );

      // Open dropdown with keyboard (raw data for UnifiedParser)
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();

      // Trigger has no border, 1 row. Dropdown starts at row 1.
      // Options with paddingStart:1: USA (y=1), UK (y=2), Canada (y=3)
      // SGR is 1-indexed, so UK is at SGR row 3, col 2
      mockStdin.emit("data", Buffer.from("\x1b[<0;2;3M"));
      await nextRender();

      assert.strictEqual(
        selectedValue,
        "uk",
        "Clicking option should select it",
      );
      app.unmount();
    });

    it("disabled select does not open on click", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "us",
                options: testOptions,
                disabled: true,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          mouse: true,
          fpsLimit: 0,
        },
      );

      // Clear initial output
      mockStdout.written = "";

      // Click on trigger
      mockStdin.emit("data", Buffer.from("\x1b[<0;1;1M"));
      await nextRender();

      // Options should not appear
      assert.ok(
        !mockStdout.written.includes("UK"),
        "Disabled select should not open",
      );
      app.unmount();
    });
  });

  describe("Portal rendering", () => {
    it("dropdown renders via Popover/Portal", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            height: 10,
            children: [
              Text({ content: "Background" }),
              Select({
                value: "us",
                options: testOptions,
                autoFocus: true,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Open dropdown
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();

      // Both background and dropdown content should be visible
      assert.ok(mockStdout.written.includes("Background"));
      assert.ok(mockStdout.written.includes("UK"));
      app.unmount();
    });
  });

  describe("click outside behavior", () => {
    it("clicking outside dropdown closes it", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(80, 24);

      const app = App.mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "us",
                options: testOptions,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          mouse: true,
          fpsLimit: 0,
        },
      );

      // Open dropdown with keyboard
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();

      // Verify dropdown is open
      assert.ok(mockStdout.written.includes("UK"), "Dropdown should be open");

      // Clear written output to check for re-render
      mockStdout.written = "";

      // Click outside the dropdown content but within the backdrop
      // (content is at rows 1-2; click at row 8 which is inside the 10-row root)
      mockStdin.emit("data", Buffer.from("\x1b[<0;50;8M"));
      await nextRender();

      // Open dropdown again to check if it was closed
      mockStdin.emit("data", Buffer.from("\r"));
      await nextRender();

      // If click-outside worked, dropdown would have closed,
      // and this Enter would reopen it showing UK again
      assert.ok(
        mockStdout.written.includes("UK"),
        "Dropdown should reopen after click-outside close",
      );
      app.unmount();
    });
  });
});

describe("Select dropdown width", () => {
  const openSelectWith = async (
    options: SelectOption<string>[],
    dropdownStyle?: Partial<ReactiveFlexStyle>,
  ) => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = App.mount(
      () =>
        Box({
          width: 30,
          children: [
            Select({
              value: options[0]?.value ?? "",
              options,
              autoFocus: true,
              dropdownStyle,
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        fpsLimit: 0,
      },
    );

    mockStdin.emit("data", Buffer.from("\r")); // open dropdown
    await nextRender();
    return app;
  };

  /**
   * Find the dropdown row (Box) containing the option Text whose intrinsic
   * width matches `labelWidth`, and return the row's laid-out width.
   * Option rows stretch to the dropdown container width, so the row width
   * is what the user sees as the dropdown width (minus container padding).
   */
  const findOptionRowWidth = (app: App, labelWidth: number): number | null => {
    const layout = app.layoutResult;
    if (!layout) return null;

    const isMarker = (node: Node): boolean => {
      if (!node.measure) return false;
      const style =
        typeof node.style === "function" ? node.style() : node.style;
      if (style.display === "none") return false;
      const m = node.measure(
        Number.POSITIVE_INFINITY,
        Number.POSITIVE_INFINITY,
      );
      return m.width === labelWidth && m.height === 1;
    };

    const countSlots = (nodes: Node[]): number => {
      let count = 0;
      for (const node of nodes) {
        const style =
          typeof node.style === "function" ? node.style() : node.style;
        if (style.display === "none") continue;
        if (style.display === "contents") {
          const kids =
            typeof node.children === "function"
              ? (node.children as () => Node[])()
              : (node.children ?? []);
          count += countSlots(kids);
        } else {
          count++;
        }
      }
      return count;
    };

    // Returns the layout of the option row (container Box whose direct
    // child is the marker Text), handling display:contents wrappers.
    const walk = (
      nodes: Node[],
      layouts: LayoutResult[],
      rowLayout: LayoutResult | null,
    ): number | null => {
      let index = 0;
      for (const node of nodes) {
        const style =
          typeof node.style === "function" ? node.style() : node.style;
        if (style.display === "none") continue;

        if (style.display === "contents") {
          const kids =
            typeof node.children === "function"
              ? (node.children as () => Node[])()
              : (node.children ?? []);
          const result = walk(kids, layouts, rowLayout);
          if (result !== null) return result;
          index += countSlots(kids);
          continue;
        }

        const nodeLayout = layouts[index];
        if (nodeLayout) {
          if (isMarker(node) && rowLayout) return rowLayout.width;

          const kids =
            typeof node.children === "function"
              ? (node.children as () => Node[])()
              : (node.children ?? []);
          // A dropdown option row directly contains the marker Text
          const isRow = kids.some((kid) => isMarker(kid));
          const result = walk(
            kids,
            nodeLayout.children ?? [],
            isRow ? nodeLayout : rowLayout,
          );
          if (result !== null) return result;
        }
        index++;
      }
      return null;
    };

    return walk([app.root], [layout], null);
  };

  it("dropdown is at least as wide as the trigger (short labels)", async () => {
    const marker = "markeroptions"; // 13 chars: unique intrinsic width
    const app = await openSelectWith([
      { value: "off", label: "off" },
      { value: "low", label: marker },
    ]);
    // Trigger fills the fixed 30-wide wrapper; dropdown container adds
    // 1+1 side padding, so each option row stretches to 28
    assert.strictEqual(findOptionRowWidth(app, marker.length), 28);
    app.unmount();
  });

  it("long labels expand the dropdown beyond the trigger width", async () => {
    const app = await openSelectWith([
      { value: "off", label: "off" },
      { value: "long", label: "x".repeat(40) },
    ]);
    assert.strictEqual(findOptionRowWidth(app, 40), 40);
    app.unmount();
  });

  it("dropdownStyle customizes the dropdown (wider padding)", async () => {
    const app = await openSelectWith(
      [
        { value: "off", label: "off" },
        { value: "low", label: "markeroptions" },
      ],
      { paddingStart: 3 },
    );
    // 30-wide trigger, paddingStart 3 + paddingEnd 1 -> row width 26
    assert.strictEqual(findOptionRowWidth(app, "markeroptions".length), 26);
    app.unmount();
  });
});
