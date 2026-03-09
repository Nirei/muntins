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
 * Distributes a total amount proportionally among weights using integer arithmetic.
 * Remainder is distributed to the first items.
 *
 * @param total - Total amount to distribute
 * @param weights - Array of weights (e.g., flexGrow values)
 * @returns Array of distributed amounts (same length as weights)
 */
export function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  if (total <= 0) return weights.map(() => 0);

  // Calculate base amounts
  const result = weights.map((w) => Math.floor((w / sum) * total));

  // Distribute remainder to first items
  let remainder = total - result.reduce((a, b) => a + b, 0);
  for (let i = 0; i < result.length && remainder > 0; i++) {
    result[i]++;
    remainder--;
  }

  return result;
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
 * Calculates available main-axis space after accounting for fixed-size children,
 * padding, and gaps.
 *
 * IMPORTANT: For space-between/around/evenly justification, style.gap is ignored
 * because the gap is computed dynamically from remaining space.
 */
function calculateAvailableMainSpace(box: LayoutBox): number {
  const style = box.style;
  const isRow = style.flexDirection === "row";

  // Start with container size minus padding
  const paddingMain = isRow
    ? style.paddingStart + style.paddingEnd
    : style.paddingTop + style.paddingBottom;
  let mainSpace = (isRow ? box.width : box.height) - paddingMain;

  // Subtract children sizes and count visible children
  let visibleChildCount = 0;
  for (const child of box.children) {
    if (child.style.display === "none") continue;
    const childMainSize = isRow ? child.width : child.height;
    const childMarginMain = isRow
      ? child.style.marginStart + child.style.marginEnd
      : child.style.marginTop + child.style.marginBottom;
    mainSpace -= childMainSize + childMarginMain;
    visibleChildCount++;
  }

  // Subtract gaps between visible children
  // For space-* justification, gap is computed dynamically, not from style.gap
  const isSpaceJustify =
    style.justifyContent === "space-between" ||
    style.justifyContent === "space-around" ||
    style.justifyContent === "space-evenly";

  if (visibleChildCount > 1 && !isSpaceJustify) {
    mainSpace -= (visibleChildCount - 1) * style.gap;
  }

  return mainSpace;
}

/**
 * Distributes extra space among children with flexGrow > 0.
 * Adds to existing child sizes rather than replacing them.
 */
function distributeGrow(box: LayoutBox, availableSpace: number): void {
  if (availableSpace <= 0) return;

  const isRow = box.style.flexDirection === "row";

  // Collect flex children and their weights
  const flexChildren: LayoutBox[] = [];
  const weights: number[] = [];

  for (const child of box.children) {
    if (child.style.display === "none") continue;
    if (child.style.flexGrow > 0) {
      flexChildren.push(child);
      weights.push(child.style.flexGrow);
    }
  }

  if (flexChildren.length === 0) return;

  // Distribute space proportionally
  const growAmounts = distribute(availableSpace, weights);

  // Add grow amount to existing size (not replace!)
  for (let i = 0; i < flexChildren.length; i++) {
    const child = flexChildren[i];
    if (isRow) {
      child.width += growAmounts[i];
    } else {
      child.height += growAmounts[i];
    }
  }
}

/**
 * Shrinks children with flexShrink > 0 to fit overflow.
 * Shrink is weighted by flexShrink * baseSize.
 */
function distributeShrink(box: LayoutBox, overflow: number): void {
  if (overflow <= 0) return;

  const isRow = box.style.flexDirection === "row";

  // Collect shrinkable children and calculate weighted shrink factors
  const shrinkChildren: LayoutBox[] = [];
  const weights: number[] = [];

  for (const child of box.children) {
    if (child.style.display === "none") continue;
    if (child.style.flexShrink > 0) {
      const baseSize = isRow ? child.width : child.height;
      const weight = child.style.flexShrink * baseSize;
      shrinkChildren.push(child);
      weights.push(weight);
    }
  }

  if (shrinkChildren.length === 0) return;

  // Distribute shrink amounts proportionally
  const shrinkAmounts = distribute(overflow, weights);

  for (let i = 0; i < shrinkChildren.length; i++) {
    const child = shrinkChildren[i];
    const baseSize = isRow ? child.width : child.height;
    const minSize = isRow ? child.style.minWidth : child.style.minHeight;
    const newSize = Math.max(baseSize - shrinkAmounts[i], minSize);

    if (isRow) {
      child.width = newSize;
    } else {
      child.height = newSize;
    }
  }
}

