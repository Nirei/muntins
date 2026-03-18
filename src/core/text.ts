// Text editing utilities for grapheme-aware string manipulation
//
// These functions operate on grapheme clusters (user-perceived characters)
// rather than code points or UTF-16 code units. This ensures correct handling
// of emoji, combining marks, and other multi-code-point characters.

import {
  graphemeCount,
  graphemeDisplayWidth,
  graphemeSlice,
  graphemes,
} from "./buffer.ts";

/**
 * Get the length of a string in grapheme clusters.
 *
 * Unlike `string.length` which counts UTF-16 code units, this counts
 * user-perceived characters. An emoji like "👨‍👩‍👧" is 1 grapheme.
 *
 * @example
 * ```typescript
 * textLength("hello");     // 5
 * textLength("👨‍👩‍👧");       // 1
 * textLength("café");      // 4 (even with combining acute accent)
 * ```
 */
export function textLength(text: string): number {
  return graphemeCount(text);
}

/**
 * Extract a section of a string by grapheme positions.
 *
 * Works like `string.slice()` but operates on grapheme clusters.
 *
 * @param text - The source string
 * @param start - Start position (0-indexed, inclusive)
 * @param end - End position (exclusive). If omitted, extracts to end of string.
 *
 * @example
 * ```typescript
 * textSlice("hello", 1, 3);  // "el"
 * textSlice("👨‍👩‍👧🎉", 0, 1);   // "👨‍👩‍👧"
 * textSlice("hello", 2);     // "llo"
 * ```
 */
export function textSlice(text: string, start: number, end?: number): string {
  return graphemeSlice(text, start, end);
}

/**
 * Insert a string at a grapheme position.
 *
 * @param text - The source string
 * @param pos - Position to insert at (0-indexed)
 * @param insert - String to insert
 *
 * @example
 * ```typescript
 * textInsert("hello", 2, "XX");  // "heXXllo"
 * textInsert("ab", 1, "👨‍👩‍👧");     // "a👨‍👩‍👧b"
 * ```
 */
export function textInsert(text: string, pos: number, insert: string): string {
  return graphemeSlice(text, 0, pos) + insert + graphemeSlice(text, pos);
}

/**
 * Delete a range of graphemes from a string.
 *
 * @param text - The source string
 * @param start - Start position (0-indexed, inclusive)
 * @param end - End position (exclusive)
 *
 * @example
 * ```typescript
 * textDelete("hello", 1, 3);  // "hlo"
 * textDelete("a👨‍👩‍👧b", 1, 2);    // "ab"
 * ```
 */
export function textDelete(text: string, start: number, end: number): string {
  return graphemeSlice(text, 0, start) + graphemeSlice(text, end);
}

/**
 * Calculate display width of graphemes from start of string to a position.
 *
 * This accounts for double-width characters (CJK, emoji) when calculating
 * the visual column position in a terminal.
 *
 * @param text - The source string
 * @param pos - Grapheme position (0-indexed)
 * @returns Display width in terminal columns
 *
 * @example
 * ```typescript
 * displayWidthToPosition("hello", 3);  // 3 (ASCII chars are width 1)
 * displayWidthToPosition("你好", 1);    // 2 (CJK chars are width 2)
 * displayWidthToPosition("a中b", 2);   // 3 (1 + 2)
 * ```
 */
export function displayWidthToPosition(text: string, pos: number): number {
  let width = 0;
  let i = 0;
  for (const grapheme of graphemes(text)) {
    if (i >= pos) break;
    width += graphemeDisplayWidth(grapheme);
    i++;
  }
  return width;
}

// =============================================================================
// Text Layout & Measurement
// =============================================================================

/** Text wrap mode for layout. */
export type WrapMode = "wrap" | "truncate" | "truncate-end" | "truncate-start";

/**
 * Calculates the display width of a line of text.
 */
export function lineDisplayWidth(line: string): number {
  let width = 0;
  for (const grapheme of graphemes(line)) {
    width += graphemeDisplayWidth(grapheme);
  }
  return width;
}

/**
 * Wraps a single line of text at grapheme boundaries to fit within maxWidth.
 * Returns an array of wrapped line segments.
 */
export function wrapLine(line: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [line];

  const result: string[] = [];
  let current = "";
  let currentWidth = 0;

  for (const grapheme of graphemes(line)) {
    const w = graphemeDisplayWidth(grapheme);

    if (currentWidth + w > maxWidth && current.length > 0) {
      result.push(current);
      current = "";
      currentWidth = 0;
    }

    current += grapheme;
    currentWidth += w;
  }

  if (current.length > 0) {
    result.push(current);
  }

  return result.length > 0 ? result : [""];
}

/**
 * Measures text for layout purposes.
 * Returns the width and height needed to display the text.
 *
 * @param text - The text to measure
 * @param availableWidth - Available width for wrapping
 * @param wrap - Wrapping mode: "wrap" for line wrapping, or truncate modes for single line
 */
export function measureText(
  text: string,
  availableWidth: number,
  wrap: WrapMode,
): { width: number; height: number } {
  if (text.length === 0) {
    return { width: 0, height: 0 };
  }

  const lines = text.split("\n");

  if (wrap === "wrap") {
    // Wrap lines to available width
    const wrappedLines = lines.flatMap((line) =>
      wrapLine(line, availableWidth),
    );
    const maxWidth = Math.max(
      ...wrappedLines.map((line) => lineDisplayWidth(line)),
    );
    return {
      width: Math.min(maxWidth, availableWidth),
      height: wrappedLines.length,
    };
  }

  // No wrapping, single line per input line
  const maxWidth = Math.max(...lines.map((line) => lineDisplayWidth(line)));
  return {
    width: Math.min(maxWidth, availableWidth),
    height: lines.length,
  };
}

/**
 * Truncates a line from the end, adding ellipsis.
 */
function truncateEnd(line: string, maxWidth: number): string {
  const ellipsis = "…";
  const ellipsisWidth = 1;
  const targetWidth = maxWidth - ellipsisWidth;

  if (targetWidth <= 0) return ellipsis.slice(0, maxWidth);

  let result = "";
  let width = 0;

  for (const grapheme of graphemes(line)) {
    const w = graphemeDisplayWidth(grapheme);
    if (width + w > targetWidth) break;
    result += grapheme;
    width += w;
  }

  return result + ellipsis;
}

/**
 * Truncates a line from the start, adding ellipsis.
 */
function truncateStart(line: string, maxWidth: number): string {
  const ellipsis = "…";
  const ellipsisWidth = 1;
  const targetWidth = maxWidth - ellipsisWidth;

  if (targetWidth <= 0) return ellipsis.slice(0, maxWidth);

  // Collect graphemes in reverse
  const chars = [...graphemes(line)];
  let result = "";
  let width = 0;

  for (let i = chars.length - 1; i >= 0; i--) {
    const w = graphemeDisplayWidth(chars[i]);
    if (width + w > targetWidth) break;
    result = chars[i] + result;
    width += w;
  }

  return ellipsis + result;
}

/**
 * Truncates a line to fit within maxWidth, using the specified mode.
 * Returns the line unchanged if it already fits.
 */
export function truncateLine(
  line: string,
  maxWidth: number,
  mode: "truncate" | "truncate-end" | "truncate-start",
): string {
  const width = lineDisplayWidth(line);
  if (width <= maxWidth) return line;

  if (mode === "truncate" || mode === "truncate-end") {
    return truncateEnd(line, maxWidth);
  }

  return truncateStart(line, maxWidth);
}
