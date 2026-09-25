// Input handling and parsing

import * as readline from "node:readline";

// Mouse button constants
export const MOUSE_LEFT = 0;

// Modifier flags (internal use)
interface Modifiers {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

const NO_MODIFIERS: Modifiers = { ctrl: false, alt: false, shift: false };

/** Minimal node interface for event targets (avoids circular dependency with runtime.ts) */
export interface EventTarget {
  /** Programmatically activate this node */
  activate?: () => void;
}

/** Raw keyboard input from terminal */
export interface KeyInput {
  type: "key";
  /** Key name: "a", "enter", "up", "f1", etc. Always lowercase. */
  name: string;
  /** Printable character or "" for non-printable keys */
  char: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** Raw escape sequence for debugging */
  sequence: string;
}

/** Raw mouse input from terminal */
export interface MouseInput {
  type: "mouse";
  action: "press" | "release" | "move";
  /** 0=left, 1=middle, 2=right */
  button: number;
  /** 0-indexed column */
  x: number;
  /** 0-indexed row */
  y: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** Raw escape sequence for debugging (optional) */
  sequence?: string;
}

/** Raw scroll input from terminal */
export interface ScrollInput {
  type: "scroll";
  direction: "up" | "down" | "left" | "right";
  /** 0-indexed column */
  x: number;
  /** 0-indexed row */
  y: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** Raw escape sequence for debugging (optional) */
  sequence?: string;
}

/** Base interface for all dispatched events */
export interface Event {
  readonly target: EventTarget;
}

/** Keyboard event dispatched to a node */
export interface KeyEvent extends KeyInput, Event {
  readonly target: EventTarget;
}

/** Mouse event dispatched to a node */
export interface MouseEvent extends MouseInput, Event {
  readonly target: EventTarget;
}

/** Scroll event dispatched to a node */
export interface ScrollEvent extends ScrollInput, Event {
  readonly target: EventTarget;
}

/** Activation event - triggered by keyboard, mouse, or programmatically */
export interface ActivateEvent extends Event {
  readonly type: "activate";
  readonly target: EventTarget;
}

/** Terminal resize event */
export interface ResizeEvent {
  type: "resize";
  /** New column count */
  width: number;
  /** New row count */
  height: number;
}

/** Bracketed paste event */
export interface PasteEvent {
  type: "paste";
  /** Pasted content (may be multi-line) */
  text: string;
}

/** Terminal focus change event */
export interface FocusEvent {
  type: "focus";
  /** true = terminal gained focus, false = lost focus */
  focused: boolean;
}

/** Union of all raw input types (from terminal parsing, no target) */
export type InputEvent =
  | KeyInput
  | MouseInput
  | ScrollInput
  | ResizeEvent
  | PasteEvent
  | FocusEvent;

export { NO_MODIFIERS, type Modifiers };

// Local interface matching readline's Key (may not be exported from @types/node)
interface ReadlineKey {
  name?: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
  sequence?: string;
}

/**
 * Check if a character is printable (not a control character).
 */
export function isPrintable(char: string | undefined): boolean {
  if (!char || char.length === 0) return false;
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  return code >= 0x20 && code !== 0x7f && !(code >= 0xd800 && code <= 0xdfff);
}

/**
 * Normalize key names for consistency.
 */
function normalizeKeyName(name: string): string {
  const normalized = name.toLowerCase();

  switch (normalized) {
    case "return":
      return "enter";
    case "esc":
      return "escape";
    default:
      return normalized;
  }
}

/**
 * Map readline keypress event to our KeyInput type.
 */
export function mapKeypressToEvent(
  char: string | undefined,
  key: ReadlineKey | undefined,
): KeyInput | null {
  if (!key && !char) {
    return null;
  }

  const rawName = key?.name ?? char ?? "";
  const name = normalizeKeyName(rawName);
  const sequence = key?.sequence ?? char ?? "";
  const printableChar = isPrintable(char) ? (char as string) : "";

  return {
    type: "key",
    name,
    char: printableChar,
    ctrl: key?.ctrl ?? false,
    alt: key?.meta ?? false,
    shift: key?.shift ?? false,
    sequence,
  };
}

/**
 * Setup keyboard input handling using Node's readline.
 *
 * Converts readline keypress events into our KeyInput type.
 *
 * @param stdin - Input stream (must have emitKeypressEvents called)
 * @param onKey - Callback for each key input
 * @returns Cleanup function to remove the listener
 */
export function setupKeyboardInput(
  stdin: NodeJS.ReadStream,
  onKey: (event: KeyInput) => void,
): () => void {
  // Enable keypress events on stdin
  // NOTE: This is a one-way operation in Node.js, there's no way to "disable" it.
  // The keypress events will continue until the process exits.
  readline.emitKeypressEvents(stdin);

  const handler = (char: string | undefined, key: ReadlineKey | undefined) => {
    const event = mapKeypressToEvent(char, key);
    if (event) {
      onKey(event);
    }
  };

  stdin.on("keypress", handler);

  // Return cleanup function (removes our handler, but emitKeypressEvents cannot be undone)
  return () => {
    stdin.off("keypress", handler);
  };
}

/**
 * Enable terminal features needed for input handling.
 *
 * Enables raw mode and sends escape sequences for focus reporting and
 * bracketed paste. Optionally enables mouse tracking.
 *
 * @throws Error if stdin is not a TTY (raw mode not supported)
 */
export function setupTerminal(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  options: { mouse?: boolean } = {},
): void {
  if (!stdin.isTTY) {
    throw new Error("stdin is not a TTY; raw mode not supported");
  }

  stdin.setRawMode(true);

  let seq = "";

  if (options.mouse) {
    seq += "\x1b[?1000h"; // Basic mouse press/release
    seq += "\x1b[?1002h"; // Button-event tracking (motion while pressed)
    seq += "\x1b[?1003h"; // Any-event tracking (hover/motion without pressing)
    seq += "\x1b[?1006h"; // SGR extended coordinates
  }

  seq += "\x1b[?1004h"; // Focus reporting
  seq += "\x1b[?2004h"; // Bracketed paste

  // Progressive keyboard enhancement (kitty protocol). Query the current
  // mode first (the CSI ? ... u reply is consumed by UnifiedParser), then
  // push flag 1 (disambiguate escape codes) so modified keys like
  // Ctrl+Enter / Shift+Enter arrive as CSI u sequences instead of
  // collapsing into plain \r. Terminals without support ignore both.
  // teardownTerminal pops the stack, restoring the prior mode exactly.
  seq += "\x1b[?u"; // Query current progressive keyboard flags
  seq += "\x1b[>1u"; // Push current mode, set disambiguate flag

  stdout.write(seq);
}

/**
 * Restore terminal to normal state.
 *
 * Disables raw mode and sends escape sequences to turn off all features
 * enabled by setupTerminal. Safe to call multiple times.
 */
export function teardownTerminal(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
): void {
  let seq = "";
  seq += "\x1b[<u"; // Pop progressive keyboard mode (restore prior flags)
  seq += "\x1b[?2004l"; // Disable bracketed paste
  seq += "\x1b[?1004l"; // Disable focus reporting
  seq += "\x1b[?1006l"; // Disable mouse tracking
  seq += "\x1b[?1003l";
  seq += "\x1b[?1002l";
  seq += "\x1b[?1000l";

  stdout.write(seq);

  if (stdin.isTTY) {
    stdin.setRawMode(false);
  }

  // Allow process to exit naturally by unreferencing stdin.
  // The unref method may not exist on mock streams in tests.
  if (typeof stdin.unref === "function") {
    stdin.unref();
  }
}

// Parser state machine states (const object pattern for strip-types compatibility)
const ParserState = {
  Ground: 0,
  Escape: 1,
  Csi: 2,
  SgrMouse: 3,
  Ss3: 4, // SS3 sequences (ESC O) for function keys
} as const;

type ParserState = (typeof ParserState)[keyof typeof ParserState];

// CSI sequence terminators to key names
const CSI_KEYS: Record<string, string> = {
  A: "up",
  B: "down",
  C: "right",
  D: "left",
  H: "home",
  F: "end",
  Z: "tab", // Shift+Tab
};

// CSI sequences with numeric parameters: ESC [ n ~
const CSI_TILDE_KEYS: Record<number, string> = {
  1: "home",
  2: "insert",
  3: "delete",
  4: "end",
  5: "pageup",
  6: "pagedown",
  7: "home",
  8: "end",
  11: "f1",
  12: "f2",
  13: "f3",
  14: "f4",
  15: "f5",
  17: "f6",
  18: "f7",
  19: "f8",
  20: "f9",
  21: "f10",
  23: "f11",
  24: "f12",
};

// SS3 sequences (ESC O): function keys on some terminals
const SS3_KEYS: Record<string, string> = {
  P: "f1",
  Q: "f2",
  R: "f3",
  S: "f4",
  A: "up",
  B: "down",
  C: "right",
  D: "left",
  H: "home",
  F: "end",
};

// Control character names
const CTRL_NAMES: Record<number, string> = {
  0: "space", // Ctrl+Space / Ctrl+@
  8: "backspace", // Ctrl+H
  9: "tab",
  10: "enter", // Ctrl+J (line feed)
  13: "enter", // Ctrl+M (carriage return)
  27: "escape",
  127: "backspace",
};

// Kitty keyboard protocol: Unicode codepoints for named keys and keypad
// codes (functional keys 57399+) reported via CSI u sequences.
const KITTY_KEY_CODES: Record<number, string> = {
  9: "tab",
  13: "enter",
  27: "escape",
  32: "space",
  127: "backspace",
  57399: "0", // keypad 0
  57400: "1",
  57401: "2",
  57402: "3",
  57403: "4",
  57404: "5",
  57405: "6",
  57406: "7",
  57407: "8",
  57408: "9",
  57409: ".",
  57410: "/",
  57411: "*",
  57412: "-",
  57413: "+",
  57414: "enter",
  57415: "=",
  57416: ",",
};

/**
 * Parse SGR mouse protocol parameters into a MouseInput or ScrollInput.
 *
 * @param params - The "button;col;row" parameters from the SGR sequence
 * @param isPress - true for press (M terminator), false for release (m terminator)
 * @returns Parsed mouse or scroll input, or null if invalid
 */
export function parseMouseSequence(
  params: string,
  isPress: boolean,
): MouseInput | ScrollInput | null {
  // Parse "button;col;row"
  const parts = params.split(";");
  if (parts.length !== 3) return null;

  const button = Number.parseInt(parts[0], 10);
  const col = Number.parseInt(parts[1], 10);
  const row = Number.parseInt(parts[2], 10);

  if (Number.isNaN(button) || Number.isNaN(col) || Number.isNaN(row))
    return null;

  const shift = (button & 4) !== 0;
  const alt = (button & 8) !== 0;
  const ctrl = (button & 16) !== 0;
  const isMotion = (button & 32) !== 0;
  const baseButton = button & 3;
  const isScroll = (button & 64) !== 0;
  const x = col - 1;
  const y = row - 1;

  // Scroll: bits 0-1 encode direction (0=up, 1=down, 2=left, 3=right)
  if (isScroll) {
    const directions = ["up", "down", "left", "right"] as const;
    const direction = directions[baseButton];
    return {
      type: "scroll",
      direction,
      x,
      y,
      ctrl,
      alt,
      shift,
    };
  }

  const action: "press" | "release" | "move" = isMotion
    ? "move"
    : isPress
      ? "press"
      : "release";

  return {
    type: "mouse",
    action,
    button: baseButton,
    x,
    y,
    ctrl,
    alt,
    shift,
  };
}

/**
 * State machine parser for escape sequences (mouse and focus events).
 *
 * Parses SGR mouse protocol sequences and focus events from raw input.
 * Does NOT emit key events - use UnifiedParser for that.
 */
export class SequenceParser {
  private state: ParserState = ParserState.Ground;
  private buffer = "";

