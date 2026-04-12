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

/** Text wrap mode for layout. */
export type WrapMode = "wrap" | "truncate" | "truncate-end" | "truncate-start";

/**
 * A single grapheme cluster with its precomputed display width.
 *
 * Produced by `segmentLine()` and used by layout, truncation, and rendering
 * to avoid redundant Unicode segmentation.
 */
export interface VisualSegment {
  grapheme: string;
  displayWidth: number;
}

/**
 * A visual line of text produced by `layoutLine()` or `truncateLine()`.
 *
 * Carries the plain text, its total display width, and the individual
 * grapheme segments — eliminating the need for downstream consumers to
 * re-segment the string.
 */
export interface VisualLine {
  text: string;
  displayWidth: number;
  segments: readonly VisualSegment[];
}

const ELLIPSIS: VisualSegment = { grapheme: "…", displayWidth: 1 };

/**
 * Segments a line of text into grapheme clusters with precomputed display widths.
 *
 * This is the single point where `graphemes()` is called for layout/render
 * operations. All other functions (`layoutLine`, `truncateLine`, `measureText`)
 * build on top of this instead of calling `graphemes()` directly.
 */
export function segmentLine(line: string): VisualSegment[] {
  const segments: VisualSegment[] = [];
  for (const g of graphemes(line)) {
    segments.push({ grapheme: g, displayWidth: graphemeDisplayWidth(g) });
  }
  return segments;
}

/**
 * Segments all lines of a text string. Returns the source text and
 * a per-line array of `VisualSegment[]` for reuse across measure and render.
 */
export function segmentText(text: string): {
  sourceText: string;
  lines: VisualSegment[][];
} {
  const sourceLines = text.split("\n");
  const lines: VisualSegment[][] = [];
  for (const line of sourceLines) {
    lines.push(segmentLine(line));
  }
  return { sourceText: text, lines };
}

/**
 * Wrap pre-segmented lines at width boundaries. Skips the segmentation step
 * entirely — used when segments were already computed during measure.
 */
export function layoutLineFromSegments(
  segments: VisualSegment[],
  maxWidth: number,
): VisualLine[] {
  if (maxWidth <= 0) {
    return segments.length > 0
      ? [segmentsToVisualLine(segments)]
      : [{ text: "", displayWidth: 0, segments: [] }];
  }

  if (segments.length === 0) {
    return [{ text: "", displayWidth: 0, segments: [] }];
  }

  const result: VisualLine[] = [];
  let currentSegments: VisualSegment[] = [];
  let currentWidth = 0;

  for (const seg of segments) {
    if (
      currentWidth + seg.displayWidth > maxWidth &&
      currentSegments.length > 0
    ) {
      result.push(segmentsToVisualLine(currentSegments));
      currentSegments = [];
      currentWidth = 0;
    }

    currentSegments.push(seg);
    currentWidth += seg.displayWidth;
  }

  if (currentSegments.length > 0) {
    result.push(segmentsToVisualLine(currentSegments));
  }

  return result.length > 0
    ? result
    : [{ text: "", displayWidth: 0, segments: [] }];
}

/**
 * Truncate pre-segmented lines to fit maxWidth. Skips the segmentation step
 * entirely — used when segments were already computed during measure.
 */
export function truncateLineFromSegments(
  segments: VisualSegment[],
  maxWidth: number,
  mode: "truncate" | "truncate-end" | "truncate-start",
): VisualLine {
  const width = segmentsDisplayWidth(segments);
  if (width <= maxWidth) {
    return segmentsToVisualLine(segments);
  }

  if (mode === "truncate" || mode === "truncate-end") {
    return truncateEnd(segments, maxWidth);
  }

  return truncateStart(segments, maxWidth);
}

/**
 * Measure text dimensions from pre-segmented lines.
 * Returns `{ width: 0, height: 0 }` for empty text.
 */
export function measureTextFromSegments(
  segmentedLines: VisualSegment[][],
  availableWidth: number,
  wrap: WrapMode,
): { width: number; height: number } {
  if (segmentedLines.length === 0) {
    return { width: 0, height: 0 };
  }

  if (wrap === "wrap") {
    const visualLines = segmentedLines.flatMap((line) =>
      layoutLineFromSegments(line, availableWidth),
    );
    let maxWidth = 0;
    for (const vl of visualLines) {
      if (vl.displayWidth > maxWidth) maxWidth = vl.displayWidth;
    }
    return {
      width: Math.min(maxWidth, availableWidth),
      height: visualLines.length,
    };
  }

  let maxWidth = 0;
  for (const segments of segmentedLines) {
    const w = segmentsDisplayWidth(segments);
    if (w > maxWidth) maxWidth = w;
  }
  return {
    width: Math.min(maxWidth, availableWidth),
    height: segmentedLines.length,
  };
}

function segmentsToVisualLine(segments: readonly VisualSegment[]): VisualLine {
  let text = "";
  let displayWidth = 0;
  for (const s of segments) {
    text += s.grapheme;
    displayWidth += s.displayWidth;
  }
  return { text, displayWidth, segments };
}

