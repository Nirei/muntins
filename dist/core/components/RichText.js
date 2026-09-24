import { DEFAULT_FLEX_STYLE } from "../layout.js";
import { renderStyledText } from "../render.js";
import { Node } from "../runtime/Node.js";
import { getActiveContext } from "../runtime/context.js";
import { createEffect, resolve } from "../signals.js";
import { layoutStyledSpans, measureStyledSpans, } from "../text.js";
/**
 * Creates a leaf node that displays styled text runs (spans).
 *
 * Spans form one continuous text flow: `"\\n"` inside span text is a hard
 * break, wrapping may split spans and cross span boundaries, and every
 * grapheme keeps its span's style (span value > node prop > inherited
 * style). Defaults to word-boundary wrapping, unlike `Text` which wraps at
 * grapheme boundaries — use RichText for prose, Text for single-style runs.
 */
export function RichText(props) {
    const { spans, color, backgroundColor, bold, dim, italic, underline, strikethrough, inverse, wrap, ref, onKeyPress, onMousePress, onMouseRelease, onMouseMove, onScroll, onHover, onActivate, } = props;
    const getSpans = () => resolve(spans);
    const getWrap = () => resolve(wrap) ?? "word";
    let linesCache = null;
    const node = new Node({
        style: DEFAULT_FLEX_STYLE,
        focusable: false,
        onKeyPress,
        onMousePress,
        onMouseRelease,
        onMouseMove,
        onScroll,
        onHover,
        onActivate,
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
            return measureStyledSpans(getSpans(), availableWidth, getWrap());
        },
        render(bounds, buffer, inherited, clip) {
            const currentSpans = getSpans();
            const wrapMode = getWrap();
            const cached = linesCache;
            const lines = cached?.spans === currentSpans &&
                cached.width === bounds.width &&
                cached.wrapMode === wrapMode
                ? cached.lines
                : layoutStyledSpans(currentSpans, bounds.width, wrapMode);
            linesCache = {
                spans: currentSpans,
                width: bounds.width,
                wrapMode,
                lines,
            };
            renderStyledText(buffer, bounds, lines, currentSpans, {
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
    // If spans are reactive, track them and schedule flush when they change
    if (typeof spans === "function") {
        const ctx = getActiveContext();
        if (ctx) {
            createEffect(() => {
                getSpans(); // Track the spans signal
                ctx.app.scheduleFlush(); // Schedule repaint when it changes
            });
        }
    }
    return node;
}
//# sourceMappingURL=RichText.js.map