/**
 * Calculates the remaining space after subtracting children sizes.
 * Used for justifyContent spacing calculations.
 */
function calculateRemainingSpace(
  box: LayoutBox,
  visibleChildren: LayoutBox[],
): number {
  const style = box.style;
  const isRow = style.flexDirection === "row";

  // Container size minus padding
  const paddingMain = isRow
    ? style.paddingStart + style.paddingEnd
    : style.paddingTop + style.paddingBottom;
  let remaining = (isRow ? box.width : box.height) - paddingMain;

  // Subtract children sizes and margins
  for (const child of visibleChildren) {
    const childMainSize = isRow ? child.width : child.height;
    const childMarginMain = isRow
      ? child.style.marginStart + child.style.marginEnd
      : child.style.marginTop + child.style.marginBottom;
    remaining -= childMainSize + childMarginMain;
  }

  // Note: For space-* justification, we ignore style.gap entirely.
  // For other justification values, gaps are added during positioning.
  // We DO NOT subtract gaps here; that happens in applyJustifyContent.

  return Math.max(0, remaining);
}

/**
 * Positions children along the main axis based on justifyContent.
 *
 * IMPORTANT: For space-between/around/evenly, the gap is computed dynamically
 * from available space. style.gap is only used for flex-start/end/center.
 * This prevents the double-counting bug where both computed and explicit gaps
 * would be applied.
 */
function applyJustifyContent(
  box: LayoutBox,
  visibleChildren: LayoutBox[],
): void {
  const style = box.style;
  const isRow = style.flexDirection === "row";
  const count = visibleChildren.length;

  if (count === 0) return;

  // For non-space justification, subtract gaps from remaining space
  const isSpaceJustify =
    style.justifyContent === "space-between" ||
    style.justifyContent === "space-around" ||
    style.justifyContent === "space-evenly";

  let remaining = calculateRemainingSpace(box, visibleChildren);

  // For non-space justification, subtract explicit gaps
  if (!isSpaceJustify && count > 1) {
    remaining -= (count - 1) * style.gap;
  }

  // Starting position (after padding)
  let pos = isRow ? style.paddingStart : style.paddingTop;

  // Adjust starting position based on justifyContent
  switch (style.justifyContent) {
    case "flex-start":
      // Default: items at start
      break;

    case "flex-end":
      pos += remaining;
      break;

    case "center":
      pos += remaining / 2;
      break;

    case "space-between":
      // No initial offset, gaps between items
      break;

    case "space-around":
      pos += remaining / count / 2;
      break;

    case "space-evenly":
      pos += remaining / (count + 1);
      break;
  }

  // Calculate gap between items
  let gap: number;

  if (style.justifyContent === "space-between") {
    gap = count > 1 ? remaining / (count - 1) : 0;
  } else if (style.justifyContent === "space-around") {
    gap = remaining / count;
  } else if (style.justifyContent === "space-evenly") {
    gap = remaining / (count + 1);
  } else {
    // flex-start, flex-end, center: use explicit gap
    gap = style.gap;
  }

  // Position each child along main axis.
  // We compute positions from index rather than accumulating, to avoid
  // fractional drift when gap is not an integer.
  for (let i = 0; i < visibleChildren.length; i++) {
    const child = visibleChildren[i];
    const marginStart = isRow ? child.style.marginStart : child.style.marginTop;

    // Sum sizes of all preceding children (including their margins)
    let precedingSize = 0;
    for (let j = 0; j < i; j++) {
      const prev = visibleChildren[j];
      const prevMainSize = isRow ? prev.width : prev.height;
      const prevMarginStart = isRow
        ? prev.style.marginStart
        : prev.style.marginTop;
      const prevMarginEnd = isRow
        ? prev.style.marginEnd
        : prev.style.marginBottom;
      precedingSize += prevMarginStart + prevMainSize + prevMarginEnd;
    }

    // Position = start offset + preceding children + (i gaps)
    const childPos = pos + precedingSize + i * gap + marginStart;

    if (isRow) {
      child.x = Math.round(childPos);
    } else {
      child.y = Math.round(childPos);
    }
  }
}

