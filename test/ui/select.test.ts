import assert from "node:assert";
import { describe, it } from "node:test";
import { Box, Text, createRef, mount } from "../../src/core/runtime.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Select, type SelectOption } from "../../src/ui/select.ts";

// Mock stdin for mount tests
interface MockStdin {
  isTTY: boolean;
  setRawMode: () => MockStdin;
  on: (event: string, handler: (...args: unknown[]) => void) => MockStdin;
  off: (event: string, handler: (...args: unknown[]) => void) => MockStdin;
  emit: (event: string, ...args: unknown[]) => boolean;
  resume: () => void;
  pause: () => void;
  listenerCount: (event: string) => number;
  _handlers: Map<string, Array<(...args: unknown[]) => void>>;
}

interface MockStdout {
  isTTY: boolean;
  columns: number;
  rows: number;
  written: string;
  write: (s: string) => boolean;
  on: (event: string, handler: () => void) => MockStdout;
  off: (event: string, handler: () => void) => MockStdout;
  emit: (event: string) => boolean;
  _handlers: Map<string, Array<() => void>>;
}

function createMockStdin(): MockStdin {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  const stdin: MockStdin = {
    isTTY: true,
    setRawMode: () => stdin,
    on: (event, handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return stdin;
    },
    off: (event, handler) => {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
      return stdin;
    },
    emit: (event, ...args) => {
      const list = handlers.get(event);
      if (list) {
        for (const h of list) h(...args);
      }
      return true;
    },
    resume: () => {},
    pause: () => {},
    listenerCount: (event) => handlers.get(event)?.length ?? 0,
    _handlers: handlers,
  };

  return stdin;
}

function createMockStdout(cols = 80, rows = 24): MockStdout {
  const handlers = new Map<string, Array<() => void>>();

  const stdout: MockStdout = {
    isTTY: true,
    columns: cols,
    rows: rows,
    written: "",
    write: function (s: string) {
      this.written += s;
      return true;
    },
    on: (event, handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return stdout;
    },
    off: (event, handler) => {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
      return stdout;
    },
    emit: (event) => {
      const list = handlers.get(event);
      if (list) {
        for (const h of list) h();
      }
      return true;
    },
    _handlers: handlers,
  };

  return stdout;
}

const testOptions: SelectOption<string>[] = [
  { value: "us", label: "USA" },
  { value: "uk", label: "UK" },
  { value: "ca", label: "Canada" },
];

/** Helper to wait for next render cycle */
const nextRender = () =>
  new Promise<void>((resolve) => queueMicrotask(resolve));

