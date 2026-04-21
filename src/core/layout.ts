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
  display: "flex" | "none" | "contents";
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

  // Positioning (for elements taken out of normal flow)
  position: "relative" | "absolute";
  top: number | "auto";
  end: number | "auto";
  bottom: number | "auto";
  start: number | "auto";

  // Borders (always exactly 1 cell when true)
  borderTop: boolean;
  borderEnd: boolean;
  borderBottom: boolean;
  borderStart: boolean;

  // Overflow behavior for child content
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
  measure?: (
    availableWidth: number,
    availableHeight: number,
  ) => { width: number; height: number };
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
  minWidth: "auto",
  maxWidth: null,
  minHeight: "auto",
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
  borderTop: false,
  borderEnd: false,
  borderBottom: false,
  borderStart: false,
  overflow: "visible",
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

  // Automatic minimum sizes (CSS min-width:auto / min-height:auto).
  // Prevents flex items from shrinking below their content.
  autoMinWidth: number;
  autoMinHeight: number;

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
 * Collects children for a layout box, hoisting children of `display: "contents"`
 * nodes to be direct children of the box.
 */
function collectLayoutChildren(
  children: LayoutNode[],
  parent: LayoutBox,
): void {
  for (const child of children) {
    const style = resolveStyle(child.style);

    if (style.display === "contents") {
      // Hoist this node's children directly to parent
      if (child.children) {
        collectLayoutChildren(child.children, parent);
      }
    } else {
      // Normal child, create a box
      parent.children.push(buildLayoutTree(child, parent));
    }
  }
}

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
    autoMinWidth: 0,
    autoMinHeight: 0,
    screenX: 0,
    screenY: 0,
    children: [],
    parent,
  };

  if (node.children) {
    collectLayoutChildren(node.children, box);
  }

  return box;
}

// Uses an index instead of shift() for O(1) dequeue.
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

// maxBound can be null to indicate no upper constraint.
function clamp(
  value: number,
  minBound: number,
  maxBound: number | null,
): number {
  const clamped = Math.max(minBound, value);
  return maxBound !== null ? Math.min(maxBound, clamped) : clamped;
}

function clampBoxSize(box: LayoutBox): void {
  const minW =
    typeof box.style.minWidth === "number"
      ? box.style.minWidth
      : box.autoMinWidth;
  const minH =
    typeof box.style.minHeight === "number"
      ? box.style.minHeight
      : box.autoMinHeight;
  const maxW =
    box.style.maxWidth !== null && box.style.maxWidth < minW
      ? null
      : box.style.maxWidth;
  const maxH =
    box.style.maxHeight !== null && box.style.maxHeight < minH
      ? null
      : box.style.maxHeight;
  box.width = clamp(box.width, minW, maxW);
  box.height = clamp(box.height, minH, maxH);
}

function isSpaceJustify(justify: FlexStyle["justifyContent"]): boolean {
  return (
    justify === "space-between" ||
    justify === "space-around" ||
    justify === "space-evenly"
  );
}

function getMainPadding(style: FlexStyle, isRow: boolean): number {
  return isRow
    ? style.paddingStart + style.paddingEnd
    : style.paddingTop + style.paddingBottom;
}

function getCrossPadding(style: FlexStyle, isRow: boolean): number {
  return isRow
    ? style.paddingTop + style.paddingBottom
    : style.paddingStart + style.paddingEnd;
}

function getMainMargin(style: FlexStyle, isRow: boolean): number {
  return isRow
    ? style.marginStart + style.marginEnd
    : style.marginTop + style.marginBottom;
}

function getCrossMargin(style: FlexStyle, isRow: boolean): number {
  return isRow
    ? style.marginTop + style.marginBottom
    : style.marginStart + style.marginEnd;
}

function borderSize(enabled: boolean): number {
  return enabled ? 1 : 0;
}

