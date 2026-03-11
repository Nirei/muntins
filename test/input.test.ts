import assert from "node:assert";
import { describe, it } from "node:test";
import {
  type FocusEvent,
  type InputEvent,
  type KeyEvent,
  MOUSE_LEFT,
  type Modifiers,
  type MouseEvent,
  NO_MODIFIERS,
  type PasteEvent,
  type ResizeEvent,
  type ScrollEvent,
  registerCleanup,
  setupTerminal,
  teardownTerminal,
} from "../src/core/input.ts";

describe("input event types", () => {
  it("KeyEvent has required fields", () => {
    const event: KeyEvent = {
      type: "key",
      name: "a",
      char: "a",
      ctrl: false,
      alt: false,
      shift: false,
      sequence: "a",
    };
    assert.strictEqual(event.type, "key");
    assert.strictEqual(event.name, "a");
  });

  it("MouseEvent has required fields", () => {
    const event: MouseEvent = {
      type: "mouse",
      action: "press",
      button: MOUSE_LEFT,
      x: 10,
      y: 5,
      ctrl: false,
      alt: false,
      shift: false,
    };
    assert.strictEqual(event.type, "mouse");
    assert.strictEqual(event.action, "press");
  });

  it("ScrollEvent has required fields", () => {
    const event: ScrollEvent = {
      type: "scroll",
      direction: "up",
      x: 10,
      y: 5,
      ctrl: false,
      alt: false,
      shift: false,
    };
    assert.strictEqual(event.type, "scroll");
    assert.strictEqual(event.direction, "up");
  });

  it("ResizeEvent has required fields", () => {
    const event: ResizeEvent = {
      type: "resize",
      width: 120,
      height: 40,
    };
    assert.strictEqual(event.type, "resize");
  });

  it("PasteEvent has required fields", () => {
    const event: PasteEvent = {
      type: "paste",
      text: "hello\nworld",
    };
    assert.strictEqual(event.type, "paste");
    assert.ok(event.text.includes("\n"));
  });

  it("FocusEvent has required fields", () => {
    const event: FocusEvent = {
      type: "focus",
      focused: true,
    };
    assert.strictEqual(event.type, "focus");
  });

  it("InputEvent union discriminates on type", () => {
    const event: InputEvent = {
      type: "key",
      name: "enter",
      char: "",
      ctrl: false,
      alt: false,
      shift: false,
      sequence: "\r",
    };

    if (event.type === "key") {
      assert.strictEqual(event.name, "enter");
    }
  });

  it("NO_MODIFIERS has all false", () => {
    assert.strictEqual(NO_MODIFIERS.ctrl, false);
    assert.strictEqual(NO_MODIFIERS.alt, false);
    assert.strictEqual(NO_MODIFIERS.shift, false);
  });
});

describe("mouse button constants", () => {
  it("MOUSE_LEFT is 0", () => {
    assert.strictEqual(MOUSE_LEFT, 0);
  });
});

describe("terminal setup", () => {
  it("setupTerminal throws if stdin is not TTY", () => {
    const mockStdin = { isTTY: false } as NodeJS.ReadStream;
    const mockStdout = { write: () => true } as unknown as NodeJS.WriteStream;

    assert.throws(() => {
      setupTerminal(mockStdin, mockStdout);
    }, /not a TTY/);
  });

  it("setupTerminal enables raw mode", () => {
    let rawModeEnabled = false;
    const mockStdin = {
      isTTY: true,
      setRawMode: (mode: boolean) => {
        rawModeEnabled = mode;
      },
    } as unknown as NodeJS.ReadStream;
    const mockStdout = { write: () => true } as unknown as NodeJS.WriteStream;

    setupTerminal(mockStdin, mockStdout);
    assert.strictEqual(rawModeEnabled, true);
  });

  it("setupTerminal writes focus and paste sequences", () => {
    let written = "";
    const mockStdin = {
      isTTY: true,
      setRawMode: () => {},
    } as unknown as NodeJS.ReadStream;
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    setupTerminal(mockStdin, mockStdout);

    assert.ok(written.includes("\x1b[?1004h")); // focus
    assert.ok(written.includes("\x1b[?2004h")); // bracketed paste
  });

  it("setupTerminal writes mouse sequences when enabled", () => {
    let written = "";
    const mockStdin = {
      isTTY: true,
      setRawMode: () => {},
    } as unknown as NodeJS.ReadStream;
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    setupTerminal(mockStdin, mockStdout, { mouse: true });

    assert.ok(written.includes("\x1b[?1000h"));
    assert.ok(written.includes("\x1b[?1002h"));
    assert.ok(written.includes("\x1b[?1006h"));
  });

  it("teardownTerminal disables raw mode", () => {
    let rawModeEnabled = true;
    const mockStdin = {
      isTTY: true,
      setRawMode: (mode: boolean) => {
        rawModeEnabled = mode;
      },
    } as unknown as NodeJS.ReadStream;
    const mockStdout = { write: () => true } as unknown as NodeJS.WriteStream;

    teardownTerminal(mockStdin, mockStdout);
    assert.strictEqual(rawModeEnabled, false);
  });

  it("teardownTerminal writes disable sequences", () => {
    let written = "";
    const mockStdin = {
      isTTY: true,
      setRawMode: () => {},
    } as unknown as NodeJS.ReadStream;
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    teardownTerminal(mockStdin, mockStdout);

    assert.ok(written.includes("\x1b[?2004l")); // bracketed paste off
    assert.ok(written.includes("\x1b[?1004l")); // focus off
    assert.ok(written.includes("\x1b[?1000l")); // mouse off
  });

  it("registerCleanup returns unregister function", () => {
    let cleanupCalled = false;
    const unregister = registerCleanup(() => {
      cleanupCalled = true;
    });

    // Immediately unregister so we don't affect other tests
    unregister();

    // Calling unregister again should be a no-op (no error)
    unregister();
    assert.strictEqual(cleanupCalled, false);
  });
});
