import assert from "node:assert";
import { EventEmitter } from "node:events";
import * as readline from "node:readline";
import { describe, it } from "node:test";
import {
  Box,
  For,
  Show,
  TabFocus,
  Text,
  batch,
  createEffect,
  createMemo,
  createSignal,
  App,
  onCleanup,
} from "../src/index.ts";
import { Input } from "../src/ui/Input.ts";
import { Separator } from "../src/ui/Separator.ts";
import { Switch } from "../src/ui/Switch.ts";
import { RadioGroup } from "../src/ui/Radiogroup.ts";
import { Label } from "../src/ui/Label.ts";
import { Textarea } from "../src/ui/Textarea.ts";
import { Select } from "../src/ui/Select.ts";

/**
 * Virtual terminal screen that simulates a real terminal.
 * Processes ANSI escape sequences to maintain an accurate screen state.
 */
class VirtualScreen {
  private cells: string[][];
  private cursorX = 0;
  private cursorY = 0;
  private savedCursorX = 0;
  private savedCursorY = 0;
  private rawOutput = "";
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cells = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => " "),
    );
  }

  get cursor(): { x: number; y: number } {
    return { x: this.cursorX, y: this.cursorY };
  }

  write(data: string): void {
    this.rawOutput += data;

    let i = 0;
    while (i < data.length) {
      if (data[i] === "\x1b" && data[i + 1] === "[") {
        // Parse CSI sequence
        let j = i + 2;

        // Handle optional ? for private mode sequences
        const isPrivate = data[j] === "?";
        if (isPrivate) {
          j++;
        }

        // Collect parameters
        let params = "";
        while (j < data.length && /[0-9;]/.test(data[j])) {
          params += data[j];
          j++;
        }

        const command = data[j];
        j++;

        // Process command
        if (command === "H") {
          // Cursor position
          const parts = params
            .split(";")
            .map((p) => Number.parseInt(p, 10) || 1);
          this.cursorY = Math.max(0, Math.min(this.height - 1, parts[0] - 1));
          this.cursorX = Math.max(
            0,
            Math.min(this.width - 1, (parts[1] || 1) - 1),
          );
        } else if (command === "J") {
          // Clear screen (2J = entire screen)
          if (params === "2") {
            for (let y = 0; y < this.height; y++) {
              for (let x = 0; x < this.width; x++) {
                this.cells[y][x] = " ";
              }
            }
          }
        } else if (isPrivate && params === "1049" && command === "h") {
          // Enter alternate screen — save cursor position
          this.savedCursorX = this.cursorX;
          this.savedCursorY = this.cursorY;
        } else if (isPrivate && params === "1049" && command === "l") {
          // Exit alternate screen — restore cursor position
          this.cursorX = this.savedCursorX;
          this.cursorY = this.savedCursorY;
        }
        // Skip other sequences (SGR, cursor visibility, etc.)

        i = j;
      } else if (data[i] === "\x1b") {
        // Skip other ESC sequences (consume ESC + next char)
        i += 2;
      } else if (data[i] >= " " || data[i] === "\t") {
        // Printable character
        if (this.cursorX < this.width && this.cursorY < this.height) {
          this.cells[this.cursorY][this.cursorX] = data[i];
          this.cursorX++;
        }
        i++;
      } else {
        // Skip control characters
        i++;
      }
    }
  }

  /**
   * Get the screen content as a string (rows joined by newlines).
   */
  getContent(): string {
    return this.cells.map((row) => row.join("")).join("\n");
  }

  /**
   * Get a specific row's content (trimmed of trailing spaces).
   */
  getRow(y: number): string {
    return this.cells[y]?.join("").trimEnd() ?? "";
  }

  /**
   * Check if the screen contains a string anywhere.
   */
  contains(text: string): boolean {
    return this.getContent().includes(text);
  }

  /**
   * Get the raw ANSI output (for checking escape sequences).
   */
  getRawOutput(): string {
    return this.rawOutput;
  }

  /**
   * Clear the raw output buffer (but keep screen state).
   */
  clearRawOutput(): void {
    this.rawOutput = "";
  }
}

/**
 * Create mock streams for testing mount() without a real TTY.
 * The stdout uses a VirtualScreen to track rendered content.
 */
function createMockStreams() {
  const stdin = Object.assign(new EventEmitter(), {
    isTTY: true,
    setRawMode: () => stdin,
    read: () => null,
    resume: () => {},
    pause: () => {},
  }) as unknown as NodeJS.ReadStream;

  readline.emitKeypressEvents(stdin);

  const screen = new VirtualScreen(80, 24);

  const stdout = Object.assign(new EventEmitter(), {
    isTTY: true,
    columns: 80,
    rows: 24,
    write: (data: string) => {
      screen.write(data);
      return true;
    },
  }) as unknown as NodeJS.WriteStream;

  return { stdin, stdout, screen };
}

/**
 * Simulate a keypress event via stdin.
 */
function emitKeypress(
  stdin: NodeJS.ReadStream,
  char: string,
  key: { name: string; ctrl?: boolean; shift?: boolean; meta?: boolean },
) {
  stdin.emit("keypress", char, { ...key, sequence: char });
}

/**
 * Wait for the next microtask (render scheduling uses queueMicrotask).
 */
