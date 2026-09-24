// Text editing utilities for grapheme-aware string manipulation
//
// These functions operate on grapheme clusters (user-perceived characters)
// rather than code points or UTF-16 code units. This ensures correct handling
// of emoji, combining marks, and other multi-code-point characters.
import { graphemeCount, graphemeDisplayWidth, graphemeSlice, graphemes, } from "./buffer.js";
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
export function textLength(text) {
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
export function textSlice(text, start, end) {
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
export function textInsert(text, pos, insert) {
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
export function textDelete(text, start, end) {
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
export function displayWidthToPosition(text, pos) {
    let width = 0;
    let i = 0;
    for (const grapheme of graphemes(text)) {
        if (i >= pos)
            break;
        width += graphemeDisplayWidth(grapheme);
        i++;
    }
    return width;
}
const ELLIPSIS = { grapheme: "…", displayWidth: 1 };
/**
 * Segments a line of text into grapheme clusters with precomputed display widths.
 *
 * This is the single point where `graphemes()` is called for layout/render
 * operations. All other functions (`layoutLine`, `truncateLine`, `measureText`)
 * build on top of this instead of calling `graphemes()` directly.
 */
export function segmentLine(line) {
    const segments = [];
    for (const g of graphemes(line)) {
        segments.push({ grapheme: g, displayWidth: graphemeDisplayWidth(g) });
    }
    return segments;
}
/**
 * Segments all lines of a text string. Returns the source text and
 * a per-line array of `VisualSegment[]` for reuse across measure and render.
 */
export function segmentText(text) {
    const sourceLines = text.split("\n");
    const lines = [];
    for (const line of sourceLines) {
        lines.push(segmentLine(line));
    }
    return { sourceText: text, lines };
}
/**
 * Wrap pre-segmented lines at width boundaries. Skips the segmentation step
 * entirely — used when segments were already computed during measure.
 */
export function layoutLineFromSegments(segments, maxWidth) {
    if (maxWidth <= 0) {
        return segments.length > 0
            ? [segmentsToVisualLine(segments)]
            : [{ text: "", displayWidth: 0, segments: [] }];
    }
    if (segments.length === 0) {
        return [{ text: "", displayWidth: 0, segments: [] }];
    }
    const result = [];
    let currentSegments = [];
    let currentWidth = 0;
    for (const seg of segments) {
        if (currentWidth + seg.displayWidth > maxWidth &&
            currentSegments.length > 0) {
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
function isSpaceSegment(seg) {
    return seg.grapheme === " ";
}
function isWideSegment(seg) {
    return seg.displayWidth >= 2;
}
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
export function layoutWordWrapFromSegments(segments, maxWidth) {
    if (maxWidth <= 0 || segments.length === 0) {
        return segments.length > 0
            ? [segmentsToVisualLine(segments)]
            : [{ text: "", displayWidth: 0, segments: [] }];
    }
    const result = [];
    let lineStart = 0;
    let lastBreak = -1; // first segment of the next line
    let width = 0;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        // Record break opportunity: this segment can start a new line when the
        // previous one is a space (word boundary), or between wide graphemes
        // (CJK/emoji). Recorded before the overflow check so a segment that
        // itself overflows can still break before itself.
        if (i > lineStart &&
            !isSpaceSegment(seg) &&
            (isSpaceSegment(segments[i - 1]) ||
                isWideSegment(seg) ||
                isWideSegment(segments[i - 1]))) {
            lastBreak = i;
        }
        if (width + seg.displayWidth > maxWidth &&
            i > lineStart &&
            !isSpaceSegment(seg) &&
            seg.displayWidth <= maxWidth) {
            // Overflow: break at the last recorded opportunity if any,
            // otherwise at the grapheme boundary (oversized word fallback).
            const breakAt = lastBreak > lineStart ? lastBreak : i;
            let end = breakAt;
            while (end > lineStart && isSpaceSegment(segments[end - 1]))
                end--;
            result.push(segmentsToVisualLine(segments.slice(lineStart, end)));
            lineStart = breakAt;
            while (lineStart < segments.length &&
                isSpaceSegment(segments[lineStart])) {
                lineStart++;
            }
            if (lineStart >= segments.length)
                break;
            i = lineStart - 1; // for-loop increments
            lastBreak = -1;
            width = 0;
            continue;
        }
        width += seg.displayWidth;
    }
    if (lineStart < segments.length) {
        result.push(segmentsToVisualLine(segments.slice(lineStart)));
    }
    return result.length > 0
        ? result
        : [{ text: "", displayWidth: 0, segments: [] }];
}
/**
 * Truncate pre-segmented lines to fit maxWidth. Skips the segmentation step
 * entirely — used when segments were already computed during measure.
 */
export function truncateLineFromSegments(segments, maxWidth, mode) {
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
export function measureTextFromSegments(segmentedLines, availableWidth, wrap) {
    if (segmentedLines.length === 0) {
        return { width: 0, height: 0 };
    }
    if (wrap === "wrap" || wrap === "word") {
        const layout = wrap === "wrap" ? layoutLineFromSegments : layoutWordWrapFromSegments;
        const visualLines = segmentedLines.flatMap((line) => layout(line, availableWidth));
        let maxWidth = 0;
        for (const vl of visualLines) {
            if (vl.displayWidth > maxWidth)
                maxWidth = vl.displayWidth;
        }
        return {
            width: Math.min(maxWidth, availableWidth),
            height: visualLines.length,
        };
    }
    if (wrap === "none") {
        // Full intrinsic width, unclamped — callers clip via overflow
        let maxWidth = 0;
        for (const segments of segmentedLines) {
            const w = segmentsDisplayWidth(segments);
            if (w > maxWidth)
                maxWidth = w;
        }
        return { width: maxWidth, height: segmentedLines.length };
    }
    let maxWidth = 0;
    for (const segments of segmentedLines) {
        const w = segmentsDisplayWidth(segments);
        if (w > maxWidth)
            maxWidth = w;
    }
    return {
        width: Math.min(maxWidth, availableWidth),
        height: segmentedLines.length,
    };
}
function segmentsToVisualLine(segments) {
    let text = "";
    let displayWidth = 0;
    for (const s of segments) {
        text += s.grapheme;
        displayWidth += s.displayWidth;
    }
    return { text, displayWidth, segments };
}
function segmentsDisplayWidth(segments) {
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
export function layoutLine(line, maxWidth) {
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
    const result = [];
    let currentSegments = [];
    let currentWidth = 0;
    for (const seg of segments) {
        if (currentWidth + seg.displayWidth > maxWidth &&
            currentSegments.length > 0) {
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
 * Lays out a single line of text, wrapping at word boundaries.
 *
 * String-level counterpart of `layoutWordWrapFromSegments` — see that
 * function for the wrapping algorithm.
 */
export function layoutWords(line, maxWidth) {
    return layoutWordWrapFromSegments(segmentLine(line), maxWidth);
}
/**
 * Segment styled spans into source lines (split on hard `"\n"` breaks),
 * tagging every grapheme with its span index.
 */
function segmentSpans(spans) {
    const lines = [[]];
    for (let spanIndex = 0; spanIndex < spans.length; spanIndex++) {
        for (const grapheme of graphemes(spans[spanIndex].text)) {
            if (grapheme === "\n") {
                lines.push([]);
                continue;
            }
            lines[lines.length - 1].push({
                grapheme,
                displayWidth: graphemeDisplayWidth(grapheme),
                spanIndex,
            });
        }
    }
    return lines;
}
function styledLine(segments) {
    let text = "";
    let displayWidth = 0;
    for (const s of segments) {
        text += s.grapheme;
        displayWidth += s.displayWidth;
    }
    return { text, displayWidth, segments };
}
/**
 * Lay out a sequence of styled spans into visual lines.
 *
 * Spans form one continuous text flow: wrapping may split a span and
 * break at boundaries between spans. `"\n"` inside span text is a hard
 * break. Segment-level span indices are preserved so rendering can
 * resolve styles per span.
 */
export function layoutStyledSpans(spans, maxWidth, wrapMode) {
    const sourceLines = segmentSpans(spans);
    if (sourceLines.length === 1 && sourceLines[0].length === 0) {
        return [styledLine([])];
    }
    if (wrapMode === "none") {
        return sourceLines.map(styledLine);
    }
    return sourceLines.flatMap((line) => {
        const wrapped = layoutWordWrapFromSegments(line, maxWidth);
        return wrapped.map((visualLine) => styledLine(visualLine.segments.map((seg) => ({
            ...seg,
            spanIndex: seg.spanIndex,
        }))));
    });
}
/**
 * Measure styled spans for layout. Mirrors `measureTextFromSegments`
 * semantics per wrap mode ("none" returns the full intrinsic width).
 */
export function measureStyledSpans(spans, availableWidth, wrapMode) {
    const lines = layoutStyledSpans(spans, availableWidth, wrapMode);
    if (lines.length === 0)
        return { width: 0, height: 0 };
    let maxWidth = 0;
    for (const line of lines) {
        if (line.displayWidth > maxWidth)
            maxWidth = line.displayWidth;
    }
    return {
        width: wrapMode === "none" ? maxWidth : Math.min(maxWidth, availableWidth),
        height: lines.length,
    };
}
/**
 * Measures text for layout purposes.
 * Returns the width and height needed to display the text.
 *
 * @param text - The text to measure
 * @param availableWidth - Available width for wrapping
 * @param wrap - Wrapping mode: "wrap" for grapheme wrapping, "word" for word
 *   wrapping, "none" for full intrinsic width, or truncate modes for single line
 */
export function measureText(text, availableWidth, wrap) {
    if (text.length === 0) {
        return { width: 0, height: 0 };
    }
    const lines = text.split("\n");
    if (wrap === "wrap" || wrap === "word") {
        const layout = wrap === "wrap" ? layoutLine : layoutWords;
        const visualLines = lines.flatMap((line) => layout(line, availableWidth));
        let maxWidth = 0;
        for (const vl of visualLines) {
            if (vl.displayWidth > maxWidth)
                maxWidth = vl.displayWidth;
        }
        return {
            width: Math.min(maxWidth, availableWidth),
            height: visualLines.length,
        };
    }
    if (wrap === "none") {
        let intrinsicWidth = 0;
        for (const line of lines) {
            const w = segmentsDisplayWidth(segmentLine(line));
            if (w > intrinsicWidth)
                intrinsicWidth = w;
        }
        return { width: intrinsicWidth, height: lines.length };
    }
    let maxWidth = 0;
    for (const line of lines) {
        const w = segmentsDisplayWidth(segmentLine(line));
        if (w > maxWidth)
            maxWidth = w;
    }
    return {
        width: Math.min(maxWidth, availableWidth),
        height: lines.length,
    };
}
/**
 * Truncates a line from the end, adding ellipsis.
 */
function truncateEnd(segments, maxWidth) {
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
    const kept = [];
    let width = 0;
    for (const seg of segments) {
        if (width + seg.displayWidth > targetWidth)
            break;
        kept.push(seg);
        width += seg.displayWidth;
    }
    const result = [...kept, ELLIPSIS];
    return segmentsToVisualLine(result);
}
/**
 * Truncates a line from the start, adding ellipsis.
 */
function truncateStart(segments, maxWidth) {
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
    const kept = [];
    let width = 0;
    for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i];
        if (width + seg.displayWidth > targetWidth)
            break;
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
export function truncateLine(line, maxWidth, mode) {
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
//# sourceMappingURL=text.js.map