/**
 * Positions children along the cross axis based on alignItems/alignSelf.
 * Also handles stretch when child cross-axis dimension is "auto".
 */
function applyAlignItems(box: LayoutBox, visibleChildren: LayoutBox[]): void {
  const style = box.style;
  const isRow = style.flexDirection === "row";

  // Cross-axis available space (after padding)
  const crossStart = isRow ? style.paddingTop : style.paddingStart;
  const crossSize = isRow
    ? box.height - style.paddingTop - style.paddingBottom
    : box.width - style.paddingStart - style.paddingEnd;

  for (const child of visibleChildren) {
    // Check for alignSelf override
    const align =
      child.style.alignSelf === "auto"
        ? style.alignItems
        : child.style.alignSelf;

    const marginStart = isRow ? child.style.marginTop : child.style.marginStart;
    const marginEnd = isRow ? child.style.marginBottom : child.style.marginEnd;
    const childCrossSize = isRow ? child.height : child.width;

    let crossPos: number;

    switch (align) {
      case "flex-start":
        crossPos = crossStart + marginStart;
        break;

      case "flex-end":
        crossPos = crossStart + crossSize - childCrossSize - marginEnd;
        break;

      case "center":
        crossPos = crossStart + (crossSize - childCrossSize) / 2;
        break;

      case "stretch":
        crossPos = crossStart + marginStart;
        // Only stretch if dimension is "auto" (not explicit number)
        if (isRow && child.style.height === "auto") {
          child.height = crossSize - marginStart - marginEnd;
        } else if (!isRow && child.style.width === "auto") {
          child.width = crossSize - marginStart - marginEnd;
        }
        break;

      default:
        crossPos = crossStart + marginStart;
    }

    if (isRow) {
      child.y = Math.round(crossPos);
    } else {
      child.x = Math.round(crossPos);
    }
  }
}

/**
 * Pass 3: Resolves flex distribution and positions children.
 *
 * For each container:
 * 1. Calculate available main-axis space
 * 2. If positive, distribute with flexGrow
 * 3. If negative, shrink with flexShrink
 * 4. Clamp all children to min/max bounds
 * 5. Position children using justifyContent and alignItems
 */
function resolveFlexAndPosition(box: LayoutBox): void {
  if (box.children.length === 0) return;

  const style = box.style;
  const isRow = style.flexDirection === "row";

  // 1. Calculate available space
  const availableSpace = calculateAvailableMainSpace(box);

  // 2. Distribute grow or shrink
  if (availableSpace > 0) {
    distributeGrow(box, availableSpace);
  } else if (availableSpace < 0) {
    distributeShrink(box, -availableSpace);
  }

  // 3. Collect visible children and clamp to min/max bounds
  const visibleChildren: LayoutBox[] = [];
  for (const child of box.children) {
    if (child.style.display === "none") continue;
    child.width = clamp(
      child.width,
      child.style.minWidth,
      child.style.maxWidth,
    );
    child.height = clamp(
      child.height,
      child.style.minHeight,
      child.style.maxHeight,
    );
    visibleChildren.push(child);
  }

  // 4. Position children using justifyContent and alignItems
  applyJustifyContent(box, visibleChildren);
  applyAlignItems(box, visibleChildren);

  // 5. Calculate screen coordinates for all children
  for (const child of visibleChildren) {
    child.screenX = (box.screenX ?? 0) + child.x;
    child.screenY = (box.screenY ?? 0) + child.y;
  }
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