function segmentsDisplayWidth(segments: readonly VisualSegment[]): number {
  let width = 0;
  for (const s of segments) {
    width += s.displayWidth;
  }
  return width;
}

/**
 * Lays out a single line of text, wrapping at grapheme boundaries to fit
 * within `maxWidth` terminal columns.
 *
 * Returns an array of `VisualLine` objects, each carrying the wrapped text,
 * its total display width, and the individual grapheme segments. Downstream
 * consumers (rendering, measurement) never need to re-segment.
 */
export function layoutLine(line: string, maxWidth: number): VisualLine[] {
  if (maxWidth <= 0) {
    const segments = segmentLine(line);
    return segments.length > 0
      ? [segmentsToVisualLine(segments)]
      : [{ text: "", displayWidth: 0, segments: [] }];
  }

  const segments = segmentLine(line);

  if (segments.length === 0) {
    return [{ text: "", displayWidth: 0, segments: [] }];
  }

  const result: VisualLine[] = [];
  let currentSegments: VisualSegment[] = [];
  let currentWidth = 0;

  for (const seg of segments) {
    if (
      currentWidth + seg.displayWidth > maxWidth &&
      currentSegments.length > 0
    ) {
      result.push(segmentsToVisualLine(currentSegments));
      currentSegments = [];
      currentWidth = 0;
    }

    currentSegments.push(seg);
    currentWidth += seg.displayWidth;
  }

  if (currentSegments.length > 0) {
    result.push(segmentsToVisualLine(currentSegments));
  }

  return result.length > 0
    ? result
    : [{ text: "", displayWidth: 0, segments: [] }];
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
    const visualLines = lines.flatMap((line) =>
      layoutLine(line, availableWidth),
    );
    let maxWidth = 0;
    for (const vl of visualLines) {
      if (vl.displayWidth > maxWidth) maxWidth = vl.displayWidth;
    }
    return {
      width: Math.min(maxWidth, availableWidth),
      height: visualLines.length,
    };
  }

  let maxWidth = 0;
  for (const line of lines) {
    const w = segmentsDisplayWidth(segmentLine(line));
    if (w > maxWidth) maxWidth = w;
  }
  return {
    width: Math.min(maxWidth, availableWidth),
    height: lines.length,
  };
}

/**
 * Truncates a line from the end, adding ellipsis.
 */
function truncateEnd(
  segments: readonly VisualSegment[],
  maxWidth: number,
): VisualLine {
  const targetWidth = maxWidth - ELLIPSIS.displayWidth;

  if (targetWidth <= 0) {
    return {
      text: ELLIPSIS.grapheme.slice(0, maxWidth),
      displayWidth: Math.min(ELLIPSIS.displayWidth, maxWidth),
      segments: [
        {
          grapheme: ELLIPSIS.grapheme.slice(0, maxWidth),
          displayWidth: Math.min(ELLIPSIS.displayWidth, maxWidth),
        },
      ],
    };
  }

  const kept: VisualSegment[] = [];
  let width = 0;

  for (const seg of segments) {
    if (width + seg.displayWidth > targetWidth) break;
    kept.push(seg);
    width += seg.displayWidth;
  }

  const result = [...kept, ELLIPSIS];
  return segmentsToVisualLine(result);
}

/**
 * Truncates a line from the start, adding ellipsis.
 */
function truncateStart(
  segments: readonly VisualSegment[],
  maxWidth: number,
): VisualLine {
  const targetWidth = maxWidth - ELLIPSIS.displayWidth;

  if (targetWidth <= 0) {
    return {
      text: ELLIPSIS.grapheme.slice(0, maxWidth),
      displayWidth: Math.min(ELLIPSIS.displayWidth, maxWidth),
      segments: [
        {
          grapheme: ELLIPSIS.grapheme.slice(0, maxWidth),
          displayWidth: Math.min(ELLIPSIS.displayWidth, maxWidth),
        },
      ],
    };
  }

  const kept: VisualSegment[] = [];
  let width = 0;

  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (width + seg.displayWidth > targetWidth) break;
    kept.unshift(seg);
    width += seg.displayWidth;
  }

  const result = [ELLIPSIS, ...kept];
  return segmentsToVisualLine(result);
}

/**
 * Truncates a line to fit within `maxWidth` terminal columns, adding an
 * ellipsis when truncation occurs. Returns a `VisualLine` with pre-segmented
 * grapheme data so the caller never needs to re-segment.
 *
 * @param line - The source line
 * @param maxWidth - Maximum display width in terminal columns
 * @param mode - Direction of truncation
 */
export function truncateLine(
  line: string,
  maxWidth: number,
  mode: "truncate" | "truncate-end" | "truncate-start",
): VisualLine {
  const segments = segmentLine(line);
  const width = segmentsDisplayWidth(segments);
  if (width <= maxWidth) {
    return segmentsToVisualLine(segments);
  }

  if (mode === "truncate" || mode === "truncate-end") {
    return truncateEnd(segments, maxWidth);
  }

  return truncateStart(segments, maxWidth);
}
