// Popover component - floating panel anchored to a trigger element

import type { KeyEvent } from "../core/input.ts";
import type { FlexStyle } from "../core/layout.ts";
import type { Node, Ref, RuntimeContext } from "../core/runtime.ts";
import {
  Box,
  Portal,
  Show,
  createRef,
  getActiveContext,
} from "../core/runtime.ts";
import { type MaybeAccessor, resolve } from "../core/signals.ts";

/**
 * Placement options for the popover relative to its trigger.
 */
export type PopoverPlacement =
  | "top"
  | "top-start"
  | "top-end"
  | "bottom"
  | "bottom-start"
  | "bottom-end"
  | "left"
  | "left-start"
  | "left-end"
  | "right"
  | "right-start"
  | "right-end";

/**
 * Props for the Popover component.
 */
export interface PopoverProps {
  /** Whether the popover is open */
  open: MaybeAccessor<boolean>;

  /** Called when popover should close */
  onClose?: () => void;

  /** Popover content */
  content: () => Node | Node[];

  /** Trigger element (receives anchor props) */
  children: (anchorProps: { ref: Ref }) => Node;

  /** Placement relative to trigger. Default: "bottom-start" */
  placement?: MaybeAccessor<PopoverPlacement>;

  /** Style overrides for popover container */
  style?: Partial<FlexStyle>;
}

/**
 * Find the layout result for a specific node by traversing both trees in parallel.
 * Returns undefined if the node is not found or if layout hasn't been computed yet.
 */
function findNodeLayout(
  targetNode: Node,
  node: Node,
  layout: import("../core/layout.ts").LayoutResult,
): import("../core/layout.ts").LayoutResult | undefined {
  if (node === targetNode) {
    return layout;
  }

  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : (node.children ?? []);
  const childLayouts = layout.children ?? [];

  const style = typeof node.style === "function" ? node.style() : node.style;
  if (style.display === "contents") {
    let layoutIndex = 0;
    for (const child of children) {
      if (child._isPortal) continue;

      const childStyle =
        typeof child.style === "function" ? child.style() : child.style;

      if (childStyle.display === "contents") {
        const result = findNodeLayout(targetNode, child, {
          ...layout,
          children: childLayouts.slice(layoutIndex),
        });
        if (result) return result;
        const grandchildren =
          typeof child.children === "function"
            ? (child.children as () => Node[])()
            : (child.children ?? []);
        layoutIndex += countLayoutNodes(grandchildren);
      } else {
        const childLayout = childLayouts[layoutIndex];
        if (childLayout) {
          const result = findNodeLayout(targetNode, child, childLayout);
          if (result) return result;
        }
        layoutIndex++;
      }
    }
    return undefined;
  }

  let layoutIndex = 0;
  for (const child of children) {
    if (child._isPortal) continue;

    const childStyle =
      typeof child.style === "function" ? child.style() : child.style;

    if (childStyle.display === "contents") {
      const result = findNodeLayout(targetNode, child, {
        ...layout,
        children: childLayouts.slice(layoutIndex),
      });
      if (result) return result;
      const grandchildren =
        typeof child.children === "function"
          ? (child.children as () => Node[])()
          : (child.children ?? []);
      layoutIndex += countLayoutNodes(grandchildren);
    } else {
      const childLayout = childLayouts[layoutIndex];
      if (childLayout) {
        const result = findNodeLayout(targetNode, child, childLayout);
        if (result) return result;
      }
      layoutIndex++;
    }
  }

  return undefined;
}

/**
 * Count how many layout nodes a subtree produces (excluding display: "contents" wrappers).
 */
function countLayoutNodes(nodes: Node[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node._isPortal) continue;
    const style = typeof node.style === "function" ? node.style() : node.style;
    if (style.display === "contents") {
      const children =
        typeof node.children === "function"
          ? (node.children as () => Node[])()
          : (node.children ?? []);
      count += countLayoutNodes(children);
    } else {
      count++;
    }
  }
  return count;
}

/**
 * Compute the intrinsic (content-based) size of a node.
 * For leaf nodes with measure(), returns the measured size.
 * For containers, recursively computes based on children.
 */