  /**
   * Feed input data and return any parsed inputs.
   *
   * @param data - Raw input string (may contain multiple sequences)
   * @returns Array of parsed inputs (may be empty)
   */
  feed(data: string): (MouseInput | ScrollInput | FocusEvent)[] {
    const events: (MouseInput | ScrollInput | FocusEvent)[] = [];

    for (const char of data) {
      const event = this.processChar(char);
      if (event) events.push(event);
    }

    return events;
  }

  private processChar(
    char: string,
  ): MouseInput | ScrollInput | FocusEvent | null {
    switch (this.state) {
      case ParserState.Ground:
        if (char === "\x1b") {
          this.state = ParserState.Escape;
          this.buffer = "";
        }
        return null;

      case ParserState.Escape:
        if (char === "[") {
          this.state = ParserState.Csi;
        } else if (char === "\x1b") {
          // Stay in Escape state for consecutive ESC
          this.state = ParserState.Escape;
        } else {
          this.state = ParserState.Ground;
        }
        return null;

      case ParserState.Csi:
        if (char === "<") {
          this.state = ParserState.SgrMouse;
          this.buffer = "";
        } else if (char === "I") {
          // Focus in: \x1b[I
          this.state = ParserState.Ground;
          return { type: "focus", focused: true };
        } else if (char === "O") {
          // Focus out: \x1b[O
          this.state = ParserState.Ground;
          return { type: "focus", focused: false };
        } else if (char === "\x1b") {
          // New escape sequence starting, don't lose it
          this.state = ParserState.Escape;
        } else {
          // Not a recognized sequence, reset
          this.state = ParserState.Ground;
        }
        return null;

      case ParserState.SgrMouse:
        if (char === "M" || char === "m") {
          const isPress = char === "M";
          const event = parseMouseSequence(this.buffer, isPress);
          this.state = ParserState.Ground;
          this.buffer = "";
          return event;
        }
        if ((char >= "0" && char <= "9") || char === ";") {
          this.buffer += char;
        } else if (char === "\x1b") {
          // New escape sequence starting, don't lose it
          this.state = ParserState.Escape;
          this.buffer = "";
        } else {
          // Invalid sequence, reset
          this.state = ParserState.Ground;
          this.buffer = "";
        }
        return null;

      case ParserState.Ss3:
        // SequenceParser doesn't handle SS3, just reset
        this.state = ParserState.Ground;
        return null;
    }
  }
}

/**
 * Unified input parser that handles all input from raw data.
 *
 * Parses keyboard, mouse, scroll, and focus events without using
 * readline.emitKeypressEvents. This avoids the escape code leak bug
 * where readline emits spurious key events for mouse sequences.
 */
export class UnifiedParser {
  private state: ParserState = ParserState.Ground;
  private buffer = "";
  private sequenceStart = "";

