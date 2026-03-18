// Rendering utilities: style inheritance, borders, text rendering, terminal control

import {
  BOLD,
  type Buffer,
  type Color,
  DEFAULT_COLOR,
  DIM,
  INVERSE,
  ITALIC,
  type InheritableColor,
  STRIKETHROUGH,
  UNDERLINE,
  graphemeDisplayWidth,
  graphemes,
} from "./buffer.ts";
import {
  type WrapMode,
  lineDisplayWidth,
  truncateLine,
  wrapLine,
} from "./text.ts";

/**
 * Inherited style values passed down through the node tree during paint.
 * All properties are resolved (no "inherit" values).
 */
export interface InheritedStyle {
  color: Color;
  backgroundColor: Color;
  borderColor: Color;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  inverse: boolean;
}

/**
 * Default inherited style values.
 * Used at the root when no parent style exists.
 */
export const DEFAULT_INHERITED_STYLE: InheritedStyle = {
  color: DEFAULT_COLOR,
  backgroundColor: DEFAULT_COLOR,
  borderColor: DEFAULT_COLOR,
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  strikethrough: false,
  inverse: false,
};

/** Inheritable boolean value for text modifiers. */
export type InheritableBool = boolean | "inherit";

/** A value that can be inherited from a parent. */
type Inheritable<T> = T | "inherit";

/**
 * Resolve an inheritable value (color or boolean).
 * Returns the inherited value if the prop is undefined or "inherit".
 */
export function resolveInheritable<T>(
  value: Inheritable<T> | (() => Inheritable<T>) | undefined,
  inherited: T,
): T {
  if (value === undefined || value === "inherit") {
    return inherited;
  }
  if (typeof value === "function") {
    const resolved = (value as () => Inheritable<T>)();
    return resolved === "inherit" ? inherited : resolved;
  }
  return value as T;
}

/**
 * Clipping rectangle for paint-time clipping.
 * Coordinates are absolute screen positions.
 */
export interface ClipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Default clip rect covering the full terminal.
 * Used when no parent clipping is in effect.
 */
export const DEFAULT_CLIP: ClipRect = {
  x: 0,
  y: 0,
  width: Number.POSITIVE_INFINITY,
  height: Number.POSITIVE_INFINITY,
};

/**
 * Intersect two clip rects, returning the overlapping region.
 * Returns a zero-area rect if there's no overlap.
 */
export function intersectClipRect(a: ClipRect, b: ClipRect): ClipRect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

/**
 * Check if a point is within the clip rect.
 */
export function isInClipRect(x: number, y: number, clip: ClipRect): boolean {
  return (
    x >= clip.x &&
    x < clip.x + clip.width &&
    y >= clip.y &&
    y < clip.y + clip.height
  );
}

/** Border style names. */
export type BorderStyleName =
  | "single"
  | "round"
  | "double"
  | "bold"
  | "dashed"
  | "ascii";

/**
 * Border prop for BoxProps.
 * - boolean: true = 'single' on all sides
 * - BorderStyleName: style on all sides
 * - object: selective borders per side
 */
export type BorderProp =
  | boolean
  | BorderStyleName
  | {
      top?: boolean;
      right?: boolean;
      bottom?: boolean;
      left?: boolean;
    };

/**
 * Border character set for a style.
 */
interface BorderChars {
  tl: string; // top-left corner
  tr: string; // top-right corner
  bl: string; // bottom-left corner
  br: string; // bottom-right corner
  h: string; // horizontal
  v: string; // vertical
}

/**
 * Border character sets for each style.
 */
