/**
 * Yields individual grapheme clusters from a string.
 * Uses Intl.Segmenter for correct Unicode segmentation.
 */
export declare function graphemes(text: string): Generator<string>;
/**
 * Counts grapheme clusters in a string.
 * Use instead of string.length for correct Unicode handling.
 */
export declare function graphemeCount(str: string): number;
/**
 * Slices a string by grapheme cluster positions.
 * Similar to string.slice() but operates on grapheme clusters.
 */
export declare function graphemeSlice(str: string, start: number, end?: number): string;
/**
 * Returns display width (0, 1, or 2) of the first codepoint in a string.
 * For multi-codepoint grapheme clusters, use graphemeDisplayWidth() instead.
 */
export declare function displayWidth(char: string): number;
/**
 * Returns display width of a complete grapheme cluster.
 * Handles emoji sequences, flags, combining marks, etc.
 */
export declare function graphemeDisplayWidth(grapheme: string): number;
/**
 * Index into the standard 8-color terminal palette.
 * Valid values: 0 (black), 1 (red), 2 (green), 3 (yellow),
 * 4 (blue), 5 (magenta), 6 (cyan), 7 (white).
 */
export type StandardColorIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/**
 * Terminal color representation.
 * Discriminated union covering all terminal color modes.
 *
 * - default: Terminal's default foreground/background color
 * - named: Standard 8-color palette (0-7: black, red, green, yellow, blue, magenta, cyan, white)
 * - bright: Bright/bold variants of the 8-color palette (0-7)
 * - palette: Extended 256-color palette (0-255)
 * - rgb: True color (24-bit RGB, each component 0-255)
 *
 * Named and bright indices are constrained at the type level (StandardColorIndex).
 * Palette and RGB values are clamped to valid ranges during packing (packColor).
 */
export type Color = {
    type: "default";
} | {
    type: "named";
    index: StandardColorIndex;
} | {
    type: "bright";
    index: StandardColorIndex;
} | {
    type: "palette";
    index: number;
} | {
    type: "rgb";
    r: number;
    g: number;
    b: number;
};
/**
 * Color value that can be inherited from a parent node.
 * Used in component props where inheritance is supported.
 *
 * - "inherit": Explicitly inherit from parent (same as undefined)
 * - undefined: Inherit from parent (default behavior)
 * - Color: Use this specific color value
 */
export type InheritableColor = Color | "inherit";
/**
 * Default color (terminal's default).
 */
export declare const DEFAULT_COLOR: Color;
export declare const BOLD = 1;
export declare const DIM = 2;
export declare const ITALIC = 4;
export declare const UNDERLINE = 8;
export declare const BLINK = 16;
export declare const INVERSE = 32;
export declare const HIDDEN = 64;
export declare const STRIKETHROUGH = 128;
/**
 * Double-buffered cell grid with zero-allocation design.
 * Tracks dirty regions and style state for efficient ANSI output.
 *
 * Write operations modify the back buffer. flush() diffs against front,
 * emits ANSI, and syncs the buffers.
 */
export declare class Buffer {
    private front;
    private back;
    private _width;
    private _height;
    private _styleFg;
    private _styleBg;
    private _styleModifiers;
    private _cursorX;
    private _cursorY;
    constructor(width: number, height: number);
    get width(): number;
    get height(): number;
    private allocateCells;
    private index;
    /**
     * Set a cell at (x, y) with primitive arguments.
     * Out-of-bounds is a silent no-op.
     */
    set(x: number, y: number, symbol: string, fg: Color, bg: Color, modifiers: number): void;
    private setInternal;
    /**
     * Write a string to the buffer, handling grapheme segmentation and double-width characters.
     * Stops at buffer edge. Returns number of columns consumed.
     * Out-of-bounds start position is a silent no-op returning 0.
     */
    writeText(x: number, y: number, text: string, fg: Color, bg: Color, modifiers: number): number;
    /**
     * Clear all cells in back buffer to defaults (spaces with default colors).
     */
    clear(): void;
    /**
     * Fill a rectangle with the given style.
     * Clips to buffer bounds.
     */
    fillRect(x: number, y: number, width: number, height: number, symbol: string, fg: Color, bg: Color, modifiers: number): void;
    /**
     * Get the symbol at (x, y).
     * Returns " " for out-of-bounds.
     */
    getSymbol(x: number, y: number): string;
    /**
     * Get the foreground color at (x, y).
     * Returns DEFAULT_COLOR for out-of-bounds.
     * Note: Allocates a Color object - avoid in hot paths.
     */
    getFg(x: number, y: number): Color;
    /**
     * Get the background color at (x, y).
     * Returns DEFAULT_COLOR for out-of-bounds.
     * Note: Allocates a Color object - avoid in hot paths.
     */
    getBg(x: number, y: number): Color;
    /**
     * Get the modifiers at (x, y).
     * Returns 0 for out-of-bounds.
     */
    getModifiers(x: number, y: number): number;
    /**
     * Resize the buffer. Reinitializes all cells (no content preservation).
     * Resets cursor tracking and invalidates front buffer to force full redraw.
     */
    resize(width: number, height: number): void;
    /**
     * Diff back against front, emit ANSI for changes, sync buffers.
     * Returns the ANSI string to write to the terminal.
     */
    flush(): string;
    /**
     * Reset for full redraw. Use when terminal state is unknown.
     * Invalidates the front buffer so next flush will output everything.
     */
    forceFullRedraw(): void;
    /**
     * Mark every front-buffer cell as stale so the next flush outputs all cells.
     * Uses a sentinel symbol ("\x00") that can never match real rendered content,
     * ensuring the diff treats every cell as changed.
     */
    private invalidateFront;
    private render;
    private cellsEqual;
    private syncBuffers;
    private emitStyleDiff;
    private appendColorCodes;
}
//# sourceMappingURL=buffer.d.ts.map