  /**
   * Flags from the last CSI ? u progressive-keyboard query reply,
   * or null when the terminal never answered (legacy mode).
   */
  keyboardFlags: number | null = null;

  /**
   * Check if the parser is waiting for more input to resolve an escape sequence.
   * When true, a standalone Esc keypress may be pending.
   */
  get pending(): boolean {
    return this.state !== ParserState.Ground;
  }

  /**
   * Flush any pending state as a standalone Esc keypress.
   * Call this after a timeout to resolve ambiguous Esc vs escape-sequence.
   */
  flushPending(): KeyInput | null {
    if (this.state === ParserState.Escape) {
      this.state = ParserState.Ground;
      return this.makeKeyInput("escape", "", "\x1b", false, false, false);
    }
    // For other mid-sequence states, discard (incomplete/invalid sequence)
    if (this.state !== ParserState.Ground) {
      this.state = ParserState.Ground;
      this.buffer = "";
      this.sequenceStart = "";
    }
    return null;
  }

  /**
   * Feed input data and return parsed inputs.
   *
   * @param data - Raw input string (may contain multiple sequences)
   * @returns Array of parsed inputs
   */
  feed(data: string): (KeyInput | MouseInput | ScrollInput | FocusEvent)[] {
    const events: (KeyInput | MouseInput | ScrollInput | FocusEvent)[] = [];

    for (const char of data) {
      const result = this.processChar(char);
      if (result) {
        if (Array.isArray(result)) {
          events.push(...result);
        } else {
          events.push(result);
        }
      }
    }

    return events;
  }

