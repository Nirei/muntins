// Cell buffer with zero-allocation design
// Double-buffered with packed color encoding for efficient diff and render

// Module-level segmenter instance (reused across calls)
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * Yields individual grapheme clusters from a string.
 * Uses Intl.Segmenter for correct Unicode segmentation.
 */
export function* graphemes(text: string): Generator<string> {
  for (const { segment } of segmenter.segment(text)) {
    yield segment;
  }
}

// Zero-width character ranges (sorted by start)
const ZERO_WIDTH_RANGES: readonly [number, number][] = [
  [0x0300, 0x036f], // Combining diacriticals
  [0x0483, 0x0489], // Combining Cyrillic
  [0x0591, 0x05bd], // Hebrew marks
  [0x05bf, 0x05bf], // Hebrew point rafe
  [0x05c1, 0x05c2], // Hebrew points
  [0x05c4, 0x05c5], // Hebrew marks
  [0x05c7, 0x05c7], // Hebrew point qamats qatan
  [0x0610, 0x061a], // Arabic signs
  [0x064b, 0x065f], // Arabic fathatan-wavy hamza
  [0x0670, 0x0670], // Arabic superscript alef
  [0x06d6, 0x06dc], // Arabic small high
  [0x06df, 0x06e4], // Arabic small high
  [0x06e7, 0x06e8], // Arabic small high
  [0x06ea, 0x06ed], // Arabic small low
  [0x0711, 0x0711], // Syriac superscript alaph
  [0x0730, 0x074a], // Syriac marks
  [0x07a6, 0x07b0], // Thaana marks
  [0x07eb, 0x07f3], // NKo combining marks
  [0x0816, 0x0819], // Samaritan marks
  [0x081b, 0x0823], // Samaritan marks
  [0x0825, 0x0827], // Samaritan marks
  [0x0829, 0x082d], // Samaritan marks
  [0x0859, 0x085b], // Mandaic marks
  [0x08d3, 0x08e1], // Arabic marks
  [0x08e3, 0x0903], // Arabic-Devanagari marks
  [0x093a, 0x093c], // Devanagari marks
  [0x093e, 0x094f], // Devanagari marks
  [0x0951, 0x0957], // Devanagari stress
  [0x0962, 0x0963], // Devanagari vowels
  [0x0981, 0x0983], // Bengali marks
  [0x09bc, 0x09bc], // Bengali virama
  [0x09be, 0x09c4], // Bengali vowels
  [0x09c7, 0x09c8], // Bengali vowels
  [0x09cb, 0x09cd], // Bengali vowels/virama
  [0x09d7, 0x09d7], // Bengali au length
  [0x09e2, 0x09e3], // Bengali vowels
  [0x09fe, 0x09fe], // Bengali sandhi mark
  [0x0a01, 0x0a03], // Gurmukhi marks
  [0x0a3c, 0x0a3c], // Gurmukhi nukta
  [0x0a3e, 0x0a42], // Gurmukhi vowels
  [0x0a47, 0x0a48], // Gurmukhi vowels
  [0x0a4b, 0x0a4d], // Gurmukhi vowels/virama
  [0x0a51, 0x0a51], // Gurmukhi udaat
  [0x0a70, 0x0a71], // Gurmukhi tippi/addak
  [0x0a75, 0x0a75], // Gurmukhi yakash
  [0x200b, 0x200f], // Zero-width space, joiners, marks
  [0x2028, 0x202e], // Line/paragraph separators, bidi
  [0x2060, 0x206f], // Word joiners, invisible operators
  [0xfe00, 0xfe0f], // Variation selectors
  [0xfeff, 0xfeff], // BOM / ZWNBSP
  [0xfff9, 0xfffb], // Interlinear annotation
  [0x1d167, 0x1d169], // Musical combining marks
  [0x1d173, 0x1d182], // Musical symbols
  [0x1d185, 0x1d18b], // Musical combining marks
  [0x1d1aa, 0x1d1ad], // Musical combining marks
  [0xe0001, 0xe0001], // Language tag
  [0xe0020, 0xe007f], // Tag components
  [0xe0100, 0xe01ef], // Variation selectors supplement
];

