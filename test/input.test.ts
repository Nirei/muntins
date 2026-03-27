import assert from "node:assert";
import { describe, it } from "node:test";
import {
  type FocusEvent,
  type InputEvent,
  type KeyInput,
  MOUSE_LEFT,
  type MouseInput,
  NO_MODIFIERS,
  type PasteEvent,
  PasteParser,
  type ResizeEvent,
  type ScrollInput,
  SequenceParser,
  createInputParser,
  isPrintable,
  mapKeypressToEvent,
  parseMouseSequence,
  registerCleanup,
  setupKeyboardInput,
  setupResizeHandler,
  setupTerminal,
  teardownTerminal
} from "../src/core/input.ts";

describe("input event types", () => {
  it("KeyInput has required fields", () => {
    const event: KeyInput = {
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

  it("MouseInput has required fields", () => {
    const event: MouseInput = {
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

  it("ScrollInput has required fields", () => {
    const event: ScrollInput = {
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
    assert.strictEqual((event as MouseInput).action, "press");
    assert.strictEqual((event as MouseInput).button, 0);
    assert.strictEqual(event?.x, 9); // 0-indexed
    assert.strictEqual(event?.y, 4); // 0-indexed
  });

  it("parses left button release", () => {
    const event = parseMouseSequence("0;10;5", false);

    assert.strictEqual((event as MouseInput).action, "release");
  });

  it("parses middle button", () => {
    const event = parseMouseSequence("1;10;5", true);

    assert.strictEqual((event as MouseInput).button, 1);
  });

  it("parses right button", () => {
    const event = parseMouseSequence("2;10;5", true);

    assert.strictEqual((event as MouseInput).button, 2);
  });

  it("parses motion event", () => {
    const event = parseMouseSequence("32;10;5", true); // 32 = motion flag

    assert.strictEqual((event as MouseInput).action, "move");
    assert.strictEqual((event as MouseInput).button, 0);
  });

  it("parses motion with button", () => {
    const event = parseMouseSequence("33;10;5", true); // 32 + 1 = motion + middle

    assert.strictEqual((event as MouseInput).action, "move");
    assert.strictEqual((event as MouseInput).button, 1);
  });

  it("parses scroll up", () => {
    const event = parseMouseSequence("64;10;5", true);

    assert.strictEqual(event?.type, "scroll");
    assert.strictEqual((event as ScrollInput).direction, "up");
  });

  it("parses scroll down", () => {
    const event = parseMouseSequence("65;10;5", true);

    assert.strictEqual(event?.type, "scroll");
    assert.strictEqual((event as ScrollInput).direction, "down");
  });

  it("parses scroll left", () => {
    const event = parseMouseSequence("66;10;5", true);

    assert.strictEqual(event?.type, "scroll");
    assert.strictEqual((event as ScrollInput).direction, "left");
  });

  it("parses scroll right", () => {
    const event = parseMouseSequence("67;10;5", true);

    assert.strictEqual(event?.type, "scroll");
    assert.strictEqual((event as ScrollInput).direction, "right");
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

  it("does not lose ESC when invalid sequence ends with ESC", () => {
    const parser = new SequenceParser();

    // Partial mouse sequence interrupted by new mouse sequence
    // \x1b[<0;10 is incomplete, then \x1b starts new sequence
    const events = parser.feed("\x1b[<0;10\x1b[<0;5;3M");

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, "mouse");
    assert.strictEqual((events[0] as MouseInput).x, 4); // 5-1 = 4
    assert.strictEqual((events[0] as MouseInput).y, 2); // 3-1 = 2
  });

  it("does not lose ESC in CSI state", () => {
    const parser = new SequenceParser();

    // Unknown CSI sequence followed by focus event
    // \x1b[X is unknown, then \x1b[I is focus
    const events = parser.feed("\x1b[X\x1b[I");

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, "focus");
    assert.strictEqual((events[0] as FocusEvent).focused, true);
  });

  it("parses focus in event", () => {
    const parser = new SequenceParser();
    const events = parser.feed("\x1b[I");

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, "focus");
    assert.strictEqual((events[0] as FocusEvent).focused, true);
  });

  it("parses focus out event", () => {
    const parser = new SequenceParser();
    const events = parser.feed("\x1b[O");

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, "focus");
    assert.strictEqual((events[0] as FocusEvent).focused, false);
  });

  it("parses focus and mouse in same chunk", () => {
    const parser = new SequenceParser();
    const events = parser.feed("\x1b[I\x1b[<0;10;5M");

    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].type, "focus");
    assert.strictEqual(events[1].type, "mouse");
  });
});

describe("paste parser", () => {
  it("parses complete paste", () => {
    const parser = new PasteParser();
    const result = parser.feed("\x1b[200~hello world\x1b[201~");

    assert.strictEqual(result.text, "hello world");
    assert.strictEqual(result.remaining, "");
  });

  it("parses paste with remaining data", () => {
    const parser = new PasteParser();
    const result = parser.feed("\x1b[200~pasted\x1b[201~more");

    assert.strictEqual(result.text, "pasted");
    assert.strictEqual(result.remaining, "more");
  });

  it("handles split paste across chunks", () => {
    const parser = new PasteParser();

    let result = parser.feed("\x1b[200~hel");
    assert.strictEqual(result.text, null);

    result = parser.feed("lo\x1b[201~");
    assert.strictEqual(result.text, "hello");
  });

  it("preserves data before paste marker", () => {
    const parser = new PasteParser();
    const result = parser.feed("hello\x1b[200~pasted\x1b[201~");

    assert.strictEqual(result.beforePaste, "hello");
    assert.strictEqual(result.text, "pasted");
  });

  it("handles split start marker across chunks", () => {
    const parser = new PasteParser();

    // First chunk ends with partial start marker
    let result = parser.feed("text\x1b[200");
    assert.strictEqual(result.text, null);
    assert.strictEqual(result.remaining, "text"); // return data before partial

    // Second chunk completes the marker
    result = parser.feed("~pasted\x1b[201~");
    assert.strictEqual(result.text, "pasted");
  });

  it("preserves newlines in paste", () => {
    const parser = new PasteParser();
    const result = parser.feed("\x1b[200~line1\nline2\x1b[201~");

    assert.strictEqual(result.text, "line1\nline2");
  });

  it("handles paste with escape sequences inside", () => {
    const parser = new PasteParser();
    const result = parser.feed("\x1b[200~\x1b[31mred\x1b[0m\x1b[201~");

    // The escape sequences inside paste are preserved as-is
    assert.ok(result.text?.includes("\x1b[31m"));
  });

  it("returns null when no paste marker", () => {
    const parser = new PasteParser();
    const result = parser.feed("regular text");

    assert.strictEqual(result.text, null);
    assert.strictEqual(result.remaining, "regular text");
  });

  it("handles multiple consecutive pastes", () => {
    const parser = new PasteParser();

    // First paste
    let result = parser.feed("\x1b[200~first\x1b[201~");
    assert.strictEqual(result.text, "first");

    // Second paste immediately after
    result = parser.feed("\x1b[200~second\x1b[201~");
    assert.strictEqual(result.text, "second");
  });

  it("handles split end marker across chunks", () => {
    const parser = new PasteParser();

    // First chunk has partial end marker
    let result = parser.feed("\x1b[200~hello\x1b[201");
    assert.strictEqual(result.text, null);

    // Second chunk completes the marker
    result = parser.feed("~");
    assert.strictEqual(result.text, "hello");
  });

  it("handles split end marker at different positions", () => {
    const parser = new PasteParser();

    // Split after \x1b
    let result = parser.feed("\x1b[200~test\x1b");
    assert.strictEqual(result.text, null);

    result = parser.feed("[201~");
    assert.strictEqual(result.text, "test");
  });

  it("handles false end marker prefix followed by real end", () => {
    const parser = new PasteParser();

    // First chunk ends with what looks like start of end marker
    let result = parser.feed("\x1b[200~data\x1b[20");
    assert.strictEqual(result.text, null);

    // But next chunk has different continuation, then real end marker
    result = parser.feed("0~more\x1b[201~");
    // The \x1b[200~ in the middle is paste content (another start marker)
    // This tests that false positives are handled
    assert.strictEqual(result.text, "data\x1b[200~more");
  });
});

describe("resize handler", () => {
  it("emits resize event", () => {
    let resizeEvent: ResizeEvent | undefined;

    const mockStdout = {
      columns: 120,
      rows: 40,
      on: (event: string, handler: () => void) => {
        if (event === "resize") {
          // Simulate resize by calling handler immediately
          handler();
        }
      },
      off: () => {},
    } as unknown as NodeJS.WriteStream;

    setupResizeHandler(mockStdout, (event) => {
      resizeEvent = event;
    });

    assert.ok(resizeEvent);
    assert.strictEqual(resizeEvent.type, "resize");
    assert.strictEqual(resizeEvent.width, 120);
    assert.strictEqual(resizeEvent.height, 40);
  });

  it("returns cleanup function", () => {
    let offCalled = false;

    const mockStdout = {
      columns: 80,
      rows: 24,
      on: () => {},
      off: (event: string) => {
        if (event === "resize") {
          offCalled = true;
        }
      },
    } as unknown as NodeJS.WriteStream;

    const cleanup = setupResizeHandler(mockStdout, () => {});
    cleanup();

    assert.ok(offCalled);
  });
});

describe("createInputParser", () => {
  it("returns destroy function", () => {
    const mockStdin = {
      isTTY: true,
      setRawMode: () => {},
      on: () => {},
      off: () => {},
      listenerCount: () => 0,
    } as unknown as NodeJS.ReadStream;
    const mockStdout = {
      write: () => true,
      columns: 80,
      rows: 24,
      on: () => {},
      off: () => {},
    } as unknown as NodeJS.WriteStream;

    const parser = createInputParser(mockStdin, mockStdout, () => {});

    assert.ok(typeof parser.destroy === "function");
    parser.destroy();
  });

  it("destroy can be called multiple times safely", () => {
    let teardownCount = 0;
    const mockStdin = {
      isTTY: true,
      setRawMode: () => {},
      on: () => {},
      off: () => {},
      listenerCount: () => 0,
    } as unknown as NodeJS.ReadStream;
    const mockStdout = {
      write: () => {
        teardownCount++;
        return true;
      },
      columns: 80,
      rows: 24,
      on: () => {},
      off: () => {},
    } as unknown as NodeJS.WriteStream;

    const parser = createInputParser(mockStdin, mockStdout, () => {});

    // Reset count after setup (which also writes)
    const setupWrites = teardownCount;

    parser.destroy();
    const afterFirstDestroy = teardownCount - setupWrites;

    parser.destroy();
    const afterSecondDestroy = teardownCount - setupWrites;

    // Second destroy should not cause additional writes
    assert.strictEqual(afterFirstDestroy, afterSecondDestroy);
  });

  it("calls onEvent for keyboard input", () => {
    const events: InputEvent[] = [];
    // Use a mutable object to capture the handler
    const handlers: { keypress?: (char: string, key: object) => void } = {};

    const mockStdin = {
      isTTY: true,
      setRawMode: () => {},
      on: (event: string, handler: (char: string, key: object) => void) => {
        if (event === "keypress") {
          handlers.keypress = handler;
        }
      },
      off: () => {},
      listenerCount: () => 0,
    } as unknown as NodeJS.ReadStream;
    const mockStdout = {
      write: () => true,
      columns: 80,
      rows: 24,
      on: () => {},
      off: () => {},
    } as unknown as NodeJS.WriteStream;

    const parser = createInputParser(mockStdin, mockStdout, (event) => {
      events.push(event);
    });

    // Simulate keypress
    assert.ok(handlers.keypress);
    handlers.keypress("a", {
      name: "a",
      ctrl: false,
      shift: false,
      meta: false,
      sequence: "a",
    });

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, "key");

    parser.destroy();
  });

  it("mouse sequence produces only mouse event, no spurious key events", () => {
    // BUG: When mouse is enabled, clicking produces spurious key events
    // because readline.emitKeypressEvents doesn't understand SGR mouse protocol
    // and emits the sequence fragments as individual keypresses.
    //
    // A mouse click should produce exactly one mouse event.
    const events: InputEvent[] = [];
    const handlers: {
      data?: (data: Buffer) => void;
    } = {};

    const mockStdin = {
      isTTY: true,
      setRawMode: () => {},
      on: (event: string, handler: (data: Buffer) => void) => {
        if (event === "data") {
          handlers.data = handler;
        }
      },
      off: () => {},
      listenerCount: () => 0,
    } as unknown as NodeJS.ReadStream;
    const mockStdout = {
      write: () => true,
      columns: 80,
      rows: 24,
      on: () => {},
      off: () => {},
    } as unknown as NodeJS.WriteStream;

    const parser = createInputParser(
      mockStdin,
      mockStdout,
      (event) => {
        events.push(event);
      },
      { mouse: true },
    );

    // Send a mouse click sequence via raw data
    assert.ok(handlers.data);
    handlers.data(Buffer.from("\x1b[<0;10;5M"));

    // Should get exactly one mouse event, no key events
    const mouseEvents = events.filter((e) => e.type === "mouse");
    const keyEvents = events.filter((e) => e.type === "key");

    assert.strictEqual(
      mouseEvents.length,
      1,
      "Should emit exactly one mouse event",
    );
    assert.strictEqual(keyEvents.length, 0, "Should not emit any key events");

    const mouseEvent = mouseEvents[0] as MouseInput;
    assert.strictEqual(mouseEvent.action, "press");
    assert.strictEqual(mouseEvent.x, 9); // 0-indexed
    assert.strictEqual(mouseEvent.y, 4); // 0-indexed

    parser.destroy();
  });

  it("keyboard input after mouse click works correctly", () => {
    // After a mouse click, typing should still produce key events
    const events: InputEvent[] = [];
    const handlers: {
      data?: (data: Buffer) => void;
    } = {};

    const mockStdin = {
      isTTY: true,
      setRawMode: () => {},
      on: (event: string, handler: (data: Buffer) => void) => {
        if (event === "data") {
          handlers.data = handler;
        }
      },
      off: () => {},
      listenerCount: () => 0,
    } as unknown as NodeJS.ReadStream;
    const mockStdout = {
      write: () => true,
      columns: 80,
      rows: 24,
      on: () => {},
      off: () => {},
    } as unknown as NodeJS.WriteStream;

    const parser = createInputParser(
      mockStdin,
      mockStdout,
      (event) => {
        events.push(event);
      },
      { mouse: true },
    );

    assert.ok(handlers.data);

    // Mouse click, then type 'a'
    handlers.data(Buffer.from("\x1b[<0;10;5M"));
    handlers.data(Buffer.from("a"));

    assert.strictEqual(events.length, 2, "Should emit two events total");
    assert.strictEqual(events[0].type, "mouse");
    assert.strictEqual(events[1].type, "key");
    assert.strictEqual((events[1] as KeyInput).name, "a");
    assert.strictEqual((events[1] as KeyInput).char, "a");

    parser.destroy();
  });
});
