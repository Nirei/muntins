// Cell buffer core types and constants

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

/**
 * A single terminal cell.
 *
 * - symbol: Grapheme cluster (possibly multi-codepoint); "" marks continuation of double-width chars
 * - fg: Foreground color
 * - bg: Background color
 * - modifiers: Bitmask of style modifiers (BOLD | ITALIC | etc.)
 */
export interface Cell {
  symbol: string;
  fg: Color;
  bg: Color;
  modifiers: number;
}

/**
 * Default color (terminal's default).
 */
export const DEFAULT_COLOR: Color = { type: "default" };

/**
 * Default cell: space character with default colors and no modifiers.
 * Frozen to prevent accidental mutation.
 */
export const DEFAULT_CELL: Readonly<Cell> = Object.freeze({
  symbol: " ",
  fg: DEFAULT_COLOR,
  bg: DEFAULT_COLOR,
  modifiers: 0,
});

/**
 * Create a cell with partial overrides from defaults.
 */
export function createCell(overrides: Partial<Cell> = {}): Cell {
  return {
    symbol: overrides.symbol ?? " ",
    fg: overrides.fg ?? DEFAULT_COLOR,
    bg: overrides.bg ?? DEFAULT_COLOR,
    modifiers: overrides.modifiers ?? 0,
  };
}

/**
 * Compare two colors for equality.
 * Handles the discriminated union properly.
 */
export function colorsEqual(a: Color, b: Color): boolean {
  if (a.type !== b.type) return false;

  switch (a.type) {
    case "default":
      return true;
    case "named":
    case "bright":
    case "palette":
      return a.index === (b as typeof a).index;
    case "rgb": {
      const bRgb = b as { type: "rgb"; r: number; g: number; b: number };
      return a.r === bRgb.r && a.g === bRgb.g && a.b === bRgb.b;
    }
    default: {
      const _exhaustive: never = a;
      return _exhaustive;
    }
  }
}

/**
 * Compare two cells for equality.
 * Used by diff to detect changes.
 */
export function cellsEqual(a: Cell, b: Cell): boolean {
  return (
    a.symbol === b.symbol &&
    a.modifiers === b.modifiers &&
    colorsEqual(a.fg, b.fg) &&
    colorsEqual(a.bg, b.bg)
  );
}
