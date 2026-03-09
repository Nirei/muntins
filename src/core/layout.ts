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
 * A flex line contains items that fit on one line when wrapping.
 */
interface FlexLine {
  items: LayoutBox[];
  mainSize: number; // total main size of items + gaps
  crossSize: number; // max cross size of items
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
 * Creates a FlexLine from a list of items, computing main and cross sizes.
 */
function createLine(items: LayoutBox[], gap: number, isRow: boolean): FlexLine {
  let mainSize = 0;
  let crossSize = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const marginMain = isRow
      ? item.style.marginStart + item.style.marginEnd
      : item.style.marginTop + item.style.marginBottom;
    const marginCross = isRow
      ? item.style.marginTop + item.style.marginBottom
      : item.style.marginStart + item.style.marginEnd;

    const itemMain = (isRow ? item.width : item.height) + marginMain;
    const itemCross = (isRow ? item.height : item.width) + marginCross;

    mainSize += itemMain + (i > 0 ? gap : 0);
    crossSize = Math.max(crossSize, itemCross);
  }

  return { items, mainSize, crossSize };
}

/**
 * Collects visible children into flex lines based on wrap setting.
 * For nowrap, all items go on a single line.
 * For wrap, items flow to new lines when they exceed available main space.
 *
 * IMPORTANT: For space-between/around/evenly justification, style.gap is ignored
 * when determining line breaks, because the gap is computed dynamically.
 */
function collectLines(
  box: LayoutBox,
  visibleChildren: LayoutBox[],
  isRow: boolean,
): FlexLine[] {
  const style = box.style;
  const paddingMain = isRow
    ? style.paddingStart + style.paddingEnd
    : style.paddingTop + style.paddingBottom;

  const availableMain = (isRow ? box.width : box.height) - paddingMain;

  // For space-* justification, gap is computed dynamically, not from style.gap.
  // Use 0 for line-break calculations and mainSize computation.
  const isSpaceJustify =
    style.justifyContent === "space-between" ||
    style.justifyContent === "space-around" ||
    style.justifyContent === "space-evenly";
  const effectiveGap = isSpaceJustify ? 0 : style.gap;

  // nowrap: single line with all children
  if (style.flexWrap === "nowrap") {
    return [createLine(visibleChildren, effectiveGap, isRow)];
  }

  // wrap: distribute items into multiple lines
  const lines: FlexLine[] = [];
  let currentItems: LayoutBox[] = [];
  let currentMainSize = 0;

  for (const child of visibleChildren) {
    const marginMain = isRow
      ? child.style.marginStart + child.style.marginEnd
      : child.style.marginTop + child.style.marginBottom;
    const childMainSize = isRow ? child.width : child.height;
    const childTotalMain = childMainSize + marginMain;

    // Gap before this item (if not first in line)
    const gapBefore = currentItems.length > 0 ? effectiveGap : 0;

    // IMPORTANT: Always allow at least one item per line, even if oversized.
    // Without this check, an item larger than availableMain would cause an
    // infinite loop (never fits, keeps trying to start new line).
    const wouldOverflow =
      currentMainSize + gapBefore + childTotalMain > availableMain;
    const hasItemsOnLine = currentItems.length > 0;

    if (wouldOverflow && hasItemsOnLine) {
      // Start new line
      lines.push(createLine(currentItems, effectiveGap, isRow));
      currentItems = [child];
      currentMainSize = childTotalMain;
    } else {
      // Either fits, or this is the first item on the line (must accept it)
      currentItems.push(child);
      currentMainSize += gapBefore + childTotalMain;
    }
  }

  // Don't forget the last line
  if (currentItems.length > 0) {
    lines.push(createLine(currentItems, effectiveGap, isRow));
  }

  return lines;
}

/**
 * Calculates intrinsic size for a given axis based on children sizes.
 * Main axis: sum of children sizes + gaps (or max line main size if wrapping)
 * Cross axis: max of children sizes (or sum of line cross sizes if wrapping)
 */
