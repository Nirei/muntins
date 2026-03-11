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
  SequenceParser,
  isPrintable,
  mapKeypressToEvent,
  parseMouseSequence,
  registerCleanup,
  setupKeyboardInput,
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

describe("keyboard input", () => {
  it("maps simple character", () => {
    const event = mapKeypressToEvent("a", {
      name: "a",
      ctrl: false,
      shift: false,
      meta: false,
      sequence: "a",
    });

    assert.strictEqual(event?.name, "a");
    assert.strictEqual(event?.char, "a");
    assert.strictEqual(event?.ctrl, false);
  });

  it("maps uppercase with shift", () => {
    const event = mapKeypressToEvent("A", {
      name: "a",
      ctrl: false,
      shift: true,
      meta: false,
      sequence: "A",
    });

    assert.strictEqual(event?.name, "a");
    assert.strictEqual(event?.char, "A");
    assert.strictEqual(event?.shift, true);
  });

  it("maps ctrl+c", () => {
    const event = mapKeypressToEvent(undefined, {
      name: "c",
      ctrl: true,
      shift: false,
      meta: false,
      sequence: "\x03",
    });

    assert.strictEqual(event?.name, "c");
    assert.strictEqual(event?.ctrl, true);
    assert.strictEqual(event?.char, "");
  });

  it("maps arrow keys", () => {
    const event = mapKeypressToEvent(undefined, {
      name: "up",
      ctrl: false,
      shift: false,
      meta: false,
      sequence: "\x1b[A",
    });

    assert.strictEqual(event?.name, "up");
    assert.strictEqual(event?.char, "");
  });

  it("maps function keys", () => {
    const event = mapKeypressToEvent(undefined, {
      name: "f1",
      ctrl: false,
      shift: false,
      meta: false,
      sequence: "\x1bOP",
    });

    assert.strictEqual(event?.name, "f1");
  });

  it("maps alt+key", () => {
    const event = mapKeypressToEvent("x", {
      name: "x",
      ctrl: false,
      shift: false,
      meta: true,
      sequence: "\x1bx",
    });

    assert.strictEqual(event?.name, "x");
    assert.strictEqual(event?.alt, true);
  });

  it("normalizes return to enter", () => {
    const event = mapKeypressToEvent(undefined, {
      name: "return",
      ctrl: false,
      shift: false,
      meta: false,
      sequence: "\r",
    });

    assert.strictEqual(event?.name, "enter");
  });

  it("normalizes esc to escape", () => {
    const event = mapKeypressToEvent(undefined, {
      name: "esc",
      ctrl: false,
      shift: false,
      meta: false,
      sequence: "\x1b",
    });

    assert.strictEqual(event?.name, "escape");
  });

  it("maps escape key", () => {
    const event = mapKeypressToEvent(undefined, {
      name: "escape",
      ctrl: false,
      shift: false,
      meta: false,
      sequence: "\x1b",
    });

    assert.strictEqual(event?.name, "escape");
  });

  it("maps UTF-8 emoji character", () => {
    const event = mapKeypressToEvent("😀", {
      name: undefined,
      ctrl: false,
      shift: false,
      meta: false,
      sequence: "😀",
    });

    assert.strictEqual(event?.char, "😀");
    assert.strictEqual(event?.sequence, "😀");
  });

  it("maps multi-codepoint emoji (ZWJ sequence)", () => {
    // Family emoji: 👨‍👩‍👧 is composed of multiple codepoints joined by ZWJ
    const familyEmoji = "👨‍👩‍👧";
    const event = mapKeypressToEvent(familyEmoji, {
      name: undefined,
      ctrl: false,
      shift: false,
      meta: false,
      sequence: familyEmoji,
    });

    // isPrintable checks charCodeAt(0), which is the first codepoint
    // The first codepoint (0x1F468) is printable, so the whole string is kept
    assert.strictEqual(event?.char, familyEmoji);
    assert.strictEqual(event?.sequence, familyEmoji);
  });

  it("returns null for empty input", () => {
    const event = mapKeypressToEvent(undefined, undefined);
    assert.strictEqual(event, null);
  });

  it("isPrintable returns true for letters", () => {
    assert.strictEqual(isPrintable("a"), true);
    assert.strictEqual(isPrintable("Z"), true);
  });

  it("isPrintable returns false for control characters", () => {
    assert.strictEqual(isPrintable("\x00"), false);
    assert.strictEqual(isPrintable("\x1b"), false);
    assert.strictEqual(isPrintable("\x7f"), false);
  });

  it("isPrintable returns false for undefined/empty", () => {
    assert.strictEqual(isPrintable(undefined), false);
    assert.strictEqual(isPrintable(""), false);
  });

  it("setupKeyboardInput cleanup removes listener", () => {
    let offCalled = false;
    const mockStdin = {
      on: (_event: string, _handler: () => void) => {},
      off: (event: string, _handler: () => void) => {
        if (event === "keypress") {
          offCalled = true;
        }
      },
      // Required by readline.emitKeypressEvents
      listenerCount: () => 0,
    } as unknown as NodeJS.ReadStream;

    const cleanup = setupKeyboardInput(mockStdin, () => {});
    cleanup();

    assert.ok(offCalled);
  });
});

