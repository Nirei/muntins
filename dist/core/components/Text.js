import { DEFAULT_FLEX_STYLE } from "../layout.js";
import { renderText } from "../render.js";
import { Node } from "../runtime/Node.js";
import { getActiveContext } from "../runtime/context.js";
import { createEffect, resolve } from "../signals.js";
import { layoutLineFromSegments, layoutWordWrapFromSegments, measureTextFromSegments, segmentText, truncateLineFromSegments, } from "../text.js";
/**
 * Creates a Text node - a leaf node that displays text content.
 *
 * Text is measured based on its content and renders text with styling.
 * Content and style props can be static values or reactive getters.
 */
export function Text(props) {
    const { content, color, backgroundColor, bold, dim, italic, underline, strikethrough, inverse, focusable, autoFocus, ref, onKeyPress, onMousePress, onMouseRelease, onMouseMove, onScroll, onHover, onActivate, wrap, } = props;
    const getContent = () => resolve(content);
    const getWrap = () => resolve(wrap) ?? "wrap";
    function ensureSegments(node, text) {
        if (node._textSegments?.sourceText !== text) {
            node._textSegments = segmentText(text);
        }
        return node._textSegments.lines;
    }
    let displayLinesCache = null;
    const node = new Node({
        style: DEFAULT_FLEX_STYLE,
        focusable,
        autoFocus,
        onKeyPress,
        onMousePress,
        onMouseRelease,
        onMouseMove,
        onScroll,
        onHover,
        onActivate,
        activate: onActivate
            ? () => {
                const event = { type: "activate", target: node };
                onActivate(event);
            }
            : undefined,
        _inheritableProps: {
            color,
            backgroundColor,
            bold,
            dim,
            italic,
            underline,
            strikethrough,
            inverse,
        },
        measure(availableWidth, _availableHeight) {
            const text = getContent();
            const wrapMode = getWrap();
            const segmentedLines = ensureSegments(node, text);
            return measureTextFromSegments(segmentedLines, availableWidth, wrapMode);
        },
        render(bounds, buffer, inherited, clip) {
            const text = getContent();
            const wrapMode = getWrap();
            const segmentedLines = ensureSegments(node, text);
            const cached = displayLinesCache;
            const lines = cached?.sourceText === text &&
                cached.width === bounds.width &&
                cached.wrapMode === wrapMode
                ? cached.lines
                : wrapMode === "wrap"
                    ? segmentedLines.flatMap((line) => layoutLineFromSegments(line, bounds.width))
                    : wrapMode === "word"
                        ? segmentedLines.flatMap((line) => layoutWordWrapFromSegments(line, bounds.width))
                        : wrapMode === "none"
                            ? segmentedLines.map((line) => ({
                                text: line.map((s) => s.grapheme).join(""),
                                displayWidth: line.reduce((sum, s) => sum + s.displayWidth, 0),
                                segments: line,
                            }))
                            : segmentedLines.map((line) => truncateLineFromSegments(line, bounds.width, wrapMode));
            displayLinesCache = {
                sourceText: text,
                width: bounds.width,
                wrapMode,
                lines,
            };
            renderText(buffer, bounds, lines, {
                color,
                backgroundColor,
                bold,
                dim,
                italic,
                underline,
                strikethrough,
                inverse,
            }, inherited, clip);
        },
    });
    if (ref) {
        ref.current = node;
    }
    // If content is reactive, track it and schedule flush when it changes
    if (typeof content === "function") {
        const ctx = getActiveContext();
        if (ctx) {
            createEffect(() => {
                getContent(); // Track the content signal
                ctx.app.scheduleFlush(); // Schedule repaint when it changes
            });
        }
    }
    return node;
}
//# sourceMappingURL=Text.js.map