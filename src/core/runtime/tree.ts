import type {
  FlexStyle,
  LayoutNode,
  LayoutResult,
} from "../layout.ts";
import type { Node } from "./Node.ts";

/**
 * Resolves a node's style, handling reactive style getters.
 */
export function resolveNodeStyle(node: Node): FlexStyle {
  return typeof node.style === "function" ? node.style() : node.style;
}

/**
 * Resolves a node's children array, handling reactive children getters (from Show/For).
 * Returns an empty array if children is undefined.
 */
export function resolveNodeChildren(node: Node): Node[] {
  return typeof node.children === "function"
    ? (node.children as () => Node[])()
    : (node.children ?? []);
}

/**
 * Build path from target node to root by following _parent pointers.
 * O(depth) complexity instead of O(n) tree search.
 *
 * Parent pointers are set by Box and Show/For when constructing the node tree.
 */
export function buildPathToRoot(target: Node): Node[] {
  const path: Node[] = [];
  let current: Node | undefined = target;

  while (current) {
    path.push(current);
    current = current._parent;
  }

  return path; // First element is target, last is root
}

/**
 * Check if a node is contained within a subtree.
 * Uses parent pointers to walk up from the node and check if the container
 * is an ancestor.
 */
export function isNodeInSubtree(node: Node, subtreeRoot: Node): boolean {
  let current: Node | undefined = node;
  while (current) {
    if (current === subtreeRoot) {
      return true;
    }
    current = current._parent;
  }
  return false;
}

/**
 * Flattens a node tree into a list, hoisting children of `display: "contents"` nodes.
 * Skips `display: "none"` nodes.
 * Used by updateAllLayoutSignals where we only need the nodes, not accessors.
 */
export function flattenNodes(node: Node, result: Node[]): void {
  const style = resolveNodeStyle(node);

  if (style.display === "none") {
    return;
  }

  if (style.display === "contents") {
    for (const child of resolveNodeChildren(node)) {
      flattenNodes(child, result);
    }
    return;
  }

  result.push(node);

  for (const child of resolveNodeChildren(node)) {
    flattenNodes(child, result);
  }
}

/**
 * Convert runtime Node to layout system's LayoutNode.
 * Resolves reactive styles and handles children as either array or getter function.
 */
export function nodeToLayoutNode(node: Node): LayoutNode {
  const style = resolveNodeStyle(node);
  const children = resolveNodeChildren(node);

  return {
    style,
    children: children.map(nodeToLayoutNode),
    measure: node.measure,
  };
}

/**
 * Hit-test a node's children against layout children, returning the number
 * of layout children consumed. Handles display:contents nodes which don't
 * consume a layout slot but whose children do.
 */
function hitTestChildren(
  children: Node[],
  layoutChildren: LayoutResult[],
  startIndex: number,
  x: number,
  y: number,
): { hit: Node | null; consumed: number } {
  let consumed = 0;
  let lastHit: Node | null = null;

  for (const child of children) {
    const childStyle = resolveNodeStyle(child);

    if (childStyle.display === "none") {
      // display:none consumes a layout slot but doesn't render
      consumed++;
      continue;
    }

    if (childStyle.display === "contents") {
      // display:contents doesn't consume a layout slot; its children do
      const grandchildren = resolveNodeChildren(child);
      const result = hitTestChildren(
        grandchildren,
        layoutChildren,
        startIndex + consumed,
        x,
        y,
      );
      consumed += result.consumed;
      if (result.hit) {
        lastHit = result.hit;
      }
      continue;
    }

    const childLayout = layoutChildren[startIndex + consumed];
    consumed++;
    if (!childLayout) continue;

    const hit = hitTest(child, childLayout, x, y);
    if (hit) {
      lastHit = hit;
    }
  }

  return { hit: lastHit, consumed };
}

/**
 * Find the deepest node containing a point using screen coordinates.
 *
 * Uses screenX/screenY from layout results since mouse events report
 * absolute terminal positions.
 *
 * @param node - Node to test
 * @param layout - Layout result for the node
 * @param x - Mouse x coordinate (0-indexed column)
 * @param y - Mouse y coordinate (0-indexed row)
 * @returns The deepest node containing the point, or null if outside bounds
 */
export function hitTest(
  node: Node,
  layout: LayoutResult,
  x: number,
  y: number,
): Node | null {
  const { screenX, screenY, width, height } = layout;

  if (
    x < screenX ||
    x >= screenX + width ||
    y < screenY ||
    y >= screenY + height
  ) {
    return null;
  }

  const children = resolveNodeChildren(node);
  const childLayouts = layout.children ?? [];

  const { hit } = hitTestChildren(children, childLayouts, 0, x, y);
  return hit ?? node;
}
