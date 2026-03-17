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