function calculateIntrinsicSize(
  box: LayoutBox,
  axis: "width" | "height",
): number {
  const style = box.style;
  const isRow = style.flexDirection === "row";
  const isMainAxis =
    (axis === "width" && isRow) || (axis === "height" && !isRow);

  // Select padding properties based on axis
  const [paddingBefore, paddingAfter] =
    axis === "width"
      ? (["paddingStart", "paddingEnd"] as const)
      : (["paddingTop", "paddingBottom"] as const);

  // Collect visible children (excluding absolute positioned, which are out of flow)
  const visibleChildren: LayoutBox[] = [];
  for (const child of box.children) {
    if (child.style.display === "none") continue;
    if (child.style.position === "absolute") continue;
    visibleChildren.push(child);
  }

  if (visibleChildren.length === 0) {
    return style[paddingBefore] + style[paddingAfter];
  }

  // Handle wrapping: need to calculate lines to determine cross-axis intrinsic size
  if (style.flexWrap === "wrap" && !isMainAxis) {
    // For cross-axis with wrap, we need to compute lines.
    // However, we don't know the main-axis size yet, so for intrinsic sizing
    // of cross-axis with wrap, we assume nowrap behavior for simplicity.
    // The actual line-based cross size is computed after dimensions are set.
    // This means intrinsic cross size uses max of children (single line assumption).
  }

  let contentSize = 0;

  if (isMainAxis) {
    // Main axis: sum of children sizes + gaps
    for (let i = 0; i < visibleChildren.length; i++) {
      const child = visibleChildren[i];
      const marginMain = isRow
        ? child.style.marginStart + child.style.marginEnd
        : child.style.marginTop + child.style.marginBottom;
      contentSize += child[axis] + marginMain;
      if (i > 0) contentSize += style.gap;
    }
  } else {
    // Cross axis: max of children sizes
    for (const child of visibleChildren) {
      const marginCross = isRow
        ? child.style.marginTop + child.style.marginBottom
        : child.style.marginStart + child.style.marginEnd;
      contentSize = Math.max(contentSize, child[axis] + marginCross);
    }
  }

  return contentSize + style[paddingBefore] + style[paddingAfter];
}

/**
 * Pass 2: Resolves intrinsic sizes bottom-up.
 *
 * For each node, determines width and height based on:
 * 1. flexBasis (if numeric, sets initial main-axis size)
 * 2. Explicit size (if set in style)
 * 3. Measure function (for leaf nodes like Text)
 * 4. Children sizes (for containers)
 *
 * Finally clamps to min/max bounds.
 *
 * Note: Root node (parent === null) is handled specially in computeLayout
 * where auto dimensions use available space, not intrinsic size.
 */
