/**
 * All flexbox properties a node can have.
 * Numeric values are integers representing terminal cells.
 * Use null for maxWidth/maxHeight to indicate no constraint.
 *
 * Uses logical properties (start/end) instead of physical (left/right)
 * to enable future RTL support. In LTR mode: start=left, end=right.
 */
export interface FlexStyle {
    display: "flex" | "none" | "contents";
    flexDirection: "row" | "column";
    flexWrap: "nowrap" | "wrap";
    justifyContent: "flex-start" | "flex-end" | "center" | "space-between" | "space-around" | "space-evenly";
    alignItems: "flex-start" | "flex-end" | "center" | "stretch";
    alignContent: "flex-start" | "flex-end" | "center" | "stretch" | "space-between" | "space-around";
    alignSelf: "auto" | "flex-start" | "flex-end" | "center" | "stretch";
    flexGrow: number;
    flexShrink: number;
    flexBasis: number | "auto";
    width: number | "auto";
    height: number | "auto";
    minWidth: number | "auto";
    maxWidth: number | null;
    minHeight: number | "auto";
    maxHeight: number | null;
    paddingTop: number;
    paddingEnd: number;
    paddingBottom: number;
    paddingStart: number;
    marginTop: number;
    marginEnd: number;
    marginBottom: number;
    marginStart: number;
    gap: number;
    position: "relative" | "absolute";
    top: number | "auto";
    end: number | "auto";
    bottom: number | "auto";
    start: number | "auto";
    borderTop: boolean;
    borderEnd: boolean;
    borderBottom: boolean;
    borderStart: boolean;
    overflow: "visible" | "hidden";
}
/**
 * FlexStyle with reactive (getter function) support for all properties.
 * Box resolves these at render time, enabling dynamic layout updates via signals.
 */
export type ReactiveFlexStyle = {
    [K in keyof FlexStyle]: FlexStyle[K] | (() => FlexStyle[K]);
};
/**
 * Input to the layout algorithm.
 * Nodes either have children (container) or measure (leaf like Text).
 *
 * The measure function receives available dimensions (Infinity when unconstrained)
 * and returns the node's intrinsic size.
 */
export interface LayoutNode {
    style: Partial<FlexStyle>;
    children?: LayoutNode[];
    measure?: (availableWidth: number, availableHeight: number) => {
        width: number;
        height: number;
    };
}
import type { ScreenRect } from "./rects.ts";
/**
 * Output from the layout algorithm.
 *
 * x/y are relative to the parent's content area (used during layout).
 * screenX/screenY are absolute positions from root (set by finalizePositions).
 */
export interface LayoutResult extends ScreenRect {
    children: LayoutResult[];
}
/**
 * Default values for all flexbox properties.
 * Matches CSS flexbox spec defaults.
 */
export declare const DEFAULT_FLEX_STYLE: FlexStyle;
/**
 * Merges a partial style with defaults to produce a complete FlexStyle.
 */
export declare function resolveStyle(partial: Partial<FlexStyle>): FlexStyle;
/**
 * Distributes a total amount proportionally among weights using integer arithmetic.
 * Remainder goes to items with the largest fractional parts.
 *
 * @param total - Total amount to distribute
 * @param weights - Array of weights (e.g., flexGrow values)
 * @returns Array of distributed amounts (same length as weights)
 */
export declare function distribute(total: number, weights: number[]): number[];
/**
 * Computes flexbox layout for a tree of nodes.
 *
 * Uses a 3-pass algorithm:
 * 1. Build internal tree with resolved styles
 * 2. Pass 2 (bottom-up): Resolve intrinsic sizes
 * 3. Pass 3 (top-down): Resolve flex values, alignment, relative positions
 * 4. Finalize absolute screen coordinates
 *
 * This is a pure function with no side effects. Caching is handled at the
 * Renderer level, which has access to stable Node references and can track
 * when layout needs recomputation.
 *
 * @param node - Root of the layout tree
 * @param availableWidth - Available width in terminal cells
 * @param availableHeight - Available height in terminal cells
 * @returns Layout results with computed positions and dimensions
 */
export declare function computeLayout(node: LayoutNode, availableWidth: number, availableHeight: number): LayoutResult;
//# sourceMappingURL=layout.d.ts.map