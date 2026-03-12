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

/** Keyboard input event */
export interface KeyEvent {
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

/** Mouse input event */
export interface MouseEvent {
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

/** Scroll wheel event */
export interface ScrollEvent {
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

/** Union of all input event types */
export type InputEvent =
  | KeyEvent
  | MouseEvent
  | ScrollEvent
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
  const code = char.charCodeAt(0);
  // Printable ASCII and beyond, excluding control characters
  return code >= 0x20 && code !== 0x7f;
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
 * Map readline keypress event to our KeyEvent type.
 */
export function mapKeypressToEvent(
  char: string | undefined,
  key: ReadlineKey | undefined,
): KeyEvent | null {
  // Handle edge cases
  if (!key && !char) {
    return null;
  }

  // Get the key name, normalize it
  const rawName = key?.name ?? char ?? "";
  const name = normalizeKeyName(rawName);
  const sequence = key?.sequence ?? char ?? "";

  // Determine if char is printable
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
 * Converts readline keypress events into our KeyEvent type.
 *
 * @param stdin - Input stream (must have emitKeypressEvents called)
 * @param onKey - Callback for each key event
 * @returns Cleanup function to remove the listener
 */
export function setupKeyboardInput(
  stdin: NodeJS.ReadStream,
  onKey: (event: KeyEvent) => void,
): () => void {
  // Enable keypress events on stdin
  // NOTE: This is a one-way operation in Node.js — there's no way to "disable" it.
  // The keypress events will continue until the process exits.
  readline.emitKeypressEvents(stdin);

  // Handler for keypress events
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
  // Check TTY
  if (!stdin.isTTY) {
    throw new Error("stdin is not a TTY; raw mode not supported");
  }

  // Enable raw mode
  stdin.setRawMode(true);

  // Build escape sequence
  let seq = "";

  // Mouse tracking (optional)
  if (options.mouse) {
    seq += "\x1b[?1000h"; // Basic mouse press/release
    seq += "\x1b[?1002h"; // Button-event tracking (motion while pressed)
    seq += "\x1b[?1006h"; // SGR extended coordinates
  }

  // Focus reporting
  seq += "\x1b[?1004h";

  // Bracketed paste
  seq += "\x1b[?2004h";

  // Write to terminal
  if (seq) {
    stdout.write(seq);
  }
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
  // Build reverse sequence
  let seq = "";

  // Disable bracketed paste
  seq += "\x1b[?2004l";

  // Disable focus reporting
  seq += "\x1b[?1004l";

  // Disable mouse tracking (all modes)
  seq += "\x1b[?1006l";
  seq += "\x1b[?1002l";
  seq += "\x1b[?1000l";

  // Write to terminal
  stdout.write(seq);

  // Disable raw mode
  if (stdin.isTTY) {
    stdin.setRawMode(false);
  }
}

// Parser state machine states (const object pattern for strip-types compatibility)
const ParserState = {
  Ground: 0,
  Escape: 1,
  Csi: 2,
  SgrMouse: 3,
} as const;

type ParserState = (typeof ParserState)[keyof typeof ParserState];

/**
 * Parse SGR mouse protocol parameters into a MouseEvent or ScrollEvent.
 *
 * @param params - The "button;col;row" parameters from the SGR sequence
 * @param isPress - true for press (M terminator), false for release (m terminator)
 * @returns Parsed mouse or scroll event, or null if invalid
 */
export function parseMouseSequence(
  params: string,
  isPress: boolean,
): MouseEvent | ScrollEvent | null {
  // Parse "button;col;row"
  const parts = params.split(";");
  if (parts.length !== 3) return null;

  const button = Number.parseInt(parts[0], 10);
  const col = Number.parseInt(parts[1], 10);
  const row = Number.parseInt(parts[2], 10);

  if (Number.isNaN(button) || Number.isNaN(col) || Number.isNaN(row))
    return null;

  // Extract modifiers
  const shift = (button & 4) !== 0;
  const alt = (button & 8) !== 0;
  const ctrl = (button & 16) !== 0;
  const isMotion = (button & 32) !== 0;

  // Extract base button (bits 0-1, plus bit 6-7 for scroll)
  const baseButton = button & 3;
  const isScroll = (button & 64) !== 0;

  // Convert to 0-indexed coordinates
  const x = col - 1;
  const y = row - 1;

  // Handle scroll events (bits 0-1 encode direction: 0=up, 1=down, 2=left, 3=right)
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

  // Handle mouse events
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
 */
export class SequenceParser {
  private state: ParserState = ParserState.Ground;
  private buffer = "";

  /**
   * Feed input data and return any parsed events.
   *
   * @param data - Raw input string (may contain multiple sequences)
   * @returns Array of parsed events (may be empty)
   */
  feed(data: string): (MouseEvent | ScrollEvent | FocusEvent)[] {
    const events: (MouseEvent | ScrollEvent | FocusEvent)[] = [];

    for (const char of data) {
      const event = this.processChar(char);
      if (event) events.push(event);
    }

    return events;
  }

  private processChar(
    char: string,
  ): MouseEvent | ScrollEvent | FocusEvent | null {
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
    }
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
      // Incomplete paste, buffer it
      this.pasteBuffer += remaining;
      return { text: null, remaining: "", beforePaste };
    }

    // Complete paste
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

  // Setup terminal
  setupTerminal(stdin, stdout, options);
  cleanups.push(() => teardownTerminal(stdin, stdout));

  // Keyboard input (via readline)
  const keyboardCleanup = setupKeyboardInput(stdin, (event) => {
    onEvent(event);
  });
  cleanups.push(keyboardCleanup);

  // Mouse and special sequence parser
  const sequenceParser = new SequenceParser();
  const pasteParser = new PasteParser();

  const dataHandler = (data: Buffer) => {
    let str = data.toString("utf8");

    // Check for paste first (consumes entire paste content)
    const pasteResult = pasteParser.feed(str);

    // Process any data that appeared before the paste
    if (pasteResult.beforePaste) {
      const events = sequenceParser.feed(pasteResult.beforePaste);
      for (const event of events) {
        onEvent(event);
      }
    }

    // Emit paste event if complete
    if (pasteResult.text !== null) {
      onEvent({ type: "paste", text: pasteResult.text });
    }

    // Parse remaining data for mouse/focus events
    str = pasteResult.remaining;
    if (str) {
      const events = sequenceParser.feed(str);
      for (const event of events) {
        onEvent(event);
      }
    }
  };

  stdin.on("data", dataHandler);
  cleanups.push(() => stdin.off("data", dataHandler));

  // Resize events
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

  // Register process cleanup
  const unregisterCleanup = registerCleanup(cleanup);
  cleanups.push(unregisterCleanup);

  return {
    destroy: cleanup,
  };
}

/**
 * Register cleanup handlers for all process exit paths.
 *
 * A terminal left in raw mode is unusable. This ensures cleanup runs on:
 * - Normal exit
 * - SIGINT (Ctrl+C)
 * - SIGTERM
 * - SIGHUP
 * - Uncaught exceptions
 * - Unhandled promise rejections
 *
 * @returns Unregister function to remove all handlers (for tests/cleanup)
 */
export function registerCleanup(cleanup: () => void): () => void {
  // Track registration to prevent duplicates
  let registered = true;

  const onExit = () => {
    if (registered) cleanup();
  };
  const onSigInt = () => {
    cleanup();
    process.exit(130);
  };
  const onSigTerm = () => {
    cleanup();
    process.exit(143);
  };
  const onSigHup = () => {
    cleanup();
    process.exit(129);
  };
  const onException = (err: Error) => {
    cleanup();
    console.error(err);
    process.exit(1);
  };
  const onRejection = (reason: unknown) => {
    cleanup();
    console.error("Unhandled rejection:", reason);
    process.exit(1);
  };

  // Register handlers
  process.on("exit", onExit);
  process.on("SIGINT", onSigInt);
  process.on("SIGTERM", onSigTerm);
  process.on("SIGHUP", onSigHup);
  process.on("uncaughtException", onException);
  process.on("unhandledRejection", onRejection);

  // Return unregister function
  return () => {
    if (!registered) return;
    registered = false;
    process.off("exit", onExit);
    process.off("SIGINT", onSigInt);
    process.off("SIGTERM", onSigTerm);
    process.off("SIGHUP", onSigHup);
    process.off("uncaughtException", onException);
    process.off("unhandledRejection", onRejection);
  };
}
