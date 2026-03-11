// Input handling and parsing

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
