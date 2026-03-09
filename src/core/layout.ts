// Flexbox layout engine

/**
 * All flexbox properties a node can have.
 * Numeric values are integers representing terminal cells.
 * Use null for maxWidth/maxHeight to indicate no constraint.
 *
 * Uses logical properties (start/end) instead of physical (left/right)
 * to enable future RTL support. In LTR mode: start=left, end=right.
 */
export interface FlexStyle {
  display: "flex" | "none";
  flexDirection: "row" | "column";
  flexWrap: "nowrap" | "wrap";
  justifyContent:
    | "flex-start"
    | "flex-end"
    | "center"
    | "space-between"
    | "space-around"
    | "space-evenly";
  alignItems: "flex-start" | "flex-end" | "center" | "stretch";
  alignContent:
    | "flex-start"
    | "flex-end"
    | "center"
    | "stretch"
    | "space-between"
    | "space-around";
  alignSelf: "auto" | "flex-start" | "flex-end" | "center" | "stretch";
  flexGrow: number;
  flexShrink: number;
  flexBasis: number | "auto";
  width: number | "auto";
  height: number | "auto";
  minWidth: number;
  maxWidth: number | null;
  minHeight: number;
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

  // Positioning (for elements taken out of normal flow)
  position: "relative" | "absolute";
  top: number | "auto";
  end: number | "auto";
  bottom: number | "auto";
  start: number | "auto";
}

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
  measure?: (
    availableWidth: number,
    availableHeight: number,
  ) => { width: number; height: number };
}

/**
 * Output from the layout algorithm.
 *
 * x/y are relative to the parent's content area (used during layout).
 * screenX/screenY are absolute positions from root (set by finalizePositions).
 */
export interface LayoutResult {
  x: number;
  y: number;
  width: number;
  height: number;

  screenX: number;
  screenY: number;

  children: LayoutResult[];
}

/**
 * Default values for all flexbox properties.
 * Matches CSS flexbox spec defaults.
 */
export const DEFAULT_FLEX_STYLE: FlexStyle = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "nowrap",
  justifyContent: "flex-start",
  alignItems: "stretch",
  alignContent: "stretch",
  alignSelf: "auto",
  flexGrow: 0,
  flexShrink: 1,
  flexBasis: "auto",
  width: "auto",
  height: "auto",
  minWidth: 0,
  maxWidth: null,
  minHeight: 0,
  maxHeight: null,
  paddingTop: 0,
  paddingEnd: 0,
  paddingBottom: 0,
  paddingStart: 0,
  marginTop: 0,
  marginEnd: 0,
  marginBottom: 0,
  marginStart: 0,
  gap: 0,
  position: "relative",
  top: "auto",
  end: "auto",
  bottom: "auto",
  start: "auto",
};

/**
 * Merges a partial style with defaults to produce a complete FlexStyle.
 */
export function resolveStyle(partial: Partial<FlexStyle>): FlexStyle {
  return { ...DEFAULT_FLEX_STYLE, ...partial };
}

/**
 * Internal representation used during layout computation.
 * Carries resolved styles and mutable layout values.
 */
interface LayoutBox {
  node: LayoutNode;
  style: FlexStyle;

  // Relative to parent (set during layout passes)
  x: number;
  y: number;
  width: number;
  height: number;

  // Absolute screen position (set by finalizePositions)
  screenX: number;
  screenY: number;

  children: LayoutBox[];
  parent: LayoutBox | null;
}

/**
 * Recursively builds a LayoutBox tree from a LayoutNode tree.
 * All dimensions start at 0 and are resolved in subsequent passes.
 */
function buildLayoutTree(
  node: LayoutNode,
  parent: LayoutBox | null,
): LayoutBox {
  const box: LayoutBox = {
    node,
    style: resolveStyle(node.style),
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    screenX: 0,
    screenY: 0,
    children: [],
    parent,
  };

  if (node.children) {
    for (const child of node.children) {
      box.children.push(buildLayoutTree(child, box));
    }
  }

  return box;
}

/**
 * Builds a top-down (level-order) traversal queue using BFS.
 * Uses an index instead of shift() for O(1) dequeue, making overall O(n).
 */
function buildTopDownQueue(root: LayoutBox): LayoutBox[] {
  const queue: LayoutBox[] = [root];
  const result: LayoutBox[] = [];
  let head = 0;

  while (head < queue.length) {
    const box = queue[head++];
    result.push(box);
    for (const child of box.children) {
      queue.push(child);
    }
  }

  return result;
}

/**
 * Stub for Pass 2: resolves intrinsic sizes (implemented in Task 2.3).
 * Currently a no-op placeholder.
 */
function resolveIntrinsicSize(_box: LayoutBox): void {
  // Task 2.3 will implement this
}

/**
 * Stub for Pass 3: resolves flex distribution and positions (Tasks 2.4, 2.5, 2.6).
 * Currently a no-op placeholder.
 */
function resolveFlexAndPosition(_box: LayoutBox): void {
  // Tasks 2.4, 2.5, 2.6 will implement this
}

/**
 * Converts internal LayoutBox tree to public LayoutResult tree.
 */
function toLayoutResult(box: LayoutBox): LayoutResult {
  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    screenX: box.screenX,
    screenY: box.screenY,
    children: box.children.map(toLayoutResult),
  };
}

/**
 * Computes flexbox layout for a tree of nodes.
 *
 * Uses a 3-pass algorithm:
 * 1. Build internal tree with resolved styles
 * 2. Pass 2 (bottom-up): Resolve intrinsic sizes
 * 3. Pass 3 (top-down): Resolve flex values, alignment, final positions
 *
 * @param node - Root of the layout tree
 * @param availableWidth - Available width in terminal cells
 * @param availableHeight - Available height in terminal cells
 * @returns Layout results with computed positions and dimensions
 */
export function computeLayout(
  node: LayoutNode,
  availableWidth: number,
  availableHeight: number,
): LayoutResult {
  // 1. Build internal tree with resolved styles
  const root = buildLayoutTree(node, null);

  // 2. Set root dimensions
  // Root dimensions come from available space UNLESS root has explicit width/height.
  // Explicit dimensions on root take precedence.
  const rootStyle = root.style;
  root.width =
    typeof rootStyle.width === "number" ? rootStyle.width : availableWidth;
  root.height =
    typeof rootStyle.height === "number" ? rootStyle.height : availableHeight;
  root.x = 0;
  root.y = 0;
  // Root's screen position equals relative position (no parent offset)
  root.screenX = 0;
  root.screenY = 0;

  // 3. Build traversal queues (top-down computed once, bottom-up is reversed copy)
  const topDownQueue = buildTopDownQueue(root);
  const bottomUpQueue = [...topDownQueue].reverse();

  // 4. Pass 2: Resolve intrinsic sizes (bottom-up)
  for (const box of bottomUpQueue) {
    resolveIntrinsicSize(box);
  }

  // 5. Pass 3: Resolve flex and positions (top-down)
  for (const box of topDownQueue) {
    resolveFlexAndPosition(box);
  }

  // 6. Convert to LayoutResult
  return toLayoutResult(root);
}