  private processChar(
    char: string,
  ):
    | KeyInput
    | MouseInput
    | ScrollInput
    | FocusEvent
    | (KeyInput | MouseInput | ScrollInput | FocusEvent)[]
    | null {
    const code = char.charCodeAt(0);

    switch (this.state) {
      case ParserState.Ground:
        if (char === "\x1b") {
          this.state = ParserState.Escape;
          this.sequenceStart = char;
          this.buffer = "";
          return null;
        }
        // Control characters
        if (code < 32 || code === 127) {
          return this.makeControlKeyEvent(code, char);
        }
        // Printable characters. A literal space is named "space" to match
        // the readline convention the rest of the library keys off
        // (Button, Switch, Select, Menubar all check name === "space").
        if (char === " ") {
          return this.makeKeyInput("space", " ", char, false, false, false);
        }
        return this.makeKeyInput(char, char, char, false, false, false);

      case ParserState.Escape:
        this.sequenceStart += char;
        if (char === "[") {
          this.state = ParserState.Csi;
          this.buffer = "";
          return null;
        }
        if (char === "O") {
          this.state = ParserState.Ss3;
          return null;
        }
        if (char === "\x1b") {
          // Double ESC - emit first ESC and stay in Escape state
          this.sequenceStart = char;
          return this.makeKeyInput("escape", "", "\x1b", false, false, false);
        }
        // ESC + char = Alt+char
        this.state = ParserState.Ground;
        {
          const altCode = char.charCodeAt(0);
          if (altCode < 32 || altCode === 127) {
            // Alt + control character
            const ctrlEvent = this.makeControlKeyEvent(altCode, char);
            if (ctrlEvent) {
              return { ...ctrlEvent, alt: true, sequence: this.sequenceStart };
            }
          }
          const name = char.toLowerCase();
          const printable = isPrintable(char) ? char : "";
          return this.makeKeyInput(
            name,
            printable,
            this.sequenceStart,
            false,
            true,
            char !== name,
          );
        }

      case ParserState.Csi:
        this.sequenceStart += char;
        if (char === "<") {
          this.state = ParserState.SgrMouse;
          this.buffer = "";
          return null;
        }
        if (char === "I") {
          this.state = ParserState.Ground;
          return { type: "focus", focused: true };
        }
        if (char === "O") {
          this.state = ParserState.Ground;
          return { type: "focus", focused: false };
        }
        // Collect parameters. '?' '<' '>' appear in progressive-keyboard
        // mode queries/acks; ':' separates kitty sub-parameters
        // (alternate keys, event types).
        if (
          (char >= "0" && char <= "9") ||
          char === ";" ||
          char === "?" ||
          char === ">" ||
          char === "<" ||
          char === ":"
        ) {
          this.buffer += char;
          return null;
        }
        // Terminal character
        if (char === "~") {
          return this.handleCsiTilde();
        }
        if (char === "u") {
          return this.handleCsiU();
        }
        if (CSI_KEYS[char]) {
          return this.handleCsiKey(char);
        }
        if (char === "\x1b") {
          // New escape sequence - emit what we have as unknown and restart
          this.state = ParserState.Escape;
          this.sequenceStart = char;
          this.buffer = "";
          return null;
        }
        // Unknown CSI sequence, ignore
        this.state = ParserState.Ground;
        return null;

      case ParserState.SgrMouse:
        this.sequenceStart += char;
        if (char === "M" || char === "m") {
          const isPress = char === "M";
          const event = parseMouseSequence(this.buffer, isPress);
          this.state = ParserState.Ground;
          this.buffer = "";
          if (event) {
            event.sequence = this.sequenceStart;
          }
          return event;
        }
        if ((char >= "0" && char <= "9") || char === ";") {
          this.buffer += char;
          return null;
        }
        if (char === "\x1b") {
          this.state = ParserState.Escape;
          this.sequenceStart = char;
          this.buffer = "";
          return null;
        }
        // Invalid sequence
        this.state = ParserState.Ground;
        this.buffer = "";
        return null;

      case ParserState.Ss3:
        this.sequenceStart += char;
        this.state = ParserState.Ground;
        if (SS3_KEYS[char]) {
          return this.makeKeyInput(
            SS3_KEYS[char],
            "",
            this.sequenceStart,
            false,
            false,
            false,
          );
        }
        // Unknown SS3 sequence, ignore
        return null;
    }
  }

