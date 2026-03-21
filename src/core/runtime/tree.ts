import type { LayoutResult } from "../layout.ts";
import type { Node } from "./Node.ts";

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
    const childStyle = child.resolveStyle();

    if (childStyle.display === "none") {
      consumed++;
      continue;
    }

    if (childStyle.display === "contents") {
      const grandchildren = child.resolveChildren();
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

  const children = node.resolveChildren();
  const childLayouts = layout.children ?? [];

  const { hit } = hitTestChildren(children, childLayouts, 0, x, y);
  return hit ?? node;
}
