export declare const MOUSE_LEFT = 0;
interface Modifiers {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
}
declare const NO_MODIFIERS: Modifiers;
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
export type InputEvent = KeyInput | MouseInput | ScrollInput | ResizeEvent | PasteEvent | FocusEvent;
export { NO_MODIFIERS, type Modifiers };
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
export declare function isPrintable(char: string | undefined): boolean;
/**
 * Map readline keypress event to our KeyInput type.
 */
export declare function mapKeypressToEvent(char: string | undefined, key: ReadlineKey | undefined): KeyInput | null;
/**
 * Setup keyboard input handling using Node's readline.
 *
 * Converts readline keypress events into our KeyInput type.
 *
 * @param stdin - Input stream (must have emitKeypressEvents called)
 * @param onKey - Callback for each key input
 * @returns Cleanup function to remove the listener
 */
export declare function setupKeyboardInput(stdin: NodeJS.ReadStream, onKey: (event: KeyInput) => void): () => void;
/**
 * Enable terminal features needed for input handling.
 *
 * Enables raw mode and sends escape sequences for focus reporting and
 * bracketed paste. Optionally enables mouse tracking.
 *
 * @throws Error if stdin is not a TTY (raw mode not supported)
 */
export declare function setupTerminal(stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream, options?: {
    mouse?: boolean;
}): void;
/**
 * Restore terminal to normal state.
 *
 * Disables raw mode and sends escape sequences to turn off all features
 * enabled by setupTerminal. Safe to call multiple times.
 */
export declare function teardownTerminal(stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream): void;
/**
 * Parse SGR mouse protocol parameters into a MouseInput or ScrollInput.
 *
 * @param params - The "button;col;row" parameters from the SGR sequence
 * @param isPress - true for press (M terminator), false for release (m terminator)
 * @returns Parsed mouse or scroll input, or null if invalid
 */
export declare function parseMouseSequence(params: string, isPress: boolean): MouseInput | ScrollInput | null;
/**
 * State machine parser for escape sequences (mouse and focus events).
 *
 * Parses SGR mouse protocol sequences and focus events from raw input.
 * Does NOT emit key events - use UnifiedParser for that.
 */
export declare class SequenceParser {
    private state;
    private buffer;
    /**
     * Feed input data and return any parsed inputs.
     *
     * @param data - Raw input string (may contain multiple sequences)
     * @returns Array of parsed inputs (may be empty)
     */
    feed(data: string): (MouseInput | ScrollInput | FocusEvent)[];
    private processChar;
}
/**
 * Unified input parser that handles all input from raw data.
 *
 * Parses keyboard, mouse, scroll, and focus events without using
 * readline.emitKeypressEvents. This avoids the escape code leak bug
 * where readline emits spurious key events for mouse sequences.
 */
export declare class UnifiedParser {
    private state;
    private buffer;
    private sequenceStart;
    /**
     * Check if the parser is waiting for more input to resolve an escape sequence.
     * When true, a standalone Esc keypress may be pending.
     */
    get pending(): boolean;
    /**
     * Flush any pending state as a standalone Esc keypress.
     * Call this after a timeout to resolve ambiguous Esc vs escape-sequence.
     */
    flushPending(): KeyInput | null;
    /**
     * Feed input data and return parsed inputs.
     *
     * @param data - Raw input string (may contain multiple sequences)
     * @returns Array of parsed inputs
     */
    feed(data: string): (KeyInput | MouseInput | ScrollInput | FocusEvent)[];
    private processChar;
    private handleCsiKey;
    private handleCsiTilde;
    private parseModifiers;
    private makeControlKeyEvent;
    private makeKeyInput;
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
export declare class PasteParser {
    private inPaste;
    private pasteBuffer;
    private prefixBuffer;
    private suffixBuffer;
    /**
     * Check if the parser is holding a buffered prefix (potential start marker).
     */
    get pending(): boolean;
    /**
     * Flush the buffered prefix as regular input data.
     * Call this after a timeout when no more bytes arrive to complete the marker.
     */
    flushPending(): string;
    /**
     * Feed input data and extract any paste content.
     *
     * @param data - Raw input string
     * @returns Paste result with text (if complete), remaining data, and data before paste
     */
    feed(data: string): PasteResult;
}
/**
 * Setup resize event handling.
 *
 * @param stdout - Output stream to monitor for resize events
 * @param onResize - Callback for resize events
 * @returns Cleanup function to remove the listener
 */
export declare function setupResizeHandler(stdout: NodeJS.WriteStream, onResize: (event: ResizeEvent) => void): () => void;
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
export declare function createInputParser(stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream, onEvent: InputHandler, options?: {
    mouse?: boolean;
}): {
    destroy: () => void;
};
//# sourceMappingURL=input.d.ts.map