  private handleCsiKey(char: string): KeyInput {
    const name = CSI_KEYS[char];
    const { ctrl, alt, shift } = this.parseModifiers();
    this.state = ParserState.Ground;
    // Shift+Tab special case
    const isShiftTab = char === "Z";
    return this.makeKeyInput(
      name,
      "",
      this.sequenceStart,
      ctrl,
      alt,
      isShiftTab || shift,
    );
  }

  /**
   * Handle CSI u terminators: kitty progressive-keyboard key reports and
   * mode query/ack replies.
   *
   * `CSI ? flags u` is the reply to our `CSI ? u` probe — consumed silently
   * (flags recorded on `keyboardFlags`), never emitted as a key event.
   * `CSI code ; modifiers [:event] u` is a key report: code is the Unicode
   * codepoint (or a 57399+ functional code), modifiers use the shared
   * 1 + shift + 2*alt + 4*ctrl encoding.
   */
  private handleCsiU(): KeyInput | null {
    this.state = ParserState.Ground;
    const params = this.buffer.split(";");
    const first = params[0] ?? "";

    // Query reply (or push/pop ack) — consume, do not emit
    if (first.startsWith("?")) {
      const flags = Number.parseInt(first.slice(1), 10);
      this.keyboardFlags = Number.isNaN(flags) ? null : flags;
      return null;
    }
    if (first.startsWith(">") || first.startsWith("<")) {
      return null;
    }

    const code = Number.parseInt(first.split(":")[0], 10);
    if (Number.isNaN(code)) return null;

    // Modifiers come from the second parameter; a `:event` sub-parameter
    // (1 press / 2 repeat / 3 release) may trail it when event reporting
    // is on — strip it before the shared modifier math.
    const modPart =
      params.length >= 2 ? Number.parseInt(params[1].split(":")[0], 10) : 1;
    const mod = (Number.isNaN(modPart) ? 1 : modPart) - 1;
    const shift = (mod & 1) !== 0;
    const alt = (mod & 2) !== 0;
    const ctrl = (mod & 4) !== 0;

    const named = KITTY_KEY_CODES[code];
    if (named !== undefined) {
      const char = named === "space" ? " " : "";
      return this.makeKeyInput(
        named,
        char,
        this.sequenceStart,
        ctrl,
        alt,
        shift,
      );
    }

    // Printable codepoint: match the legacy shape (lowercase name, the
    // codepoint itself as char — e.g. Shift+A reports 65;2 → name "a",
    // char "A", shift true).
    if (code >= 32 && code !== 127 && !(code >= 0xd800 && code <= 0xdfff)) {
      const char = String.fromCodePoint(code);
      return this.makeKeyInput(
        char.toLowerCase(),
        char,
        this.sequenceStart,
        ctrl,
        alt,
        shift,
      );
    }

    // Unknown functional code — drop rather than emit a bogus key
    return null;
  }