// Wide character ranges (sorted by start)
const WIDE_RANGES: readonly [number, number][] = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x231a, 0x231b], // Watch, hourglass
  [0x2329, 0x232a], // Angle brackets
  [0x23e9, 0x23f3], // Media control symbols
  [0x23f8, 0x23fa], // Media control symbols
  [0x25fd, 0x25fe], // Medium squares
  [0x2614, 0x2615], // Umbrella, hot beverage
  [0x2648, 0x2653], // Zodiac signs
  [0x267f, 0x267f], // Wheelchair
  [0x2693, 0x2693], // Anchor
  [0x26a1, 0x26a1], // High voltage
  [0x26aa, 0x26ab], // Circles
  [0x26bd, 0x26be], // Soccer, baseball
  [0x26c4, 0x26c5], // Snowman, sun
  [0x26ce, 0x26ce], // Ophiuchus
  [0x26d4, 0x26d4], // No entry
  [0x26ea, 0x26ea], // Church
  [0x26f2, 0x26f3], // Fountain, golf
  [0x26f5, 0x26f5], // Sailboat
  [0x26fa, 0x26fa], // Tent
  [0x26fd, 0x26fd], // Fuel pump
  [0x2702, 0x2702], // Scissors
  [0x2705, 0x2705], // Check mark
  [0x2708, 0x270d], // Airplane-writing hand
  [0x270f, 0x270f], // Pencil
  [0x2712, 0x2712], // Black nib
  [0x2714, 0x2714], // Check mark
  [0x2716, 0x2716], // X mark
  [0x271d, 0x271d], // Latin cross
  [0x2721, 0x2721], // Star of David
  [0x2728, 0x2728], // Sparkles
  [0x2733, 0x2734], // Eight spoked asterisk
  [0x2744, 0x2744], // Snowflake
  [0x2747, 0x2747], // Sparkle
  [0x274c, 0x274c], // Cross mark
  [0x274e, 0x274e], // Cross mark
  [0x2753, 0x2755], // Question marks
  [0x2757, 0x2757], // Exclamation mark
  [0x2763, 0x2764], // Heart exclamation, heart
  [0x2795, 0x2797], // Plus, minus, divide
  [0x27a1, 0x27a1], // Right arrow
  [0x27b0, 0x27b0], // Curly loop
  [0x27bf, 0x27bf], // Double curly loop
  [0x2934, 0x2935], // Arrows
  [0x2b05, 0x2b07], // Arrows
  [0x2b1b, 0x2b1c], // Squares
  [0x2b50, 0x2b50], // Star
  [0x2b55, 0x2b55], // Circle
  [0x2e80, 0x2e99], // CJK Radicals Supplement
  [0x2e9b, 0x2ef3], // CJK Radicals Supplement
  [0x2f00, 0x2fd5], // Kangxi Radicals
  [0x2ff0, 0x2ffb], // Ideographic Description
  [0x3000, 0x303e], // CJK Symbols and Punctuation
  [0x3041, 0x3096], // Hiragana
  [0x3099, 0x30ff], // Hiragana/Katakana
  [0x3105, 0x312f], // Bopomofo
  [0x3131, 0x318e], // Hangul Compatibility Jamo
  [0x3190, 0x31e3], // Kanbun, Bopomofo Extended, CJK Strokes
  [0x31f0, 0x321e], // Katakana Phonetic, Enclosed CJK
  [0x3220, 0x3247], // Enclosed CJK
  [0x3250, 0x4dbf], // Enclosed CJK through CJK Unified
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xa000, 0xa48c], // Yi Syllables
  [0xa490, 0xa4c6], // Yi Radicals
  [0xa960, 0xa97c], // Hangul Jamo Extended-A
  [0xac00, 0xd7a3], // Hangul Syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xfe10, 0xfe19], // Vertical Forms
  [0xfe30, 0xfe6f], // CJK Compatibility Forms, Small Forms
  [0xff00, 0xff60], // Fullwidth ASCII
  [0xffe0, 0xffe6], // Fullwidth symbols
  [0x16fe0, 0x16fe4], // Tangut/Nushu/Khitan components
  [0x16ff0, 0x16ff1], // Vietnamese reading marks
  [0x17000, 0x187f7], // Tangut
  [0x18800, 0x18cd5], // Tangut Components
  [0x18d00, 0x18d08], // Tangut Supplement
  [0x1aff0, 0x1aff3], // Kana Extended-B
  [0x1aff5, 0x1affb], // Kana Extended-B
  [0x1affd, 0x1affe], // Kana Extended-B
  [0x1b000, 0x1b122], // Kana Supplement, Kana Extended-A
  [0x1b132, 0x1b132], // Hiragana small ko
  [0x1b150, 0x1b152], // Hiragana small wi/we/wo
  [0x1b155, 0x1b155], // Katakana small ko
  [0x1b164, 0x1b167], // Katakana small
  [0x1b170, 0x1b2fb], // Nushu
  [0x1f004, 0x1f004], // Mahjong red dragon
  [0x1f0cf, 0x1f0cf], // Playing card black joker
  [0x1f18e, 0x1f18e], // AB button
  [0x1f191, 0x1f19a], // Squared symbols
  [0x1f200, 0x1f202], // Enclosed ideographic
  [0x1f210, 0x1f23b], // Enclosed ideographic
  [0x1f240, 0x1f248], // Enclosed ideographic
  [0x1f250, 0x1f251], // Enclosed ideographic
  [0x1f260, 0x1f265], // Rounded symbols
  [0x1f300, 0x1f64f], // Miscellaneous Symbols and Pictographs, Emoticons
  [0x1f680, 0x1f6ff], // Transport and Map Symbols
  [0x1f774, 0x1f77f], // Geometric shapes extended
  [0x1f7d5, 0x1f7ff], // Geometric shapes extended
  [0x1f80c, 0x1f80f], // Supplemental arrows
  [0x1f848, 0x1f84f], // Supplemental arrows
  [0x1f85a, 0x1f85f], // Supplemental arrows
  [0x1f888, 0x1f88f], // Supplemental arrows
  [0x1f8ae, 0x1f8ff], // Supplemental arrows
  [0x1f900, 0x1f9ff], // Supplemental Symbols and Pictographs
  [0x1fa00, 0x1fa6f], // Chess Symbols
  [0x1fa70, 0x1faff], // Symbols and Pictographs Extended-A
  [0x1fb00, 0x1fbff], // Symbols for Legacy Computing
  [0x20000, 0x2fffd], // CJK Extension B-F
  [0x30000, 0x3fffd], // CJK Extension G+
];