function getMainBorder(style: FlexStyle, isRow: boolean): number {
  return isRow
    ? borderSize(style.borderStart) + borderSize(style.borderEnd)
    : borderSize(style.borderTop) + borderSize(style.borderBottom);
}

function getCrossBorder(style: FlexStyle, isRow: boolean): number {
  return isRow
    ? borderSize(style.borderTop) + borderSize(style.borderBottom)
    : borderSize(style.borderStart) + borderSize(style.borderEnd);
}

function getWidthPaddingBorder(style: FlexStyle): number {
  return (
    style.paddingStart +
    style.paddingEnd +
    borderSize(style.borderStart) +
    borderSize(style.borderEnd)
  );
}

function getHeightPaddingBorder(style: FlexStyle): number {
  return (
    style.paddingTop +
    style.paddingBottom +
    borderSize(style.borderTop) +
    borderSize(style.borderBottom)
  );
}

/**
 * Compute automatic minimum sizes for a layout box (CSS min-width:auto / min-height:auto).
 * Must be called after children are resolved so their autoMin values are set.
 *
 * For leaf nodes (with measure): autoMin is 0. This matches the practical
 * behavior needed for terminal UIs where horizontal overflow is never useful.
 * Text wrapping and overflow:hidden handle visual containment.
 *
 * For containers: padding + border + children's minimums along the main axis.
 */
function computeAutoMin(box: LayoutBox): void {
  if (box.node.measure) {
    // CSS spec: overflow != visible ⇒ automatic minimum size is 0
    if (box.style.overflow !== "visible") {
      box.autoMinWidth = 0;
      box.autoMinHeight = 0;
      return;
    }
    box.autoMinWidth = 0;
    box.autoMinHeight = box.height;
    return;
  }

  const style = box.style;
  const hPB = getWidthPaddingBorder(style);
  const vPB = getHeightPaddingBorder(style);

  if (style.overflow !== "visible") {
    box.autoMinWidth = hPB;
    box.autoMinHeight = vPB;
    return;
  }

  const visible: LayoutBox[] = [];
  for (const child of box.children) {
    if (child.style.display === "none" || child.style.position === "absolute")
      continue;
    visible.push(child);
  }

  if (visible.length === 0) {
    box.autoMinWidth = hPB;
    box.autoMinHeight = vPB;
    return;
  }

  const isRow = style.flexDirection === "row";
  const isWrap = style.flexWrap === "wrap";
  let mainSum = 0;
  let crossMax = 0;
  let mainMax = 0;

  const effectiveGap = isSpaceJustify(style.justifyContent) ? 0 : style.gap;

  for (let i = 0; i < visible.length; i++) {
    const child = visible[i];
    const cs = child.style;
    const childMainMin = isRow ? child.autoMinWidth : child.autoMinHeight;
    const childCrossMin = isRow ? child.autoMinHeight : child.autoMinWidth;
    const mainMargin = getMainMargin(cs, isRow);
    const crossMargin = getCrossMargin(cs, isRow);
    mainSum += childMainMin + mainMargin + (i > 0 ? effectiveGap : 0);
    crossMax = Math.max(crossMax, childCrossMin + crossMargin);
    mainMax = Math.max(mainMax, childMainMin + mainMargin);
  }

  // With flex-wrap, items flow to multiple lines so the minimum is one
  // line's worth (tallest single item) rather than all items stacked.
  const mainAutoMin = isWrap ? mainMax : mainSum;

  if (isRow) {
    box.autoMinWidth = hPB + mainAutoMin;
    box.autoMinHeight = vPB + crossMax;
  } else {
    box.autoMinWidth = hPB + crossMax;
    box.autoMinHeight = vPB + mainAutoMin;
  }
}

/**
 * Distributes a total amount proportionally among weights using integer arithmetic.
 * Remainder goes to items with the largest fractional parts.
 *
 * @param total - Total amount to distribute
 * @param weights - Array of weights (e.g., flexGrow values)
 * @returns Array of distributed amounts (same length as weights)
 */
