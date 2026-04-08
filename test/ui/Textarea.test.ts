import assert from "node:assert";
import { describe, it } from "node:test";
import { INVERSE } from "../../src/core/buffer.ts";
import { App, Box, createRef } from "../../src/core/runtime.ts";
import { createSignal } from "../../src/core/signals.ts";
import { setTheme } from "../../src/core/theme.ts";
import defaultThemeJson from "../../src/default-theme.json" with {
  type: "json",
};
import { Textarea } from "../../src/ui/Textarea.ts";

// Helper to create mock stdin for mount tests
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

// Helper to create a basic key event
function keyEvent(
  name: string,
  char = "",
  modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {},
) {
  return {
    type: "key" as const,
    name,
    char,
    ctrl: modifiers.ctrl ?? false,
    alt: modifiers.alt ?? false,
    shift: modifiers.shift ?? false,
    sequence: char || name,
    target: {},
  };
}

describe("Textarea", () => {
  describe("rendering", () => {
    // Default theme has paddingStart:1 on input (textarea falls back to input).
    // Text content starts at column 1 in the buffer.
    const p = 1;

    it("renders multi-line value", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(40, 10);
      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({ value: "Line 1\nLine 2\nLine 3", width: 20 }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );
      const buf = app.renderer.buffer;
      assert.strictEqual(buf.getSymbol(p, 0), "L");
      assert.strictEqual(buf.getSymbol(p + 1, 0), "i");
      assert.strictEqual(buf.getSymbol(p + 5, 0), "1");
      assert.strictEqual(buf.getSymbol(p, 1), "L");
      assert.strictEqual(buf.getSymbol(p + 5, 1), "2");
      assert.strictEqual(buf.getSymbol(p, 2), "L");
      assert.strictEqual(buf.getSymbol(p + 5, 2), "3");
      app.unmount();
    });

    it("renders placeholder when empty", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(40, 10);
      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value: "",
                placeholder: "Enter your message...",
                width: 30,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );
      const buf = app.renderer.buffer;
      assert.strictEqual(buf.getSymbol(p, 0), "E");
      assert.strictEqual(buf.getSymbol(p + 1, 0), "n");
      assert.strictEqual(buf.getSymbol(p + 2, 0), "t");
      app.unmount();
    });

    it("renders reactive value", async () => {
      const [value, setValue] = createSignal("Hello");
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(40, 10);
      const app = App.mount(
        () => Box({ children: [Textarea({ value, width: 20 })] }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );
      const buf = app.renderer.buffer;
      assert.strictEqual(buf.getSymbol(p, 0), "H");

      setValue("World");
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.strictEqual(buf.getSymbol(p, 0), "W");
      app.unmount();
    });
  });

  describe("keyboard handling", () => {
    it("character input inserts at cursor", () => {
      let received = "";
      const node = Textarea({
        value: "",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(keyEvent("a", "a"));

      assert.strictEqual(result, true);
      assert.strictEqual(received, "a");
    });

    it("Enter inserts newline", () => {
      let received = "";
      const node = Textarea({
        value: "ab",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move cursor to start, then between a and b
      node.onKeyPress(keyEvent("home"));
      node.onKeyPress(keyEvent("right"));

      // Insert newline
      const result = node.onKeyPress(keyEvent("enter"));

      assert.strictEqual(result, true);
      assert.strictEqual(received, "a\nb");
    });

    it("Up arrow moves cursor to previous line", () => {
      let received = "";
      const node = Textarea({
        value: "Line 1\nLine 2",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Start at end, move to start of second line
      node.onKeyPress(keyEvent("home"));

      // Move up
      const result = node.onKeyPress(keyEvent("up"));
      assert.strictEqual(result, true);

      // Insert character - should be at start of first line
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "XLine 1\nLine 2");
    });

    it("Down arrow moves cursor to next line", () => {
      let received = "";
      const node = Textarea({
        value: "Line 1\nLine 2",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move to start of first line
      node.onKeyPress(keyEvent("home"));
      node.onKeyPress(keyEvent("up"));

      // Move down from first line
      const result = node.onKeyPress(keyEvent("down"));
      assert.strictEqual(result, true);

      // Insert character - should be at start of second line
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "Line 1\nXLine 2");
    });

    it("left at line start moves to previous line end", () => {
      let received = "";
      const node = Textarea({
        value: "abc\ndef",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move to start of second line
      node.onKeyPress(keyEvent("home"));

      // Move left - should go to end of first line (position 3)
      node.onKeyPress(keyEvent("left"));

      // Insert character
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "abcX\ndef");
    });

    it("right at line end moves to next line start", () => {
      let received = "";
      const node = Textarea({
        value: "abc\ndef",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move to start of first line, then to end
      node.onKeyPress(keyEvent("home"));
      node.onKeyPress(keyEvent("up"));
      node.onKeyPress(keyEvent("end"));

      // Move right - should cross newline
      node.onKeyPress(keyEvent("right"));

      // Insert character - should be at start of second line
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "abc\nXdef");
    });

    it("backspace removes character before cursor", () => {
      let received = "";
      const node = Textarea({
        value: "abc",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move to end
      node.onKeyPress(keyEvent("end"));

      // Backspace
      const result = node.onKeyPress(keyEvent("backspace"));

      assert.strictEqual(result, true);
      assert.strictEqual(received, "ab");
    });

    it("backspace at line start joins with previous line", () => {
      let received = "";
      const node = Textarea({
        value: "abc\ndef",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move to start of second line
      node.onKeyPress(keyEvent("home"));

      // Backspace - should remove newline
      const result = node.onKeyPress(keyEvent("backspace"));

      assert.strictEqual(result, true);
      assert.strictEqual(received, "abcdef");
    });

    it("delete removes character at cursor", () => {
      let received = "";
      const node = Textarea({
        value: "abc",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move cursor to start, delete first char
      node.onKeyPress(keyEvent("home"));
      const result = node.onKeyPress(keyEvent("delete"));

      assert.strictEqual(result, true);
      assert.strictEqual(received, "bc");
    });

    it("delete at line end joins with next line", () => {
      let received = "";
      const node = Textarea({
        value: "abc\ndef",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move to start of first line, then to end
      node.onKeyPress(keyEvent("home"));
      node.onKeyPress(keyEvent("up"));
      node.onKeyPress(keyEvent("end"));

      // Delete - should remove newline
      const result = node.onKeyPress(keyEvent("delete"));

      assert.strictEqual(result, true);
      assert.strictEqual(received, "abcdef");
    });

    it("Ctrl+K deletes from cursor to end of current line", () => {
      let received = "";
      const node = Textarea({
        value: "abcdef\nghijkl",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move to start of first line, then right twice (cursor at position 2)
      node.onKeyPress(keyEvent("home"));
      node.onKeyPress(keyEvent("up"));
      node.onKeyPress(keyEvent("right"));
      node.onKeyPress(keyEvent("right"));

      // Ctrl+K
      const result = node.onKeyPress(keyEvent("k", "", { ctrl: true }));
      assert.strictEqual(result, true);
      assert.strictEqual(received, "ab\nghijkl");
    });

    it("Ctrl+U deletes from start of current line to cursor", () => {
      let received = "";
      const node = Textarea({
        value: "abcdef\nghijkl",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move to start of first line, then right twice (cursor at position 2)
      node.onKeyPress(keyEvent("home"));
      node.onKeyPress(keyEvent("up"));
      node.onKeyPress(keyEvent("right"));
      node.onKeyPress(keyEvent("right"));

      // Ctrl+U
      const result = node.onKeyPress(keyEvent("u", "", { ctrl: true }));
      assert.strictEqual(result, true);
      assert.strictEqual(received, "cdef\nghijkl");
    });

    it("home moves cursor to start of current line", () => {
      let received = "";
      const node = Textarea({
        value: "abc\ndef",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Cursor starts at end of second line ("def|")
      // Home
      const result = node.onKeyPress(keyEvent("home"));
      assert.strictEqual(result, true);

      // Insert at start of second line
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "abc\nXdef");
    });

    it("end moves cursor to end of current line", () => {
      let received = "";
      const node = Textarea({
        value: "abc\ndef",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move cursor to first line
      node.onKeyPress(keyEvent("up"));

      // End
      const result = node.onKeyPress(keyEvent("end"));
      assert.strictEqual(result, true);

      // Insert at end of first line
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "abcX\ndef");
    });

    it("onChange fires on edits", () => {
      const changes: string[] = [];
      const [value, setValue] = createSignal("");
      const node = Textarea({
        value,
        onChange: (v) => {
          changes.push(v);
          setValue(v);
        },
      });

      assert.ok(node.onKeyPress);

      node.onKeyPress(keyEvent("a", "a"));
      node.onKeyPress(keyEvent("b", "b"));
      node.onKeyPress(keyEvent("c", "c"));

      assert.deepStrictEqual(changes, ["a", "ab", "abc"]);
    });
  });

  describe("single-line mode (multiline: false)", () => {
    it("Enter does not insert newline", () => {
      let received: string | undefined;
      const node = Textarea({
        value: "ab",
        multiline: false,
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move cursor between a and b
      node.onKeyPress(keyEvent("home"));
      node.onKeyPress(keyEvent("right"));

      // Enter should not insert newline
      const result = node.onKeyPress(keyEvent("enter"));

      assert.strictEqual(result, false);
      assert.strictEqual(received, undefined);
    });

    it("Up/Down arrows do nothing in single-line mode", () => {
      const node = Textarea({
        value: "hello",
        multiline: false,
      });

      assert.ok(node.onKeyPress);

      // Up and Down should return false (not handled)
      assert.strictEqual(node.onKeyPress(keyEvent("up")), false);
      assert.strictEqual(node.onKeyPress(keyEvent("down")), false);
    });

    it("Home goes to start of text", () => {
      let received = "";
      const node = Textarea({
        value: "hello",
        multiline: false,
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Home should go to absolute start
      node.onKeyPress(keyEvent("home"));
      node.onKeyPress(keyEvent("X", "X"));

      assert.strictEqual(received, "Xhello");
    });

    it("End goes to end of text", () => {
      let received = "";
      const node = Textarea({
        value: "hello",
        multiline: false,
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Move to start first
      node.onKeyPress(keyEvent("home"));

      // End should go to absolute end
      node.onKeyPress(keyEvent("end"));
      node.onKeyPress(keyEvent("X", "X"));

      assert.strictEqual(received, "helloX");
    });
  });

  describe("disabled state", () => {
    it("disabled textarea ignores character input", () => {
      let received: string | undefined;
      const node = Textarea({
        value: "test",
        disabled: true,
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      const result = node.onKeyPress(keyEvent("a", "a"));
      assert.strictEqual(result, false);
      assert.strictEqual(received, undefined);
    });

    it("disabled textarea ignores navigation", () => {
      const node = Textarea({
        value: "test",
        disabled: true,
      });

      assert.ok(node.onKeyPress);

      const result = node.onKeyPress(keyEvent("left"));
      assert.strictEqual(result, false);
    });

    it("reactive disabled prop updates behavior", () => {
      const [disabled, setDisabled] = createSignal(false);
      const changes: string[] = [];
      const node = Textarea({
        value: "",
        disabled,
        onChange: (v) => changes.push(v),
      });

      assert.ok(node.onKeyPress);

      // Not disabled - should work
      node.onKeyPress(keyEvent("a", "a"));
      assert.deepStrictEqual(changes, ["a"]);

      // Now disable
      setDisabled(true);
      node.onKeyPress(keyEvent("b", "b"));
      assert.deepStrictEqual(changes, ["a"]); // Should not have changed
    });
  });

  describe("focus", () => {
    it("is focusable by default", () => {
      const node = Textarea({ value: "" });
      assert.strictEqual(node.focusable, true);
    });

    it("focusable: false makes it not focusable", () => {
      const node = Textarea({ value: "", focusable: false });
      assert.strictEqual(node.focusable, false);
    });

    it("autoFocus prop is passed through", () => {
      const node = Textarea({ value: "", autoFocus: true });
      assert.strictEqual(node.autoFocus, true);
    });

    it("ref is bound to the node", () => {
      const ref = createRef();
      const node = Textarea({ value: "", ref });
      assert.strictEqual(ref.current, node);
    });
  });

  describe("cursor position", () => {
    it("cursor starts at end of initial value", () => {
      let received = "";
      const node = Textarea({
        value: "hello",
        onChange: (v) => {
          received = v;
        },
      });

      assert.ok(node.onKeyPress);

      // Insert character without moving cursor - should append at end
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "helloX");
    });
  });

  describe("style overrides", () => {
    it("applies style overrides", () => {
      const node = Textarea({
        value: "",
        style: { marginTop: 2, marginStart: 1 },
      });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.marginTop, 2);
      assert.strictEqual(style.marginStart, 1);
    });

    it("uses specified width", () => {
      const node = Textarea({ value: "", width: 60 });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.width, 60);
    });

    it("uses default width from theme", () => {
      setTheme(defaultThemeJson);
      const node = Textarea({ value: "" });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.width, 40);
      setTheme({ tokens: {} });
    });
  });

  describe("measurement", () => {
    it("renders correct number of lines", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(40, 10);
      const app = App.mount(
        () =>
          Box({ children: [Textarea({ value: "Hello\nWorld", width: 20 })] }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );
      const buf = app.renderer.buffer;
      // Line 1
      assert.strictEqual(buf.getSymbol(0, 0), "H");
      // Line 2
      assert.strictEqual(buf.getSymbol(0, 1), "W");
      // Line 3 should be empty
      assert.notStrictEqual(buf.getSymbol(0, 2), "H");
      app.unmount();
    });

    it("renders at least 1 row for empty content", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(40, 10);
      const app = App.mount(
        () => Box({ children: [Textarea({ value: "", width: 20 })] }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );
      // Just verify it mounts without crashing
      assert.ok(app.renderer.buffer);
      app.unmount();
    });
  });

  describe("maxHeight and scrolling", () => {
    // Helper to strip ANSI escape codes from output
    function stripAnsi(s: string): string {
      // Match ESC [ followed by params and command letter
      const ESC = String.fromCharCode(0x1b);
      const pattern = new RegExp(`${ESC}\\[[0-9;?]*[a-zA-Z]`, "g");
      return s.replace(pattern, "");
    }

    // Helper to wait for microtask (render is scheduled via queueMicrotask)
    function flushMicrotasks(): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Helper to mount textarea and return utilities for testing
    // Escape sequences for common keys
    const KEY_SEQUENCES: Record<string, string> = {
      up: "\x1b[A",
      down: "\x1b[B",
      right: "\x1b[C",
      left: "\x1b[D",
      home: "\x1b[H",
      end: "\x1b[F",
      pageup: "\x1b[5~",
      pagedown: "\x1b[6~",
      backspace: "\x7f",
      delete: "\x1b[3~",
      enter: "\r",
      tab: "\t",
    };

    function mountTextarea(
      initialValue: string,
      options: {
        width?: number;
        maxHeight?: number;
        multiline?: boolean;
        mouse?: boolean;
      } = {},
    ) {
      const [value, setValue] = createSignal(initialValue);
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(80, 24);
      const ref = createRef();
      const mouseEnabled = options.mouse ?? false;

      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value,
                onChange: setValue,
                width: options.width ?? 10,
                maxHeight: options.maxHeight,
                multiline: options.multiline,
                ref,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
          mouse: mouseEnabled,
          scroll: false,
        },
      );

      // Helper to check if stripped output contains a string
      const outputContains = (s: string) =>
        stripAnsi(mockStdout.written).includes(s);

      // Helper to send key via stdin (triggers full event cycle)
      // When mouse is enabled, runtime uses 'data' events; otherwise uses 'keypress'
      const sendKey = async (name: string) => {
        if (mouseEnabled) {
          const seq = KEY_SEQUENCES[name] ?? name;
          mockStdin.emit("data", Buffer.from(seq));
        } else {
          mockStdin.emit("keypress", name.length === 1 ? name : undefined, {
            name,
            sequence: name,
          });
        }
        await flushMicrotasks();
      };

      // Helper to clear output
      const clearOutput = () => {
        mockStdout.written = "";
      };

      return {
        app,
        ref,
        setValue,
        getValue: value,
        outputContains,
        sendKey,
        clearOutput,
        getOutput: () => stripAnsi(mockStdout.written),
        mockStdin,
      };
    }

    it("shows scrollbar when content exceeds maxHeight", () => {
      const { app, outputContains } = mountTextarea(
        "1\n2\n3\n4\n5\n6\n7\n8\n9\n10",
        { width: 10, maxHeight: 5 },
      );

      // Scrollbar uses box drawing characters
      const hasScrollbar = outputContains("\u2502") || outputContains("\u2503");
      assert.ok(hasScrollbar, "Should render scrollbar characters");

      app.unmount();
    });

    it("shows last lines initially when cursor starts at end", () => {
      const { app, outputContains } = mountTextarea(
        "AAA\nBBB\nCCC\nDDD\nEEE\nFFF",
        { width: 10, maxHeight: 3 },
      );

      // Cursor starts at end, so last three lines should be visible
      assert.ok(outputContains("DDD"), "Fourth line should be visible");
      assert.ok(outputContains("EEE"), "Fifth line should be visible");
      assert.ok(outputContains("FFF"), "Sixth line should be visible");
      // Line 1 should not be visible initially
      assert.ok(!outputContains("AAA"), "First line should NOT be visible");

      app.unmount();
    });

    it("scrolls up when cursor moves above visible area", async () => {
      const { app, sendKey, outputContains } = mountTextarea(
        "AAA\nBBB\nCCC\nDDD\nEEE\nFFF",
        { width: 10, maxHeight: 3 },
      );

      // Initially AAA should not be visible (cursor starts at end)
      assert.ok(
        !outputContains("AAA"),
        "Line 1 should NOT be visible initially",
      );

      // Move cursor up to line 1 (should trigger scroll)
      await sendKey("up"); // line 5
      await sendKey("up"); // line 4
      await sendKey("up"); // line 3
      await sendKey("up"); // line 2
      await sendKey("up"); // line 1 - should trigger scroll

      // Now line 1 (AAA) should be visible in cumulative output
      assert.ok(outputContains("AAA"), "Line 1 should be visible after scroll");

      app.unmount();
    });

    it("scrolls down when cursor moves past visible area", async () => {
      const { app, sendKey, outputContains } = mountTextarea(
        "AAA\nBBB\nCCC\nDDD\nEEE\nFFF",
        { width: 10, maxHeight: 3 },
      );

      // Move cursor to start first (cursor starts at end)
      for (let i = 0; i < 5; i++) {
        await sendKey("up");
      }

      // At this point, AAA should be visible (line 1)
      assert.ok(
        outputContains("AAA"),
        "Line 1 should be visible after moving to start",
      );

      // Move down past visible area - DDD should become visible
      await sendKey("down"); // line 2
      await sendKey("down"); // line 3
      await sendKey("down"); // line 4 - should trigger scroll down

      // Line 4 (DDD) should be visible in cumulative output
      assert.ok(
        outputContains("DDD"),
        "Line 4 should be visible after scroll down",
      );

      app.unmount();
    });

    it("cursor stays visible at bottom of content", async () => {
      const { app, outputContains } = mountTextarea("AAA\nBBB\nCCC\nDDD\nEEE", {
        width: 10,
        maxHeight: 3,
      });

      // Cursor starts at end, so EEE should already be visible
      assert.ok(
        outputContains("EEE"),
        "Last line should be visible when cursor starts there",
      );

      // First line should not be visible
      assert.ok(
        !outputContains("AAA"),
        "First line should NOT be visible initially",
      );

      app.unmount();
    });

    it("without maxHeight, shows all content", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(40, 20);

      function stripAnsi(s: string): string {
        const ESC = String.fromCharCode(0x1b);
        const pattern = new RegExp(`${ESC}\\[[0-9;?]*[a-zA-Z]`, "g");
        return s.replace(pattern, "");
      }

      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({ value: "1\n2\n3\n4\n5\n6\n7\n8\n9\n10", width: 20 }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      const output = stripAnsi(mockStdout.written);
      // All 10 lines should be rendered (no scrolling, no maxHeight)
      assert.ok(output.includes("10"), "Line 10 should be visible");
      assert.ok(output.includes("1"), "Line 1 should be visible");
      app.unmount();
    });

    it("handles content shrinking", async () => {
      const { app, sendKey, setValue, clearOutput, outputContains } =
        mountTextarea("AAA\nBBB\nCCC\nDDD\nEEE\nFFF\nGGG\nHHH", {
          width: 10,
          maxHeight: 3,
        });

      // Move cursor to last line
      for (let i = 0; i < 7; i++) {
        await sendKey("down");
      }

      // Shrink content - cursor will be clamped
      setValue("AAA\nBBB\nCCC");

      clearOutput();
      await sendKey("left"); // Trigger re-render

      // Should show the remaining content without crashing
      assert.ok(
        outputContains("CCC"),
        "Should show last line of shrunk content",
      );

      app.unmount();
    });

    it("scrolls horizontally in single-line mode", async () => {
      const longText = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const { app, sendKey, outputContains } = mountTextarea(longText, {
        width: 10,
        multiline: false,
      });

      // Cursor starts at end, so we should see the last part
      assert.ok(
        outputContains("Z"),
        "Last character should be visible initially",
      );
      assert.ok(
        !outputContains("A"),
        "First character should NOT be visible initially",
      );

      // Move to start
      await sendKey("home");

      // Now first character should be visible
      assert.ok(
        outputContains("A"),
        "First character should be visible after Home",
      );

      app.unmount();
    });

    it("scrolls with mousewheel", async () => {
      // Create textarea - cursor starts at end, so we see last 3 lines (DDD, EEE, FFF)
      const { app, mockStdin, clearOutput, getOutput } = mountTextarea(
        "AAA\nBBB\nCCC\nDDD\nEEE\nFFF",
        {
          width: 10,
          maxHeight: 3,
          mouse: true,
        },
      );

      // Wait for initial render
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Initial state: cursor is at end, so we see DDD, EEE, FFF (last 3 lines)
      // AAA should NOT be visible initially
      let output = getOutput();
      assert.ok(
        !output.includes("AAA"),
        "AAA should NOT be visible initially (cursor at end)",
      );
      assert.ok(
        output.includes("FFF"),
        "FFF should be visible initially (cursor at end)",
      );

      clearOutput();

      // Send mousewheel scroll up multiple times to get to top
      // SGR scroll up: button 64 (64 scroll + 0 up) at (1,1) -> col=2, row=2 in SGR
      for (let i = 0; i < 5; i++) {
        mockStdin.emit("data", Buffer.from("\x1b[<64;2;2M"));
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // After scrolling up, AAA should now be visible
      output = getOutput();
      assert.ok(
        output.includes("AAA"),
        `AAA should be visible after scrolling up with mousewheel. Output: ${output.slice(0, 200)}`,
      );

      app.unmount();
    });

    it("scrolls with mousewheel when textarea is inside a bordered box", async () => {
      // This matches the settings app structure where Textarea is inside a Box with border
      const [value, setValue] = createSignal("AAA\nBBB\nCCC\nDDD\nEEE\nFFF");
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(80, 24);

      const app = App.mount(
        () =>
          Box({
            children: [
              Box({
                border: "single",
                children: [
                  Textarea({
                    value,
                    onChange: setValue,
                    width: 10,
                    maxHeight: 3,
                  }),
                ],
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
          mouse: true,
          scroll: false,
        },
      );

      // Wait for initial render
      await new Promise((resolve) => setTimeout(resolve, 20));

      const stripAnsi = (s: string): string => {
        const ESC = String.fromCharCode(0x1b);
        const pattern = new RegExp(`${ESC}\\[[0-9;?]*[a-zA-Z]`, "g");
        return s.replace(pattern, "");
      };

      // Initial state: cursor is at end, so we see DDD, EEE, FFF (last 3 lines)
      let output = stripAnsi(mockStdout.written);
      assert.ok(!output.includes("AAA"), "AAA should NOT be visible initially");
      assert.ok(output.includes("FFF"), "FFF should be visible initially");

      mockStdout.written = "";

      // Send mousewheel scroll up - note: position needs to be inside the bordered box
      // Border takes 1 char on each side, so content starts at (1,1)
      // SGR uses 1-indexed coords, so (2,2) in SGR = (1,1) in 0-indexed
      for (let i = 0; i < 5; i++) {
        mockStdin.emit("data", Buffer.from("\x1b[<64;3;3M"));
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // After scrolling up, AAA should now be visible
      output = stripAnsi(mockStdout.written);
      assert.ok(
        output.includes("AAA"),
        `AAA should be visible after scrolling up. Output: ${output.slice(0, 300)}`,
      );

      app.unmount();
    });

    it("scroll position persists after multiple mousewheel events", async () => {
      // Test that scroll position doesn't reset between scroll events
      // Using distinct markers for each line to make them easy to identify
      const [value, setValue] = createSignal(
        "AAA\nBBB\nCCC\nDDD\nEEE\nFFF\nGGG\nHHH\nIII\nJJJ",
      );
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(80, 24);

      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value,
                onChange: setValue,
                width: 10,
                maxHeight: 3,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
          mouse: true,
          scroll: false,
        },
      );

      // Wait for initial render
      await new Promise((resolve) => setTimeout(resolve, 20));

      const stripAnsi = (s: string): string => {
        const ESC = String.fromCharCode(0x1b);
        const pattern = new RegExp(`${ESC}\\[[0-9;?]*[a-zA-Z]`, "g");
        return s.replace(pattern, "");
      };

      // Initial: cursor at end, so HHH, III, JJJ visible (last 3 of 10 lines)
      let output = stripAnsi(mockStdout.written);
      assert.ok(output.includes("JJJ"), "JJJ should be visible initially");
      assert.ok(!output.includes("AAA"), "AAA should NOT be visible initially");

      // Scroll up twice (should show FFF, GGG, HHH)
      mockStdin.emit("data", Buffer.from("\x1b[<64;2;2M"));
      await new Promise((resolve) => setTimeout(resolve, 10));
      mockStdin.emit("data", Buffer.from("\x1b[<64;2;2M"));
      await new Promise((resolve) => setTimeout(resolve, 10));

      mockStdout.written = "";

      // Scroll down once (should show GGG, HHH, III - NOT back to JJJ)
      mockStdin.emit("data", Buffer.from("\x1b[<65;2;2M"));
      await new Promise((resolve) => setTimeout(resolve, 20));

      output = stripAnsi(mockStdout.written);

      // After scroll up 2 + scroll down 1, we should be at scroll position 6
      // which shows GGG, HHH, III
      // If scroll reset to the cursor position (end), we'd see HHH, III, JJJ
      const showsGGG = output.includes("GGG");
      const showsJJJ = output.includes("JJJ");

      // GGG should be visible, JJJ should NOT be visible (if scroll persisted)
      assert.ok(
        showsGGG && !showsJJJ,
        `Scroll position should persist. Shows GGG: ${showsGGG}, Shows JJJ: ${showsJJJ}. Output: ${output.slice(0, 300)}`,
      );

      app.unmount();
    });

    it("mousewheel scroll after typing content should work incrementally", async () => {
      // Reproduces exact bug: user types lines into textarea, then scrolls with mousewheel
      // Bug: scroll jumps to top and then stops working
      // Note: This test needs mouse mode enabled, so we set up our own mount
      const [value, setValue] = createSignal("");
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(80, 24);

      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value,
                onChange: setValue,
                width: 10,
                maxHeight: 3,
                autoFocus: true,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
          mouse: true,
          scroll: false,
        },
      );

      const stripAnsi = (s: string): string => {
        const ESC = String.fromCharCode(0x1b);
        const pattern = new RegExp(`${ESC}\\[[0-9;?]*[a-zA-Z]`, "g");
        return s.replace(pattern, "");
      };
      const getOutput = () => stripAnsi(mockStdout.written);
      const clearOutput = () => {
        mockStdout.written = "";
      };

      // Wait for initial render
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Type content line by line using raw data events (simulating real terminal input)
      // When mouse is enabled, input parser uses "data" events, not "keypress"
      for (let i = 1; i <= 9; i++) {
        mockStdin.emit("data", Buffer.from(String(i)));
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (i < 9) {
          mockStdin.emit("data", Buffer.from("\r"));
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 20));

      // Now cursor is at end, showing last 3 lines (7, 8, 9)
      let output = getOutput();
      assert.ok(
        output.includes("9"),
        `Line 9 should be visible after typing. Output: ${output.slice(0, 100)}`,
      );

      clearOutput();

      // Scroll up ONCE with mousewheel
      mockStdin.emit("data", Buffer.from("\x1b[<64;2;2M"));
      await new Promise((resolve) => setTimeout(resolve, 20));

      output = getOutput();

      // Should scroll by 1, showing line 6 now, but NOT jump to line 1
      const shows6 = output.includes("6");
      const shows1 = output.includes("1");

      assert.ok(
        shows6 && !shows1,
        `After 1 scroll up, should show line 6 but not line 1 (jumped to top). Shows 6: ${shows6}, Shows 1: ${shows1}. Output: ${output.slice(0, 200)}`,
      );

      // Now scroll down - should still work
      clearOutput();
      mockStdin.emit("data", Buffer.from("\x1b[<65;2;2M"));
      await new Promise((resolve) => setTimeout(resolve, 20));

      output = getOutput();
      const shows7 = output.includes("7");

      assert.ok(
        shows7,
        `After scrolling down, should show line 7. Output: ${output.slice(0, 200)}`,
      );

      app.unmount();
    });

    it("mousewheel scroll up once should scroll by 1, not jump to top", async () => {
      // Reproduces bug: user has cursor at bottom, scrolls up once with mousewheel,
      // and it jumps all the way to the top instead of scrolling by 1 line
      const [value, setValue] = createSignal("1\n2\n3\n4\n5\n6\n7\n8\n9");
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(80, 24);

      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value,
                onChange: setValue,
                width: 10,
                maxHeight: 3,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
          mouse: true,
          scroll: false,
        },
      );

      // Wait for initial render
      await new Promise((resolve) => setTimeout(resolve, 20));

      const stripAnsi = (s: string): string => {
        const ESC = String.fromCharCode(0x1b);
        const pattern = new RegExp(`${ESC}\\[[0-9;?]*[a-zA-Z]`, "g");
        return s.replace(pattern, "");
      };

      // Initial: cursor at end (line 8 = "9"), so we see lines 7, 8, 9
      let output = stripAnsi(mockStdout.written);
      assert.ok(output.includes("9"), "Line 9 should be visible initially");
      assert.ok(output.includes("7"), "Line 7 should be visible initially");
      assert.ok(
        !output.includes("1"),
        "Line 1 should NOT be visible initially",
      );

      mockStdout.written = "";

      // Scroll up ONCE - should show lines 6, 7, 8 (NOT jump to top showing 1, 2, 3)
      mockStdin.emit("data", Buffer.from("\x1b[<64;2;2M"));
      await new Promise((resolve) => setTimeout(resolve, 20));

      output = stripAnsi(mockStdout.written);

      // After scrolling up once, we should see line 6 (scrolled by 1)
      // but NOT line 1 (which would mean it jumped to top)
      const shows6 = output.includes("6");
      const shows1 = output.includes("1");

      assert.ok(
        shows6 && !shows1,
        `After 1 scroll up, should show line 6 but not line 1. Shows 6: ${shows6}, Shows 1: ${shows1}. Output: ${output.slice(0, 200)}`,
      );

      app.unmount();
    });

    it("mousewheel scrolls down when already scrolled up", async () => {
      // Test: start at top (scrollTop=0), scroll down with mousewheel
      // This tests the case where user is at top and wants to scroll to see more content
      const [value, setValue] = createSignal(
        "AAA\nBBB\nCCC\nDDD\nEEE\nFFF\nGGG\nHHH",
      );
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(80, 24);

      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value,
                onChange: setValue,
                width: 10,
                maxHeight: 3,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
          mouse: true,
          scroll: false,
        },
      );

      // Wait for initial render
      await new Promise((resolve) => setTimeout(resolve, 20));

      const stripAnsi = (s: string): string => {
        const ESC = String.fromCharCode(0x1b);
        const pattern = new RegExp(`${ESC}\\[[0-9;?]*[a-zA-Z]`, "g");
        return s.replace(pattern, "");
      };

      // Initial: cursor at end (line 7 = HHH), so we see FFF, GGG, HHH
      let output = stripAnsi(mockStdout.written);
      assert.ok(output.includes("HHH"), "HHH should be visible initially");

      // Scroll up to get to the top
      for (let i = 0; i < 6; i++) {
        mockStdin.emit("data", Buffer.from("\x1b[<64;2;2M"));
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await new Promise((resolve) => setTimeout(resolve, 20));

      output = stripAnsi(mockStdout.written);
      // After scrolling up 6 times, we should be at top showing AAA, BBB, CCC
      assert.ok(
        output.includes("AAA"),
        `AAA should be visible after scrolling up. Output: ${output.slice(0, 300)}`,
      );

      mockStdout.written = "";

      // Now scroll down 2 times - should show CCC, DDD, EEE (not all the way back to HHH)
      mockStdin.emit("data", Buffer.from("\x1b[<65;2;2M"));
      await new Promise((resolve) => setTimeout(resolve, 10));
      mockStdin.emit("data", Buffer.from("\x1b[<65;2;2M"));
      await new Promise((resolve) => setTimeout(resolve, 20));

      output = stripAnsi(mockStdout.written);

      // Should show DDD (3 lines from top)
      assert.ok(
        output.includes("DDD"),
        `DDD should be visible after scrolling down. Output: ${output.slice(0, 300)}`,
      );
      // Should NOT show HHH (too far down)
      assert.ok(
        !output.includes("HHH"),
        `HHH should NOT be visible (only scrolled 2 down). Output: ${output.slice(0, 300)}`,
      );

      app.unmount();
    });
  });

  describe("clipping", () => {
    it("clips content vertically inside ScrollArea", () => {
      // Tested via the maxHeight scrolling tests — ScrollArea clips to viewport height.
      // Verify that content beyond maxHeight is not rendered.
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(40, 10);
      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value: "AAA\nBBB\nCCC\nDDD\nEEE",
                width: 10,
                maxHeight: 2,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );
      const buf = app.renderer.buffer;
      // maxHeight is 2, cursor starts at end so last 2 lines visible (DDD, EEE)
      // Row 0 should have D (from DDD) — cursor at end scrolls to show last lines
      // Rows beyond maxHeight+scrollbar area should be empty
      const row3sym = buf.getSymbol(0, 3);
      assert.strictEqual(row3sym, " ", "Row 3 should be empty (clipped)");
      app.unmount();
    });

    it("clips content horizontally in single-line mode", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(40, 10);
      const [value] = createSignal("ABCDEFGHIJKLMNOP");
      const app = App.mount(
        () =>
          Box({ children: [Textarea({ value, width: 5, multiline: false })] }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );
      const buf = app.renderer.buffer;
      // Width is 5, cursor at end, so last 5 chars visible (LMNOP area)
      // Column 5 should be empty (beyond textarea width)
      const col5sym = buf.getSymbol(5, 0);
      assert.strictEqual(col5sym, " ", "Column 5 should be empty (clipped)");
      app.unmount();
    });
  });

  describe("mouse click", () => {
    // SGR mouse press at 0-indexed (x,y): \x1b[<0;{x+1};{y+1}M
    function sgrClick(x: number, y: number): string {
      return `\x1b[<0;${x + 1};${y + 1}M`;
    }

    function nextRender(): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, 10));
    }

    it("moves cursor to clicked position on first line", async () => {
      const [value, setValue] = createSignal("hello\nworld");
      let received = "";
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(40, 5);
      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value,
                onChange: (v) => {
                  received = v;
                  setValue(v);
                },
                width: 20,
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
      await nextRender();
      // Click at column 3 on row 0, then type X
      mockStdin.emit("data", Buffer.from(sgrClick(3, 0)));
      await nextRender();
      mockStdin.emit("data", Buffer.from("X"));
      await nextRender();
      assert.strictEqual(received, "helXlo\nworld");
      app.unmount();
    });

    it("moves cursor to clicked position on second line", async () => {
      const [value, setValue] = createSignal("hello\nworld");
      let received = "";
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(40, 5);
      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value,
                onChange: (v) => {
                  received = v;
                  setValue(v);
                },
                width: 20,
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
      await nextRender();
      mockStdin.emit("data", Buffer.from(sgrClick(2, 1)));
      await nextRender();
      mockStdin.emit("data", Buffer.from("X"));
      await nextRender();
      assert.strictEqual(received, "hello\nwoXrld");
      app.unmount();
    });

    it("clicking past line end moves cursor to end of that line", async () => {
      const [value, setValue] = createSignal("hi\nworld");
      let received = "";
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(40, 5);
      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value,
                onChange: (v) => {
                  received = v;
                  setValue(v);
                },
                width: 20,
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
      await nextRender();
      mockStdin.emit("data", Buffer.from(sgrClick(15, 0)));
      await nextRender();
      mockStdin.emit("data", Buffer.from("X"));
      await nextRender();
      assert.strictEqual(received, "hiX\nworld");
      app.unmount();
    });

    it("clicking below text moves cursor to last line", async () => {
      const [value, setValue] = createSignal("hello\nworld");
      let received = "";
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(40, 5);
      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value,
                onChange: (v) => {
                  received = v;
                  setValue(v);
                },
                width: 20,
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
      await nextRender();
      mockStdin.emit("data", Buffer.from(sgrClick(2, 3)));
      await nextRender();
      mockStdin.emit("data", Buffer.from("X"));
      await nextRender();
      assert.strictEqual(received, "hello\nwoXrld");
      app.unmount();
    });
  });

  describe("integration", () => {
    it("works within mounted app", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const [value, setValue] = createSignal("");

      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value,
                onChange: setValue,
                placeholder: "Enter your message...",
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      // Verify component structure is correct
      assert.ok(app.unmount);

      app.unmount();
    });

    it("works with maxHeight in mounted app", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const [value, setValue] = createSignal("1\n2\n3\n4\n5\n6\n7\n8\n9\n10");

      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value,
                onChange: setValue,
                maxHeight: 5,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );

      assert.ok(app.unmount);
      app.unmount();
    });
  });

  describe("scrollbar width invariants", () => {
    const W = 20;
    const TRACK = "\u2502";
    const THUMB = "\u2503";
    const isScrollbarChar = (ch: string) => ch === TRACK || ch === THUMB;

    function mountApp(rootFn: () => ReturnType<typeof Box>) {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(80, 24);
      const app = App.mount(rootFn, {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        fpsLimit: 0,
      });
      return { app, buf: app.renderer.buffer };
    }

    const sixLines = "AAA\nBBB\nCCC\nDDD\nEEE\nFFF";

    it("total rendered width is exactly W columns when scrollbar is visible", () => {
      const { app, buf } = mountApp(() =>
        Box({
          children: [Textarea({ value: sixLines, width: W, maxHeight: 3 })],
        }),
      );

      for (let row = 0; row < 3; row++) {
        assert.strictEqual(
          buf.getSymbol(W, row),
          " ",
          `Column ${W} row ${row} should be empty — component must not exceed W`,
        );
      }

      app.unmount();
    });

    it("scrollbar character appears at column W-1", () => {
      const { app, buf } = mountApp(() =>
        Box({
          children: [Textarea({ value: sixLines, width: W, maxHeight: 3 })],
        }),
      );

      const col = W - 1;
      let found = false;
      for (let row = 0; row < 3; row++) {
        if (isScrollbarChar(buf.getSymbol(col, row))) {
          found = true;
          break;
        }
      }
      assert.ok(found, `Scrollbar should appear at column ${col} (W-1)`);

      app.unmount();
    });

    it("text does not render at column W-1 when the scrollbar is visible", () => {
      const longLine = "X".repeat(W);
      const value = Array(6).fill(longLine).join("\n");
      const { app, buf } = mountApp(() =>
        Box({ children: [Textarea({ value, width: W, maxHeight: 3 })] }),
      );

      const col = W - 1;
      for (let row = 0; row < 3; row++) {
        assert.notStrictEqual(
          buf.getSymbol(col, row),
          "X",
          `Text must not render at column ${col} row ${row} when scrollbar is visible`,
        );
      }

      app.unmount();
    });

    it("text can render up to column W-1 when there is no scrollbar", () => {
      const longLine = "Y".repeat(W);
      const { app, buf } = mountApp(() =>
        Box({ children: [Textarea({ value: longLine, width: W })] }),
      );

      // Without maxHeight there is no scrollbar; without padding the full W columns
      // are available for text. With default theme paddingStart=1 and paddingEnd=1,
      // text occupies columns 1 through W-2. The key assertion: column W-2 has text
      // (which would be W-3 if a scrollbar wrongly reserved a column).
      const col = W - 1 - 1; // W-1 minus paddingEnd
      assert.strictEqual(
        buf.getSymbol(col, 0),
        "Y",
        `Text should render at column ${col} (W - 1 - paddingEnd) without scrollbar`,
      );

      app.unmount();
    });

    it("padding does not push the scrollbar outside the component width", () => {
      // Default theme: input has paddingStart:1, paddingEnd:1
      const { app, buf } = mountApp(() =>
        Box({
          children: [Textarea({ value: sixLines, width: W, maxHeight: 3 })],
        }),
      );

      // Scrollbar must be within columns 0..W-1
      assert.strictEqual(
        buf.getSymbol(W, 0),
        " ",
        "Column W must be empty — scrollbar must not overflow",
      );

      // Scrollbar must exist somewhere within the W columns
      let scrollbarCol = -1;
      for (let col = 0; col < W; col++) {
        if (
          isScrollbarChar(buf.getSymbol(col, 0)) ||
          isScrollbarChar(buf.getSymbol(col, 1)) ||
          isScrollbarChar(buf.getSymbol(col, 2))
        ) {
          scrollbarCol = col;
        }
      }
      assert.ok(
        scrollbarCol >= 0,
        "Scrollbar should exist within the W-column boundary",
      );
      assert.strictEqual(
        scrollbarCol,
        W - 1,
        `Scrollbar should be at column ${W - 1}, not ${scrollbarCol}`,
      );

      app.unmount();
    });
  });

  describe("text wrapping", () => {
    const p = 1;

    it("long line renders across multiple visual rows", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(20, 10);
      const app = App.mount(
        () =>
          Box({
            children: [Textarea({ value: "abcdefghij", width: 10 })],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          fpsLimit: 0,
        },
      );
      const buf = app.renderer.buffer;
      assert.strictEqual(buf.getSymbol(p, 0), "a");
      assert.strictEqual(buf.getSymbol(p + 7, 0), "h");
      assert.strictEqual(buf.getSymbol(p, 1), "i");
      assert.strictEqual(buf.getSymbol(p + 1, 1), "j");
      app.unmount();
    });

    it("typing at end of full line shows character on next visual row", async () => {
      const [value, setValue] = createSignal("abcdefgh");
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(20, 10);
      const ref = createRef();
      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value,
                onChange: setValue,
                width: 10,
                autoFocus: true,
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
      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.ok(ref.current?.onKeyPress);
      ref.current.onKeyPress(keyEvent("i", "i"));
      app.renderer.flush();

      const buf = app.renderer.buffer;
      assert.strictEqual(buf.getSymbol(p, 0), "a");
      assert.strictEqual(buf.getSymbol(p + 7, 0), "h");
      assert.strictEqual(buf.getSymbol(p, 1), "i");
      app.unmount();
    });

    it("typing at end of full line preserves text on subsequent lines", async () => {
      const [value, setValue] = createSignal("abcdefgh\nwhatever");
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(20, 10);
      const ref = createRef();
      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value,
                onChange: setValue,
                width: 10,
                autoFocus: true,
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
      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.ok(ref.current?.onKeyPress);
      ref.current.onKeyPress(keyEvent("up"));
      ref.current.onKeyPress(keyEvent("i", "i"));
      app.renderer.flush();

      const buf = app.renderer.buffer;
      assert.strictEqual(buf.getSymbol(p, 0), "a");
      assert.strictEqual(buf.getSymbol(p + 7, 0), "h");
      assert.strictEqual(buf.getSymbol(p, 1), "i");
      assert.strictEqual(buf.getSymbol(p, 2), "w");
      app.unmount();
    });

    it("cursor visible on wrapped continuation row", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(20, 10);
      const ref = createRef();
      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value: "abcdefghi",
                width: 10,
                autoFocus: true,
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
      await new Promise((resolve) => setTimeout(resolve, 10));

      const buf = app.renderer.buffer;
      const mods = buf.getModifiers(p + 1, 1);
      assert.strictEqual(
        mods & INVERSE,
        INVERSE,
        "Cursor should be inverse on visual row 1",
      );
      app.unmount();
    });

    it("Home goes to start of current visual row", () => {
      let received = "";
      const node = Textarea({
        value: "abcdefghi",
        width: 10,
        onChange: (v) => {
          received = v;
        },
      });
      assert.ok(node.onKeyPress);
      node.onKeyPress(keyEvent("home"));
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "abcdefghXi");
    });

    it("End goes to end of current visual row, not logical line end", () => {
      let received = "";
      const node = Textarea({
        value: "abcdefghijklmnopqrst",
        width: 10,
        onChange: (v) => {
          received = v;
        },
      });
      assert.ok(node.onKeyPress);
      // Cursor starts at end (position 20). Move left to position 10
      for (let i = 0; i < 10; i++) {
        node.onKeyPress(keyEvent("left"));
      }
      // Press End - should go to end of visual row 1 (position 16), not logical end (20)
      node.onKeyPress(keyEvent("end"));
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "abcdefghijklmnopXqrst");
    });

    it("Up arrow moves to previous visual row within same logical line", () => {
      let received = "";
      const node = Textarea({
        value: "abcdefghijkl",
        width: 10,
        onChange: (v) => {
          received = v;
        },
      });
      assert.ok(node.onKeyPress);
      // Cursor at end (position 12). Move left to position 10 (visual row 1, column 2)
      node.onKeyPress(keyEvent("left"));
      node.onKeyPress(keyEvent("left"));
      // Press Up - should go to visual row 0, column 2 (position 2)
      node.onKeyPress(keyEvent("up"));
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "abXcdefghijkl");
    });

    it("Down arrow moves to next visual row within same logical line", () => {
      let received = "";
      const node = Textarea({
        value: "abcdefghijkl",
        width: 10,
        onChange: (v) => {
          received = v;
        },
      });
      assert.ok(node.onKeyPress);
      // Cursor at end (position 12). Move to start, then right to position 2 (visual row 0, column 2)
      node.onKeyPress(keyEvent("home"));
      node.onKeyPress(keyEvent("right"));
      node.onKeyPress(keyEvent("right"));
      // Press Down - should go to visual row 1, column 2 (position 10)
      node.onKeyPress(keyEvent("down"));
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "abcdefghijXkl");
    });

    it("cursor visible at end of line that fills content width", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(20, 10);
      const ref = createRef();
      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value: "abcdefgh",
                width: 10,
                autoFocus: true,
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
      await new Promise((resolve) => setTimeout(resolve, 10));

      const buf = app.renderer.buffer;
      // "abcdefgh" fills content width (8 chars, padding 1 each side = 10).
      // Cursor is at end (position 8), which should appear on visual row 1.
      const mods = buf.getModifiers(p, 1);
      assert.strictEqual(
        mods & INVERSE,
        INVERSE,
        "Cursor should be inverse on visual row 1 at end of full line",
      );
      app.unmount();
    });

    it("cursor visible at wrap boundary in wrapped line", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(20, 10);
      const ref = createRef();
      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value: "abcdefghi",
                width: 10,
                autoFocus: true,
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
      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.ok(ref.current?.onKeyPress);
      // Cursor starts at position 9 (end). Move left to position 8 (wrap boundary).
      ref.current.onKeyPress(keyEvent("left"));
      app.renderer.flush();

      const buf = app.renderer.buffer;
      // At position 8 the cursor is at the end of the first visual segment "abcdefgh"
      // It should be visible on visual row 1 at column 0.
      const mods = buf.getModifiers(p, 1);
      assert.strictEqual(
        mods & INVERSE,
        INVERSE,
        "Cursor should be visible at wrap boundary on visual row 1",
      );
      app.unmount();
    });

    it("cursor visible at end of full line before next logical line", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(20, 10);
      const ref = createRef();
      const app = App.mount(
        () =>
          Box({
            children: [
              Textarea({
                value: "abcdefgh\nbbbbb",
                width: 10,
                autoFocus: true,
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
      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.ok(ref.current?.onKeyPress);
      // Cursor starts at end of "bbbbb" (position 13). Navigate up to
      // land at end of "abcdefgh" on its overflow row.
      ref.current.onKeyPress(keyEvent("up"));
      app.renderer.flush();

      const buf = app.renderer.buffer;
      const mods = buf.getModifiers(p, 1);
      assert.strictEqual(
        mods & INVERSE,
        INVERSE,
        "Cursor should be visible on overflow row between full line and next logical line",
      );
      app.unmount();
    });

    it("typing from overflow row inserts at correct position", () => {
      let received = "";
      const node = Textarea({
        value: "abcdefgh",
        width: 10,
        onChange: (v) => {
          received = v;
        },
      });
      assert.ok(node.onKeyPress);
      // Cursor starts at end (position 8), which is on the overflow row.
      // Typing should insert after the 8th character.
      node.onKeyPress(keyEvent("X", "X"));
      assert.strictEqual(received, "abcdefghX");
    });
  });
});