function nextTick(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

describe("cursor position", () => {
  it("restores cursor to pre-mount row after unmount", () => {
    const { stdin, stdout, screen } = createMockStreams();

    // Simulate cursor at row 10 (not at the top of the screen)
    stdout.write("\x1b[11;1H");

    const app = App.mount(() => Text({ content: "Hello" }), { stdin, stdout });

    // After mount, cursor has moved somewhere in the TUI
    // After unmount, cursor should be back at row 10
    app.unmount();

    assert.strictEqual(
      screen.cursor.y,
      10,
      `cursor should be restored to row 10 after unmount, got row ${screen.cursor.y}`,
    );
  });

  it("unmounts immediately when Esc is pressed with mouse mode", async () => {
    // Create mock streams without readline.emitKeypressEvents — mouse mode
    // uses UnifiedParser which reads raw data, not readline keypress events.
    const stdin = Object.assign(new EventEmitter(), {
      isTTY: true,
      setRawMode: () => stdin,
      read: () => null,
      resume: () => {},
      pause: () => {},
    }) as unknown as NodeJS.ReadStream;

    const screen = new VirtualScreen(80, 24);
    const stdout = Object.assign(new EventEmitter(), {
      isTTY: true,
      columns: 80,
      rows: 24,
      write: (data: string) => {
        screen.write(data);
        return true;
      },
    }) as unknown as NodeJS.WriteStream;

    let unmounted = false;
    const appRef = { current: null as App | null };
    const app = App.mount(
      () =>
        Box({
          focusable: true,
          autoFocus: true,
          onKeyPress: (key) => {
            if (key.name === "escape") {
              appRef.current?.unmount();
              unmounted = true;
              return true;
            }
            return false;
          },
          children: [Text({ content: "Hello" })],
        }),
      { stdin, stdout, mouse: true },
    );
    appRef.current = app;

    // Send raw Esc byte — this is what the terminal sends when Esc is pressed
    stdin.emit("data", Buffer.from("\x1b"));

    // The UnifiedParser should resolve the standalone Esc within a short timeout,
    // not wait for the next input event
    await new Promise((resolve) => setTimeout(resolve, 150));

    assert.ok(
      unmounted,
      "App should unmount after Esc keypress without waiting for another input event",
    );
  });

  it("does not flush after unmount triggered by event handler", async () => {
    const { stdin, stdout, screen } = createMockStreams();

    // Simulate cursor at row 10 before the TUI starts
    stdout.write("\x1b[11;1H");

    // Use a reactive signal so the first flush renders "A" into the front buffer.
    // When the event handler updates it to "B" and then unmounts, the spurious
    // post-unmount doFlush would see front="A" vs back="B" and emit cursor-
    // positioning sequences onto the main screen — moving the cursor away from row 10.
    const [label, setLabel] = createSignal("A");

    const appRef = { current: null as App | null };
    const app = App.mount(
      () =>
        Box({
          focusable: true,
          autoFocus: true,
          onKeyPress: () => {
            setLabel("B"); // dirty the front/back diff before unmounting
            appRef.current?.unmount();
            return true;
          },
          children: [Text({ content: label })],
        }),
      { stdin, stdout, fpsLimit: 0 },
    );
    appRef.current = app;

    // Trigger unmount via event handler — this exercises the handleEvent bug path
    emitKeypress(stdin, "q", { name: "q" });

    // fpsLimit:0 schedules flushes via queueMicrotask; wait for that microtask to run
    await nextTick();

    assert.strictEqual(
      screen.cursor.y,
      10,
      `cursor should be restored to row 10 after event-triggered unmount, got row ${screen.cursor.y}`,
    );
  });
});

describe("integration", () => {
  describe("render pipeline", () => {
    it("renders Text content to screen", () => {
      const { stdin, stdout, screen } = createMockStreams();

      const app = App.mount(() => Text({ content: "Hello World" }), {
        stdin,
        stdout,
      });

      assert.ok(
        screen.contains("Hello World"),
        `Screen should contain 'Hello World', got row 0: '${screen.getRow(0)}'`,
      );

      app.unmount();
    });

    it("renders Box with multiple Text children", () => {
      const { stdin, stdout, screen } = createMockStreams();

      const app = App.mount(
        () =>
          Box({
            flexDirection: "column",
            children: [
              Text({ content: "Line 1" }),
              Text({ content: "Line 2" }),
              Text({ content: "Line 3" }),
            ],
          }),
        { stdin, stdout },
      );

      assert.ok(screen.contains("Line 1"), "Should render Line 1");
      assert.ok(screen.contains("Line 2"), "Should render Line 2");
      assert.ok(screen.contains("Line 3"), "Should render Line 3");

      app.unmount();
    });

    it("renders reactive Text content with initial value", () => {
      const { stdin, stdout, screen } = createMockStreams();
      const [text] = createSignal("Initial Value");

      const app = App.mount(() => Text({ content: text }), {
        stdin,
        stdout,
      });

      assert.ok(
        screen.contains("Initial Value"),
        "Should render initial signal value",
      );

      app.unmount();
    });

    it("renders nested Box hierarchy", () => {
      const { stdin, stdout, screen } = createMockStreams();

      const app = App.mount(
        () =>
          Box({
            children: [
              Box({
                children: [
                  Box({
                    children: [Text({ content: "Deeply nested" })],
                  }),
                ],
              }),
            ],
          }),
        { stdin, stdout },
      );

      assert.ok(screen.contains("Deeply nested"), "Should render nested text");

      app.unmount();
    });
  });

  describe("reactive updates via events", () => {
    it("updates Text content when signal changes during keypress", async () => {
      const { stdin, stdout, screen } = createMockStreams();
      const [count, setCount] = createSignal(0);

      const app = App.mount(
        () =>
          Box({
            focusable: true,
            autoFocus: true,
            onKeyPress: () => {
              setCount((c) => c + 1);
              return true;
            },
            children: [Text({ content: () => `Count: ${count()}` })],
          }),
        { stdin, stdout, fpsLimit: 0 },
      );

      // Initial render
      assert.ok(screen.contains("Count: 0"), "Initial should show Count: 0");

      // Trigger update
      emitKeypress(stdin, "x", { name: "x" });
      await nextTick();
      assert.ok(
        screen.contains("Count: 1"),
        `After keypress should show Count: 1, got: '${screen.getRow(0)}'`,
      );

      // Trigger another update
      emitKeypress(stdin, "x", { name: "x" });
      await nextTick();
      assert.ok(screen.contains("Count: 2"), "Should show Count: 2");

      app.unmount();
    });

    it("batches multiple signal updates within single event", async () => {
      const { stdin, stdout, screen } = createMockStreams();
      const [a, setA] = createSignal(0);
      const [b, setB] = createSignal(0);
      // Track the values seen during content calls to verify batching
      const valuesSeen: string[] = [];

      const app = App.mount(
        () =>
          Box({
            focusable: true,
            autoFocus: true,
            onKeyPress: () => {
              // Both updates happen in same batch (event handler)
              setA(1);
              setB(2);
              return true;
            },
            children: [
              Text({
                content: () => {
                  const value = `A=${a()} B=${b()}`;
                  // Only track unique values to see if we ever see partial state
                  if (!valuesSeen.includes(value)) {
                    valuesSeen.push(value);
                  }
                  return value;
                },
              }),
            ],
          }),
        { stdin, stdout, fpsLimit: 0 },
      );

      // Initial render should show A=0 B=0
      assert.deepStrictEqual(
        valuesSeen,
        ["A=0 B=0"],
        "Initial render should show A=0 B=0",
      );

      emitKeypress(stdin, "x", { name: "x" });
      await nextTick();

      assert.ok(screen.contains("A=1"), "Should show A=1");
      assert.ok(screen.contains("B=2"), "Should show B=2");

      // Key test: we should never see partial state like A=1 B=0
      // Batching ensures both updates are applied together
      assert.deepStrictEqual(
        valuesSeen,
        ["A=0 B=0", "A=1 B=2"],
        "Should jump from initial to final state without partial states",
      );

      app.unmount();
    });

    it("memo values update correctly", async () => {
      const { stdin, stdout, screen } = createMockStreams();
      const [count, setCount] = createSignal(1);
      const doubled = createMemo(() => count() * 2);

      const app = App.mount(
        () =>
          Box({
            focusable: true,
            autoFocus: true,
            onKeyPress: () => {
              setCount((c) => c + 1);
              return true;
            },
            children: [Text({ content: () => `Doubled: ${doubled()}` })],
          }),
        { stdin, stdout, fpsLimit: 0 },
      );

      assert.ok(screen.contains("Doubled: 2"), "Initial: 1*2=2");

      emitKeypress(stdin, "x", { name: "x" });
      await nextTick();
      assert.ok(screen.contains("Doubled: 4"), "After update: 2*2=4");

      app.unmount();
    });
  });

  describe("keyboard input routing", () => {
    it("routes events to focused node", () => {
      const { stdin, stdout, screen } = createMockStreams();
      let focusedReceived = false;
      let unfocusedReceived = false;

      const app = App.mount(
        () =>
          Box({
            children: [
              Box({
                focusable: true,
                autoFocus: true,
                onKeyPress: () => {
                  focusedReceived = true;
                  return true;
                },
                children: [Text({ content: "Focused" })],
              }),
              Box({
                focusable: true,
                onKeyPress: () => {
                  unfocusedReceived = true;
                  return true;
                },
                children: [Text({ content: "Not focused" })],
              }),
            ],
          }),
        { stdin, stdout },
      );

      emitKeypress(stdin, "x", { name: "x" });

      assert.ok(focusedReceived, "Focused node should receive event");
      assert.ok(!unfocusedReceived, "Unfocused node should not receive event");

      app.unmount();
    });

    it("bubbles events up when not consumed", () => {
      const { stdin, stdout, screen } = createMockStreams();
      const received: string[] = [];

      const app = App.mount(
        () =>
          Box({
            onKeyPress: () => {
              received.push("grandparent");
              return true;
            },
            children: [
              Box({
                onKeyPress: () => {
                  received.push("parent");
                  return false; // Don't consume
                },
                children: [
                  Box({
                    focusable: true,
                    autoFocus: true,
                    onKeyPress: () => {
                      received.push("child");
                      return false; // Don't consume
                    },
                    children: [Text({ content: "Deep" })],
                  }),
                ],
              }),
            ],
          }),
        { stdin, stdout },
      );

      emitKeypress(stdin, "x", { name: "x" });

      assert.deepStrictEqual(
        received,
        ["child", "parent", "grandparent"],
        "Events should bubble up in order",
      );

      app.unmount();
    });

    it("stops bubbling when event is consumed", () => {
      const { stdin, stdout, screen } = createMockStreams();
      const received: string[] = [];

      const app = App.mount(
        () =>
          Box({
            onKeyPress: () => {
              received.push("grandparent");
              return true;
            },
            children: [
              Box({
                onKeyPress: () => {
                  received.push("parent");
                  return true; // Consume here
                },
                children: [
                  Box({
                    focusable: true,
                    autoFocus: true,
                    onKeyPress: () => {
                      received.push("child");
                      return false;
                    },
                    children: [Text({ content: "Deep" })],
                  }),
                ],
              }),
            ],
          }),
        { stdin, stdout },
      );

      emitKeypress(stdin, "x", { name: "x" });

      assert.deepStrictEqual(
        received,
        ["child", "parent"],
        "Should stop at parent which consumed",
      );

      app.unmount();
    });

    it("provides correct key properties", () => {
      const { stdin, stdout, screen } = createMockStreams();
      let receivedKey: { name: string; ctrl: boolean; shift: boolean } | null =
        null;

      const app = App.mount(
        () =>
          Box({
            focusable: true,
            autoFocus: true,
            onKeyPress: (key) => {
              receivedKey = {
                name: key.name,
                ctrl: key.ctrl,
                shift: key.shift,
              };
              return true;
            },
            children: [Text({ content: "Input" })],
          }),
        { stdin, stdout },
      );

      emitKeypress(stdin, "a", { name: "a", ctrl: true, shift: true });

      assert.deepStrictEqual(receivedKey, {
        name: "a",
        ctrl: true,
        shift: true,
      });

      app.unmount();
    });
  });

  describe("TabFocus navigation", () => {
    it("Tab moves focus to next focusable", () => {
      const { stdin, stdout, screen } = createMockStreams();
      const focused: string[] = [];

      const app = App.mount(
        () =>
          TabFocus({
            children: [
              Box({
                focusable: true,
                autoFocus: true,
                onKeyPress: (key) => {
                  if (key.name !== "tab") focused.push("first");
                  return false;
                },
                children: [Text({ content: "First" })],
              }),
              Box({
                focusable: true,
                onKeyPress: (key) => {
                  if (key.name !== "tab") focused.push("second");
                  return false;
                },
                children: [Text({ content: "Second" })],
              }),
              Box({
                focusable: true,
                onKeyPress: (key) => {
                  if (key.name !== "tab") focused.push("third");
                  return false;
                },
                children: [Text({ content: "Third" })],
              }),
            ],
          }),
        { stdin, stdout },
      );

      // Initially first is focused
      emitKeypress(stdin, "x", { name: "x" });
      assert.deepStrictEqual(focused, ["first"]);

      // Tab to second
      focused.length = 0;
      emitKeypress(stdin, "\t", { name: "tab" });
      emitKeypress(stdin, "x", { name: "x" });
      assert.deepStrictEqual(focused, ["second"]);

      // Tab to third
      focused.length = 0;
      emitKeypress(stdin, "\t", { name: "tab" });
      emitKeypress(stdin, "x", { name: "x" });
      assert.deepStrictEqual(focused, ["third"]);

      app.unmount();
    });

    it("Shift+Tab moves focus to previous focusable", () => {
      const { stdin, stdout, screen } = createMockStreams();
      const focused: string[] = [];

      const app = App.mount(
        () =>
          TabFocus({
            children: [
              Box({
                focusable: true,
                onKeyPress: (key) => {
                  if (key.name !== "tab") focused.push("first");
                  return false;
                },
                children: [Text({ content: "First" })],
              }),
              Box({
                focusable: true,
                onKeyPress: (key) => {
                  if (key.name !== "tab") focused.push("second");
                  return false;
                },
                children: [Text({ content: "Second" })],
              }),
              Box({
                focusable: true,
                autoFocus: true,
                onKeyPress: (key) => {
                  if (key.name !== "tab") focused.push("third");
                  return false;
                },
                children: [Text({ content: "Third" })],
              }),
            ],
          }),
        { stdin, stdout },
      );

      // Initially third is focused
      emitKeypress(stdin, "x", { name: "x" });
      assert.deepStrictEqual(focused, ["third"]);

      // Shift+Tab to second
      focused.length = 0;
      emitKeypress(stdin, "\t", { name: "tab", shift: true });
      emitKeypress(stdin, "x", { name: "x" });
      assert.deepStrictEqual(focused, ["second"]);

      // Shift+Tab to first
      focused.length = 0;
      emitKeypress(stdin, "\t", { name: "tab", shift: true });
      emitKeypress(stdin, "x", { name: "x" });
      assert.deepStrictEqual(focused, ["first"]);

      app.unmount();
    });

    it("focus wraps around at boundaries", () => {
      const { stdin, stdout, screen } = createMockStreams();
      const focused: string[] = [];

      const app = App.mount(
        () =>
          TabFocus({
            children: [
              Box({
                focusable: true,
                autoFocus: true,
                onKeyPress: (key) => {
                  if (key.name !== "tab") focused.push("first");
                  return false;
                },
                children: [Text({ content: "First" })],
              }),
              Box({
                focusable: true,
                onKeyPress: (key) => {
                  if (key.name !== "tab") focused.push("second");
                  return false;
                },
                children: [Text({ content: "Second" })],
              }),
            ],
          }),
        { stdin, stdout },
      );

      // Tab twice to wrap back to first
      emitKeypress(stdin, "\t", { name: "tab" }); // -> second
      emitKeypress(stdin, "\t", { name: "tab" }); // -> first (wrap)
      emitKeypress(stdin, "x", { name: "x" });

      assert.deepStrictEqual(focused, ["first"]);

      app.unmount();
    });
  });

  describe("Show component", () => {
    it("renders children when condition is truthy", () => {
      const { stdin, stdout, screen } = createMockStreams();
      const [visible] = createSignal(true);

      const app = App.mount(
        () =>
          Show({
            when: visible,
            children: () => Text({ content: "Visible content" }),
          }),
        { stdin, stdout },
      );

      assert.ok(screen.contains("Visible content"), "Should render children");

      app.unmount();
    });

    it("renders fallback when condition is falsy", () => {
      const { stdin, stdout, screen } = createMockStreams();
      const [visible] = createSignal(false);

      const app = App.mount(
        () =>
          Show({
            when: visible,
            children: () => Text({ content: "Shown" }),
            fallback: () => Text({ content: "Fallback" }),
          }),
        { stdin, stdout },
      );

      assert.ok(!screen.contains("Shown"), "Should not render children");
      assert.ok(screen.contains("Fallback"), "Should render fallback");

      app.unmount();
    });

    it("switches branches when condition changes via event", async () => {
      const { stdin, stdout, screen } = createMockStreams();
      const [visible, setVisible] = createSignal(true);

      const app = App.mount(
        () =>
          Box({
            focusable: true,
            autoFocus: true,
            onKeyPress: () => {
              setVisible((v) => !v);
              return true;
            },
            children: [
              Show({
                when: visible,
                children: () => Text({ content: "VISIBLE" }),
                fallback: () => Text({ content: "HIDDEN" }),
              }),
            ],
          }),
        { stdin, stdout, fpsLimit: 0 },
      );

      assert.ok(screen.contains("VISIBLE"), "Initially visible");

      emitKeypress(stdin, "x", { name: "x" });
      await nextTick();
      assert.ok(screen.contains("HIDDEN"), "After toggle: hidden");

      emitKeypress(stdin, "x", { name: "x" });
      await nextTick();
      assert.ok(screen.contains("VISIBLE"), "After second toggle: visible");

      app.unmount();
    });

    it("disposes old branch when switching", () => {
      const { stdin, stdout, screen } = createMockStreams();
      const cleanups: string[] = [];
      const [visible, setVisible] = createSignal(true);

      const app = App.mount(
        () =>
          Box({
            focusable: true,
            autoFocus: true,
            onKeyPress: () => {
              setVisible((v) => !v);
              return true;
            },
            children: [
              Show({
                when: visible,
                children: () => {
                  onCleanup(() => cleanups.push("children"));
                  return Text({ content: "Children" });
                },
                fallback: () => {
                  onCleanup(() => cleanups.push("fallback"));
                  return Text({ content: "Fallback" });
                },
              }),
            ],
          }),
        { stdin, stdout },
      );

      assert.deepStrictEqual(cleanups, [], "No cleanups initially");

      emitKeypress(stdin, "x", { name: "x" }); // true -> false
      assert.deepStrictEqual(cleanups, ["children"], "Children disposed");

      emitKeypress(stdin, "x", { name: "x" }); // false -> true
      assert.deepStrictEqual(
        cleanups,
        ["children", "fallback"],
        "Fallback disposed",
      );

      app.unmount();
    });
  });

  describe("For component", () => {
    it("renders all items", () => {
      const { stdin, stdout, screen } = createMockStreams();
      const [items] = createSignal(["apple", "banana", "cherry"]);

      const app = App.mount(
        () =>
          For({
            each: items,
            render: (item) => Text({ content: item }),
          }),
        { stdin, stdout },
      );

      assert.ok(screen.contains("apple"), "Should render apple");
      assert.ok(screen.contains("banana"), "Should render banana");
      assert.ok(screen.contains("cherry"), "Should render cherry");

      app.unmount();
    });

    it("provides reactive index accessor", () => {
      const { stdin, stdout, screen } = createMockStreams();
      const [items] = createSignal(["x", "y", "z"]);

      const app = App.mount(
        () =>
          Box({
            flexDirection: "column",
            children: [
              For({
                each: items,
                render: (item, index) =>
                  Text({ content: () => `${index()}: ${item()}` }),
              }),
            ],
          }),
        { stdin, stdout },
      );

      assert.ok(screen.contains("0: x"), "Should render 0: x");
      assert.ok(screen.contains("1: y"), "Should render 1: y");
      assert.ok(screen.contains("2: z"), "Should render 2: z");

      app.unmount();
    });

    it("adds new items when list grows", async () => {
      const { stdin, stdout, screen } = createMockStreams();
      const [items, setItems] = createSignal(["a", "b"]);

      const app = App.mount(
        () =>
          Box({
            focusable: true,
            autoFocus: true,
            onKeyPress: () => {
              setItems(["a", "b", "c", "d"]);
              return true;
            },
            children: [
              For({
                each: items,
                render: (item) => Text({ content: item }),
              }),
            ],
          }),
        { stdin, stdout, fpsLimit: 0 },
      );

      assert.ok(screen.contains("a"), "Initial: has a");
      assert.ok(screen.contains("b"), "Initial: has b");
      assert.ok(!screen.contains("c"), "Initial: no c");

      emitKeypress(stdin, "x", { name: "x" });
      await nextTick();

      assert.ok(screen.contains("c"), "After add: has c");
      assert.ok(screen.contains("d"), "After add: has d");

      app.unmount();
    });

    it("removes items and calls cleanup", () => {
      const { stdin, stdout, screen } = createMockStreams();
      const cleanups: string[] = [];
      const [items, setItems] = createSignal(["a", "b", "c"]);

      const app = App.mount(
        () =>
          Box({
            focusable: true,
            autoFocus: true,
            onKeyPress: () => {
              setItems(["a", "c"]); // Remove b
              return true;
            },
            children: [
              For({
                each: items,
                render: (item) => {
                  const val = item();
                  onCleanup(() => cleanups.push(val));
                  return Text({ content: item });
                },
              }),
            ],
          }),
        { stdin, stdout },
      );

      emitKeypress(stdin, "x", { name: "x" });

      assert.ok(cleanups.includes("b"), "Removed item b should be cleaned up");
      assert.ok(!cleanups.includes("a"), "Item a should not be cleaned up");
      assert.ok(!cleanups.includes("c"), "Item c should not be cleaned up");

      app.unmount();
    });

    it("reorders items without recreating them", () => {
      const { stdin, stdout, screen } = createMockStreams();
      const createCount = { value: 0 };
      const [items, setItems] = createSignal(["a", "b", "c"]);

      const app = App.mount(
        () =>
          Box({
            focusable: true,
            autoFocus: true,
            onKeyPress: () => {
              setItems(["c", "a", "b"]); // Reorder
              return true;
            },
            children: [
              For({
                each: items,
                render: (item) => {
                  createCount.value++;
                  return Text({ content: item });
                },
              }),
            ],
          }),
        { stdin, stdout },
      );

      const initialCreates = createCount.value;
      assert.strictEqual(initialCreates, 3, "Should create 3 items initially");

      emitKeypress(stdin, "x", { name: "x" });

      // No new items created on reorder (keyed by identity)
      assert.strictEqual(
        createCount.value,
        initialCreates,
        "Reorder should not create new items",
      );

      app.unmount();
    });
  });

  describe("cleanup and lifecycle", () => {
    it("calls onCleanup on unmount", () => {
      const { stdin, stdout, screen } = createMockStreams();
      let cleanupCalled = false;

      const app = App.mount(
        () => {
          onCleanup(() => {
            cleanupCalled = true;
          });
          return Text({ content: "Test" });
        },
        { stdin, stdout },
      );

      assert.ok(!cleanupCalled, "Cleanup not called before unmount");
      app.unmount();
      assert.ok(cleanupCalled, "Cleanup called after unmount");
    });

    it("disposes nested effects on unmount", () => {
      const { stdin, stdout, screen } = createMockStreams();
      const [signal, setSignal] = createSignal(0);
      let effectRuns = 0;

      const app = App.mount(
        () => {
          createEffect(() => {
            signal();
            effectRuns++;
          });
          return Box({
            focusable: true,
            autoFocus: true,
            onKeyPress: () => {
              setSignal((s) => s + 1);
              return true;
            },
            children: [Text({ content: "Test" })],
          });
        },
        { stdin, stdout },
      );

      const runsBeforeUnmount = effectRuns;

      // Effect should run on signal change
      emitKeypress(stdin, "x", { name: "x" });
      assert.strictEqual(
        effectRuns,
        runsBeforeUnmount + 1,
        "Effect runs on signal change",
      );

      app.unmount();
    });
  });

  describe("terminal state management", () => {
    it("enters alternate screen buffer on mount", () => {
      const { stdin, stdout, screen } = createMockStreams();

      const app = App.mount(() => Text({ content: "Test" }), {
        stdin,
        stdout,
        alternateScreen: true,
      });

      assert.ok(
        screen.getRawOutput().includes("\x1b[?1049h"),
        "Should enter alternate screen",
      );

      app.unmount();
    });

    it("skips alternate screen when disabled", () => {
      const { stdin, stdout, screen } = createMockStreams();

      const app = App.mount(() => Text({ content: "Test" }), {
        stdin,
        stdout,
        alternateScreen: false,
      });

      assert.ok(
        !screen.getRawOutput().includes("\x1b[?1049h"),
        "Should not enter alternate screen",
      );

      app.unmount();
    });

    it("hides cursor on mount", () => {
      const { stdin, stdout, screen } = createMockStreams();

      const app = App.mount(() => Text({ content: "Test" }), {
        stdin,
        stdout,
      });

      assert.ok(
        screen.getRawOutput().includes("\x1b[?25l"),
        "Should hide cursor",
      );

      app.unmount();
    });

    it("restores terminal state on unmount", () => {
      const { stdin, stdout, screen } = createMockStreams();

      const app = App.mount(() => Text({ content: "Test" }), {
        stdin,
        stdout,
        alternateScreen: true,
      });

      screen.clearRawOutput();
      app.unmount();

      const output = screen.getRawOutput();
      assert.ok(output.includes("\x1b[?25h"), "Should show cursor");
      assert.ok(output.includes("\x1b[?1049l"), "Should exit alternate screen");
    });

    it("clears screen on mount", () => {
      const { stdin, stdout, screen } = createMockStreams();

      const app = App.mount(() => Text({ content: "Test" }), {
        stdin,
        stdout,
      });

      assert.ok(
        screen.getRawOutput().includes("\x1b[2J"),
        "Should clear screen",
      );

      app.unmount();
    });
  });

  describe("Input component rendering", () => {
    /**
     * Extended VirtualScreen that tracks SGR modifiers (bold, inverse, etc.)
     * for each cell, not just the character.
     */
    class VirtualScreenWithModifiers {
      private cells: Array<{ char: string; inverse: boolean }>[];
      private cursorX = 0;
      private cursorY = 0;
      private currentInverse = false;
      width: number;
      height: number;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.cells = Array.from({ length: height }, () =>
          Array.from({ length: width }, () => ({ char: " ", inverse: false })),
        );
      }

      write(data: string): void {
        let i = 0;
        while (i < data.length) {
          if (data[i] === "\x1b" && data[i + 1] === "[") {
            // Parse CSI sequence
            let j = i + 2;

            // Handle optional ? for private mode sequences
            if (data[j] === "?") {
              j++;
            }

            // Collect parameters
            let params = "";
            while (j < data.length && /[0-9;]/.test(data[j])) {
              params += data[j];
              j++;
            }

            const command = data[j];
            j++;

            if (command === "H") {
              // Cursor position
              const parts = params
                .split(";")
                .map((p) => Number.parseInt(p, 10) || 1);
              this.cursorY = Math.max(
                0,
                Math.min(this.height - 1, parts[0] - 1),
              );
              this.cursorX = Math.max(
                0,
                Math.min(this.width - 1, (parts[1] || 1) - 1),
              );
            } else if (command === "J") {
              // Clear screen (2J = entire screen)
              if (params === "2") {
                for (let y = 0; y < this.height; y++) {
                  for (let x = 0; x < this.width; x++) {
                    this.cells[y][x] = { char: " ", inverse: false };
                  }
                }
              }
            } else if (command === "m") {
              // SGR - style attributes
              const codes = params
                .split(";")
                .map((p) => Number.parseInt(p, 10) || 0);
              for (const code of codes) {
                if (code === 0) {
                  // Reset
                  this.currentInverse = false;
                } else if (code === 7) {
                  // Inverse
                  this.currentInverse = true;
                } else if (code === 27) {
                  // Inverse off
                  this.currentInverse = false;
                }
              }
            }

            i = j;
          } else if (data[i] >= " " || data[i] === "\t") {
            // Printable character
            if (this.cursorX < this.width && this.cursorY < this.height) {
              this.cells[this.cursorY][this.cursorX] = {
                char: data[i],
                inverse: this.currentInverse,
              };
              this.cursorX++;
            }
            i++;
          } else {
            // Skip control characters
            i++;
          }
        }
      }

      /**
       * Get the character at a position.
       */
      getChar(x: number, y: number): string {
        return this.cells[y]?.[x]?.char ?? " ";
      }

      /**
       * Check if a cell has the INVERSE modifier (cursor).
       */
      isInverse(x: number, y: number): boolean {
        return this.cells[y]?.[x]?.inverse ?? false;
      }

      /**
       * Get the row as a string.
       */
      getRow(y: number): string {
        return (
          this.cells[y]
            ?.map((c) => c.char)
            .join("")
            .trimEnd() ?? ""
        );
      }

      /**
       * Find all positions with INVERSE modifier on a given row.
       */
      getInversePositions(y: number): number[] {
        const positions: number[] = [];
        const row = this.cells[y];
        if (row) {
          for (let x = 0; x < row.length; x++) {
            if (row[x].inverse) {
              positions.push(x);
            }
          }
        }
        return positions;
      }
    }

    function createMockStreamsWithModifiers() {
      const stdin = Object.assign(new EventEmitter(), {
        isTTY: true,
        setRawMode: () => stdin,
        read: () => null,
        resume: () => {},
        pause: () => {},
      }) as unknown as NodeJS.ReadStream;

      readline.emitKeypressEvents(stdin);

      const screen = new VirtualScreenWithModifiers(80, 24);

      const stdout = Object.assign(new EventEmitter(), {
        isTTY: true,
        columns: 80,
        rows: 24,
        write: (data: string) => {
          screen.write(data);
          return true;
        },
      }) as unknown as NodeJS.WriteStream;

      return { stdin, stdout, screen };
    }

    it("shows typed character immediately, not on next keystroke", async () => {
      const { stdin, stdout, screen } = createMockStreamsWithModifiers();
      const [value, setValue] = createSignal("");

      const app = App.mount(
        () =>
          Box({
            children: [
              Input({
                value,
                onChange: setValue,
                width: 20,
                autoFocus: true,
              }),
            ],
          }),
        { stdin, stdout, fpsLimit: 0 },
      );

      // Initial state: empty input with cursor at position 0
      await nextTick();

      // Type 'a'
      emitKeypress(stdin, "a", { name: "a" });
      await nextTick();

      // The 'a' should be visible at position 0, cursor at position 1
      assert.strictEqual(
        screen.getChar(0, 0),
        "a",
        `After typing 'a': position 0 should be 'a', got '${screen.getChar(0, 0)}'`,
      );

      // Type 'b'
      emitKeypress(stdin, "b", { name: "b" });
      await nextTick();

      // Both 'a' and 'b' should be visible
      assert.strictEqual(
        screen.getChar(0, 0),
        "a",
        `After typing 'b': position 0 should still be 'a', got '${screen.getChar(0, 0)}'`,
      );
      assert.strictEqual(
        screen.getChar(1, 0),
        "b",
        `After typing 'b': position 1 should be 'b', got '${screen.getChar(1, 0)}'`,
      );

      // Type 'c'
      emitKeypress(stdin, "c", { name: "c" });
      await nextTick();

      assert.strictEqual(
        screen.getRow(0).substring(0, 3),
        "abc",
        "Should show 'abc'",
      );

      app.unmount();
    });

    it("cursor (INVERSE) moves to correct position after typing", async () => {
      const { stdin, stdout, screen } = createMockStreamsWithModifiers();
      const [value, setValue] = createSignal("");

      const app = App.mount(
        () =>
          Box({
            children: [
              Input({
                value,
                onChange: setValue,
                width: 20,
                autoFocus: true,
              }),
            ],
          }),
        { stdin, stdout, fpsLimit: 0 },
      );

      await nextTick();

      // Initial: cursor should be at position 0 (empty input)
      let inversePositions = screen.getInversePositions(0);
      assert.deepStrictEqual(
        inversePositions,
        [0],
        `Initial: cursor should be at position 0, got ${JSON.stringify(inversePositions)}`,
      );

      // Type 'a' - cursor should move to position 1
      emitKeypress(stdin, "a", { name: "a" });
      await nextTick();

      inversePositions = screen.getInversePositions(0);
      assert.deepStrictEqual(
        inversePositions,
        [1],
        `After 'a': cursor should be at position 1 only, got ${JSON.stringify(inversePositions)}`,
      );

      // Type 'b' - cursor should move to position 2
      emitKeypress(stdin, "b", { name: "b" });
      await nextTick();

      inversePositions = screen.getInversePositions(0);
      assert.deepStrictEqual(
        inversePositions,
        [2],
        `After 'ab': cursor should be at position 2 only, got ${JSON.stringify(inversePositions)}`,
      );

      // Type 'c' - cursor should move to position 3
      emitKeypress(stdin, "c", { name: "c" });
      await nextTick();

      inversePositions = screen.getInversePositions(0);
      assert.deepStrictEqual(
        inversePositions,
        [3],
        `After 'abc': cursor should be at position 3 only, got ${JSON.stringify(inversePositions)}`,
      );

      app.unmount();
    });

    it("no residual INVERSE when focus moves away", async () => {
      const { stdin, stdout, screen } = createMockStreamsWithModifiers();
      const [value1, setValue1] = createSignal("hello");
      const [value2, setValue2] = createSignal("world");

      const app = App.mount(
        () =>
          TabFocus({
            children: [
              Box({
                flexDirection: "column",
                children: [
                  Input({
                    value: value1,
                    onChange: setValue1,
                    width: 20,
                    autoFocus: true,
                  }),
                  Input({
                    value: value2,
                    onChange: setValue2,
                    width: 20,
                  }),
                ],
              }),
            ],
          }),
        { stdin, stdout, fpsLimit: 0 },
      );

      await nextTick();

      // First input is focused, cursor at position 5 (end of "hello")
      let row0Inverse = screen.getInversePositions(0);
      assert.ok(
        row0Inverse.length > 0,
        "First input should have cursor (INVERSE)",
      );

      // Tab to second input
      emitKeypress(stdin, "\t", { name: "tab" });
      await nextTick();

      // First input should have NO inverse cells anymore
      row0Inverse = screen.getInversePositions(0);
      assert.deepStrictEqual(
        row0Inverse,
        [],
        `After Tab: first input should have no INVERSE, got positions ${JSON.stringify(row0Inverse)}`,
      );

      // Second input should have cursor
      const row1Inverse = screen.getInversePositions(1);
      assert.ok(
        row1Inverse.length > 0,
        `After Tab: second input should have cursor, got ${JSON.stringify(row1Inverse)}`,
      );

      app.unmount();
    });
  });

  describe("text inside box with backgroundColor", () => {
    it("renders text inside a box with backgroundColor", () => {
      const { stdin, stdout, screen } = createMockStreams();

      const cardBg = { type: "palette" as const, index: 236 };

      const app = App.mount(
        () =>
          Box({
            flexDirection: "column",
            width: 52,
            border: true,
            borderStyle: "round" as const,
            children: [
              Box({
                paddingStart: 2,
                paddingEnd: 2,
                paddingTop: 1,
                paddingBottom: 1,
                backgroundColor: cardBg,
                children: [Text({ content: "Settings", bold: true })],
              }),
              Box({
                flexDirection: "column",
                paddingStart: 2,
                paddingEnd: 2,
                paddingBottom: 1,
                children: [Text({ content: "Content here" })],
              }),
            ],
          }),
        { stdin, stdout },
      );

      assert.ok(
        screen.contains("Settings"),
        `Screen should contain 'Settings'. Row 0: '${screen.getRow(0)}', Row 1: '${screen.getRow(1)}', Row 2: '${screen.getRow(2)}', Row 3: '${screen.getRow(3)}'`,
      );

      app.unmount();
    });

    it("renders header text in a centered card layout (settings pattern)", () => {
      const { stdin, stdout, screen } = createMockStreams();

      const cardBg = { type: "palette" as const, index: 236 };

      const app = App.mount(
        () =>
          Box({
            flexGrow: 1,
            children: [
              Box({
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flexGrow: 1,
                children: [
                  Box({
                    flexDirection: "column",
                    width: 52,
                    border: true,
                    borderStyle: "round" as const,
                    children: [
                      Box({
                        paddingStart: 2,
                        paddingEnd: 2,
                        paddingTop: 1,
                        paddingBottom: 1,
                        backgroundColor: cardBg,
                        children: [Text({ content: "Settings", bold: true })],
                      }),
                      Box({
                        flexDirection: "column",
                        paddingStart: 2,
                        paddingEnd: 2,
                        paddingBottom: 1,
                        gap: 1,
                        children: [
                          Text({ content: "Row 1" }),
                          Text({ content: "Row 2" }),
                          Text({ content: "Row 3" }),
                          Text({ content: "Row 4" }),
                          Text({ content: "Row 5" }),
                          Text({ content: "Row 6" }),
                          Text({ content: "Row 7" }),
                          Text({ content: "Row 8" }),
                          Text({ content: "Row 9" }),
                          Text({ content: "Row 10" }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        { stdin, stdout },
      );

      assert.ok(
        screen.contains("Settings"),
        `Screen should contain 'Settings'. Rows:\n${Array.from({ length: 24 }, (_, i) => `  ${i}: '${screen.getRow(i)}'`).join("\n")}`,
      );

      app.unmount();
    });

    it("renders SectionHeader text when content overflows", () => {
      const { stdin, stdout, screen } = createMockStreams();

      // Reproduce SectionHeader pattern: column box with Text + Separator-like element
      function SectionHeader(title: string) {
        return Box({
          flexDirection: "column",
          gap: 0,
          marginTop: 1,
          children: [
            Text({ content: title, bold: true }),
            Box({ border: { top: true }, height: 1, alignSelf: "stretch" }),
          ],
        });
      }

      const app = App.mount(
        () =>
          Box({
            flexDirection: "column",
            width: 40,
            height: 20,
            children: [
              SectionHeader("Profile"),
              Text({ content: "Field 1" }),
              Text({ content: "Field 2" }),
              SectionHeader("Preferences"),
              Text({ content: "Field 3" }),
              Text({ content: "Field 4" }),
              Text({ content: "Field 5" }),
              Text({ content: "Field 6" }),
              Text({ content: "Field 7" }),
              Text({ content: "Field 8" }),
              Text({ content: "Field 9" }),
              Text({ content: "Field 10" }),
              Text({ content: "Field 11" }),
              Text({ content: "Field 12" }),
              Text({ content: "Field 13" }),
              Text({ content: "Field 14" }),
              Text({ content: "Field 15" }),
              Text({ content: "Field 16" }),
              Text({ content: "Field 17" }),
              Text({ content: "Field 18" }),
            ],
          }),
        { stdin, stdout },
      );

      assert.ok(
        screen.contains("Profile"),
        `Screen should contain 'Profile'. Rows:\n${Array.from({ length: 24 }, (_, i) => `  ${i}: '${screen.getRow(i)}'`).join("\n")}`,
      );

      app.unmount();
    });
  });

  describe("root scroll", () => {
    it("scrolls overflowing content instead of crushing it", () => {
      const { stdin, stdout, screen } = createMockStreams();

      const app = App.mount(
        () =>
          Box({
            flexDirection: "column",
            children: Array.from({ length: 30 }, (_, i) =>
              Text({ content: `Line ${i + 1}` }),
            ),
          }),
        { stdin, stdout },
      );

      // First lines should be visible
      assert.ok(screen.contains("Line 1"), "Line 1 should be visible");
      assert.ok(screen.contains("Line 2"), "Line 2 should be visible");

      // Lines beyond viewport should NOT be visible (clipped by scroll)
      assert.ok(!screen.contains("Line 25"), "Line 25 should be off-screen initially");

      app.unmount();
    });

    it("scrolling reaches the very bottom of complex content", async () => {
      // Reproduce settings-like structure with padding, borders, gaps, margins
      // that estimateContentHeight() might undercount
      const stdin = Object.assign(new EventEmitter(), {
        isTTY: true,
        setRawMode: () => stdin,
        read: () => null,
        resume: () => {},
        pause: () => {},
      }) as unknown as NodeJS.ReadStream;

      const screen = new VirtualScreen(80, 24);
      const stdout = Object.assign(new EventEmitter(), {
        isTTY: true,
        columns: 80,
        rows: 24,
        write: (data: string) => {
          screen.write(data);
          return true;
        },
      }) as unknown as NodeJS.WriteStream;

      const [val, setVal] = createSignal("test");

      const appRef = { current: null as App | null };
      const app = App.mount(
        () =>
          Box({
            flexGrow: 1,
            focusable: true,
            onKeyPress: (key) => {
              if (key.name === "escape") { appRef.current?.unmount(); return true; }
              return false;
            },
            children: [
              TabFocus({
                children: [
                  Box({
                    flexDirection: "column",
                    alignItems: "center",
                    flexGrow: 1,
                    children: [
                      Box({
                        flexDirection: "column",
                        width: 52,
                        border: true,
                        borderStyle: "round" as const,
                        children: [
                          // Header with padding
                          Box({
                            paddingStart: 2, paddingEnd: 2,
                            paddingTop: 1, paddingBottom: 1,
                            children: [Text({ content: "Header", bold: true })],
                          }),
                          // Content with padding, gaps, and nested borders
                          Box({
                            flexDirection: "column",
                            paddingStart: 2, paddingEnd: 2, paddingBottom: 1,
                            gap: 1,
                            children: [
                              // Section with margin
                              Box({
                                flexDirection: "column", marginTop: 1,
                                children: [
                                  Text({ content: "Section 1" }),
                                  Separator({ style: { marginTop: 0 } }),
                                ],
                              }),
                              // Rows with bordered inputs
                              Box({
                                flexDirection: "row", gap: 2,
                                children: [
                                  Box({ width: 14, children: [Text({ content: "Field 1" })] }),
                                  Box({ border: "single", children: [Input({ value: val, onChange: setVal, width: 28 })] }),
                                ],
                              }),
                              Box({
                                flexDirection: "row", gap: 2,
                                children: [
                                  Box({ width: 14, children: [Text({ content: "Field 2" })] }),
                                  Box({ border: "single", children: [Textarea({ value: val, onChange: setVal, width: 28, maxHeight: 3 })] }),
                                ],
                              }),
                              Box({
                                flexDirection: "column", marginTop: 1,
                                children: [
                                  Text({ content: "Section 2" }),
                                  Separator({ style: { marginTop: 0 } }),
                                ],
                              }),
                              Text({ content: "Row A" }),
                              Text({ content: "Row B" }),
                              Text({ content: "Row C" }),
                              Box({
                                flexDirection: "column", marginTop: 1,
                                children: [
                                  Text({ content: "Section 3" }),
                                  Separator({ style: { marginTop: 0 } }),
                                ],
                              }),
                              Text({ content: "Row D" }),
                              Text({ content: "Row E" }),
                              // Bottom buttons — these MUST be reachable
                              Box({
                                flexDirection: "row", justifyContent: "flex-end",
                                gap: 2, marginTop: 2,
                                children: [
                                  Box({ border: "single", children: [Text({ content: " Cancel " })] }),
                                  Box({ border: "single", children: [Text({ content: " Save " })] }),
                                ],
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        { stdin, stdout, mouse: true },
      );
      appRef.current = app;

      // Scroll all the way down (more events than content height to hit the max)
      for (let i = 0; i < 60; i++) {
        stdin.emit("data", Buffer.from("\x1b[<65;40;12M"));
      }
      await new Promise((resolve) => setTimeout(resolve, 300));

      assert.ok(
        screen.contains("Save"),
        `After scrolling to bottom, "Save" button must be reachable. Rows:\n${Array.from({ length: 24 }, (_, i) => `  ${i}: '${screen.getRow(i)}'`).join("\n")}`,
      );

      app.unmount();
    });

    it("settings app scrolls with mouse wheel", async () => {
      // Exact reproduction of the settings example structure
      const stdin = Object.assign(new EventEmitter(), {
        isTTY: true,
        setRawMode: () => stdin,
        read: () => null,
        resume: () => {},
        pause: () => {},
      }) as unknown as NodeJS.ReadStream;

      const screen = new VirtualScreen(80, 24);
      const stdout = Object.assign(new EventEmitter(), {
        isTTY: true,
        columns: 80,
        rows: 24,
        write: (data: string) => {
          screen.write(data);
          return true;
        },
      }) as unknown as NodeJS.WriteStream;

      const [username, setUsername] = createSignal("johndoe");
      const [bio, setBio] = createSignal("Software developer\nLoves building TUIs");
      const [theme, setTheme] = createSignal<"light" | "dark" | "system">("dark");
      const [notifications, setNotifications] = createSignal(true);
      const [sound, setSound] = createSignal(false);
      const [country, setCountry] = createSignal("us");

      function SectionHeader(title: string) {
        return Box({
          flexDirection: "column",
          gap: 0,
          marginTop: 1,
          children: [
            Text({ content: title, bold: true }),
            Separator({ style: { marginTop: 0 } }),
          ],
        });
      }

      function FormRow(props: { label: string; children: ReturnType<typeof Box>; alignTop?: boolean }) {
        return Box({
          flexDirection: "row",
          gap: 2,
          alignItems: props.alignTop ? "flex-start" : "center",
          children: [
            Box({ width: 14, children: [Label({ children: props.label })] }),
            props.children,
          ],
        });
      }

      const appRef = { current: null as App | null };
      const app = App.mount(
        () =>
          Box({
            flexGrow: 1,
            focusable: true,
            onKeyPress: (key) => {
              if (key.name === "escape") { appRef.current?.unmount(); return true; }
              return false;
            },
            children: [
              TabFocus({
                children: [
                  Box({
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    flexGrow: 1,
                    children: [
                      Box({
                        flexDirection: "column",
                        width: 52,
                        border: true,
                        borderStyle: "round" as const,
                        children: [
                          Box({
                            paddingStart: 2, paddingEnd: 2, paddingTop: 1, paddingBottom: 1,
                            children: [Text({ content: "Settings", bold: true })],
                          }),
                          Box({
                            flexDirection: "column",
                            paddingStart: 2, paddingEnd: 2, paddingBottom: 1,
                            gap: 1,
                            children: [
                              SectionHeader("Profile"),
                              FormRow({
                                label: "Username",
                                children: Box({
                                  border: "single",
                                  children: [Input({ value: username, onChange: setUsername, width: 28, autoFocus: true })],
                                }),
                              }),
                              FormRow({
                                label: "Bio", alignTop: true,
                                children: Box({
                                  border: "single",
                                  children: [Textarea({ value: bio, onChange: setBio, width: 28, maxHeight: 3 })],
                                }),
                              }),
                              SectionHeader("Preferences"),
                              FormRow({
                                label: "Theme",
                                children: RadioGroup({
                                  value: theme, onChange: setTheme, direction: "row",
                                  options: [
                                    { value: "light" as const, label: "Light" },
                                    { value: "dark" as const, label: "Dark" },
                                    { value: "system" as const, label: "System" },
                                  ],
                                }),
                              }),
                              FormRow({
                                label: "Notifications",
                                children: Box({
                                  flexDirection: "row", gap: 1, alignItems: "center",
                                  children: [
                                    Switch({ checked: notifications, onChange: setNotifications }),
                                    Label({ children: "Enabled" }),
                                  ],
                                }),
                              }),
                              FormRow({
                                label: "Sound",
                                children: Box({
                                  flexDirection: "row", gap: 1, alignItems: "center",
                                  children: [
                                    Switch({ checked: sound, onChange: setSound }),
                                    Label({ children: "Disabled" }),
                                  ],
                                }),
                              }),
                              SectionHeader("Region"),
                              FormRow({
                                label: "Country",
                                children: Select({
                                  value: country, onChange: setCountry,
                                  options: [
                                    { value: "us", label: "United States" },
                                    { value: "uk", label: "United Kingdom" },
                                  ],
                                  renderTrigger: (props) => Box({
                                    border: "single", width: 22,
                                    children: [Text({ content: () => ` ${props.label()}` })],
                                  }),
                                  renderOption: (props) => Text({ content: () => `  ${props.option.label}` }),
                                }),
                              }),
                              Box({
                                flexDirection: "row", justifyContent: "flex-end", gap: 2, marginTop: 2,
                                children: [
                                  Box({ border: "single", children: [Text({ content: " Cancel " })] }),
                                  Box({ border: "single", children: [Text({ content: " Save " })] }),
                                ],
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        { stdin, stdout, mouse: true },
      );
      appRef.current = app;

      // Settings header should be visible
      assert.ok(screen.contains("Settings"), "Settings header should be visible");

      // Send mouse wheel-down events to scroll past viewport
      for (let i = 0; i < 24; i++) {
        stdin.emit("data", Buffer.from("\x1b[<65;40;12M"));
      }
      await new Promise((resolve) => setTimeout(resolve, 300));

      assert.ok(
        !screen.contains("Settings"),
        `After scrolling 24 lines, "Settings" header should be off-screen. Rows:\n${Array.from({ length: 24 }, (_, i) => `  ${i}: '${screen.getRow(i)}'`).join("\n")}`,
      );

      app.unmount();
    });

    it("mouse wheel scrolls when mouse mode is enabled", async () => {
      // Mouse mode uses UnifiedParser which reads raw data, not readline
      const stdin = Object.assign(new EventEmitter(), {
        isTTY: true,
        setRawMode: () => stdin,
        read: () => null,
        resume: () => {},
        pause: () => {},
      }) as unknown as NodeJS.ReadStream;

      const screen = new VirtualScreen(80, 24);
      const stdout = Object.assign(new EventEmitter(), {
        isTTY: true,
        columns: 80,
        rows: 24,
        write: (data: string) => {
          screen.write(data);
          return true;
        },
      }) as unknown as NodeJS.WriteStream;

      const app = App.mount(
        () =>
          Box({
            flexGrow: 1,
            focusable: true,
            autoFocus: true,
            children: [
              TabFocus({
                children: [
                  Box({
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    flexGrow: 1,
                    children: [
                      Box({
                        flexDirection: "column",
                        width: 52,
                        border: true,
                        children: Array.from({ length: 30 }, (_, i) =>
                          Text({ content: `Row ${String(i + 1).padStart(2, "0")}` }),
                        ),
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        { stdin, stdout, mouse: true },
      );

      assert.ok(screen.contains("Row 01"), "Row 01 should be visible initially");

      // Send 24 mouse wheel-down events (SGR encoding: button 65 = scroll down)
      for (let i = 0; i < 24; i++) {
        stdin.emit("data", Buffer.from("\x1b[<65;40;12M"));
      }
      await new Promise((resolve) => setTimeout(resolve, 200));

      assert.ok(
        !screen.contains("Row 01"),
        `After scrolling down 24 lines, Row 01 should be off-screen. Rows:\n${Array.from({ length: 24 }, (_, i) => `  ${i}: '${screen.getRow(i)}'`).join("\n")}`,
      );

      app.unmount();
    });

    it("preserves flexGrow and centering when content fits", () => {
      const { stdin, stdout, screen } = createMockStreams();

      const app = App.mount(
        () =>
          Box({
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flexGrow: 1,
            children: [Text({ content: "Centered" })],
          }),
        { stdin, stdout },
      );

      // "Centered" should not be at row 0 — it should be vertically centered
      const row0 = screen.getRow(0);
      assert.ok(
        !row0.includes("Centered"),
        `Text should be centered, not at row 0. Row 0: '${row0}'`,
      );
      assert.ok(screen.contains("Centered"), "Text should be visible somewhere");

      app.unmount();
    });

    it("centers content vertically through TabFocus wrapper", () => {
      const { stdin, stdout, screen } = createMockStreams();

      const app = App.mount(
        () =>
          TabFocus({
            children: [
              Box({
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flexGrow: 1,
                children: [Text({ content: "CENTERED" })],
              }),
            ],
          }),
        { stdin, stdout },
      );

      // "CENTERED" should be vertically centered (~row 11), not at the top
      const row0 = screen.getRow(0);
      assert.ok(
        !row0.includes("CENTERED"),
        `Text should be centered, not at row 0. Row 0: '${row0}'`,
      );
      assert.ok(screen.contains("CENTERED"), "Text should be visible somewhere");

      app.unmount();
    });

    it("hides scrollbar when content fits viewport", () => {
      const { stdin, stdout, screen } = createMockStreams();

      const app = App.mount(
        () => Text({ content: "short content" }),
        { stdin, stdout },
      );

      // When content fits the viewport, no scrollbar should be visible
      const content = screen.getContent();
      assert.ok(
        !content.includes("\u2502") && !content.includes("\u2503"),
        "Scrollbar characters should not appear when content fits viewport",
      );

      app.unmount();
    });

    it("does not wrap in ScrollArea when scroll: false", () => {
      const { stdin, stdout, screen } = createMockStreams();

      const app = App.mount(
        () =>
          Box({
            flexDirection: "column",
            children: Array.from({ length: 30 }, (_, i) =>
              Text({ content: `Line ${i + 1}` }),
            ),
          }),
        { stdin, stdout, scroll: false },
      );

      // Without scroll wrapping, content gets flex-shrunk or overflows
      // but no scrollbar column should be present
      // Line 1 should still render (it's at the top)
      assert.ok(screen.contains("Line 1"), "Line 1 should be visible");

      app.unmount();
    });
  });
});