function resolveIntrinsicSize(box: LayoutBox): void {
  const style = box.style;
  const isRoot = box.parent === null;

  // Determine parent's flex direction to know which axis flexBasis applies to
  const parentIsRow = box.parent?.style.flexDirection === "row";
  const parentIsColumn = box.parent?.style.flexDirection === "column";

  // 1. If flexBasis is numeric, use it for the main axis (determined by parent's direction)
  if (typeof style.flexBasis === "number" && box.parent !== null) {
    if (parentIsRow) {
      box.width = style.flexBasis;
    } else if (parentIsColumn) {
      box.height = style.flexBasis;
    }
  }

  // 2. If explicit size, use it (overrides flexBasis if both are set)
  if (typeof style.width === "number") {
    box.width = style.width;
  }
  if (typeof style.height === "number") {
    box.height = style.height;
  }

  // 3. If measure function (leaf node like Text), use it for remaining auto dimensions
  if (box.node.measure) {
    // Calculate available space from parent's content area.
    // If explicit size or flexBasis already set a dimension, use that minus padding.
    // Otherwise Infinity (unconstrained).
    const paddingStart = style.paddingStart;
    const paddingEnd = style.paddingEnd;
    const paddingTop = style.paddingTop;
    const paddingBottom = style.paddingBottom;

    // box.width may already be set by flexBasis or explicit width
    const widthKnown = box.width > 0;
    const heightKnown = box.height > 0;

    const availW = widthKnown
      ? Math.max(0, box.width - paddingStart - paddingEnd)
      : Number.POSITIVE_INFINITY;
    const availH = heightKnown
      ? Math.max(0, box.height - paddingTop - paddingBottom)
      : Number.POSITIVE_INFINITY;

    const measured = box.node.measure(availW, availH);

    // Only use measured size for dimensions not already set
    if (!widthKnown) box.width = measured.width;
    if (!heightKnown) box.height = measured.height;

    // Clamp to min/max and return early
    box.width = clamp(box.width, style.minWidth, style.maxWidth);
    box.height = clamp(box.height, style.minHeight, style.maxHeight);
    return;
  }

  // 4. Calculate from children (for containers)
  // Root's auto dimensions use available space (set before this pass), not intrinsic size
  // flexBasis only affects main axis, so cross-axis still needs intrinsic calculation
  const widthSetByFlexBasis =
    typeof style.flexBasis === "number" && parentIsRow;
  const heightSetByFlexBasis =
    typeof style.flexBasis === "number" && parentIsColumn;

  if (style.width === "auto" && !isRoot && !widthSetByFlexBasis) {
    box.width = calculateIntrinsicSize(box, "width");
  }
  if (style.height === "auto" && !isRoot && !heightSetByFlexBasis) {
    box.height = calculateIntrinsicSize(box, "height");
  }

  // 4. Clamp to min/max
  box.width = clamp(box.width, style.minWidth, style.maxWidth);
  box.height = clamp(box.height, style.minHeight, style.maxHeight);
}

/**
 * Distributes extra space among items in a line with flexGrow > 0.
 * Adds to existing item sizes rather than replacing them.
 */