export function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  if (total <= 0) return weights.map(() => 0);

  const exact = weights.map((w) => (w / sum) * total);
  const result = exact.map((v) => Math.floor(v));

  let remainder = total - result.reduce((a, b) => a + b, 0);
  if (remainder > 0) {
    const fractional = exact.map((v, i) => ({ fraction: v - result[i], i }));
    fractional.sort((a, b) => b.fraction - a.fraction);
    for (let j = 0; j < fractional.length && remainder > 0; j++) {
      result[fractional[j].i]++;
      remainder--;
    }
  }

  return result;
}

function createLine(items: LayoutBox[], gap: number, isRow: boolean): FlexLine {
  let mainSize = 0;
  let crossSize = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const marginMain = getMainMargin(item.style, isRow);
    const marginCross = getCrossMargin(item.style, isRow);

    const itemMain = (isRow ? item.width : item.height) + marginMain;
    const itemCross = (isRow ? item.height : item.width) + marginCross;

    mainSize += itemMain + (i > 0 ? gap : 0);
    crossSize = Math.max(crossSize, itemCross);
  }

  return { items, mainSize, crossSize };
}

function collectLines(
  box: LayoutBox,
  visibleChildren: LayoutBox[],
  isRow: boolean,
): FlexLine[] {
  const style = box.style;
  const availableMain =
    (isRow ? box.width : box.height) -
    getMainPadding(style, isRow) -
    getMainBorder(style, isRow);

  const effectiveGap = style.gap;

  // nowrap: single line with all children
  if (style.flexWrap === "nowrap") {
    return [createLine(visibleChildren, effectiveGap, isRow)];
  }

  const lines: FlexLine[] = [];
  let currentItems: LayoutBox[] = [];
  let currentMainSize = 0;

  for (const child of visibleChildren) {
    const childMainSize = isRow ? child.width : child.height;
    const childTotalMain = childMainSize + getMainMargin(child.style, isRow);

    // Gap before this item (if not first in line)
    const gapBefore = currentItems.length > 0 ? effectiveGap : 0;

    // IMPORTANT: Always allow at least one item per line, even if oversized.
    // Without this check, an item larger than availableMain would cause an
    // infinite loop (never fits, keeps trying to start new line).
    const wouldOverflow =
      currentMainSize + gapBefore + childTotalMain > availableMain;
    const hasItemsOnLine = currentItems.length > 0;

    if (wouldOverflow && hasItemsOnLine) {
      lines.push(createLine(currentItems, effectiveGap, isRow));
      currentItems = [child];
      currentMainSize = childTotalMain;
    } else {
      currentItems.push(child);
      currentMainSize += gapBefore + childTotalMain;
    }
  }

  if (currentItems.length > 0) {
    lines.push(createLine(currentItems, effectiveGap, isRow));
  }

  return lines;
}

function calculateIntrinsicSize(
  box: LayoutBox,
  axis: "width" | "height",
): number {
  const style = box.style;
  const isRow = style.flexDirection === "row";
  const isMainAxis =
    (axis === "width" && isRow) || (axis === "height" && !isRow);

  const paddingBorder =
    axis === "width"
      ? getWidthPaddingBorder(style)
      : getHeightPaddingBorder(style);

  const visibleChildren: LayoutBox[] = [];
  for (const child of box.children) {
    if (child.style.display === "none") continue;
    if (child.style.position === "absolute") continue;
    visibleChildren.push(child);
  }

  if (visibleChildren.length === 0) {
    return paddingBorder;
  }

  if (style.overflow !== "visible") {
    return paddingBorder;
  }

  // Note: For cross-axis intrinsic size with wrap, we can't compute actual lines
  // without knowing main-axis size first. We assume single-line behavior (max of
  // children). The actual line-based cross size is computed in resolveFlexAndPosition
  // after dimensions are set.

  let contentSize = 0;

  if (isMainAxis) {
    // Main axis: sum of children sizes + gaps
    for (let i = 0; i < visibleChildren.length; i++) {
      const child = visibleChildren[i];
      contentSize += child[axis] + getMainMargin(child.style, isRow);
      if (i > 0) contentSize += style.gap;
    }
  } else {
    // Cross axis: max of children sizes
    for (const child of visibleChildren) {
      contentSize = Math.max(
        contentSize,
        child[axis] + getCrossMargin(child.style, isRow),
      );
    }
  }

  return contentSize + paddingBorder;
}

