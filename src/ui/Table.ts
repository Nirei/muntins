import type { Buffer } from "../core/buffer.ts";
import { DEFAULT_FLEX_STYLE, type ReactiveFlexStyle } from "../core/layout.ts";
import type { Rect, ScreenRect } from "../core/rects.ts";
import {
  BORDER_CHARS,
  type InheritedStyle,
  type TextRenderProps,
  renderStyledText,
  renderText,
} from "../core/render.ts";
import { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor, resolve } from "../core/signals.ts";
import {
  type StyledSpan,
  type StyledVisualLine,
  type VisualLine,
  layoutStyledSpans,
  layoutWords,
} from "../core/text.ts";
import { theme } from "../core/theme.ts";

/** Column alignment within its cell. */
export type ColumnAlign = "left" | "center" | "right";

/** A table column definition. */
export interface TableColumn {
  header: string;
  align?: ColumnAlign;
}

/** Cell content: plain text or styled spans. */
export type TableCell = string | StyledSpan[];

/** Rows of cells; rows may be shorter than the column list (ragged). */
export type CellMatrix = readonly TableCell[][];

/** Props for the Table component. */
export interface TableProps {
  columns: MaybeAccessor<TableColumn[]>;
  rows: MaybeAccessor<CellMatrix>;
  /** Style overrides */
  style?: Partial<ReactiveFlexStyle>;
}

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
export function computeColumnWidths(
  minWidths: readonly number[],
  maxContentWidths: readonly number[],
  availableWidth: number,
): number[] {
  const count = minWidths.length;
  if (count === 0) return [];

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

  const widths = maxContentWidths.map((max, i) =>
    Math.max(
      mins[i],
      max - Math.floor((shrinkable[i] * deficit) / totalShrinkable),
    ),
  );

  // Fix rounding: distribute the remainder to (or from) the widest columns
  let remainder = availableWidth - widths.reduce((a, b) => a + b, 0);
  const order = widths
    .map((w, i) => ({ w, i }))
    .sort((a, b) => b.w - a.w || a.i - b.i);
  while (remainder !== 0) {
    let moved = false;
    for (const { i } of order) {
      if (remainder === 0) break;
      if (remainder > 0 && widths[i] < maxContentWidths[i]) {
        widths[i] += 1;
        remainder -= 1;
        moved = true;
      } else if (remainder < 0 && widths[i] > mins[i]) {
        widths[i] -= 1;
        remainder += 1;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return widths;
}

/** A laid-out table cell. */
interface LaidOutCell {
  lines: readonly (VisualLine | StyledVisualLine)[];
  styled: boolean;
  spans?: readonly StyledSpan[];
}

function isStyled(cell: TableCell | undefined): cell is StyledSpan[] {
  return Array.isArray(cell);
}

function plainWidth(text: string): number {
  return layoutWords(text, Number.POSITIVE_INFINITY)[0].displayWidth;
}

/** Max-content width of a cell: longest line, no wrapping. */
function cellMaxWidth(cell: TableCell | undefined): number {
  if (cell === undefined) return 0;
  if (isStyled(cell)) {
    const lines = layoutStyledSpans(cell, Number.POSITIVE_INFINITY, "none");
    let width = 0;
    for (const line of lines) width = Math.max(width, line.displayWidth);
    return width;
  }
  let width = 0;
  for (const line of cell.split("\n")) {
    width = Math.max(width, plainWidth(line));
  }
  return width;
}

/** Min-content width of a cell: longest unbreakable word. */
function cellMinWidth(cell: TableCell | undefined): number {
  if (cell === undefined) return 1;
  let minWidth = 1;
  const texts = isStyled(cell) ? cell.map((span) => span.text) : [cell];
  for (const text of texts) {
    for (const line of text.split("\n")) {
      for (const word of line.split(/\s+/)) {
        if (word !== "") minWidth = Math.max(minWidth, plainWidth(word));
      }
    }
  }
  return minWidth;
}

function layoutCell(cell: TableCell | undefined, width: number): LaidOutCell {
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

interface TableLayout {
  columns: TableColumn[];
  widths: number[];
  headerLines: LaidOutCell[];
  bodyRows: LaidOutCell[][];
  height: number;
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
export function Table(props: TableProps): Node {
  const getColumns = (): TableColumn[] => resolve(props.columns);
  const getRows = (): CellMatrix => resolve(props.rows);

  let cache: { key: string; layout: TableLayout } | null = null;

  function headerProps(): TextRenderProps {
    const slice = theme("table--header");
    return {
      bold: (slice.bold as boolean | undefined) ?? true,
      color: slice.color as TextRenderProps["color"],
    };
  }

  function computeLayout(availableWidth: number): TableLayout {
    const columns = getColumns();
    const rows = getRows();
    const key = `${availableWidth}:${columns.length}:${rows.length}`;
    if (cache && cache.key === key) return cache.layout;

    const count = columns.length;
    const maxContent: number[] = [];
    const minWidths: number[] = [];
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
    const widths = computeColumnWidths(minWidths, maxContent, innerWidth).map(
      (w) => Math.max(1, w),
    );

    const headerLines = columns.map((column, c) =>
      layoutCell(column.header, widths[c]),
    );
    const bodyRows = rows.map((row) =>
      columns.map((_, c) => layoutCell(row[c], widths[c])),
    );

    let height = 1; // top border
    height += Math.max(1, ...headerLines.map((cell) => cell.lines.length));
    height += 1; // header separator
    for (const row of bodyRows) {
      height += Math.max(1, ...row.map((cell) => cell.lines.length));
    }
    height += 1; // bottom border

    const layout: TableLayout = {
      columns,
      widths,
      headerLines,
      bodyRows,
      height,
    };
    cache = { key, layout };
    return layout;
  }

  function tableWidth(widths: readonly number[]): number {
    // border + (padding + content + padding + separator) per column
    return 2 + widths.reduce((sum, w) => sum + w + 2 * CELL_PADDING + 1, -1);
  }

  return new Node({
    style: { ...DEFAULT_FLEX_STYLE, alignSelf: "flex-start" },

    measure(availableWidth: number, _availableHeight: number) {
      const laid = computeLayout(
        availableWidth === Number.POSITIVE_INFINITY
          ? tableWidthFromContent()
          : availableWidth,
      );
      return {
        width: Math.min(tableWidth(laid.widths), availableWidth),
        height: laid.height,
      };
    },

    render(
      bounds: ScreenRect,
      buffer: Buffer,
      inherited: InheritedStyle,
      clip: Rect,
    ) {
      const laid = computeLayout(bounds.width);
      drawTable(laid, bounds, buffer, inherited, clip, headerProps());
    },
  });

  function tableWidthFromContent(): number {
    const columns = getColumns();
    const rows = getRows();
    let width = 2;
    for (let c = 0; c < columns.length; c++) {
      let max = cellMaxWidth(columns[c].header);
      for (const row of rows) max = Math.max(max, cellMaxWidth(row[c]));
      width += max + 2 * CELL_PADDING + 1;
    }
    return width - 1;
  }
}

function drawTable(
  laid: TableLayout,
  bounds: ScreenRect,
  buffer: Buffer,
  inherited: InheritedStyle,
  clip: Rect,
  headerProps: TextRenderProps,
): void {
  const { widths, columns, headerLines, bodyRows } = laid;
  const chars = BORDER_CHARS.single;
  const borderColor =
    (theme("table").borderColor as typeof inherited.borderColor) ??
    inherited.borderColor;

  const colStart = (c: number): number =>
    bounds.screenX +
    1 +
    widths.slice(0, c).reduce((sum, w) => sum + w + 2 * CELL_PADDING + 1, 0);

  const inClip = (x: number, y: number): boolean =>
    x >= clip.x &&
    x < clip.x + clip.width &&
    y >= clip.y &&
    y < clip.y + clip.height;

  const put = (x: number, y: number, ch: string): void => {
    if (inClip(x, y))
      buffer.set(x, y, ch, borderColor, inherited.backgroundColor, 0);
  };

  const horizontalLine = (
    y: number,
    left: string,
    mid: string,
    right: string,
  ): void => {
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

  const verticals = (y: number): void => {
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

  const renderCellContent = (
    cell: LaidOutCell,
    col: number,
    rowY: number,
    propsOverride: TextRenderProps | undefined,
  ): void => {
    const width = widths[col];
    const align = columns[col].align ?? "left";
    for (let i = 0; i < cell.lines.length; i++) {
      const line = cell.lines[i];
      let offset: number;
      if (align === "right") offset = width - line.displayWidth;
      else if (align === "center")
        offset = Math.floor((width - line.displayWidth) / 2);
      else offset = 0;
      const rect: ScreenRect = {
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
        renderStyledText(
          buffer,
          rect,
          [line as StyledVisualLine],
          cell.spans,
          propsOverride ?? {},
          inherited,
          clip,
        );
      } else {
        renderText(
          buffer,
          rect,
          [line as VisualLine],
          propsOverride ?? {},
          inherited,
          clip,
        );
      }
    }
  };

  let y = bounds.screenY;

  horizontalLine(y, chars.tl, "┬", chars.tr);
  y += 1;

  const headerHeight = Math.max(
    1,
    ...headerLines.map((cell) => cell.lines.length),
  );
  for (let row = 0; row < headerHeight; row++) verticals(y + row);
  for (let c = 0; c < widths.length; c++) {
    renderCellContent(headerLines[c], c, y, headerProps);
  }
  y += headerHeight;

  horizontalLine(y, "├", "┼", "┤");
  y += 1;

  for (const row of bodyRows) {
    const rowHeight = Math.max(1, ...row.map((cell) => cell.lines.length));
    for (let line = 0; line < rowHeight; line++) verticals(y + line);
    for (let c = 0; c < widths.length; c++) {
      renderCellContent(row[c], c, y, undefined);
    }
    y += rowHeight;
  }

  horizontalLine(y, chars.bl, "┴", chars.br);
}