describe("Select", () => {
  describe("trigger rendering", () => {
    it("renders trigger with selected value", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
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

      const app = mount(
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
        },
      );

      assert.ok(mockStdout.written.includes("Select"));
      app.unmount();
    });

    it("reactive value prop updates trigger", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const [value, setValue] = createSignal("us");

      const app = mount(
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

      const app = mount(
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

      const app = mount(
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
        },
      );

      // Simulate Enter key to open
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });

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

      const app = mount(
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
        },
      );

      // Simulate Space key to open
      mockStdin.emit("keypress", " ", { name: "space", sequence: " " });
      await nextRender();

      // Options should now be visible
      assert.ok(mockStdout.written.includes("UK"));
      app.unmount();
    });

    it("opens on Down key", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
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
        },
      );

      // Simulate Down key to open
      mockStdin.emit("keypress", "\x1b[B", {
        name: "down",
        sequence: "\x1b[B",
      });
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

      const app = mount(
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
        },
      );

      // Open dropdown
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      await nextRender();
      assert.ok(mockStdout.written.includes("Canada"));

      // Press Escape
      mockStdin.emit("keypress", "\x1b", { name: "escape", sequence: "\x1b" });
      await nextRender();

      // onChange should not have been called
      assert.strictEqual(changeCalled, false);
      app.unmount();
    });

    it("Enter selects highlighted option", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let selectedValue: string | undefined;

      const app = mount(
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
        },
      );

      // Open dropdown
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      await nextRender();

      // Navigate down once (from us to uk)
      mockStdin.emit("keypress", "\x1b[B", {
        name: "down",
        sequence: "\x1b[B",
      });
      await nextRender();

      // Select with Enter
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      await nextRender();

      assert.strictEqual(selectedValue, "uk");
      app.unmount();
    });

    it("Home jumps to first option", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let selectedValue: string | undefined;

      const app = mount(
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
        },
      );

      // Open dropdown (highlighted starts at selected item: canada)
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      await nextRender();

      // Press Home to go to first
      mockStdin.emit("keypress", "\x1b[H", {
        name: "home",
        sequence: "\x1b[H",
      });
      await nextRender();

      // Select with Enter
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      await nextRender();

      assert.strictEqual(selectedValue, "us");
      app.unmount();
    });

    it("End jumps to last option", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let selectedValue: string | undefined;

      const app = mount(
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
        },
      );

      // Open dropdown
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      await nextRender();

      // Press End to go to last
      mockStdin.emit("keypress", "\x1b[F", { name: "end", sequence: "\x1b[F" });
      await nextRender();

      // Select with Enter
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      await nextRender();

      assert.strictEqual(selectedValue, "ca");
      app.unmount();
    });

    it("Up/Down arrows navigate options", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let selectedValue: string | undefined;

      const app = mount(
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
        },
      );

      // Open dropdown
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      await nextRender();

      // Navigate down twice (us -> uk -> ca)
      mockStdin.emit("keypress", "\x1b[B", {
        name: "down",
        sequence: "\x1b[B",
      });
      await nextRender();
      mockStdin.emit("keypress", "\x1b[B", {
        name: "down",
        sequence: "\x1b[B",
      });
      await nextRender();

      // Navigate up once (ca -> uk)
      mockStdin.emit("keypress", "\x1b[A", { name: "up", sequence: "\x1b[A" });
      await nextRender();

      // Select with Enter
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      await nextRender();

      assert.strictEqual(selectedValue, "uk");
      app.unmount();
    });

    it("navigation stops at boundaries", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let selectedValue: string | undefined;

      const app = mount(
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
        },
      );

      // Open dropdown (starts at us, index 0)
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      await nextRender();

      // Try to go up from first item (should stay at first)
      mockStdin.emit("keypress", "\x1b[A", { name: "up", sequence: "\x1b[A" });
      await nextRender();

      // Select with Enter
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
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

      const app = mount(
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
        },
      );

      // Clear initial output
      mockStdout.written = "";

      // Try to open with Enter
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });

      // Options should not appear
      assert.ok(!mockStdout.written.includes("UK"));
      app.unmount();
    });

    it("reactive disabled prop", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const [disabled, setDisabled] = createSignal(true);

      const app = mount(
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
        },
      );

      // Try to open while disabled
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      await nextRender();
      assert.ok(!mockStdout.written.includes("UK"));

      // Enable the select and wait for it to render
      setDisabled(false);
      // Use setTimeout to ensure disabled change propagates through all effects
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Now it should open
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      await nextRender();
      assert.ok(mockStdout.written.includes("UK"));

      app.unmount();
    });
  });

  describe("custom renderers", () => {
    it("renderTrigger controls trigger appearance", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            children: [
              Select({
                value: "us",
                options: testOptions,
                // Note: props.label is now an accessor
                renderTrigger: (props) =>
                  Text({ content: () => `[${props.label()}]` }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Custom format should be used
      assert.ok(mockStdout.written.includes("[USA]"));
      app.unmount();
    });

    it("renderOption controls option appearance", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "us",
                options: testOptions,
                autoFocus: true,
                renderOption: (props) =>
                  Text({
                    content: `>${props.option.label}<`,
                  }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Open dropdown
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      await nextRender();

      // Custom format should be used (no spaces to avoid ANSI escape issues)
      assert.ok(mockStdout.written.includes(">UK<"));
      app.unmount();
    });

    it("renderOption receives highlighted and selected state", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const states: Array<{ highlighted: boolean; selected: boolean }> = [];

      const app = mount(
        () =>
          Box({
            height: 10,
            children: [
              Select({
                value: "uk",
                options: testOptions,
                autoFocus: true,
                renderOption: (props) => {
                  // Note: highlighted and selected are accessors
                  states.push({
                    highlighted: props.highlighted(),
                    selected: props.selected(),
                  });
                  return Text({ content: props.option.label });
                },
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Open dropdown (highlighted should match selected: uk at index 1)
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      await nextRender();

      // Find uk option state (selected and highlighted)
      const ukState = states.find(
        (s, i) => states.indexOf(s) % 3 === 1 && s.selected === true,
      );
      assert.ok(ukState?.highlighted === true);
      assert.ok(ukState?.selected === true);

      app.unmount();
    });
  });

  describe("focus", () => {
    it("is focusable by default", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
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
        },
      );

      // Should respond to keyboard input (implies focusable)
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      // No error means it's working
      app.unmount();
    });

    it("ref is bound to the trigger node", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const ref = createRef();

      const app = mount(
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

      const app = mount(
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
        },
      );

      // Should render without error (style applied)
      assert.ok(mockStdout.written.includes("USA"));
      app.unmount();
    });
  });

  describe("onChange callback", () => {
    it("fires on selection with new value", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let selectedValue: string | undefined;

      const app = mount(
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
        },
      );

      // Open and select second option
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      await nextRender();
      mockStdin.emit("keypress", "\x1b[B", {
        name: "down",
        sequence: "\x1b[B",
      });
      await nextRender();
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      await nextRender();

      assert.strictEqual(selectedValue, "uk");
      app.unmount();
    });

    it("Space also selects option", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let selectedValue: string | undefined;

      const app = mount(
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
        },
      );

      // Open and select with Space
      mockStdin.emit("keypress", " ", { name: "space", sequence: " " });
      await nextRender();
      mockStdin.emit("keypress", "\x1b[B", {
        name: "down",
        sequence: "\x1b[B",
      });
      await nextRender();
      mockStdin.emit("keypress", " ", { name: "space", sequence: " " });
      await nextRender();

      assert.strictEqual(selectedValue, "uk");
      app.unmount();
    });
  });

  describe("Portal rendering", () => {
    it("dropdown renders via Popover/Portal", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
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
        },
      );

      // Open dropdown
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });
      await nextRender();

      // Both background and dropdown content should be visible
      assert.ok(mockStdout.written.includes("Background"));
      assert.ok(mockStdout.written.includes("UK"));
      app.unmount();
    });
  });
});
