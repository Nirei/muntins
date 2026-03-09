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
 * Clamps a value between min and max bounds.
 * maxBound can be null to indicate no upper constraint.
 */
function clamp(
  value: number,
  minBound: number,
  maxBound: number | null,
): number {
  const clamped = Math.max(minBound, value);
  return maxBound !== null ? Math.min(maxBound, clamped) : clamped;
}

/**
 * Calculates intrinsic size for a given axis based on children sizes.
 * Main axis: sum of children sizes + gaps
 * Cross axis: max of children sizes
 */
function calculateIntrinsicSize(
  box: LayoutBox,
  axis: "width" | "height",
): number {
  const style = box.style;
  const isMainAxis =
    (axis === "width" && style.flexDirection === "row") ||
    (axis === "height" && style.flexDirection === "column");

  // Select padding and margin properties based on axis
  const [paddingBefore, paddingAfter, marginBefore, marginAfter] =
    axis === "width"
      ? (["paddingStart", "paddingEnd", "marginStart", "marginEnd"] as const)
      : (["paddingTop", "paddingBottom", "marginTop", "marginBottom"] as const);

  let contentSize = 0;
  let childCount = 0;

  for (const child of box.children) {
    if (child.style.display === "none") continue;

    const childSize =
      child[axis] + child.style[marginBefore] + child.style[marginAfter];

    if (isMainAxis) {
      contentSize += childSize;
      childCount++;
    } else {
      contentSize = Math.max(contentSize, childSize);
    }
  }

  // Add gaps between children (main axis only)
  if (isMainAxis && childCount > 1) {
    contentSize += (childCount - 1) * style.gap;
  }

  return contentSize + style[paddingBefore] + style[paddingAfter];
}

/**
 * Pass 2: Resolves intrinsic sizes bottom-up.
 *
 * For each node, determines width and height based on:
 * 1. Explicit size (if set in style)
 * 2. Measure function (for leaf nodes like Text)
 * 3. Children sizes (for containers)
 *
 * Finally clamps to min/max bounds.
 *
 * Note: Root node (parent === null) is handled specially in computeLayout
 * where auto dimensions use available space, not intrinsic size.
 */
function resolveIntrinsicSize(box: LayoutBox): void {
  const style = box.style;
  const isRoot = box.parent === null;

  // 1. If explicit size, use it
  if (typeof style.width === "number") {
    box.width = style.width;
  }
  if (typeof style.height === "number") {
    box.height = style.height;
  }

  // 2. If measure function (leaf node like Text), use it
  if (box.node.measure) {
    // Calculate available space from parent's content area.
    // If explicit size, use that minus padding. Otherwise Infinity (unconstrained).
    const paddingStart = style.paddingStart;
    const paddingEnd = style.paddingEnd;
    const paddingTop = style.paddingTop;
    const paddingBottom = style.paddingBottom;

    const availW =
      typeof style.width === "number"
        ? Math.max(0, style.width - paddingStart - paddingEnd)
        : Number.POSITIVE_INFINITY;
    const availH =
      typeof style.height === "number"
        ? Math.max(0, style.height - paddingTop - paddingBottom)
        : Number.POSITIVE_INFINITY;

    const measured = box.node.measure(availW, availH);

    if (style.width === "auto") box.width = measured.width;
    if (style.height === "auto") box.height = measured.height;

    // Clamp to min/max and return early
    box.width = clamp(box.width, style.minWidth, style.maxWidth);
    box.height = clamp(box.height, style.minHeight, style.maxHeight);
    return;
  }

  // 3. Calculate from children (for containers)
  // Root's auto dimensions use available space (set before this pass), not intrinsic size
  if (style.width === "auto" && !isRoot) {
    box.width = calculateIntrinsicSize(box, "width");
  }
  if (style.height === "auto" && !isRoot) {
    box.height = calculateIntrinsicSize(box, "height");
  }

  // 4. Clamp to min/max
  box.width = clamp(box.width, style.minWidth, style.maxWidth);
  box.height = clamp(box.height, style.minHeight, style.maxHeight);
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