/**
 * Resolves intrinsic sizes recursively, top-down, propagating available width
 * from parent to children. This ensures leaf measure functions receive a
 * constrained width when the container has a definite size, enabling text
 * wrapping and proper flex distribution.
 *
 * The available width for a child depends on the parent's flex direction:
 * - Column parent: children share the cross-axis width, so availableWidth
 *   is the parent's content width.
 * - Row parent: children share the main-axis width, so availableWidth
 *   is the row's content width as an upper bound for each child.
 */
function resolveIntrinsicSizeRecursive(
  box: LayoutBox,
  availableWidth: number,
): void {
  const style = box.style;
  const isRoot = box.parent === null;

  const parentIsRow = box.parent?.style.flexDirection === "row";
  const parentIsColumn = box.parent?.style.flexDirection === "column";

  // 1. If flexBasis is numeric, use it for the main axis
  if (typeof style.flexBasis === "number" && box.parent !== null) {
    if (parentIsRow) {
      box.width = style.flexBasis;
    } else if (parentIsColumn) {
      box.height = style.flexBasis;
    }
  }

  // 2. If explicit size, use it (overrides flexBasis)
  if (typeof style.width === "number") {
    box.width = style.width;
  }
  if (typeof style.height === "number") {
    box.height = style.height;
  }

  // Compute this box's content area width for propagating to children
  const contentWidth = Math.max(
    0,
    box.width -
      style.paddingStart -
      style.paddingEnd -
      borderSize(style.borderStart) -
      borderSize(style.borderEnd),
  );

  // If width is still 0 (auto), use the available width from parent
  const effectiveContentWidth = box.width > 0 ? contentWidth : availableWidth;

  // 3. If measure function (leaf node like Text), measure with constrained width
  if (box.node.measure) {
    const widthKnown = box.width > 0;
    const heightKnown = box.height > 0;

    const availW = widthKnown ? contentWidth : effectiveContentWidth;
    const availH = heightKnown
      ? Math.max(
          0,
          box.height -
            style.paddingTop -
            style.paddingBottom -
            borderSize(style.borderTop) -
            borderSize(style.borderBottom),
        )
      : Number.POSITIVE_INFINITY;

    const measured = box.node.measure(availW, availH);

    if (!widthKnown) box.width = measured.width;
    if (!heightKnown) box.height = measured.height;

    computeAutoMin(box);
    clampBoxSize(box);
    return;
  }

  // 4. Container: recurse into children with propagated available width
  const childAvailableWidth = effectiveContentWidth;

  for (const child of box.children) {
    if (child.style.display === "none") continue;
    resolveIntrinsicSizeRecursive(child, childAvailableWidth);
  }

  // 5. Compute intrinsic sizes from children (same as before)
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

  computeAutoMin(box);
  clampBoxSize(box);
}