/**
 * Binary search for a codepoint within sorted interval ranges.
 * Returns true if the codepoint falls within any [start, end] range.
 */
function inRanges(ranges: readonly [number, number][], code: number): boolean {
  let lo = 0;
  let hi = ranges.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const [start, end] = ranges[mid];

    if (code < start) {
      hi = mid - 1;
    } else if (code > end) {
      lo = mid + 1;
    } else {
      return true; // code is within [start, end]
    }
  }

  return false;
}

/**
 * Returns display width (0, 1, or 2) of the first codepoint in a string.
 * For multi-codepoint grapheme clusters, use graphemeDisplayWidth() instead.
 */
export function displayWidth(char: string): number {
  if (char === "") return 0;

  const code = char.codePointAt(0);
  if (code === undefined) return 0;

  // Control characters (most common early-exit)
  if (code < 32 || code === 0x7f) return 0;

  // ASCII fast path (most common case)
  if (code < 0x0300) return 1;

  // Binary search for zero-width
  if (inRanges(ZERO_WIDTH_RANGES, code)) return 0;

  // Binary search for wide
  if (inRanges(WIDE_RANGES, code)) return 2;

  return 1;
}

// Regional Indicator range (U+1F1E0 to U+1F1FF)
const REGIONAL_INDICATOR_START = 0x1f1e0;
const REGIONAL_INDICATOR_END = 0x1f1ff;