function distributeGrowForLine(
  items: LayoutBox[],
  availableSpace: number,
  isRow: boolean,
): void {
  if (availableSpace <= 0) return;

  // Collect flex children and their weights
  const flexChildren: LayoutBox[] = [];
  const weights: number[] = [];

  for (const child of items) {
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
 * Shrinks items in a line with flexShrink > 0 to fit overflow.
 * Shrink is weighted by flexShrink * baseSize.
 */
function distributeShrinkForLine(
  items: LayoutBox[],
  overflow: number,
  isRow: boolean,
): void {
  if (overflow <= 0) return;

  // Collect shrinkable children and calculate weighted shrink factors
  const shrinkChildren: LayoutBox[] = [];
  const weights: number[] = [];

  for (const child of items) {
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
 * Calculates available main-axis space for a single line.
 */
function calculateAvailableMainSpaceForLine(
  box: LayoutBox,
  line: FlexLine,
): number {
  const style = box.style;
  const isRow = style.flexDirection === "row";

  const paddingMain = isRow
    ? style.paddingStart + style.paddingEnd
    : style.paddingTop + style.paddingBottom;
  const availableMain = (isRow ? box.width : box.height) - paddingMain;

  // Calculate remaining space after line items
  return availableMain - line.mainSize;
}

/**
 * Positions items within a line along the main axis using justifyContent.
 * Uses pre-computed line mainSize to avoid redundant iteration.
 */
function applyJustifyContentForLine(
  box: LayoutBox,
  line: FlexLine,
  isRow: boolean,
): void {
  const style = box.style;
  const count = line.items.length;

  if (count === 0) return;

  const paddingMain = isRow
    ? style.paddingStart + style.paddingEnd
    : style.paddingTop + style.paddingBottom;
  const availableMain = (isRow ? box.width : box.height) - paddingMain;

  const remaining = availableMain - line.mainSize;

  // Starting position (after padding)
  let pos = isRow ? style.paddingStart : style.paddingTop;

  // Adjust starting position based on justifyContent
  switch (style.justifyContent) {
    case "flex-start":
      break;
    case "flex-end":
      pos += remaining;
      break;
    case "center":
      pos += remaining / 2;
      break;
    case "space-between":
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
    gap = style.gap;
  }

  // Position each item along main axis
  for (let i = 0; i < line.items.length; i++) {
    const child = line.items[i];
    const marginStart = isRow ? child.style.marginStart : child.style.marginTop;

    // Sum sizes of all preceding children (including their margins)
    let precedingSize = 0;
    for (let j = 0; j < i; j++) {
      const prev = line.items[j];
      const prevMainSize = isRow ? prev.width : prev.height;
      const prevMarginStart = isRow
        ? prev.style.marginStart
        : prev.style.marginTop;
      const prevMarginEnd = isRow
        ? prev.style.marginEnd
        : prev.style.marginBottom;
      precedingSize += prevMarginStart + prevMainSize + prevMarginEnd;
    }

    const childPos = pos + precedingSize + i * gap + marginStart;

    if (isRow) {
      child.x = Math.round(childPos);
    } else {
      child.y = Math.round(childPos);
    }
  }
}

/**
 * Positions items within a line along the cross axis using alignItems.
 * crossStart is the starting position of this line on the cross axis.
 * lineCrossSize is the cross-axis size to use for alignment (may be line's
 * intrinsic size or container's full cross size for nowrap single line).
 */
function applyAlignItemsForLine(
  box: LayoutBox,
  line: FlexLine,
  crossStart: number,
  lineCrossSize: number,
  isRow: boolean,
): void {
  const style = box.style;

  for (const child of line.items) {
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
        crossPos = crossStart + lineCrossSize - childCrossSize - marginEnd;
        break;

      case "center":
        crossPos = crossStart + (lineCrossSize - childCrossSize) / 2;
        break;

      case "stretch":
        crossPos = crossStart + marginStart;
        if (isRow && child.style.height === "auto") {
          child.height = lineCrossSize - marginStart - marginEnd;
        } else if (!isRow && child.style.width === "auto") {
          child.width = lineCrossSize - marginStart - marginEnd;
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
 * 1. Collect visible children
 * 2. Collect items into lines (based on wrap)
 * 3. For each line: distribute flex grow/shrink, position main axis
 * 4. Position lines on cross axis, apply alignItems within each line
 * 5. Calculate screen coordinates
 */
/**
 * Positions absolutely positioned children relative to parent's content area.
 * Uses top/start/bottom/end offsets to determine position.
 */
function positionAbsoluteChildren(
  box: LayoutBox,
  absoluteChildren: LayoutBox[],
): void {
  const style = box.style;

  // Content area bounds (inside padding)
  const contentLeft = style.paddingStart;
  const contentTop = style.paddingTop;
  const contentWidth = box.width - style.paddingStart - style.paddingEnd;
  const contentHeight = box.height - style.paddingTop - style.paddingBottom;

  for (const child of absoluteChildren) {
    const childStyle = child.style;

    // Resolve horizontal position
    // Priority: start > end (if both set, start wins)
    if (typeof childStyle.start === "number") {
      child.x = contentLeft + childStyle.start;
    } else if (typeof childStyle.end === "number") {
      child.x = contentLeft + contentWidth - child.width - childStyle.end;
    } else {
      // Default to start edge
      child.x = contentLeft;
    }

    // Resolve vertical position
    // Priority: top > bottom (if both set, top wins)
    if (typeof childStyle.top === "number") {
      child.y = contentTop + childStyle.top;
    } else if (typeof childStyle.bottom === "number") {
      child.y = contentTop + contentHeight - child.height - childStyle.bottom;
    } else {
      // Default to top edge
      child.y = contentTop;
    }
  }
}

function resolveFlexAndPosition(box: LayoutBox): void {
  if (box.children.length === 0) return;

  const style = box.style;
  const isRow = style.flexDirection === "row";

  // 1. Separate children into relative (normal flow) and absolute (out of flow)
  const relativeChildren: LayoutBox[] = [];
  const absoluteChildren: LayoutBox[] = [];

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

    if (child.style.position === "absolute") {
      absoluteChildren.push(child);
    } else {
      relativeChildren.push(child);
    }
  }

  // 2. Position absolute children (out of normal flow)
  if (absoluteChildren.length > 0) {
    positionAbsoluteChildren(box, absoluteChildren);
  }

  // 3. Layout relative children in flex flow
  if (relativeChildren.length === 0) return;

  // 4. Collect items into lines
  const lines = collectLines(box, relativeChildren, isRow);

  // 5. For each line: distribute flex grow/shrink
  for (const line of lines) {
    const availableSpace = calculateAvailableMainSpaceForLine(box, line);

    if (availableSpace > 0) {
      distributeGrowForLine(line.items, availableSpace, isRow);
    } else if (availableSpace < 0) {
      distributeShrinkForLine(line.items, -availableSpace, isRow);
    }

    // Clamp again after flex distribution
    for (const child of line.items) {
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
    }
  }

  // 6. Position items within each line (main axis) and lines on cross axis
  const paddingCrossStart = isRow ? style.paddingTop : style.paddingStart;
  const paddingCrossEnd = isRow ? style.paddingBottom : style.paddingEnd;

  // Calculate container's cross-axis content size (used for nowrap single line)
  const containerCrossSize = isRow
    ? box.height - paddingCrossStart - paddingCrossEnd
    : box.width - paddingCrossStart - paddingCrossEnd;

  // For space-* justification, gap is computed dynamically, not from style.gap
  const isSpaceJustify =
    style.justifyContent === "space-between" ||
    style.justifyContent === "space-around" ||
    style.justifyContent === "space-evenly";
  const justifyGap = isSpaceJustify ? 0 : style.gap;

  // Recalculate all line sizes after flex distribution
  const updatedLines: FlexLine[] = [];
  for (const line of lines) {
    updatedLines.push(createLine(line.items, justifyGap, isRow));
  }

  // Calculate total intrinsic cross size of all lines
  let totalLinesCrossSize = 0;
  for (let i = 0; i < updatedLines.length; i++) {
    totalLinesCrossSize += updatedLines[i].crossSize;
    if (i > 0) totalLinesCrossSize += style.gap;
  }

  // Calculate alignContent parameters (only for wrap with multiple lines)
  let crossPos = paddingCrossStart;
  let lineCrossGap = style.gap;
  let stretchPerLine = 0;

  if (style.flexWrap === "wrap" && updatedLines.length > 1) {
    const remainingCrossSpace = containerCrossSize - totalLinesCrossSize;

    if (remainingCrossSpace > 0) {
      const lineCount = updatedLines.length;

      switch (style.alignContent) {
        case "flex-start":
          // Lines packed at start (default behavior)
          break;

        case "flex-end":
          // Lines packed at end
          crossPos += remainingCrossSpace;
          break;

        case "center":
          // Lines centered
          crossPos += remainingCrossSpace / 2;
          break;

        case "stretch":
          // Distribute extra space equally among lines
          stretchPerLine = Math.floor(remainingCrossSpace / lineCount);
          break;

        case "space-between":
          // First line at start, last at end, space distributed between
          if (lineCount > 1) {
            lineCrossGap =
              style.gap +
              (remainingCrossSpace - style.gap * (lineCount - 1)) /
                (lineCount - 1);
            // Recalculate: extra space between lines
            lineCrossGap = style.gap + remainingCrossSpace / (lineCount - 1);
          }
          break;

        case "space-around":
          // Equal space around each line
          {
            const spacePerLine = remainingCrossSpace / lineCount;
            crossPos += spacePerLine / 2;
            lineCrossGap = style.gap + spacePerLine;
          }
          break;
      }
    }
  }

  // Track total cross size for auto-sizing containers with wrap
  let totalCrossSize = 0;

  for (let i = 0; i < updatedLines.length; i++) {
    const updatedLine = updatedLines[i];

    // Position items along main axis
    applyJustifyContentForLine(box, updatedLine, isRow);

    // Determine cross size for this line
    // For nowrap (single line), use container's full cross size for alignment.
    // For wrap with multiple lines, use line's intrinsic cross size (+ stretch if applicable).
    let lineCrossSize: number;
    if (style.flexWrap === "nowrap" || updatedLines.length === 1) {
      lineCrossSize = containerCrossSize;
    } else {
      lineCrossSize = updatedLine.crossSize + stretchPerLine;
    }

    // Position items along cross axis within this line
    applyAlignItemsForLine(box, updatedLine, crossPos, lineCrossSize, isRow);

    // Track total cross size (intrinsic, without stretch)
    totalCrossSize += updatedLine.crossSize;
    if (i > 0) {
      totalCrossSize += style.gap;
    }

    // Move to next line position
    crossPos += lineCrossSize;
    if (i < updatedLines.length - 1) {
      crossPos += lineCrossGap;
    }
  }

  // 4b. Update container cross-axis size if auto and wrapping
  if (style.flexWrap === "wrap" && updatedLines.length > 1) {
    const crossSizeProp = isRow ? "height" : "width";
    if (style[crossSizeProp] === "auto") {
      box[crossSizeProp] = totalCrossSize + paddingCrossStart + paddingCrossEnd;
    }
  }

  // Note: Screen coordinates are computed by finalizePositions() after all passes
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
 * Recursively computes absolute screen coordinates from relative positions.
 *
 * This function bridges relative and screen coordinates:
 * - Input: box.x, box.y are relative to parent's border box (set by Pass 3)
 * - Output: box.screenX, box.screenY are absolute screen positions
 *
 * Note: Children's x/y positions already include parent's padding offset
 * (set by applyJustifyContentForLine), so we use the parent's screen position
 * directly without adding padding again.
 */
function finalizePositions(
  box: LayoutBox,
  parentScreenX: number,
  parentScreenY: number,
): void {
  // Compute screen position by adding parent's screen position to our relative position
  box.screenX = parentScreenX + box.x;
  box.screenY = parentScreenY + box.y;

  // Children's x/y already account for this box's padding,
  // so we pass our screen position directly
  for (const child of box.children) {
    finalizePositions(child, box.screenX, box.screenY);
  }
}

/**
 * Cache for layout results keyed on LayoutNode and available dimensions.
 * Uses WeakMap so entries are garbage collected when nodes are no longer referenced.
 */
const layoutCache = new WeakMap<LayoutNode, Map<string, LayoutResult>>();

/**
 * Clears the layout cache for a specific node.
 * Useful for testing or when forcing a recomputation.
 */
export function clearLayoutCache(node?: LayoutNode): void {
  if (node) {
    layoutCache.delete(node);
  }
}

/**
 * Computes flexbox layout for a tree of nodes.
 *
 * Uses a 3-pass algorithm:
 * 1. Build internal tree with resolved styles
 * 2. Pass 2 (bottom-up): Resolve intrinsic sizes
 * 3. Pass 3 (top-down): Resolve flex values, alignment, relative positions
 * 4. Finalize absolute screen coordinates
 *
 * Results are cached keyed on the LayoutNode and available dimensions.
 * Cache invalidation is automatic: when a node is recreated (different object
 * identity), the old cache entry is garbage collected via WeakMap.
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
  // Check cache first
  const cacheKey = `${availableWidth},${availableHeight}`;
  let nodeCache = layoutCache.get(node);
  const cached = nodeCache?.get(cacheKey);
  if (cached) {
    return cached;
  }

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

  // 6. Finalize absolute screen coordinates (top-down walk)
  // Root starts at (0, 0) with no parent offset
  finalizePositions(root, 0, 0);

  // 7. Convert to LayoutResult
  const result = toLayoutResult(root);

  // Store in cache
  if (!nodeCache) {
    nodeCache = new Map();
    layoutCache.set(node, nodeCache);
  }
  nodeCache.set(cacheKey, result);

  return result;
}