describe("mouse parser", () => {
  it("parses left button press", () => {
    const event = parseMouseSequence("0;10;5", true);

    assert.strictEqual(event?.type, "mouse");
    assert.strictEqual((event as MouseEvent).action, "press");
    assert.strictEqual((event as MouseEvent).button, 0);
    assert.strictEqual(event?.x, 9); // 0-indexed
    assert.strictEqual(event?.y, 4); // 0-indexed
  });

  it("parses left button release", () => {
    const event = parseMouseSequence("0;10;5", false);

    assert.strictEqual((event as MouseEvent).action, "release");
  });

  it("parses middle button", () => {
    const event = parseMouseSequence("1;10;5", true);

    assert.strictEqual((event as MouseEvent).button, 1);
  });

  it("parses right button", () => {
    const event = parseMouseSequence("2;10;5", true);

    assert.strictEqual((event as MouseEvent).button, 2);
  });

  it("parses motion event", () => {
    const event = parseMouseSequence("32;10;5", true); // 32 = motion flag

    assert.strictEqual((event as MouseEvent).action, "move");
    assert.strictEqual((event as MouseEvent).button, 0);
  });

  it("parses motion with button", () => {
    const event = parseMouseSequence("33;10;5", true); // 32 + 1 = motion + middle

    assert.strictEqual((event as MouseEvent).action, "move");
    assert.strictEqual((event as MouseEvent).button, 1);
  });

  it("parses scroll up", () => {
    const event = parseMouseSequence("64;10;5", true);

    assert.strictEqual(event?.type, "scroll");
    assert.strictEqual((event as ScrollEvent).direction, "up");
  });

  it("parses scroll down", () => {
    const event = parseMouseSequence("65;10;5", true);

    assert.strictEqual(event?.type, "scroll");
    assert.strictEqual((event as ScrollEvent).direction, "down");
  });

  it("parses scroll left", () => {
    const event = parseMouseSequence("66;10;5", true);

    assert.strictEqual(event?.type, "scroll");
    assert.strictEqual((event as ScrollEvent).direction, "left");
  });

  it("parses scroll right", () => {
    const event = parseMouseSequence("67;10;5", true);

    assert.strictEqual(event?.type, "scroll");
    assert.strictEqual((event as ScrollEvent).direction, "right");
  });

  it("parses shift modifier", () => {
    const event = parseMouseSequence("4;10;5", true); // 4 = shift

    assert.strictEqual(event?.shift, true);
    assert.strictEqual(event?.alt, false);
    assert.strictEqual(event?.ctrl, false);
  });

  it("parses alt modifier", () => {
    const event = parseMouseSequence("8;10;5", true); // 8 = alt

    assert.strictEqual(event?.alt, true);
  });

  it("parses ctrl modifier", () => {
    const event = parseMouseSequence("16;10;5", true); // 16 = ctrl

    assert.strictEqual(event?.ctrl, true);
  });

  it("parses multiple modifiers", () => {
    const event = parseMouseSequence("28;10;5", true); // 4 + 8 + 16 = shift + alt + ctrl

    assert.strictEqual(event?.shift, true);
    assert.strictEqual(event?.alt, true);
    assert.strictEqual(event?.ctrl, true);
  });

  it("returns null for invalid params", () => {
    assert.strictEqual(parseMouseSequence("", true), null);
    assert.strictEqual(parseMouseSequence("0;10", true), null);
    assert.strictEqual(parseMouseSequence("a;10;5", true), null);
  });

  it("converts to 0-indexed coordinates", () => {
    const event = parseMouseSequence("0;1;1", true);

    assert.strictEqual(event?.x, 0);
    assert.strictEqual(event?.y, 0);
  });

  it("handles large coordinates", () => {
    const event = parseMouseSequence("0;300;100", true);

    assert.strictEqual(event?.x, 299);
    assert.strictEqual(event?.y, 99);
  });
});

describe("SequenceParser state machine", () => {
  it("parses complete mouse sequence", () => {
    const parser = new SequenceParser();
    const events = parser.feed("\x1b[<0;10;5M");

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, "mouse");
  });

  it("parses multiple sequences in one chunk", () => {
    const parser = new SequenceParser();
    const events = parser.feed("\x1b[<0;10;5M\x1b[<0;11;5M");

    assert.strictEqual(events.length, 2);
  });

  it("handles split sequences across chunks", () => {
    const parser = new SequenceParser();

    let events = parser.feed("\x1b[<0;10");
    assert.strictEqual(events.length, 0);

    events = parser.feed(";5M");
    assert.strictEqual(events.length, 1);
  });

  it("ignores non-mouse CSI sequences", () => {
    const parser = new SequenceParser();
    const events = parser.feed("\x1b[A"); // arrow up

    assert.strictEqual(events.length, 0);
  });

  it("recovers from invalid sequences", () => {
    const parser = new SequenceParser();

    // Invalid sequence followed by valid
    const events = parser.feed("\x1b[<invalid\x1b[<0;10;5M");

    assert.strictEqual(events.length, 1);
  });
});