function isRegionalIndicator(code: number): boolean {
  return code >= REGIONAL_INDICATOR_START && code <= REGIONAL_INDICATOR_END;
}

/**
 * Returns display width of a complete grapheme cluster.
 * Handles emoji sequences, flags, combining marks, etc.
 */
export function graphemeDisplayWidth(grapheme: string): number {
  if (grapheme.length === 0) return 0;

  const codepoints = [...grapheme];

  // Single codepoint - just return base width
  if (codepoints.length === 1) {
    return displayWidth(grapheme);
  }

  // Multi-codepoint grapheme:

  // Special case: flag sequences (pairs of regional indicators)
  // Each regional indicator is technically narrow, but the pair renders as width 2
  if (codepoints.length === 2) {
    const code1 = codepoints[0].codePointAt(0);
    const code2 = codepoints[1].codePointAt(0);
    if (
      code1 !== undefined &&
      code2 !== undefined &&
      isRegionalIndicator(code1) &&
      isRegionalIndicator(code2)
    ) {
      return 2;
    }
  }

  // For other multi-codepoint graphemes:
  // - Use width of first codepoint (base character)
  // - Combining marks, skin tones, VS selectors don't add width
  return displayWidth(codepoints[0]);
}

/**
 * Terminal color representation.
 * Discriminated union covering all terminal color modes.
 *
 * - default: Terminal's default foreground/background color
 * - named: Standard 8-color palette (0-7: black, red, green, yellow, blue, magenta, cyan, white)
 * - bright: Bright/bold variants of the 8-color palette (0-7)
 * - palette: Extended 256-color palette (0-255)
 * - rgb: True color (24-bit RGB)
 */
export type Color =
  | { type: "default" }
  | { type: "named"; index: number }
  | { type: "bright"; index: number }
  | { type: "palette"; index: number }
  | { type: "rgb"; r: number; g: number; b: number };

/**
 * Default color (terminal's default).
 */
export const DEFAULT_COLOR: Color = { type: "default" };

// Packed color encoding (internal only):
// 0x00_000000 = default
// 0x01_0000NN = named (N = index 0-7)
// 0x02_0000NN = bright (N = index 0-7)
// 0x03_0000NN = palette (N = index 0-255)
// 0x04_RRGGBB = RGB (24-bit color)
const COLOR_DEFAULT = 0x00_000000;
const COLOR_NAMED = 0x01_000000;
const COLOR_BRIGHT = 0x02_000000;
const COLOR_PALETTE = 0x03_000000;
const COLOR_RGB = 0x04_000000;
const COLOR_TYPE_MASK = 0xff_000000;

function packColor(color: Color): number {
  switch (color.type) {
    case "default":
      return COLOR_DEFAULT;
    case "named":
      return COLOR_NAMED | color.index;
    case "bright":
      return COLOR_BRIGHT | color.index;
    case "palette":
      return COLOR_PALETTE | color.index;
    case "rgb":
      return COLOR_RGB | (color.r << 16) | (color.g << 8) | color.b;
  }
}

function unpackColor(packed: number): Color {
  const type = packed & COLOR_TYPE_MASK;
  const value = packed & 0x00_ffffff;

  switch (type) {
    case COLOR_DEFAULT:
      return { type: "default" };
    case COLOR_NAMED:
      return { type: "named", index: value };
    case COLOR_BRIGHT:
      return { type: "bright", index: value };
    case COLOR_PALETTE:
      return { type: "palette", index: value };
    case COLOR_RGB:
      return {
        type: "rgb",
        r: (value >> 16) & 0xff,
        g: (value >> 8) & 0xff,
        b: value & 0xff,
      };
    default:
      return { type: "default" }; // Defensive fallback
  }
}

