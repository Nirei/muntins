import { DEFAULT_FLEX_STYLE } from "../core/layout.js";
import { BORDER_CHARS, renderStyledText, renderText, } from "../core/render.js";
import { Node } from "../core/runtime/Node.js";
import { resolve } from "../core/signals.js";
import { layoutStyledSpans, layoutWords, } from "../core/text.js";
import { theme } from "../core/theme.js";
const CELL_PADDING = 1;
/**
 * Distribute `availableWidth` across table columns.
 *
 * Pure function. When the sum of max-content widths fits, max-content is
 * used unchanged. Otherwise columns shrink proportionally toward their
 * min-content widths (longest unbreakable word), never below min-content;
 * the rounding remainder goes to the widest columns so the total equals
 * `availableWidth` exactly. When even the min-content sum exceeds the
 * available width, min-content widths are returned (the table overflows
 * and the caller clips it).
 */
export function computeColumnWidths(minWidths, maxContentWidths, availableWidth) {
    const count = minWidths.length;
    if (count === 0)
        return [];
    const sumMax = maxContentWidths.reduce((a, b) => a + b, 0);
    if (sumMax <= availableWidth) {
        return maxContentWidths.slice();
    }
    const mins = minWidths.map((w) => Math.max(1, w));
    const sumMin = mins.reduce((a, b) => a + b, 0);
    if (availableWidth <= sumMin) {
        return mins.slice();
    }
    // Shrink proportionally: each column loses its share of the deficit,
    // weighted by its shrinkable slack (max - min).
    const shrinkable = maxContentWidths.map((max, i) => max - mins[i]);
    const totalShrinkable = shrinkable.reduce((a, b) => a + b, 0);
    const deficit = sumMax - availableWidth;
    const widths = maxContentWidths.map((max, i) => Math.max(mins[i], max - Math.floor((shrinkable[i] * deficit) / totalShrinkable)));
    // Fix rounding: distribute the remainder to (or from) the widest columns
    let remainder = availableWidth - widths.reduce((a, b) => a + b, 0);
    const order = widths
        .map((w, i) => ({ w, i }))
        .sort((a, b) => b.w - a.w || a.i - b.i);
    while (remainder !== 0) {
        let moved = false;
        for (const { i } of order) {
            if (remainder === 0)
                break;
            if (remainder > 0 && widths[i] < maxContentWidths[i]) {
                widths[i] += 1;
                remainder -= 1;
                moved = true;
            }
            else if (remainder < 0 && widths[i] > mins[i]) {
                widths[i] -= 1;
                remainder += 1;
                moved = true;
            }
        }
        if (!moved)
            break;
    }
    return widths;
}
function isStyled(cell) {
    return Array.isArray(cell);
}
function plainWidth(text) {
    return layoutWords(text, Number.POSITIVE_INFINITY)[0].displayWidth;
}
/** Max-content width of a cell: longest line, no wrapping. */
function cellMaxWidth(cell) {
    if (cell === undefined)
        return 0;
    if (isStyled(cell)) {
        const lines = layoutStyledSpans(cell, Number.POSITIVE_INFINITY, "none");
        let width = 0;
        for (const line of lines)
            width = Math.max(width, line.displayWidth);
        return width;
    }
    let width = 0;
    for (const line of cell.split("\n")) {
        width = Math.max(width, plainWidth(line));
    }
    return width;
}
/** Min-content width of a cell: longest unbreakable word. */
function cellMinWidth(cell) {
    if (cell === undefined)
        return 1;
    let minWidth = 1;
    const texts = isStyled(cell) ? cell.map((span) => span.text) : [cell];
    for (const text of texts) {
        for (const line of text.split("\n")) {
            for (const word of line.split(/\s+/)) {
                if (word !== "")
                    minWidth = Math.max(minWidth, plainWidth(word));
            }
        }
    }
    return minWidth;
}
function layoutCell(cell, width) {
    if (isStyled(cell)) {
        return {
            lines: layoutStyledSpans(cell, width, "word"),
            styled: true,
            spans: cell,
        };
    }
    const text = cell ?? "";
    return {
        lines: text.split("\n").flatMap((line) => layoutWords(line, width)),
        styled: false,
    };
}
/**
 * A table with aligned columns, an emphasized header row, and a grid drawn
 * with box-drawing characters.
 *
 * Column widths come from content: each column takes its max-content width
 * when everything fits, otherwise widths shrink toward min-content via
 * `computeColumnWidths`. Cells word-wrap within their column and align
 * left/center/right per column; the header is bold (theme `table--header`).
 * Implemented as a leaf node with a custom `measure()`/`render()` pair —
 * the same pattern `Text` uses.
 *
 * @example
 * ```typescript
 * Table({
 *   columns: [
 *     { header: "Name" },
 *     { header: "Score", align: "right" },
 *   ],
 *   rows: [["ada", "10"], ["grace", "9"]],
 * });
 * ```
 */