function computeIntrinsicSize(
  node: Node,
  layout: import("../core/layout.ts").LayoutResult,
): { width: number; height: number } {
  if (node.measure) {
    return node.measure(layout.width, layout.height);
  }

  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : (node.children ?? []);
  const childLayouts = layout.children ?? [];

  if (children.length === 0) {
    return { width: layout.width, height: layout.height };
  }

  const style = typeof node.style === "function" ? node.style() : node.style;
  const isRow = style.flexDirection === "row";

  let width = 0;
  let height = 0;
  let layoutIndex = 0;

  for (const child of children) {
    if (child._isPortal) continue;

    const childStyle =
      typeof child.style === "function" ? child.style() : child.style;

    if (childStyle.display === "none") continue;
    if (childStyle.position === "absolute") continue;

    const childLayout = childLayouts[layoutIndex];
    if (!childLayout) {
      layoutIndex++;
      continue;
    }

    const childSize = computeIntrinsicSize(child, childLayout);

    if (isRow) {
      width += childSize.width;
      height = Math.max(height, childSize.height);
    } else {
      width = Math.max(width, childSize.width);
      height += childSize.height;
    }

    layoutIndex++;
  }

  const paddingH = (style.paddingStart ?? 0) + (style.paddingEnd ?? 0);
  const paddingV = (style.paddingTop ?? 0) + (style.paddingBottom ?? 0);
  const borderH = (style.borderStart ? 1 : 0) + (style.borderEnd ? 1 : 0);
  const borderV = (style.borderTop ? 1 : 0) + (style.borderBottom ? 1 : 0);

  return {
    width: width + paddingH + borderH,
    height: height + paddingV + borderV,
  };
}

/**
 * Get the screen position and size of a node from the current layout.
 * Returns the node's screen position and intrinsic (content-based) size.
 * Returns undefined if the node is not found or layout hasn't been computed.
 */
function getNodePosition(
  ctx: RuntimeContext,
  node: Node,
):
  | { screenX: number; screenY: number; width: number; height: number }
  | undefined {
  const { state } = ctx;
  if (!state.layoutResult) return undefined;

  const layout = findNodeLayout(node, state.root, state.layoutResult);
  if (!layout) return undefined;

  const intrinsicSize = computeIntrinsicSize(node, layout);

  return {
    screenX: layout.screenX,
    screenY: layout.screenY,
    width: intrinsicSize.width,
    height: intrinsicSize.height,
  };
}

/**
 * Calculate position for the popover based on anchor position and placement.
 */
function calculatePosition(
  anchor: { screenX: number; screenY: number; width: number; height: number },
  placement: PopoverPlacement,
): { top: number; start: number } {
  const { screenX, screenY, width, height } = anchor;

  switch (placement) {
    case "bottom-start":
    case "bottom":
    case "bottom-end":
      return { top: screenY + height, start: screenX };

    case "top-start":
    case "top":
    case "top-end":
      return { top: screenY - 1, start: screenX };

    case "left-start":
    case "left":
    case "left-end":
      return { top: screenY, start: screenX - 1 };

    case "right-start":
    case "right":
    case "right-end":
      return { top: screenY, start: screenX + width };

    default:
      return { top: screenY + height, start: screenX };
  }
}

/**
 * A floating panel anchored to a trigger element.
 *
 * Popover is a foundational component for building dropdowns, tooltips,
 * and other floating UI elements. The trigger renders in normal document
 * flow, while the content floats via Portal when open.
 *
 * The popover is intentionally unstyled - it renders content with no default
 * border, padding, or colors. Use style overrides to add visual styling.
 *
 * @example
 * ```typescript
 * const [open, setOpen] = createSignal(false);
 *
 * Popover({
 *   open,
 *   onClose: () => setOpen(false),
 *   placement: "bottom-start",
 *   content: () => [
 *     Text({ content: "Popover content" }),
 *   ],
 *   children: (props) =>
 *     Button({
 *       ...props,
 *       children: "Open",
 *       onClick: () => setOpen(true),
 *     }),
 * });
 *
 * // With styling
 * Popover({
 *   open,
 *   onClose: () => setOpen(false),
 *   content: () => menuItems,
 *   children: (props) => trigger,
 *   style: {
 *     border: "single",
 *     padding: 1,
 *   },
 * });
 * ```
 */
export function Popover(props: PopoverProps): Node {
  const anchorRef = createRef();
  const isOpen = () => resolve(props.open) ?? false;
  const getPlacement = () => resolve(props.placement) ?? "bottom-start";

  const ctx = getActiveContext();

  const handleKeyPress = (key: KeyEvent): boolean | undefined => {
    if (key.name === "escape") {
      props.onClose?.();
      return true;
    }
    return false;
  };

  const getPositionStyle = (): { top: number; start: number } => {
    if (!ctx || !anchorRef.current) {
      return { top: 0, start: 0 };
    }

    const anchorPos = getNodePosition(ctx, anchorRef.current);
    if (!anchorPos) {
      return { top: 0, start: 0 };
    }

    return calculatePosition(anchorPos, getPlacement());
  };

  const trigger = props.children({ ref: anchorRef });

  return Box({
    display: "contents",
    children: [
      trigger,
      Show({
        when: isOpen,
        children: () =>
          Portal({
            children: [
              Box({
                position: "absolute",
                top: 0,
                start: 0,
                bottom: 0,
                end: 0,
                children: [
                  Box({
                    position: "absolute",
                    top: () => getPositionStyle().top,
                    start: () => getPositionStyle().start,
                    onKeyPress: handleKeyPress,
                    focusable: true,
                    ...props.style,
                    children: props.content(),
                  }),
                ],
              }),
            ],
          }),
      }),
    ],
  });
}
