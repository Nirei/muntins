import type { LayoutResult } from "../layout.ts";
import type { ClipRect, InheritedStyle } from "../render.ts";
import { intersectClipRect } from "../render.ts";
import type { Accessor } from "../signals.ts";
import { batch } from "../signals.ts";
import { createLayoutSignals } from "./LayoutSignals.ts";
import type { Node } from "./Node.ts";
import { computeInheritedStyle } from "./paint.ts";
import {
  flattenNodes,
  resolveNodeChildren,
  resolveNodeStyle,
} from "./tree.ts";

type InheritedStyleAccessor = Accessor<InheritedStyle>;

/**
 * A bindable node with its context (parent accessors).
 * Used for parallel iteration with flattened layout results.
 */
interface BindableNode {
  node: Node;
  inheritedAccessor: InheritedStyleAccessor;
  clipAccessor: Accessor<ClipRect>;
}

/**
 * Flattens a node tree into bindable nodes.
 * Hoists children of `display: "contents"` nodes.
 * Skips `display: "none"` nodes.
 */
function flattenBindableNodes(
  node: Node,
  inheritedAccessor: InheritedStyleAccessor,
  clipAccessor: Accessor<ClipRect>,
  result: BindableNode[],
): void {
  const style = resolveNodeStyle(node);

  if (style.display === "none") {
    return;
  }

  if (style.display === "contents") {
    const wrapperInheritedAccessor: InheritedStyleAccessor = () =>
      computeInheritedStyle(node, inheritedAccessor());

    for (const child of resolveNodeChildren(node)) {
      flattenBindableNodes(
        child,
        wrapperInheritedAccessor,
        clipAccessor,
        result,
      );
    }
    return;
  }

  result.push({ node, inheritedAccessor, clipAccessor });

  const childInheritedAccessor: InheritedStyleAccessor = () =>
    computeInheritedStyle(node, inheritedAccessor());

  const childClipAccessor: Accessor<ClipRect> = () => {
    const parentClip = clipAccessor();
    const s = resolveNodeStyle(node);
    const layout = node._layout;
    if (s.overflow === "hidden" && layout) {
      return intersectClipRect(parentClip, {
        x: layout.screenX(),
        y: layout.screenY(),
        width: layout.width(),
        height: layout.height(),
      });
    }
    return parentClip;
  };

  for (const child of resolveNodeChildren(node)) {
    flattenBindableNodes(
      child,
      childInheritedAccessor,
      childClipAccessor,
      result,
    );
  }
}

/**
 * Flattens a LayoutResult tree into a list matching the order produced by
 * `flattenBindableNodes`. Traverses node tree and layout tree in parallel,
 * skipping contents and none nodes (which don't have layout results).
 *
 * Returns the number of layout results consumed from the layoutChildren array.
 */
function flattenLayoutResultsInner(
  node: Node,
  layoutChildren: LayoutResult[],
  startIndex: number,
  result: LayoutResult[],
): number {
  const style = resolveNodeStyle(node);

  // display: none nodes still consume a layout slot but we skip them in results
  if (style.display === "none") {
    return 1;
  }

  if (style.display === "contents") {
    let consumed = 0;
    for (const child of resolveNodeChildren(node)) {
      consumed += flattenLayoutResultsInner(
        child,
        layoutChildren,
        startIndex + consumed,
        result,
      );
    }
    return consumed;
  }

  const layout = layoutChildren[startIndex];
  if (!layout) return 0;

  result.push(layout);

  let childConsumed = 0;
  for (const child of resolveNodeChildren(node)) {
    childConsumed += flattenLayoutResultsInner(
      child,
      layout.children,
      childConsumed,
      result,
    );
  }

  return 1;
}

/**
 * Flattens a LayoutResult tree into a list matching `flattenBindableNodes`.
 */
function flattenLayoutResults(
  layoutResult: LayoutResult,
  root: Node,
  result: LayoutResult[],
): void {
  const rootStyle = resolveNodeStyle(root);

  if (rootStyle.display === "contents") {
    let consumed = 0;
    for (const child of resolveNodeChildren(root)) {
      consumed += flattenLayoutResultsInner(
        child,
        layoutResult.children,
        consumed,
        result,
      );
    }
  } else {
    flattenLayoutResultsInner(root, [layoutResult], 0, result);
  }
}

/**
 * Binds a single node with its layout result.
 * Creates layout signals if needed.
 */
function bindSingleNode(bindable: BindableNode, layout: LayoutResult): void {
  const { node } = bindable;

  if (!node._layout) {
    node._layout = createLayoutSignals();
  }
  node._layout.setLayout(layout);
}

/**
 * Binds nodes in the tree.
 * Sets up layout signals for each node.
 *
 * @param onlyNew - If true, only binds nodes that don't have layout signals yet.
 *                  Used during relayout to bind newly created nodes (Show/For).
 */
export function bindNodes(
  root: Node,
  layoutResult: LayoutResult,
  rootInheritedAccessor: InheritedStyleAccessor,
  rootClipAccessor: Accessor<ClipRect>,
  onlyNew = false,
): void {
  const bindableNodes: BindableNode[] = [];
  flattenBindableNodes(
    root,
    rootInheritedAccessor,
    rootClipAccessor,
    bindableNodes,
  );

  const layouts: LayoutResult[] = [];
  flattenLayoutResults(layoutResult, root, layouts);

  for (let i = 0; i < bindableNodes.length; i++) {
    const { node } = bindableNodes[i];
    if (onlyNew && node._layout) continue;
    bindSingleNode(bindableNodes[i], layouts[i]);
  }
}

/**
 * Updates layout signals for all existing nodes.
 * Uses flattened parallel iteration.
 */
export function updateAllLayoutSignals(
  root: Node,
  layoutResult: LayoutResult,
): void {
  const nodes: Node[] = [];
  flattenNodes(root, nodes);

  const layouts: LayoutResult[] = [];
  flattenLayoutResults(layoutResult, root, layouts);

  batch(() => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node._layout) {
        node._layout.setLayout(layouts[i]);
      }
    }
  });
}

/**
 * Clears layout signals for a subtree being removed.
 */
export function clearSubtreeLayoutSignals(node: Node): void {
  node._layout = undefined;

  for (const child of resolveNodeChildren(node)) {
    clearSubtreeLayoutSignals(child);
  }
}
