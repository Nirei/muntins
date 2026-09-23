// Rendering utilities: style inheritance, borders, text rendering, terminal control
import { BOLD, DEFAULT_COLOR, DIM, INVERSE, ITALIC, STRIKETHROUGH, UNDERLINE, } from "./buffer.js";
import { rectContains, rectOverlaps, } from "./rects.js";
/**
 * Default inherited style values.
 * Used at the root when no parent style exists.
 */
export const DEFAULT_INHERITED_STYLE = {
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
/**
 * Resolve an inheritable value (color or boolean).
 * Returns the inherited value if the prop is undefined or "inherit".
 */
export function resolveInheritable(value, inherited) {
    if (value === undefined || value === "inherit") {
        return inherited;
    }
    if (typeof value === "function") {
        const resolved = value();
        return resolved === undefined || resolved === "inherit"
            ? inherited
            : resolved;
    }
    return value;
}
/**
 * Border character sets for each style.
 */
export const BORDER_CHARS = {
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
export function parseBorderProp(border) {
    if (border === undefined || border === false) {
        return {
            borderTop: false,
            borderEnd: false,
            borderBottom: false,
            borderStart: false,
        };
    }
    if (border === true || typeof border === "string") {
        return {
            borderTop: true,
            borderEnd: true,
            borderBottom: true,
            borderStart: true,
        };
    }
    // Selective borders object - map right to end, left to start
    return {
        borderTop: border.top ?? false,
        borderEnd: border.right ?? false,
        borderBottom: border.bottom ?? false,
        borderStart: border.left ?? false,
    };
}
/**
 * Determine the border style name from props.
 */
export function getBorderStyleName(border, borderStyle) {
    if (borderStyle)
        return borderStyle;
    if (typeof border === "string")
        return border;
    return "single";
}
/**
 * Get the character for a corner position based on which adjacent edges exist.
 * Returns corner char if both edges exist, edge char if one exists, undefined if neither.
 */
function getCornerChar(chars, hasEdge1, hasEdge2, corner, edge1Char, edge2Char) {
    if (hasEdge1 && hasEdge2)
        return corner;
    if (hasEdge1)
        return edge1Char;
    if (hasEdge2)
        return edge2Char;
    return undefined;
}
/**
 * Render border onto the buffer.
 * Uses correct corner logic: corners only render when both adjacent edges exist.
 */
export function renderBorder(buffer, rect, borders, styleName, fg, bg, clip) {
    const { screenX: x, screenY: y, width, height } = rect;
    const chars = BORDER_CHARS[styleName];
    const { borderTop: top, borderEnd: end, borderBottom: bottom, borderStart: start, } = borders;
    if (top) {
        const startCol = start ? x + 1 : x;
        const endCol = end ? x + width - 1 : x + width;
        for (let col = startCol; col < endCol; col++) {
            if (rectContains(clip, col, y)) {
                buffer.set(col, y, chars.h, fg, bg, 0);
            }
        }
    }
    if (bottom) {
        const startCol = start ? x + 1 : x;
        const endCol = end ? x + width - 1 : x + width;
        for (let col = startCol; col < endCol; col++) {
            if (rectContains(clip, col, y + height - 1)) {
                buffer.set(col, y + height - 1, chars.h, fg, bg, 0);
            }
        }
    }
    if (start) {
        const startRow = top ? y + 1 : y;
        const endRow = bottom ? y + height - 1 : y + height;
        for (let row = startRow; row < endRow; row++) {
            if (rectContains(clip, x, row)) {
                buffer.set(x, row, chars.v, fg, bg, 0);
            }
        }
    }
    if (end) {
        const startRow = top ? y + 1 : y;
        const endRow = bottom ? y + height - 1 : y + height;
        for (let row = startRow; row < endRow; row++) {
            if (rectContains(clip, x + width - 1, row)) {
                buffer.set(x + width - 1, row, chars.v, fg, bg, 0);
            }
        }
    }
    const corners = [
        [x, y, top, start, chars.tl, chars.h, chars.v], // top-left
        [x + width - 1, y, top, end, chars.tr, chars.h, chars.v], // top-right
        [x, y + height - 1, bottom, start, chars.bl, chars.h, chars.v], // bottom-left
        [x + width - 1, y + height - 1, bottom, end, chars.br, chars.h, chars.v], // bottom-right
    ];
    for (const [cx, cy, hasHoriz, hasVert, corner, hChar, vChar] of corners) {
        const char = getCornerChar(chars, hasHoriz, hasVert, corner, hChar, vChar);
        if (char && rectContains(clip, cx, cy)) {
            buffer.set(cx, cy, char, fg, bg, 0);
        }
    }
}
/**
 * Computes the modifier bitmask from text props using inherited styles.
 */
function computeModifiers(props, inherited) {
    let mods = 0;
    if (resolveInheritable(props.bold, inherited.bold))
        mods |= BOLD;
    if (resolveInheritable(props.dim, inherited.dim))
        mods |= DIM;
    if (resolveInheritable(props.italic, inherited.italic))
        mods |= ITALIC;
    if (resolveInheritable(props.underline, inherited.underline))
        mods |= UNDERLINE;
    if (resolveInheritable(props.strikethrough, inherited.strikethrough))
        mods |= STRIKETHROUGH;
    if (resolveInheritable(props.inverse, inherited.inverse))
        mods |= INVERSE;
    return mods;
}
export function fillClippedRect(buffer, rect, clip, fg, bg, modifiers) {
    const { screenX: x, screenY: y, width, height } = rect;
    const fillX = Math.max(x, clip.x);
    const fillY = Math.max(y, clip.y);
    const fillRight = Math.min(x + width, clip.x + clip.width);
    const fillBottom = Math.min(y + height, clip.y + clip.height);
    const fillWidth = fillRight - fillX;
    const fillHeight = fillBottom - fillY;
    if (fillWidth > 0 && fillHeight > 0) {
        buffer.fillRect(fillX, fillY, fillWidth, fillHeight, " ", fg, bg, modifiers);
    }
}
/**
 * Renders pre-laid-out visual lines into the buffer with styling.
 * Fills the entire area with background color first to clear any stale content.
 *
 * This is a pure painting function — all text segmentation and layout
 * (wrapping/truncation) must be done before calling this.
 */
export function renderText(buffer, rect, displayLines, props, inherited, clip) {
    if (!rectOverlaps(rect, clip))
        return;
    const { screenX: x, screenY: y, width, height } = rect;
    const fg = resolveInheritable(props.color, inherited.color);
    const bg = resolveInheritable(props.backgroundColor, inherited.backgroundColor);
    const modifiers = computeModifiers(props, inherited);
    fillClippedRect(buffer, rect, clip, fg, bg, modifiers);
    for (let row = 0; row < Math.min(displayLines.length, height); row++) {
        const screenY = y + row;
        if (screenY < clip.y || screenY >= clip.y + clip.height)
            continue;
        const visualLine = displayLines[row];
        let col = x;
        for (const seg of visualLine.segments) {
            if (col >= clip.x &&
                col + seg.displayWidth <= clip.x + clip.width &&
                col < clip.x + clip.width) {
                buffer.set(col, screenY, seg.grapheme, fg, bg, modifiers);
            }
            col += seg.displayWidth;
            if (col >= clip.x + clip.width)
                break;
        }
    }
}
/**
 * Enter TUI mode (display setup).
 *
 * Optionally enters alternate screen buffer, hides cursor, clears screen,
 * and moves cursor home.
 */
export function enterTuiMode(stdout, options) {
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
export function exitTuiMode(stdout, options) {
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
export function flushFrame(stdout, content) {
    if (content.length === 0)
        return;
    stdout.write(content);
}
//# sourceMappingURL=render.js.map