  private handleCsiTilde(): KeyInput | null {
    this.state = ParserState.Ground;
    const parts = this.buffer.split(";");
    const keyNum = Number.parseInt(parts[0], 10);
    const name = CSI_TILDE_KEYS[keyNum];
    if (!name) return null;
    const { ctrl, alt, shift } = this.parseModifiers();
    return this.makeKeyInput(name, "", this.sequenceStart, ctrl, alt, shift);
  }

  private parseModifiers(): { ctrl: boolean; alt: boolean; shift: boolean } {
    // Modifiers in CSI sequences: ESC [ params ; modifier char
    // modifier = 1 + (shift ? 1 : 0) + (alt ? 2 : 0) + (ctrl ? 4 : 0)
    const parts = this.buffer.split(";");
    if (parts.length < 2) {
      return { ctrl: false, alt: false, shift: false };
    }
    const mod = Number.parseInt(parts[parts.length - 1], 10) - 1;
    return {
      shift: (mod & 1) !== 0,
      alt: (mod & 2) !== 0,
      ctrl: (mod & 4) !== 0,
    };
  }

  private makeControlKeyEvent(code: number, char: string): KeyInput | null {
    // Named control characters
    if (CTRL_NAMES[code] !== undefined) {
      const name = CTRL_NAMES[code];
      return this.makeKeyInput(name, "", char, false, false, false);
    }
    // Ctrl+A through Ctrl+Z (codes 1-26)
    if (code >= 1 && code <= 26) {
      const name = String.fromCharCode(code + 96); // 1 -> 'a', 2 -> 'b', etc.
      return this.makeKeyInput(name, "", char, true, false, false);
    }
    // Other control characters - emit as-is
    return this.makeKeyInput(char, "", char, false, false, false);
  }