export function Table(props) {
    const getColumns = () => resolve(props.columns);
    const getRows = () => resolve(props.rows);
    let cache = null;
    function headerProps() {
        const slice = theme("table--header");
        return {
            bold: slice.bold ?? true,
            color: slice.color,
        };
    }
    function computeLayout(availableWidth) {
        const columns = getColumns();
        const rows = getRows();
        const key = `${availableWidth}:${columns.length}:${rows.length}`;
        if (cache && cache.key === key)
            return cache.layout;
        const count = columns.length;
        const maxContent = [];
        const minWidths = [];
        for (let c = 0; c < count; c++) {
            let max = cellMaxWidth(columns[c].header);
            let min = cellMinWidth(columns[c].header);
            for (const row of rows) {
                max = Math.max(max, cellMaxWidth(row[c]));
                min = Math.max(min, cellMinWidth(row[c]));
            }
            maxContent.push(max);
            minWidths.push(min);
        }
        const innerWidth = Math.max(0, availableWidth - count - 1); // grid lines
        const widths = computeColumnWidths(minWidths, maxContent, innerWidth).map((w) => Math.max(1, w));
        const headerLines = columns.map((column, c) => layoutCell(column.header, widths[c]));
        const bodyRows = rows.map((row) => columns.map((_, c) => layoutCell(row[c], widths[c])));
        let height = 1; // top border
        height += Math.max(1, ...headerLines.map((cell) => cell.lines.length));
        height += 1; // header separator
        for (const row of bodyRows) {
            height += Math.max(1, ...row.map((cell) => cell.lines.length));
        }
        height += 1; // bottom border
        const layout = {
            columns,
            widths,
            headerLines,
            bodyRows,
            height,
        };
        cache = { key, layout };
        return layout;
    }
    function tableWidth(widths) {
        // border + (padding + content + padding + separator) per column
        return 2 + widths.reduce((sum, w) => sum + w + 2 * CELL_PADDING + 1, -1);
    }
    return new Node({
        style: { ...DEFAULT_FLEX_STYLE, alignSelf: "flex-start" },
        measure(availableWidth, _availableHeight) {
            const laid = computeLayout(availableWidth === Number.POSITIVE_INFINITY
                ? tableWidthFromContent()
                : availableWidth);
            return {
                width: Math.min(tableWidth(laid.widths), availableWidth),
                height: laid.height,
            };
        },
        render(bounds, buffer, inherited, clip) {
            const laid = computeLayout(bounds.width);
            drawTable(laid, bounds, buffer, inherited, clip, headerProps());
        },
    });
    function tableWidthFromContent() {
        const columns = getColumns();
        const rows = getRows();
        let width = 2;
        for (let c = 0; c < columns.length; c++) {
            let max = cellMaxWidth(columns[c].header);
            for (const row of rows)
                max = Math.max(max, cellMaxWidth(row[c]));
            width += max + 2 * CELL_PADDING + 1;
        }
        return width - 1;
    }
}
function drawTable(laid, bounds, buffer, inherited, clip, headerProps) {
    const { widths, columns, headerLines, bodyRows } = laid;
    const chars = BORDER_CHARS.single;
    const borderColor = theme("table").borderColor ??
        inherited.borderColor;
    const colStart = (c) => bounds.screenX +
        1 +
        widths.slice(0, c).reduce((sum, w) => sum + w + 2 * CELL_PADDING + 1, 0);
    const inClip = (x, y) => x >= clip.x &&
        x < clip.x + clip.width &&
        y >= clip.y &&
        y < clip.y + clip.height;
    const put = (x, y, ch) => {
        if (inClip(x, y))
            buffer.set(x, y, ch, borderColor, inherited.backgroundColor, 0);
    };
    const horizontalLine = (y, left, mid, right) => {
        put(bounds.screenX, y, left);
        let x = bounds.screenX + 1;
        for (let c = 0; c < widths.length; c++) {
            for (let i = 0; i < widths[c] + 2 * CELL_PADDING; i++) {
                put(x, y, chars.h);
                x++;
            }
            if (c < widths.length - 1) {
                put(x, y, mid);
                x++;
            }
        }
        put(x, y, right);
    };
    const verticals = (y) => {
        put(bounds.screenX, y, chars.v);
        let x = bounds.screenX + 1;
        for (let c = 0; c < widths.length; c++) {
            x += widths[c] + 2 * CELL_PADDING;
            if (c < widths.length - 1) {
                put(x, y, chars.v);
                x++;
            }
        }
        put(x, y, chars.v);
    };
    const renderCellContent = (cell, col, rowY, propsOverride) => {
        const width = widths[col];
        const align = columns[col].align ?? "left";
        for (let i = 0; i < cell.lines.length; i++) {
            const line = cell.lines[i];
            let offset;
            if (align === "right")
                offset = width - line.displayWidth;
            else if (align === "center")
                offset = Math.floor((width - line.displayWidth) / 2);
            else
                offset = 0;
            const rect = {
                x: 0,
                y: 0,
                screenX: colStart(col) + CELL_PADDING + Math.max(0, offset),
                screenY: rowY + i,
                // Shrink by the alignment offset so the background fill never
                // spills past the column into the padding or the grid border.
                width: Math.max(1, width - Math.max(0, offset)),
                height: 1,
            };
            if (cell.styled && cell.spans) {
                renderStyledText(buffer, rect, [line], cell.spans, propsOverride ?? {}, inherited, clip);
            }
            else {
                renderText(buffer, rect, [line], propsOverride ?? {}, inherited, clip);
            }
        }
    };
    let y = bounds.screenY;
    horizontalLine(y, chars.tl, "┬", chars.tr);
    y += 1;
    const headerHeight = Math.max(1, ...headerLines.map((cell) => cell.lines.length));
    for (let row = 0; row < headerHeight; row++)
        verticals(y + row);
    for (let c = 0; c < widths.length; c++) {
        renderCellContent(headerLines[c], c, y, headerProps);
    }
    y += headerHeight;
    horizontalLine(y, "├", "┼", "┤");
    y += 1;
    for (const row of bodyRows) {
        const rowHeight = Math.max(1, ...row.map((cell) => cell.lines.length));
        for (let line = 0; line < rowHeight; line++)
            verticals(y + line);
        for (let c = 0; c < widths.length; c++) {
            renderCellContent(row[c], c, y, undefined);
        }
        y += rowHeight;
    }
    horizontalLine(y, chars.bl, "┴", chars.br);
}
//# sourceMappingURL=Table.js.map