// Style modifiers as bitmask constants (powers of 2)
// Map directly to ECMA-48 SGR codes
export const BOLD = 1; // SGR 1
export const DIM = 2; // SGR 2
export const ITALIC = 4; // SGR 3
export const UNDERLINE = 8; // SGR 4
export const BLINK = 16; // SGR 5
export const INVERSE = 32; // SGR 7
export const HIDDEN = 64; // SGR 8
export const STRIKETHROUGH = 128; // SGR 9

// Internal cell structure (not exported)
interface InternalCell {
  symbol: string;
  fg: number; // Packed color
  bg: number; // Packed color
  modifiers: number;
}

/**
 * Double-buffered cell grid with zero-allocation design.
 * Tracks dirty regions and style state for efficient ANSI output.
 *
 * Write operations modify the back buffer. flush() diffs against front,
 * emits ANSI, and syncs the buffers.
 */
export class Buffer {
  private front: InternalCell[]; // What's currently on screen
  private back: InternalCell[]; // Render target for this frame

  private _width: number;
  private _height: number;

  // Dirty region tracking
  private _dirtyMinX: number;
  private _dirtyMinY: number;
  private _dirtyMaxX: number;
  private _dirtyMaxY: number;

  // Style state (persists across flush calls)
  private _styleFg: number = COLOR_DEFAULT;
  private _styleBg: number = COLOR_DEFAULT;
  private _styleModifiers = 0;

  // Cursor state (persists across flush calls)
  private _cursorX = 0;
  private _cursorY = 0;

  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
    this.front = this.allocateCells(width * height);
    this.back = this.allocateCells(width * height);

    // Initial dirty region is empty - set by first set() calls
    this._dirtyMinX = width;
    this._dirtyMinY = height;
    this._dirtyMaxX = -1;
    this._dirtyMaxY = -1;
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  get dirtyMinX(): number {
    return this._dirtyMinX;
  }

  get dirtyMinY(): number {
    return this._dirtyMinY;
  }

  get dirtyMaxX(): number {
    return this._dirtyMaxX;
  }

  get dirtyMaxY(): number {
    return this._dirtyMaxY;
  }

  hasDirtyRegion(): boolean {
    return (
      this._dirtyMaxX >= this._dirtyMinX && this._dirtyMaxY >= this._dirtyMinY
    );
  }

  private allocateCells(size: number): InternalCell[] {
    const cells: InternalCell[] = new Array(size);
    for (let i = 0; i < size; i++) {
      cells[i] = {
        symbol: " ",
        fg: COLOR_DEFAULT,
        bg: COLOR_DEFAULT,
        modifiers: 0,
      };
    }
    return cells;
  }

  private index(x: number, y: number): number {
    return y * this._width + x;
  }

  private markDirty(x: number, y: number): void {
    if (x < this._dirtyMinX) this._dirtyMinX = x;
    if (x > this._dirtyMaxX) this._dirtyMaxX = x;
    if (y < this._dirtyMinY) this._dirtyMinY = y;
    if (y > this._dirtyMaxY) this._dirtyMaxY = y;
  }

  private clearDirtyRegion(): void {
    this._dirtyMinX = this._width;
    this._dirtyMinY = this._height;
    this._dirtyMaxX = -1;
    this._dirtyMaxY = -1;
  }

  /**
   * Set a cell at (x, y) with primitive arguments.
   * Out-of-bounds is a silent no-op.
   */
  set(
    x: number,
    y: number,
    symbol: string,
    fg: Color,
    bg: Color,
    modifiers: number,
  ): void {
    this.setInternal(x, y, symbol, packColor(fg), packColor(bg), modifiers);
  }

