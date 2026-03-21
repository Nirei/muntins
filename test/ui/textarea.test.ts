import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import {
  App,
  Box,
  DEFAULT_CLIP,
  DEFAULT_INHERITED_STYLE,
  createRef,
} from "../../src/core/runtime.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Textarea } from "../../src/ui/textarea.ts";

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
    it("renders multi-line value", () => {
      const node = Textarea({ value: "Line 1\nLine 2\nLine 3" });

      assert.ok(node.render);

      const buffer = new RenderBuffer(20, 5);
      node.render(0, 0, 20, 5, buffer, DEFAULT_INHERITED_STYLE, DEFAULT_CLIP);

      assert.strictEqual(buffer.getSymbol(0, 0), "L");
      assert.strictEqual(buffer.getSymbol(1, 0), "i");
      assert.strictEqual(buffer.getSymbol(5, 0), "1");
      assert.strictEqual(buffer.getSymbol(0, 1), "L");
      assert.strictEqual(buffer.getSymbol(5, 1), "2");
      assert.strictEqual(buffer.getSymbol(0, 2), "L");
      assert.strictEqual(buffer.getSymbol(5, 2), "3");
    });

    it("renders placeholder when empty", () => {
      const node = Textarea({
        value: "",
        placeholder: "Enter your message...",
      });

      assert.ok(node.render);

      const buffer = new RenderBuffer(30, 5);
      node.render(0, 0, 30, 5, buffer, DEFAULT_INHERITED_STYLE, DEFAULT_CLIP);

      // Placeholder should be rendered (with dim)
      assert.strictEqual(buffer.getSymbol(0, 0), "E");
      assert.strictEqual(buffer.getSymbol(1, 0), "n");
      assert.strictEqual(buffer.getSymbol(2, 0), "t");
    });

    it("renders reactive value", () => {
      const [value, setValue] = createSignal("Hello");
      const node = Textarea({ value });

      assert.ok(node.render);

      const buffer = new RenderBuffer(20, 5);

      // Initial render
      node.render(0, 0, 20, 5, buffer, DEFAULT_INHERITED_STYLE, DEFAULT_CLIP);
      assert.strictEqual(buffer.getSymbol(0, 0), "H");

      // Update value
      setValue("World");
      buffer.flush();
      node.render(0, 0, 20, 5, buffer, DEFAULT_INHERITED_STYLE, DEFAULT_CLIP);
      assert.strictEqual(buffer.getSymbol(0, 0), "W");
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

    it("uses default width of 40", () => {
      const node = Textarea({ value: "" });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.width, 40);
    });
  });

  describe("measurement", () => {
    it("measures height based on line count", () => {
      const node = Textarea({ value: "Hello\nWorld", width: 20 });

      assert.ok(node.measure);
      const size = node.measure(100, 100);
      assert.strictEqual(size.width, 20);
      assert.strictEqual(size.height, 2); // 2 lines
    });

    it("measures minimum height of 1 for empty content", () => {
      const node = Textarea({ value: "", width: 20 });

      assert.ok(node.measure);
      const size = node.measure(100, 100);
      assert.strictEqual(size.height, 1);
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
      const node = Textarea({
        value: "1\n2\n3\n4\n5\n6\n7\n8\n9\n10",
        width: 20,
        // No maxHeight
      });

      // Without maxHeight, textarea should measure to full content height
      assert.ok(node.measure);
      const size = node.measure(100, 100);
      assert.strictEqual(
        size.height,
        10,
        "Should measure to full content height",
      );
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
    it("respects clip bounds when rendering", () => {
      // Textarea content should be clipped to the provided clip rect
      // This is critical for ScrollArea to work properly
      const node = Textarea({ value: "Line1\nLine2\nLine3\nLine4\nLine5" });

      const buffer = new RenderBuffer(20, 10);

      // Clip to only show rows 1-2 (Line2 and Line3)
      const clip = { x: 0, y: 1, width: 20, height: 2 };

      assert.ok(node.render);
      node.render(0, 0, 20, 5, buffer, DEFAULT_INHERITED_STYLE, clip);

      // Row 0 should be empty (clipped out - Line1)
      assert.strictEqual(buffer.getSymbol(0, 0), " ");

      // Rows 1-2 should have content (Line2, Line3)
      assert.strictEqual(buffer.getSymbol(0, 1), "L");
      assert.strictEqual(buffer.getSymbol(4, 1), "2");
      assert.strictEqual(buffer.getSymbol(0, 2), "L");
      assert.strictEqual(buffer.getSymbol(4, 2), "3");

      // Row 3 should be empty (clipped out - Line4)
      assert.strictEqual(buffer.getSymbol(0, 3), " ");

      // Row 4 should be empty (clipped out - Line5)
      assert.strictEqual(buffer.getSymbol(0, 4), " ");
    });

    it("clips horizontally as well", () => {
      const node = Textarea({ value: "ABCDEFGHIJ" });

      const buffer = new RenderBuffer(20, 5);

      // Clip to only show columns 2-5
      const clip = { x: 2, y: 0, width: 4, height: 1 };

      assert.ok(node.render);
      node.render(0, 0, 20, 1, buffer, DEFAULT_INHERITED_STYLE, clip);

      // Columns 0-1 should be empty (clipped)
      assert.strictEqual(buffer.getSymbol(0, 0), " ");
      assert.strictEqual(buffer.getSymbol(1, 0), " ");

      // Columns 2-5 should have content (CDEF)
      assert.strictEqual(buffer.getSymbol(2, 0), "C");
      assert.strictEqual(buffer.getSymbol(3, 0), "D");
      assert.strictEqual(buffer.getSymbol(4, 0), "E");
      assert.strictEqual(buffer.getSymbol(5, 0), "F");

      // Columns 6+ should be empty (clipped)
      assert.strictEqual(buffer.getSymbol(6, 0), " ");
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
});