function distributeGrowForLine(
  items: LayoutBox[],
  availableSpace: number,
  isRow: boolean,
): void {
  if (availableSpace <= 0) return;

  const flexChildren: LayoutBox[] = [];
  const weights: number[] = [];

  for (const child of items) {
    if (child.style.flexGrow > 0) {
      flexChildren.push(child);
      weights.push(child.style.flexGrow);
    }
  }

  if (flexChildren.length === 0) return;

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

// Shrink is weighted by flexShrink * baseSize, clamped to automatic minimums.
function distributeShrinkForLine(
  items: LayoutBox[],
  overflow: number,
  isRow: boolean,
): void {
  if (overflow <= 0) return;

  const shrinkChildren: LayoutBox[] = [];
  const weights: number[] = [];
  const effectiveMins: number[] = [];

  for (const child of items) {
    if (child.style.flexShrink > 0) {
      const baseSize = isRow ? child.width : child.height;
      const explicitMin = isRow ? child.style.minWidth : child.style.minHeight;
      const autoMin = isRow ? child.autoMinWidth : child.autoMinHeight;
      const effectiveMin =
        typeof explicitMin === "number" ? explicitMin : autoMin;
      const shrinkable = Math.max(0, baseSize - effectiveMin);
      const weight = child.style.flexShrink * shrinkable;
      shrinkChildren.push(child);
      weights.push(weight);
      effectiveMins.push(effectiveMin);
    }
  }

  if (shrinkChildren.length === 0) return;

  const totalShrinkable = weights.reduce((a, b) => a + b, 0);
  const clampedOverflow = Math.min(overflow, totalShrinkable);
  const shrinkAmounts = distribute(clampedOverflow, weights);

  for (let i = 0; i < shrinkChildren.length; i++) {
    const child = shrinkChildren[i];
    const baseSize = isRow ? child.width : child.height;
    const newSize = Math.max(baseSize - shrinkAmounts[i], effectiveMins[i]);

    if (isRow) {
      child.width = newSize;
    } else {
      child.height = newSize;
    }
  }
}

function calculateAvailableMainSpaceForLine(
  box: LayoutBox,
  line: FlexLine,
): number {
  const style = box.style;
  const isRow = style.flexDirection === "row";
  const availableMain =
    (isRow ? box.width : box.height) -
    getMainPadding(style, isRow) -
    getMainBorder(style, isRow);

  return availableMain - line.mainSize;
}

function applyJustifyContentForLine(
  box: LayoutBox,
  line: FlexLine,
  isRow: boolean,
): void {
  const style = box.style;
  const count = line.items.length;

  if (count === 0) return;

  const availableMain =
    (isRow ? box.width : box.height) -
    getMainPadding(style, isRow) -
    getMainBorder(style, isRow);

  const remaining = availableMain - line.mainSize;

  const borderStart = isRow
    ? borderSize(style.borderStart)
    : borderSize(style.borderTop);
  let pos = (isRow ? style.paddingStart : style.paddingTop) + borderStart;

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

  let gap: number;

  if (style.justifyContent === "space-between") {
    gap = style.gap + (count > 1 ? remaining / (count - 1) : 0);
  } else if (style.justifyContent === "space-around") {
    gap = style.gap + remaining / count;
  } else if (style.justifyContent === "space-evenly") {
    gap = style.gap + remaining / (count + 1);
  } else {
    gap = style.gap;
  }

  let precedingSize = 0;
  for (let i = 0; i < line.items.length; i++) {
    const child = line.items[i];
    const marginStart = isRow ? child.style.marginStart : child.style.marginTop;
    const marginEnd = isRow ? child.style.marginEnd : child.style.marginBottom;
    const mainSize = isRow ? child.width : child.height;

    const childPos = pos + precedingSize + i * gap + marginStart;

    if (isRow) {
      child.x = Math.round(childPos);
    } else {
      child.y = Math.round(childPos);
    }

    precedingSize += marginStart + mainSize + marginEnd;
  }
}

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

function positionAbsoluteChildren(
  box: LayoutBox,
  absoluteChildren: LayoutBox[],
): void {
  const style = box.style;

  // Content area bounds (inside border and padding)
  const borderStartSize = borderSize(style.borderStart);
  const borderEndSize = borderSize(style.borderEnd);
  const borderTopSize = borderSize(style.borderTop);
  const borderBottomSize = borderSize(style.borderBottom);
  const contentLeft = borderStartSize + style.paddingStart;
  const contentTop = borderTopSize + style.paddingTop;
  const contentWidth =
    box.width -
    borderStartSize -
    borderEndSize -
    style.paddingStart -
    style.paddingEnd;
  const contentHeight =
    box.height -
    borderTopSize -
    borderBottomSize -
    style.paddingTop -
    style.paddingBottom;

  for (const child of absoluteChildren) {
    const childStyle = child.style;
    let sizeChanged = false;

    // CSS behavior: when both start AND end are specified, compute width from constraints
    if (
      childStyle.width === "auto" &&
      typeof childStyle.start === "number" &&
      typeof childStyle.end === "number"
    ) {
      const newWidth = Math.max(
        0,
        contentWidth - childStyle.start - childStyle.end,
      );
      if (child.width !== newWidth) {
        child.width = newWidth;
        sizeChanged = true;
      }
    }
    // CSS behavior: when both top AND bottom are specified, compute height from constraints
    if (
      childStyle.height === "auto" &&
      typeof childStyle.top === "number" &&
      typeof childStyle.bottom === "number"
    ) {
      const newHeight = Math.max(
        0,
        contentHeight - childStyle.top - childStyle.bottom,
      );
      if (child.height !== newHeight) {
        child.height = newHeight;
        sizeChanged = true;
      }
    }

    // If size changed due to stretch constraints, re-compute intrinsic sizes
    // and re-layout the child's descendants
    if (sizeChanged) {
      const childBorderStart = borderSize(childStyle.borderStart);
      const childBorderEnd = borderSize(childStyle.borderEnd);
      const absoluteContentWidth = Math.max(
        0,
        child.width -
          childBorderStart -
          childBorderEnd -
          childStyle.paddingStart -
          childStyle.paddingEnd,
      );
      for (const c of child.children) {
        resolveIntrinsicSizeRecursive(c, absoluteContentWidth);
      }
      resolveFlexAndPosition(child);
    }

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
    // Note: child sizes are already clamped by resolveIntrinsicSize

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
      clampBoxSize(child);
    }
  }

  // 6. Position items within each line (main axis) and lines on cross axis
  const crossPadding = getCrossPadding(style, isRow);
  const crossBorder = getCrossBorder(style, isRow);
  const borderCrossStart = isRow
    ? borderSize(style.borderTop)
    : borderSize(style.borderStart);
  const paddingCrossStart = isRow ? style.paddingTop : style.paddingStart;

  // Calculate container's cross-axis content size (used for nowrap single line)
  const containerCrossSize =
    (isRow ? box.height : box.width) - crossPadding - crossBorder;

  const justifyGap = style.gap;

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
  let crossPos = borderCrossStart + paddingCrossStart;
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
          // First line at start, last at end, remaining space distributed between
          if (lineCount > 1) {
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
      box[crossSizeProp] = totalCrossSize + crossPadding + crossBorder;
    }
  }

  // Note: Screen coordinates are computed by finalizePositions() after all passes
}

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

  // 3. Resolve intrinsic sizes (top-down recursive with width propagation)
  resolveIntrinsicSizeRecursive(root, root.width);

  // 4. Resolve flex and positions (top-down)
  const topDownQueue = buildTopDownQueue(root);
  for (const box of topDownQueue) {
    resolveFlexAndPosition(box);
  }

  // 6. Finalize absolute screen coordinates (top-down walk)
  // Root starts at (0, 0) with no parent offset
  finalizePositions(root, 0, 0);

  // 7. Convert to LayoutResult
  const result = toLayoutResult(root);

  if (!nodeCache) {
    nodeCache = new Map();
    layoutCache.set(node, nodeCache);
  }
  nodeCache.set(cacheKey, result);

  return result;
}