  // Internal set that takes pre-packed colors
  private setInternal(
    x: number,
    y: number,
    symbol: string,
    fg: number,
    bg: number,
    modifiers: number,
  ): void {
    if (x < 0 || x >= this._width || y < 0 || y >= this._height) return;

    const idx = this.index(x, y);
    const cell = this.back[idx];

    // Handle double-width character overwrites:
    // If we're overwriting part of a double-width char, clear the orphaned half

    // Case 1: Overwriting a continuation cell - clear the base character to its left
    if (cell.symbol === "" && x > 0) {
      const baseCell = this.back[this.index(x - 1, y)];
      baseCell.symbol = " ";
      this.markDirty(x - 1, y);
    }

    // Case 2: Overwriting a base character that has a continuation - clear the continuation
    if (x + 1 < this._width) {
      const nextCell = this.back[this.index(x + 1, y)];
      if (nextCell.symbol === "") {
        nextCell.symbol = " ";
        this.markDirty(x + 1, y);
      }
    }

    cell.symbol = symbol;
    cell.fg = fg;
    cell.bg = bg;
    cell.modifiers = modifiers;
    this.markDirty(x, y);
  }

  /**
   * Write a string to the buffer, handling grapheme segmentation and double-width characters.
   * Stops at buffer edge. Returns number of columns consumed.
   * Out-of-bounds start position is a silent no-op returning 0.
   */
  writeText(
    x: number,
    y: number,
    text: string,
    fg: Color,
    bg: Color,
    modifiers: number,
  ): number {
    // Out-of-bounds start position - silent no-op
    if (y < 0 || y >= this._height || x >= this._width) return 0;

    let col = Math.max(0, x); // Clamp negative x to 0
    const startCol = col;
    const packedFg = packColor(fg);
    const packedBg = packColor(bg);

    for (const grapheme of graphemes(text)) {
      if (col >= this._width) break;

      const width = graphemeDisplayWidth(grapheme);

      // Skip if double-width char won't fit
      if (width === 2 && col + 1 >= this._width) break;

      this.setInternal(col, y, grapheme, packedFg, packedBg, modifiers);

      if (width === 2) {
        this.setInternal(col + 1, y, "", packedFg, packedBg, modifiers);
      }

      col += width;
    }

    return col - startCol; // Columns consumed
  }

  /**
   * Clear all cells in back buffer to defaults.
   * Does NOT expand dirty region - the diff against front handles efficiency.
   */
  clear(): void {
    for (const cell of this.back) {
      cell.symbol = " ";
      cell.fg = COLOR_DEFAULT;
      cell.bg = COLOR_DEFAULT;
      cell.modifiers = 0;
    }
    // NOTE: Do NOT mark dirty here. The diff against front handles efficiency.
    // If a cell was already a space in front, no ANSI is emitted.
  }

