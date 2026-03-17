import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import {
  Box,
  DEFAULT_CLIP,
  DEFAULT_INHERITED_STYLE,
  createRef,
  mount,
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

      // Move cursor between a and b
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

      // Move to second line
      for (let i = 0; i < 7; i++) {
        node.onKeyPress(keyEvent("right"));
      }

      // Move up
      const result = node.onKeyPress(keyEvent("up"));
      assert.strictEqual(result, true);

      // Insert character - should be on first line
      node.onKeyPress(keyEvent("X", "X"));
      assert.ok(received.startsWith("X") || received.includes("\nLine 2"));
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

      // Move down from first line
      const result = node.onKeyPress(keyEvent("down"));
      assert.strictEqual(result, true);

      // Insert character - should be on second line
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

      // Move to start of second line (position 4, after newline)
      for (let i = 0; i < 4; i++) {
        node.onKeyPress(keyEvent("right"));
      }

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

      // Move to end of first line (position 3)
      for (let i = 0; i < 3; i++) {
        node.onKeyPress(keyEvent("right"));
      }

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
      for (let i = 0; i < 4; i++) {
        node.onKeyPress(keyEvent("right"));
      }

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

      // Cursor at start, delete first char
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

      // Move to end of first line
      for (let i = 0; i < 3; i++) {
        node.onKeyPress(keyEvent("right"));
      }

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

      // Move right twice (cursor at position 2)
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

      // Move right twice (cursor at position 2)
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

      // Move to middle of second line
      for (let i = 0; i < 6; i++) {
        node.onKeyPress(keyEvent("right"));
      }

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

      // Cursor at start of first line
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
    function mountTextarea(
      initialValue: string,
      options: { width?: number; maxHeight?: number } = {},
    ) {
      const [value, setValue] = createSignal(initialValue);
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(80, 24);
      const ref = createRef();

      const app = mount(
        () =>
          Box({
            children: [
              Textarea({
                value,
                onChange: setValue,
                width: options.width ?? 10,
                maxHeight: options.maxHeight,
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

      // Helper to check if stripped output contains a string
      const outputContains = (s: string) =>
        stripAnsi(mockStdout.written).includes(s);

      // Helper to send key via stdin (triggers full event cycle)
      const sendKey = async (name: string) => {
        mockStdin.emit("keypress", name.length === 1 ? name : undefined, {
          name,
          sequence: name,
        });
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

    it("shows first lines initially", () => {
      const { app, outputContains } = mountTextarea(
        "AAA\nBBB\nCCC\nDDD\nEEE\nFFF",
        { width: 10, maxHeight: 3 },
      );

      // First three lines should be visible
      assert.ok(outputContains("AAA"), "First line should be visible");
      assert.ok(outputContains("BBB"), "Second line should be visible");
      assert.ok(outputContains("CCC"), "Third line should be visible");
      // Line 4 should not be visible initially
      assert.ok(!outputContains("DDD"), "Fourth line should NOT be visible");

      app.unmount();
    });

    it("scrolls down when cursor moves past visible area", async () => {
      const { app, sendKey, outputContains } = mountTextarea(
        "AAA\nBBB\nCCC\nDDD\nEEE\nFFF",
        { width: 10, maxHeight: 3 },
      );

      // Initially DDD should not be visible
      assert.ok(
        !outputContains("DDD"),
        "Line 4 should NOT be visible initially",
      );

      // Move cursor down 3 times (to line 4, which is past visible area)
      await sendKey("down"); // line 2
      await sendKey("down"); // line 3
      await sendKey("down"); // line 4 - should trigger scroll

      // Now line 4 (DDD) should be visible in cumulative output
      assert.ok(outputContains("DDD"), "Line 4 should be visible after scroll");

      app.unmount();
    });

    it("scrolls up when cursor moves above visible area", async () => {
      const { app, sendKey, outputContains } = mountTextarea(
        "AAA\nBBB\nCCC\nDDD\nEEE\nFFF",
        { width: 10, maxHeight: 3 },
      );

      // Move down to line 5
      for (let i = 0; i < 4; i++) {
        await sendKey("down");
      }

      // At this point, EEE should be visible (line 5)
      assert.ok(
        outputContains("EEE"),
        "Line 5 should be visible after scrolling down",
      );

      // Move back up - BBB should become visible when we reach line 2
      await sendKey("up"); // line 4
      await sendKey("up"); // line 3
      await sendKey("up"); // line 2 - should trigger scroll up

      // Line 2 (BBB) should be visible again (was scrolled out of view then back)
      assert.ok(
        outputContains("BBB"),
        "Line 2 should be visible after scroll up",
      );

      app.unmount();
    });

    it("cursor stays visible at bottom of content", async () => {
      const { app, sendKey, outputContains } = mountTextarea(
        "AAA\nBBB\nCCC\nDDD\nEEE",
        { width: 10, maxHeight: 3 },
      );

      // Initially EEE should not be visible
      assert.ok(
        !outputContains("EEE"),
        "Last line should NOT be visible initially",
      );

      // Move to last line
      for (let i = 0; i < 4; i++) {
        await sendKey("down");
      }

      // Last line (EEE) should be visible after scrolling
      assert.ok(
        outputContains("EEE"),
        "Last line should be visible when cursor is there",
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
  });

  describe("integration", () => {
    it("works within mounted app", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const [value, setValue] = createSignal("");

      const app = mount(
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

      const app = mount(
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
