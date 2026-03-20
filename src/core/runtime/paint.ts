import type { Buffer } from "../buffer.ts";
import type { LayoutResult } from "../layout.ts";
import {
  type ClipRect,
  type InheritedStyle,
  intersectClipRect,
  resolveInheritable,
} from "../render.ts";
import type { Node } from "./Node.ts";
import { resolveNodeChildren, resolveNodeStyle } from "./tree.ts";

/**
 * Compute resolved inherited style from a node's inheritable props.
 * Merges with parent inherited style, resolving any "inherit" values.
 */
export function computeInheritedStyle(
  node: Node,
  parentStyle: InheritedStyle,
): InheritedStyle {
  const props = node._inheritableProps;
  if (!props) {
    return parentStyle;
  }

  return {
    color: resolveInheritable(props.color, parentStyle.color),
    backgroundColor: resolveInheritable(
      props.backgroundColor,
      parentStyle.backgroundColor,
    ),
    borderColor: resolveInheritable(props.borderColor, parentStyle.borderColor),
    bold: resolveInheritable(props.bold, parentStyle.bold),
    dim: resolveInheritable(props.dim, parentStyle.dim),
    italic: resolveInheritable(props.italic, parentStyle.italic),
    underline: resolveInheritable(props.underline, parentStyle.underline),
    strikethrough: resolveInheritable(
      props.strikethrough,
      parentStyle.strikethrough,
    ),
    inverse: resolveInheritable(props.inverse, parentStyle.inverse),
  };
}

/**
 * Paints a node and its children, returning the number of layout children consumed.
 * Handles display:contents nodes by recursively painting their children without
 * consuming a layout slot for the contents node itself.
 */
function paintNode(
  node: Node,
  layoutChildren: LayoutResult[],
  startIndex: number,
  buffer: Buffer,
  inherited: InheritedStyle,
  clip: ClipRect,
  stdout: NodeJS.WriteStream,
): number {
  const style = resolveNodeStyle(node);

  // display: none nodes don't render but DO consume a layout slot
  if (style.display === "none") {
    return 1;
  }

  // Handle display: contents nodes - they don't have their own layout,
  // their children use layouts from the parent's children array
  if (style.display === "contents") {
    const wrapperInherited = computeInheritedStyle(node, inherited);
    let consumed = 0;

    for (const child of resolveNodeChildren(node)) {
      consumed += paintNode(
        child,
        layoutChildren,
        startIndex + consumed,
        buffer,
        wrapperInherited,
        clip,
        stdout,
      );
    }
    return consumed;
  }

  // Normal node - consume one layout slot
  const layoutResult = layoutChildren[startIndex];
  if (!layoutResult) return 0;

  const nodeInherited = computeInheritedStyle(node, inherited);

  if (node.render) {
    node.render(
      layoutResult.screenX,
      layoutResult.screenY,
      layoutResult.width,
      layoutResult.height,
      buffer,
      nodeInherited,
      clip,
    );
  }

  // Compute clip rect for children
  const childClip =
    style.overflow === "hidden"
      ? intersectClipRect(clip, {
          x: layoutResult.screenX,
          y: layoutResult.screenY,
          width: layoutResult.width,
          height: layoutResult.height,
        })
      : clip;

  // Recurse into children using this node's layout children
  let childIndex = 0;
  for (const child of resolveNodeChildren(node)) {
    childIndex += paintNode(
      child,
      layoutResult.children,
      childIndex,
      buffer,
      nodeInherited,
      childClip,
      stdout,
    );
  }

  return 1;
}

/**
 * Paints all nodes in the tree by calling their render() functions.
 */
export function paintTree(
  root: Node,
  layoutResult: LayoutResult,
  buffer: Buffer,
  inherited: InheritedStyle,
  clip: ClipRect,
  stdout: NodeJS.WriteStream,
): void {
  const rootStyle = resolveNodeStyle(root);

  if (rootStyle.display === "contents") {
    const wrapperInherited = computeInheritedStyle(root, inherited);
    let childIndex = 0;

    for (const child of resolveNodeChildren(root)) {
      childIndex += paintNode(
        child,
        layoutResult.children,
        childIndex,
        buffer,
        wrapperInherited,
        clip,
        stdout,
      );
    }
    return;
  }

  paintNode(root, [layoutResult], 0, buffer, inherited, clip, stdout);
}