  private makeKeyInput(
    name: string,
    char: string,
    sequence: string,
    ctrl: boolean,
    alt: boolean,
    shift: boolean,
  ): KeyInput {
    return {
      type: "key",
      name,
      char,
      ctrl,
      alt,
      shift,
      sequence,
    };
  }
}

/** Result from PasteParser.feed() */
interface PasteResult {
  /** The complete pasted text, or null if paste is incomplete */
  text: string | null;
  /** Data remaining after the paste (or all data if no paste) */
  remaining: string;
  /** Data that appeared before the paste start marker */
  beforePaste: string;
}

/**
 * Parser for bracketed paste sequences.
 *
 * When bracketed paste is enabled, pasted text is wrapped:
 * - Start marker: \x1b[200~
 * - End marker: \x1b[201~
 *
 * Handles split markers across chunks and preserves data before paste.
 *
 * NOTE: This parser trusts the terminal to comply with the bracketed paste
 * protocol. If pasted content contains a literal end marker (\x1b[201~), the
 * paste will terminate early. Terminals are responsible for ensuring the end
 * marker is not present in paste content (typically by filtering or escaping).
 */
export class PasteParser {
  private inPaste = false;
  private pasteBuffer = "";
  private prefixBuffer = ""; // Buffer for incomplete start marker
  private suffixBuffer = ""; // Buffer for incomplete end marker

  /**
   * Check if the parser is holding a buffered prefix (potential start marker).
   */
  get pending(): boolean {
    return this.prefixBuffer.length > 0;
  }

  /**
   * Flush the buffered prefix as regular input data.
   * Call this after a timeout when no more bytes arrive to complete the marker.
   */
  flushPending(): string {
    const data = this.prefixBuffer;
    this.prefixBuffer = "";
    return data;
  }