  /**
   * Fill a rectangle with the given style.
   * Clips to buffer bounds.
   */
  fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    symbol: string,
    fg: Color,
    bg: Color,
    modifiers: number,
  ): void {
    const x1 = Math.max(0, x);
    const y1 = Math.max(0, y);
    const x2 = Math.min(this._width, x + width);
    const y2 = Math.min(this._height, y + height);

    // Early exit if rect is completely outside buffer
    if (x1 >= x2 || y1 >= y2) return;

    const packedFg = packColor(fg);
    const packedBg = packColor(bg);

    for (let py = y1; py < y2; py++) {
      for (let px = x1; px < x2; px++) {
        const idx = this.index(px, py);
        const cell = this.back[idx];
        cell.symbol = symbol;
        cell.fg = packedFg;
        cell.bg = packedBg;
        cell.modifiers = modifiers;
      }
    }

    // Mark the filled region as dirty
    if (x1 < this._dirtyMinX) this._dirtyMinX = x1;
    if (y1 < this._dirtyMinY) this._dirtyMinY = y1;
    if (x2 - 1 > this._dirtyMaxX) this._dirtyMaxX = x2 - 1;
    if (y2 - 1 > this._dirtyMaxY) this._dirtyMaxY = y2 - 1;
  }

  /**
   * Get the symbol at (x, y).
   * Returns " " for out-of-bounds.
   */
  getSymbol(x: number, y: number): string {
    if (x < 0 || x >= this._width || y < 0 || y >= this._height) {
      return " ";
    }
    return this.back[this.index(x, y)].symbol;
  }

  /**
   * Get the foreground color at (x, y).
   * Returns DEFAULT_COLOR for out-of-bounds.
   * Note: Allocates a Color object - avoid in hot paths.
   */
  getFg(x: number, y: number): Color {
    if (x < 0 || x >= this._width || y < 0 || y >= this._height) {
      return DEFAULT_COLOR;
    }
    return unpackColor(this.back[this.index(x, y)].fg);
  }

  /**
   * Get the background color at (x, y).
   * Returns DEFAULT_COLOR for out-of-bounds.
   * Note: Allocates a Color object - avoid in hot paths.
   */
  getBg(x: number, y: number): Color {
    if (x < 0 || x >= this._width || y < 0 || y >= this._height) {
      return DEFAULT_COLOR;
    }
    return unpackColor(this.back[this.index(x, y)].bg);
  }

  /**
   * Get the modifiers at (x, y).
   * Returns 0 for out-of-bounds.
   */
  getModifiers(x: number, y: number): number {
    if (x < 0 || x >= this._width || y < 0 || y >= this._height) {
      return 0;
    }
    return this.back[this.index(x, y)].modifiers;
  }

  /**
   * Resize the buffer. Reinitializes all cells (no content preservation).
   * Marks entire buffer dirty and resets cursor tracking.
   */
  resize(width: number, height: number): void {
    if (width === this._width && height === this._height) return;

    this._width = width;
    this._height = height;

    const size = width * height;
    this.front = this.allocateCells(size);
    this.back = this.allocateCells(size);

    // Mark entire buffer dirty for full redraw
    this._dirtyMinX = 0;
    this._dirtyMinY = 0;
    this._dirtyMaxX = width - 1;
    this._dirtyMaxY = height - 1;

    // Reset cursor tracking (position unknown after resize)
    this._cursorX = -1;
    this._cursorY = -1;
  }

  /**
   * Diff back against front, emit ANSI for changes, sync buffers.
   * Returns the ANSI string to write to the terminal.
   */
  flush(): string {
    const output = this.render();
    this.syncBuffers();
    this.clearDirtyRegion();
    return output;
  }

  /**
   * Reset for full redraw. Use when terminal state is unknown.
   */
  forceFullRedraw(): void {
    // Reset front buffer to all defaults (forces full diff)
    for (const cell of this.front) {
      cell.symbol = " ";
      cell.fg = COLOR_DEFAULT;
      cell.bg = COLOR_DEFAULT;
      cell.modifiers = 0;
    }

    // Reset style tracking (forces SGR reset on next render)
    this._styleFg = COLOR_DEFAULT;
    this._styleBg = COLOR_DEFAULT;
    this._styleModifiers = 0;

    // Mark entire buffer for scanning
    this._dirtyMinX = 0;
    this._dirtyMinY = 0;
    this._dirtyMaxX = this._width - 1;
    this._dirtyMaxY = this._height - 1;
  }

  private render(): string {
    if (!this.hasDirtyRegion()) return "";

    const parts: string[] = [];

    for (let y = this._dirtyMinY; y <= this._dirtyMaxY; y++) {
      for (let x = this._dirtyMinX; x <= this._dirtyMaxX; x++) {
        const idx = this.index(x, y);
        const curr = this.back[idx];
        const prev = this.front[idx];

        if (!this.cellsEqual(curr, prev)) {
          // Skip continuation cells (empty symbol marks continuation of wide char)
          if (curr.symbol === "") continue;

          // Emit cursor move if needed
          if (y !== this._cursorY || x !== this._cursorX) {
            parts.push(`\x1b[${y + 1};${x + 1}H`);
          }

          // Emit style diff
          this.emitStyleDiff(parts, curr);

          // Emit symbol
          parts.push(curr.symbol);

          // Track cursor (advances by display width)
          this._cursorX = x + graphemeDisplayWidth(curr.symbol);
          this._cursorY = y;
        }
      }
    }

    return parts.join("");
  }

  private cellsEqual(a: InternalCell, b: InternalCell): boolean {
    return (
      a.symbol === b.symbol &&
      a.fg === b.fg &&
      a.bg === b.bg &&
      a.modifiers === b.modifiers
    );
  }

  private syncBuffers(): void {
    if (!this.hasDirtyRegion()) return;

    // Only copy cells that were written this frame
    for (let y = this._dirtyMinY; y <= this._dirtyMaxY; y++) {
      for (let x = this._dirtyMinX; x <= this._dirtyMaxX; x++) {
        const idx = this.index(x, y);
        const src = this.back[idx];
        const dst = this.front[idx];
        dst.symbol = src.symbol;
        dst.fg = src.fg;
        dst.bg = src.bg;
        dst.modifiers = src.modifiers;
      }
    }
  }

  private emitStyleDiff(parts: string[], cell: InternalCell): void {
    const codes: number[] = [];

    // Check if we need to remove modifiers (requires reset)
    const removedModifiers = this._styleModifiers & ~cell.modifiers;
    if (removedModifiers !== 0) {
      codes.push(0); // SGR reset
      this._styleFg = COLOR_DEFAULT;
      this._styleBg = COLOR_DEFAULT;
      this._styleModifiers = 0;
    }

    // Add new modifiers
    const addedModifiers = cell.modifiers & ~this._styleModifiers;
    if (addedModifiers & BOLD) codes.push(1);
    if (addedModifiers & DIM) codes.push(2);
    if (addedModifiers & ITALIC) codes.push(3);
    if (addedModifiers & UNDERLINE) codes.push(4);
    if (addedModifiers & BLINK) codes.push(5);
    if (addedModifiers & INVERSE) codes.push(7);
    if (addedModifiers & HIDDEN) codes.push(8);
    if (addedModifiers & STRIKETHROUGH) codes.push(9);

    // Foreground color
    if (cell.fg !== this._styleFg) {
      this.appendColorCodes(codes, cell.fg, true);
    }

    // Background color
    if (cell.bg !== this._styleBg) {
      this.appendColorCodes(codes, cell.bg, false);
    }

    if (codes.length > 0) {
      parts.push(`\x1b[${codes.join(";")}m`);
    }

    this._styleFg = cell.fg;
    this._styleBg = cell.bg;
    this._styleModifiers = cell.modifiers;
  }

  private appendColorCodes(
    codes: number[],
    packed: number,
    isForeground: boolean,
  ): void {
    const type = packed & COLOR_TYPE_MASK;
    const value = packed & 0x00_ffffff;
    const base = isForeground ? 30 : 40;

    switch (type) {
      case COLOR_DEFAULT:
        codes.push(isForeground ? 39 : 49);
        break;
      case COLOR_NAMED:
        codes.push(base + value);
        break;
      case COLOR_BRIGHT:
        codes.push(base + 60 + value); // 90-97 / 100-107
        break;
      case COLOR_PALETTE:
        codes.push(isForeground ? 38 : 48, 5, value);
        break;
      case COLOR_RGB: {
        const r = (value >> 16) & 0xff;
        const g = (value >> 8) & 0xff;
        const b = value & 0xff;
        codes.push(isForeground ? 38 : 48, 2, r, g, b);
        break;
      }
    }
  }
}
