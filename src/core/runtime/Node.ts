import type { Buffer, InheritableColor } from "../buffer.ts";
import type {
  ActivateEvent,
  KeyEvent,
  MouseEvent,
  ScrollEvent,
} from "../input.ts";
import type { FlexStyle, LayoutNode } from "../layout.ts";
import type { ClipRect, InheritableBool, InheritedStyle } from "../render.ts";
import type { LayoutSignals } from "./binding.ts";

/**
 * A mutable reference to a node.
 * Enables imperative access to nodes (for focus control).
 */
export interface Ref {
  current: Node | null;
}

/**
 * Create a mutable reference to a node.
 *
 * Refs are bound during node creation by Box/Text components.
 * When a node is disposed (e.g., via Show/For), the ref still holds
 * the stale reference. Users should check node validity before use,
 * or set ref.current = null in an onCleanup callback if needed.
 */
export function createRef(): Ref {
  return { current: null };
}

type InheritableProps = {
  backgroundColor?: InheritableColor | (() => InheritableColor);
  borderColor?: InheritableColor | (() => InheritableColor);
  color?: InheritableColor | (() => InheritableColor);
  bold?: InheritableBool | (() => InheritableBool);
  dim?: InheritableBool | (() => InheritableBool);
  italic?: InheritableBool | (() => InheritableBool);
  underline?: InheritableBool | (() => InheritableBool);
  strikethrough?: InheritableBool | (() => InheritableBool);
  inverse?: InheritableBool | (() => InheritableBool);
};

type MeasureFunction = (
    width: number,
    height: number,
  ) => { width: number; height: number }

type RenderFunction = (
  x: number,
  y: number,
  width: number,
  height: number,
  buffer: Buffer,
  inherited: InheritedStyle,
  clip: ClipRect,
) => void;

/**
 * Constructor argument for Node.
 * Same shape as Node minus runtime-set fields (_parent, _layout) and methods.
 */
export interface NodeInit {
  style: FlexStyle | (() => FlexStyle);
  children?: Node[] | (() => Node[]);
  measure?: MeasureFunction;
  render?: RenderFunction;
  _inheritableProps?: InheritableProps;
  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;
  onKeyPress?: (key: KeyEvent) => boolean | undefined;
  onMousePress?: (event: MouseEvent) => void;
  onMouseRelease?: (event: MouseEvent) => void;
  onMouseMove?: (event: MouseEvent) => void;
  onScroll?: (event: ScrollEvent) => void;
  onHover?: (hovering: boolean) => void;
  onActivate?: (event: ActivateEvent) => void;
  activate?: () => void;
}

/**
 * The central data structure representing a UI element.
 *
 * Nodes either have children (container) or measure/render (leaf like Text).
 * Components run once; signals handle updates.
 */
export class Node {
  style!: FlexStyle | (() => FlexStyle);
  children?: Node[] | (() => Node[]);
  measure?: MeasureFunction;
  render?: RenderFunction;

  _inheritableProps?: InheritableProps;

  _parent?: Node;

  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;

  onKeyPress?: (key: KeyEvent) => boolean | undefined;
  onMousePress?: (event: MouseEvent) => void;
  onMouseRelease?: (event: MouseEvent) => void;
  onMouseMove?: (event: MouseEvent) => void;
  onScroll?: (event: ScrollEvent) => void;
  onHover?: (hovering: boolean) => void;
  onActivate?: (event: ActivateEvent) => void;

  activate?: () => void;

  _layout?: LayoutSignals;

  constructor(init: NodeInit) {
    Object.assign(this, init);
  }

  /** Resolve reactive style getter to a concrete FlexStyle. */
  resolveStyle(): FlexStyle {
    return typeof this.style === "function" ? this.style() : this.style;
  }

  /** Resolve children, handling both static arrays and reactive getters. */
  resolveChildren(): Node[] {
    return typeof this.children === "function"
      ? this.children()
      : (this.children ?? []);
  }

  /**
   * Build path from this node to root by following _parent pointers.
   * First element is this node, last is root.
   */
  pathToRoot(): Node[] {
    const path: Node[] = [];
    let current: Node | undefined = this;
    while (current) {
      path.push(current);
      current = current._parent;
    }
    return path;
  }

  /**
   * Check if this node is contained within a subtree.
   * Walks up the _parent chain looking for the subtree root.
   */
  isInSubtree(subtreeRoot: Node): boolean {
    let current: Node | undefined = this;
    while (current) {
      if (current === subtreeRoot) return true;
      current = current._parent;
    }
    return false;
  }

  /**
   * Convert to layout system's LayoutNode format.
   * Resolves reactive styles and recursively converts children.
   */
  toLayoutNode(): LayoutNode {
    const style = this.resolveStyle();
    const children = this.resolveChildren();
    return {
      style,
      children: children.map((child) => child.toLayoutNode()),
      measure: this.measure,
    };
  }

  /**
   * Flatten this node tree into a list, hoisting children of
   * `display: "contents"` nodes and skipping `display: "none"` nodes.
   */
  flatten(result?: Node[]): Node[] {
    const nodes = result ?? [];
    const style = this.resolveStyle();

    if (style.display === "none") return nodes;

    if (style.display === "contents") {
      for (const child of this.resolveChildren()) {
        child.flatten(nodes);
      }
      return nodes;
    }

    nodes.push(this);
    for (const child of this.resolveChildren()) {
      child.flatten(nodes);
    }
    return nodes;
  }
}
