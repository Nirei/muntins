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

/**
 * 2D grid of cells with row-major storage.
 * Tracks dirty regions for efficient diff operations.
 *
 * Out-of-bounds access is handled gracefully:
 * - get() returns DEFAULT_CELL
 * - set() is a no-op
 */
export class Buffer {
  private cells: Cell[];
  private _width: number;
  private _height: number;

  // Dirty rectangle tracking for efficient diff
  private _dirtyMinX: number;
  private _dirtyMinY: number;
  private _dirtyMaxX: number;
  private _dirtyMaxY: number;

  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
    this.cells = new Array(width * height);

    // Initialize dirty region as empty (no dirty cells)
    this._dirtyMinX = width; // Invalid high value
    this._dirtyMinY = height;
    this._dirtyMaxX = -1; // Invalid low value
    this._dirtyMaxY = -1;

    this.clear();
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

  clearDirtyRegion(): void {
    this._dirtyMinX = this._width;
    this._dirtyMinY = this._height;
    this._dirtyMaxX = -1;
    this._dirtyMaxY = -1;
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

  get(x: number, y: number): Cell {
    if (x < 0 || x >= this._width || y < 0 || y >= this._height) {
      return DEFAULT_CELL;
    }
    return { ...this.cells[this.index(x, y)] };
  }

  set(x: number, y: number, cell: Cell): void {
    if (x < 0 || x >= this._width || y < 0 || y >= this._height) {
      return;
    }
    this.cells[this.index(x, y)] = { ...cell };
    this.markDirty(x, y);
  }

  clear(): void {
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = { ...DEFAULT_CELL };
    }
    // Mark entire buffer as dirty since all cells changed
    this._dirtyMinX = 0;
    this._dirtyMinY = 0;
    this._dirtyMaxX = this._width - 1;
    this._dirtyMaxY = this._height - 1;
  }

  resize(width: number, height: number): void {
    if (width === this._width && height === this._height) {
      return;
    }

    const newCells = new Array(width * height);

    // Copy existing content where it fits
    const copyWidth = Math.min(width, this._width);
    const copyHeight = Math.min(height, this._height);

    for (let y = 0; y < copyHeight; y++) {
      for (let x = 0; x < copyWidth; x++) {
        const oldIndex = y * this._width + x;
        const newIndex = y * width + x;
        newCells[newIndex] = this.cells[oldIndex];
      }
    }

    // Fill new areas with default
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const newIndex = y * width + x;
        if (newCells[newIndex] === undefined) {
          newCells[newIndex] = { ...DEFAULT_CELL };
        }
      }
    }

    this._width = width;
    this._height = height;
    this.cells = newCells;

    // Mark entire buffer dirty after resize (full redraw needed)
    this._dirtyMinX = 0;
    this._dirtyMinY = 0;
    this._dirtyMaxX = width - 1;
    this._dirtyMaxY = height - 1;
  }

  fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    cell: Cell,
  ): void {
    const x1 = Math.max(0, x);
    const y1 = Math.max(0, y);
    const x2 = Math.min(this._width, x + width);
    const y2 = Math.min(this._height, y + height);

    // Early exit if rect is completely outside buffer
    if (x1 >= x2 || y1 >= y2) return;

    for (let py = y1; py < y2; py++) {
      for (let px = x1; px < x2; px++) {
        this.cells[this.index(px, py)] = { ...cell };
      }
    }

    // Mark the filled region as dirty
    if (x1 < this._dirtyMinX) this._dirtyMinX = x1;
    if (y1 < this._dirtyMinY) this._dirtyMinY = y1;
    if (x2 - 1 > this._dirtyMaxX) this._dirtyMaxX = x2 - 1;
    if (y2 - 1 > this._dirtyMaxY) this._dirtyMaxY = y2 - 1;
  }
}
