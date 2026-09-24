import { type ReactiveFlexStyle } from "../core/layout.ts";
import { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor } from "../core/signals.ts";
import { type StyledSpan } from "../core/text.ts";
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
export declare function computeColumnWidths(minWidths: readonly number[], maxContentWidths: readonly number[], availableWidth: number): number[];
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
export declare function Table(props: TableProps): Node;
//# sourceMappingURL=Table.d.ts.map