  /**
   * Feed input data and extract any paste content.
   *
   * @param data - Raw input string
   * @returns Paste result with text (if complete), remaining data, and data before paste
   */
  feed(data: string): PasteResult {
    let remaining = data;
    let beforePaste = "";

    if (!this.inPaste) {
      // Handle potential split start marker from previous chunk
      if (this.prefixBuffer.length > 0) {
        remaining = this.prefixBuffer + remaining;
        this.prefixBuffer = "";
      }

      // Look for start marker
      const startMarker = "\x1b[200~";
      const startIdx = remaining.indexOf(startMarker);

      if (startIdx === -1) {
        // Check if data ends with a prefix of the start marker
        for (let i = 1; i < startMarker.length; i++) {
          const suffix = remaining.slice(-i);
          if (startMarker.startsWith(suffix)) {
            this.prefixBuffer = suffix;
            return {
              text: null,
              remaining: remaining.slice(0, -i),
              beforePaste: "",
            };
          }
        }
        return { text: null, remaining, beforePaste: "" };
      }

      // Found start marker - preserve data BEFORE the paste
      beforePaste = remaining.slice(0, startIdx);
      this.inPaste = true;
      this.pasteBuffer = "";
      remaining = remaining.slice(startIdx + startMarker.length);
    }

    // Handle potential split end marker from previous chunk
    if (this.suffixBuffer.length > 0) {
      remaining = this.suffixBuffer + remaining;
      this.suffixBuffer = "";
    }

    // Look for end marker
    const endMarker = "\x1b[201~";
    const endIdx = remaining.indexOf(endMarker);
    if (endIdx === -1) {
      // Check if data ends with a prefix of the end marker
      for (let i = 1; i < endMarker.length; i++) {
        const suffix = remaining.slice(-i);
        if (endMarker.startsWith(suffix)) {
          this.suffixBuffer = suffix;
          this.pasteBuffer += remaining.slice(0, -i);
          return { text: null, remaining: "", beforePaste };
        }
      }
      this.pasteBuffer += remaining;
      return { text: null, remaining: "", beforePaste };
    }

    this.pasteBuffer += remaining.slice(0, endIdx);
    const text = this.pasteBuffer;

    this.inPaste = false;
    this.pasteBuffer = "";

    return {
      text,
      remaining: remaining.slice(endIdx + endMarker.length),
      beforePaste,
    };
  }
}

/**
 * Setup resize event handling.
 *
 * @param stdout - Output stream to monitor for resize events
 * @param onResize - Callback for resize events
 * @returns Cleanup function to remove the listener
 */
export function setupResizeHandler(
  stdout: NodeJS.WriteStream,
  onResize: (event: ResizeEvent) => void,
): () => void {
  const handler = () => {
    onResize({
      type: "resize",
      width: stdout.columns,
      height: stdout.rows,
    });
  };

  stdout.on("resize", handler);

  return () => {
    stdout.off("resize", handler);
  };
}

/** Handler type for input events */
type InputHandler = (event: InputEvent) => void;

/**
 * Create a unified input parser that handles all input types.
 *
 * Combines keyboard, mouse, paste, focus, and resize event parsing
 * into a single interface. Manages terminal setup/teardown.
 *
 * When mouse is enabled, uses UnifiedParser to parse all input from raw data,
 * avoiding the escape code leak bug where readline.emitKeypressEvents emits
 * spurious key events for mouse sequences.
 *
 * @param stdin - Input stream
 * @param stdout - Output stream (for resize events)
 * @param onEvent - Callback for all input events
 * @param options - Optional configuration (mouse tracking)
 * @returns Object with destroy() method to cleanup
 */
export function createInputParser(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  onEvent: InputHandler,
  options: { mouse?: boolean } = {},
): { destroy: () => void } {
  const cleanups: (() => void)[] = [];

  setupTerminal(stdin, stdout, options);
  cleanups.push(() => teardownTerminal(stdin, stdout));

  const pasteParser = new PasteParser();
  const unifiedParser = new UnifiedParser();
  let escapeTimer: ReturnType<typeof setTimeout> | null = null;

  const dataHandler = (data: Buffer) => {
    // New input arrived — cancel any pending escape timeout since
    // the parser will resolve the ambiguity with the new bytes.
    if (escapeTimer) {
      clearTimeout(escapeTimer);
      escapeTimer = null;
    }

    let str = data.toString("utf8");

    // Check for paste first (consumes entire paste content)
    const pasteResult = pasteParser.feed(str);

    if (pasteResult.beforePaste) {
      const events = unifiedParser.feed(pasteResult.beforePaste);
      for (const event of events) {
        onEvent(event);
      }
    }

    if (pasteResult.text !== null) {
      onEvent({ type: "paste", text: pasteResult.text });
    }

    str = pasteResult.remaining;
    if (str) {
      const events = unifiedParser.feed(str);
      for (const event of events) {
        onEvent(event);
      }
    }

    // If either parser is holding buffered bytes after processing, set a
    // timeout to flush them. Real escape sequences and paste markers arrive
    // as a single chunk from the terminal; a lone \x1b that isn't followed
    // by more bytes within the timeout means the user pressed Esc.
    if (pasteParser.pending || unifiedParser.pending) {
      escapeTimer = setTimeout(() => {
        escapeTimer = null;
        // Flush paste parser prefix first — it may contain an \x1b that
        // the unified parser needs to see.
        const prefix = pasteParser.flushPending();
        if (prefix) {
          const events = unifiedParser.feed(prefix);
          for (const event of events) {
            onEvent(event);
          }
        }
        // Then flush any pending escape sequence state.
        const event = unifiedParser.flushPending();
        if (event) {
          onEvent(event);
        }
      }, 100);
    }
  };

  stdin.on("data", dataHandler);
  cleanups.push(() => {
    stdin.off("data", dataHandler);
    if (escapeTimer) {
      clearTimeout(escapeTimer);
      escapeTimer = null;
    }
  });

  const resizeCleanup = setupResizeHandler(stdout, (event) => {
    onEvent(event);
  });
  cleanups.push(resizeCleanup);

  // Create cleanup function with guard against double execution
  let destroyed = false;
  const cleanup = () => {
    if (destroyed) return;
    destroyed = true;
    for (const fn of cleanups) {
      fn();
    }
  };

  return {
    destroy: cleanup,
  };
}
