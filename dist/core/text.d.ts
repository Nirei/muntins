import { type InheritableColor } from "./buffer.ts";
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
export declare function textLength(text: string): number;
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
export declare function textSlice(text: string, start: number, end?: number): string;
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
export declare function textInsert(text: string, pos: number, insert: string): string;
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
export declare function textDelete(text: string, start: number, end: number): string;
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
export declare function displayWidthToPosition(text: string, pos: number): number;
/** Text wrap mode for layout. */
export type WrapMode = "wrap" | "word" | "none" | "truncate" | "truncate-end" | "truncate-start";
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
/**
 * A styled run of text. Spans are laid out as one continuous flow;
 * `"\n"` inside a span is a hard line break. Any omitted style
 * property is inherited from the containing node and ancestors.
 */
export interface StyledSpan {
    text: string;
    color?: InheritableColor;
    backgroundColor?: InheritableColor;
    bold?: boolean;
    dim?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    inverse?: boolean;
}
/** A grapheme segment carrying the index of the span it came from. */
export interface StyledSegment extends VisualSegment {
    spanIndex: number;
}
/** A visual line of styled segments. */
export interface StyledVisualLine {
    text: string;
    displayWidth: number;
    segments: readonly StyledSegment[];
}
export interface VisualLine {
    text: string;
    displayWidth: number;
    segments: readonly VisualSegment[];
}
/**
 * Segments a line of text into grapheme clusters with precomputed display widths.
 *
 * This is the single point where `graphemes()` is called for layout/render
 * operations. All other functions (`layoutLine`, `truncateLine`, `measureText`)
 * build on top of this instead of calling `graphemes()` directly.
 */
export declare function segmentLine(line: string): VisualSegment[];
/**
 * Segments all lines of a text string. Returns the source text and
 * a per-line array of `VisualSegment[]` for reuse across measure and render.
 */
export declare function segmentText(text: string): {
    sourceText: string;
    lines: VisualSegment[][];
};
/**
 * Wrap pre-segmented lines at width boundaries. Skips the segmentation step
 * entirely — used when segments were already computed during measure.
 */
export declare function layoutLineFromSegments(segments: VisualSegment[], maxWidth: number): VisualLine[];
/**
 * Wrap pre-segmented text at word boundaries (greedy algorithm).
 *
 * Break opportunities exist before a non-space segment that follows a space,
 * and between wide graphemes (CJK/emoji — terminals allow breaking between
 * them since they carry no intra-word semantics). A word longer than the
 * line falls back to grapheme-boundary breaks. Spaces at a break point are
 * not rendered (trimmed from the end of the wrapped line, skipped at the
 * start of the next). The final line keeps its trailing content as-is.
 */
export declare function layoutWordWrapFromSegments(segments: VisualSegment[], maxWidth: number): VisualLine[];
/**
 * Truncate pre-segmented lines to fit maxWidth. Skips the segmentation step
 * entirely — used when segments were already computed during measure.
 */
export declare function truncateLineFromSegments(segments: VisualSegment[], maxWidth: number, mode: "truncate" | "truncate-end" | "truncate-start"): VisualLine;
/**
 * Measure text dimensions from pre-segmented lines.
 * Returns `{ width: 0, height: 0 }` for empty text.
 */
export declare function measureTextFromSegments(segmentedLines: VisualSegment[][], availableWidth: number, wrap: WrapMode): {
    width: number;
    height: number;
};
/**
 * Lays out a single line of text, wrapping at grapheme boundaries to fit
 * within `maxWidth` terminal columns.
 *
 * Returns an array of `VisualLine` objects, each carrying the wrapped text,
 * its total display width, and the individual grapheme segments. Downstream
 * consumers (rendering, measurement) never need to re-segment.
 */
export declare function layoutLine(line: string, maxWidth: number): VisualLine[];
/**
 * Lays out a single line of text, wrapping at word boundaries.
 *
 * String-level counterpart of `layoutWordWrapFromSegments` — see that
 * function for the wrapping algorithm.
 */
export declare function layoutWords(line: string, maxWidth: number): VisualLine[];
/** Wrap modes usable for styled-span layout. */
export type SpanWrapMode = "wrap" | "word" | "none";
/**
 * Lay out a sequence of styled spans into visual lines.
 *
 * Spans form one continuous text flow: wrapping may split a span and
 * break at boundaries between spans. `"\n"` inside span text is a hard
 * break. Segment-level span indices are preserved so rendering can
 * resolve styles per span.
 */
export declare function layoutStyledSpans(spans: readonly StyledSpan[], maxWidth: number, wrapMode: SpanWrapMode): StyledVisualLine[];
/**
 * Measure styled spans for layout. Mirrors `measureTextFromSegments`
 * semantics per wrap mode ("none" returns the full intrinsic width).
 */
export declare function measureStyledSpans(spans: readonly StyledSpan[], availableWidth: number, wrapMode: SpanWrapMode): {
    width: number;
    height: number;
};
/**
 * Measures text for layout purposes.
 * Returns the width and height needed to display the text.
 *
 * @param text - The text to measure
 * @param availableWidth - Available width for wrapping
 * @param wrap - Wrapping mode: "wrap" for grapheme wrapping, "word" for word
 *   wrapping, "none" for full intrinsic width, or truncate modes for single line
 */
export declare function measureText(text: string, availableWidth: number, wrap: WrapMode): {
    width: number;
    height: number;
};
/**
 * Truncates a line to fit within `maxWidth` terminal columns, adding an
 * ellipsis when truncation occurs. Returns a `VisualLine` with pre-segmented
 * grapheme data so the caller never needs to re-segment.
 *
 * @param line - The source line
 * @param maxWidth - Maximum display width in terminal columns
 * @param mode - Direction of truncation
 */
export declare function truncateLine(line: string, maxWidth: number, mode: "truncate" | "truncate-end" | "truncate-start"): VisualLine;
//# sourceMappingURL=text.d.ts.map