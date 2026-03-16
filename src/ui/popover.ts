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
  open: boolean | (() => boolean);

  /** Called when popover should close */
  onClose?: () => void;

  /** Popover content */
  content: () => Node | Node[];

  /** Trigger element (receives anchor props) */
  children: (anchorProps: { ref: Ref }) => Node;

  /** Placement relative to trigger. Default: "bottom-start" */
  placement?: PopoverPlacement | (() => PopoverPlacement);

  /** Style overrides for popover container */
  style?: Partial<FlexStyle>;
}

/**
 * Resolve a value that may be static or a getter function.
 */
function resolve<T>(value: T | (() => T) | undefined): T | undefined {
  return typeof value === "function" ? (value as () => T)() : value;
}

/**
 * Normalize content to an array of nodes.
 */
function normalizeContent(content: Node | Node[]): Node[] {
  return Array.isArray(content) ? content : [content];
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
  // Check if this is the target node
  if (node === targetNode) {
    return layout;
  }

  // Get children (may be a getter for Show/For)
  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : (node.children ?? []);
  const childLayouts = layout.children ?? [];

  // Handle display: "contents" nodes - their children are hoisted in layout
  const style = typeof node.style === "function" ? node.style() : node.style;
  if (style.display === "contents") {
    // For display: "contents", layout results correspond to grandchildren
    // We need to recurse into children but match against the flattened layout
    let layoutIndex = 0;
    for (const child of children) {
      // Skip portal children (they have their own layout)
      if (child._isPortal) continue;

      const childStyle =
        typeof child.style === "function" ? child.style() : child.style;

      if (childStyle.display === "contents") {
        // Recursively handle nested display: "contents"
        const result = findNodeLayout(targetNode, child, {
          ...layout,
          children: childLayouts.slice(layoutIndex),
        });
        if (result) return result;
        // Count how many layout results this subtree consumed
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

  // For regular nodes, traverse children with corresponding layouts
  let layoutIndex = 0;
  for (const child of children) {
    // Skip portal children
    if (child._isPortal) continue;

    const childStyle =
      typeof child.style === "function" ? child.style() : child.style;

    if (childStyle.display === "contents") {
      // display: "contents" children's children are hoisted
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
 * Get the screen position and size of a node from the current layout.
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

  return {
    screenX: layout.screenX,
    screenY: layout.screenY,
    width: layout.width,
    height: layout.height,
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
    // Bottom placements (below the trigger)
    case "bottom-start":
      return { top: screenY + height, start: screenX };
    case "bottom":
      return { top: screenY + height, start: screenX };
    case "bottom-end":
      return { top: screenY + height, start: screenX };

    // Top placements (above the trigger)
    case "top-start":
      return { top: screenY - 1, start: screenX };
    case "top":
      return { top: screenY - 1, start: screenX };
    case "top-end":
      return { top: screenY - 1, start: screenX };

    // Left placements (to the left of the trigger)
    case "left-start":
      return { top: screenY, start: screenX - 1 };
    case "left":
      return { top: screenY, start: screenX - 1 };
    case "left-end":
      return { top: screenY, start: screenX - 1 };

    // Right placements (to the right of the trigger)
    case "right-start":
      return { top: screenY, start: screenX + width };
    case "right":
      return { top: screenY, start: screenX + width };
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

  // Capture context for accessing layout results
  const ctx = getActiveContext();

  const handleKeyPress = (key: KeyEvent): boolean | undefined => {
    if (key.name === "escape") {
      props.onClose?.();
      return true;
    }
    return false;
  };

  // Dynamically compute position based on anchor's layout
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

  // Build the trigger node with the anchor ref
  const trigger = props.children({ ref: anchorRef });

  return Box({
    display: "contents",
    children: [
      // Trigger element in normal flow
      trigger,

      // Floating content via Portal when open
      Show({
        when: isOpen,
        children: () =>
          Portal({
            children: [
              // Full-viewport container for absolute positioning
              Box({
                position: "absolute",
                top: 0,
                start: 0,
                bottom: 0,
                end: 0,
                children: [
                  // Positioned popover content
                  Box({
                    position: "absolute",
                    // Position is computed reactively to use anchor's layout position
                    top: (() => getPositionStyle().top) as unknown as number,
                    start: (() =>
                      getPositionStyle().start) as unknown as number,
                    onKeyPress: handleKeyPress,
                    focusable: true,
                    ...props.style,
                    children: normalizeContent(props.content()),
                  }),
                ],
              }),
            ],
          }),
      }),
    ],
  });
}