export const BORDER_CHARS: Record<BorderStyleName, BorderChars> = {
  single: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" },
  round: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" },
  double: { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" },
  bold: { tl: "┏", tr: "┓", bl: "┗", br: "┛", h: "━", v: "┃" },
  dashed: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "┄", v: "┆" },
  ascii: { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" },
};

/**
 * Parse BorderProp into individual border flags for each side.
 */
export function parseBorderProp(border: BorderProp | undefined): {
  top: boolean;
  end: boolean;
  bottom: boolean;
  start: boolean;
} {
  if (border === undefined || border === false) {
    return { top: false, end: false, bottom: false, start: false };
  }

  if (border === true || typeof border === "string") {
    return { top: true, end: true, bottom: true, start: true };
  }

  // Selective borders object - map right to end, left to start
  return {
    top: border.top ?? false,
    end: border.right ?? false,
    bottom: border.bottom ?? false,
    start: border.left ?? false,
  };
}

/**
 * Determine the border style name from props.
 */
export function getBorderStyleName(
  border: BorderProp | undefined,
  borderStyle: BorderStyleName | undefined,
): BorderStyleName {
  if (borderStyle) return borderStyle;
  if (typeof border === "string") return border;
  return "single";
}

/**
 * Get the character for a corner position based on which adjacent edges exist.
 * Returns corner char if both edges exist, edge char if one exists, undefined if neither.
 */
function getCornerChar(
  chars: BorderChars,
  hasEdge1: boolean,
  hasEdge2: boolean,
  corner: string,
  edge1Char: string,
  edge2Char: string,
): string | undefined {
  if (hasEdge1 && hasEdge2) return corner;
  if (hasEdge1) return edge1Char;
  if (hasEdge2) return edge2Char;
  return undefined;
}

/**
 * Render border onto the buffer.
 * Uses correct corner logic: corners only render when both adjacent edges exist.
 */
export function renderBorder(
  buffer: Buffer,
  x: number,
  y: number,
  width: number,
  height: number,
  borders: { top: boolean; end: boolean; bottom: boolean; start: boolean },
  styleName: BorderStyleName,
  fg: Color,
  bg: Color,
  clip: ClipRect,
): void {
  const chars = BORDER_CHARS[styleName];
  const { top, end, bottom, start } = borders;

  if (top) {
    const startCol = start ? x + 1 : x;
    const endCol = end ? x + width - 1 : x + width;
    for (let col = startCol; col < endCol; col++) {
      if (isInClipRect(col, y, clip)) {
        buffer.set(col, y, chars.h, fg, bg, 0);
      }
    }
  }
  if (bottom) {
    const startCol = start ? x + 1 : x;
    const endCol = end ? x + width - 1 : x + width;
    for (let col = startCol; col < endCol; col++) {
      if (isInClipRect(col, y + height - 1, clip)) {
        buffer.set(col, y + height - 1, chars.h, fg, bg, 0);
      }
    }
  }

  if (start) {
    const startRow = top ? y + 1 : y;
    const endRow = bottom ? y + height - 1 : y + height;
    for (let row = startRow; row < endRow; row++) {
      if (isInClipRect(x, row, clip)) {
        buffer.set(x, row, chars.v, fg, bg, 0);
      }
    }
  }
  if (end) {
    const startRow = top ? y + 1 : y;
    const endRow = bottom ? y + height - 1 : y + height;
    for (let row = startRow; row < endRow; row++) {
      if (isInClipRect(x + width - 1, row, clip)) {
        buffer.set(x + width - 1, row, chars.v, fg, bg, 0);
      }
    }
  }

  const corners: [number, number, boolean, boolean, string, string, string][] =
    [
      [x, y, top, start, chars.tl, chars.h, chars.v], // top-left
      [x + width - 1, y, top, end, chars.tr, chars.h, chars.v], // top-right
      [x, y + height - 1, bottom, start, chars.bl, chars.h, chars.v], // bottom-left
      [x + width - 1, y + height - 1, bottom, end, chars.br, chars.h, chars.v], // bottom-right
    ];

  for (const [cx, cy, hasHoriz, hasVert, corner, hChar, vChar] of corners) {
    const char = getCornerChar(chars, hasHoriz, hasVert, corner, hChar, vChar);
    if (char && isInClipRect(cx, cy, clip)) {
      buffer.set(cx, cy, char, fg, bg, 0);
    }
  }
}

/** Props for text rendering (subset of TextProps used by renderText). */
export interface TextRenderProps {
  color?: InheritableColor | (() => InheritableColor);
  backgroundColor?: InheritableColor | (() => InheritableColor);
  bold?: InheritableBool | (() => InheritableBool);
  dim?: InheritableBool | (() => InheritableBool);
  italic?: InheritableBool | (() => InheritableBool);
  underline?: InheritableBool | (() => InheritableBool);
  strikethrough?: InheritableBool | (() => InheritableBool);
  inverse?: InheritableBool | (() => InheritableBool);
  wrap?: WrapMode;
}

/**
 * Computes the modifier bitmask from text props using inherited styles.
 */
function computeModifiers(
  props: TextRenderProps,
  inherited: InheritedStyle,
): number {
  let mods = 0;
  if (resolveInheritable(props.bold, inherited.bold)) mods |= BOLD;
  if (resolveInheritable(props.dim, inherited.dim)) mods |= DIM;
  if (resolveInheritable(props.italic, inherited.italic)) mods |= ITALIC;
  if (resolveInheritable(props.underline, inherited.underline))
    mods |= UNDERLINE;
  if (resolveInheritable(props.strikethrough, inherited.strikethrough))
    mods |= STRIKETHROUGH;
  if (resolveInheritable(props.inverse, inherited.inverse)) mods |= INVERSE;
  return mods;
}

/**
 * Renders text into the buffer with styling and wrapping/truncation.
 */
export function renderText(
  buffer: Buffer,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  props: TextRenderProps,
  inherited: InheritedStyle,
  clip: ClipRect,
): void {
  if (
    x >= clip.x + clip.width ||
    x + width <= clip.x ||
    y >= clip.y + clip.height ||
    y + height <= clip.y
  ) {
    return;
  }

  const fg = resolveInheritable(props.color, inherited.color);
  const bg = resolveInheritable(
    props.backgroundColor,
    inherited.backgroundColor,
  );
  const modifiers = computeModifiers(props, inherited);
  const wrapValue = props.wrap ?? "wrap";

  const lines = text.split("\n");
  const displayLines =
    wrapValue === "wrap"
      ? lines.flatMap((line) => wrapLine(line, width))
      : lines.map((line) => truncateLine(line, width, wrapValue));

  for (let row = 0; row < Math.min(displayLines.length, height); row++) {
    const screenY = y + row;
    if (screenY < clip.y || screenY >= clip.y + clip.height) continue;

    const line = displayLines[row];
    let col = x;
    for (const char of graphemes(line)) {
      const charWidth = graphemeDisplayWidth(char);
      if (col >= clip.x && col < clip.x + clip.width) {
        buffer.set(col, screenY, char, fg, bg, modifiers);
      }
      col += charWidth;
      if (col >= clip.x + clip.width) break;
    }
  }
}

/**
 * Enter TUI mode (display setup).
 *
 * Optionally enters alternate screen buffer, hides cursor, clears screen,
 * and moves cursor home.
 */
export function enterTuiMode(
  stdout: NodeJS.WriteStream,
  options: { alternateScreen: boolean },
): void {
  let seq = "";

  if (options.alternateScreen) {
    seq += "\x1b[?1049h"; // Enter alternate screen
  }

  seq += "\x1b[?25l"; // Hide cursor
  seq += "\x1b[2J"; // Clear screen
  seq += "\x1b[H"; // Move cursor home

  stdout.write(seq);
}

/**
 * Exit TUI mode (display teardown).
 *
 * Shows cursor and optionally exits alternate screen buffer.
 */
export function exitTuiMode(
  stdout: NodeJS.WriteStream,
  options: { alternateScreen: boolean },
): void {
  let seq = "";

  seq += "\x1b[?25h"; // Show cursor

  if (options.alternateScreen) {
    seq += "\x1b[?1049l"; // Exit alternate screen
  }

  stdout.write(seq);
}

/**
 * Write frame content to stdout.
 *
 * The cursor is already hidden by enterTuiMode and restored by exitTuiMode,
 * so this function simply writes the content without cursor manipulation.
 * No-op for empty content.
 */
export function flushFrame(stdout: NodeJS.WriteStream, content: string): void {
  if (content.length === 0) return;

  stdout.write(content);
}
