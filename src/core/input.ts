// Input handling and parsing

import * as readline from "node:readline";

// Mouse button constants
export const MOUSE_LEFT = 0;
export const MOUSE_MIDDLE = 1;
export const MOUSE_RIGHT = 2;

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
  direction: "up" | "down";
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
