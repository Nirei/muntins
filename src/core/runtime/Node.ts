import type { Buffer, InheritableColor } from "../buffer.ts";
import type {
  ActivateEvent,
  KeyEvent,
  MouseEvent,
  ScrollEvent,
} from "../input.ts";
import type { FlexStyle, LayoutNode, LayoutResult } from "../layout.ts";
import type { Rect, ScreenRect } from "../rects.ts";
import type { InheritableBool, InheritedStyle } from "../render.ts";
import { resolveInheritable } from "../render.ts";
import type { Accessor } from "../signals.ts";
import { createSignal, resolve } from "../signals.ts";
import type { VisualSegment } from "../text.ts";

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
 *
 * Allows passing another ref, in which case, it will passthrough.
 * This provides ergonomics for Components that need to capture their
 * parent's ref.
 */
export function createRef(ref?: Ref): Ref {
  return ref ?? { current: null };
}

/**
 * Layout information for reactive layout access via refs.
 * All values are integers representing terminal cells.
 */
export interface LayoutInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  screenX: number;
  screenY: number;
}

/**
 * Layout signals for reactive layout coordinates.
 * Created during node binding and updated on resize/relayout.
 */
export interface LayoutSignals {
  x: Accessor<number>;
  y: Accessor<number>;
  width: Accessor<number>;
  height: Accessor<number>;
  screenX: Accessor<number>;
  screenY: Accessor<number>;
  setLayout: (result: LayoutResult) => void;
}

export type InheritableProps = {
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
) => { width: number; height: number };

type RenderFunction = (
  bounds: ScreenRect,
  buffer: Buffer,
  inherited: InheritedStyle,
  clip: Rect,
) => void;

export interface EventHandlerProps {
  onKeyPress?: (key: KeyEvent) => boolean | undefined;
  onMousePress?: (event: MouseEvent) => void;
  onMouseRelease?: (event: MouseEvent) => void;
  onMouseMove?: (event: MouseEvent) => void;
  onScroll?: (event: ScrollEvent) => void;
  onHover?: (hovering: boolean) => void;
  onActivate?: (event: ActivateEvent) => void;
}

/**
 * Constructor argument for Node.
 * Same shape as Node minus runtime-set fields (_parent, _layout) and methods.
 */
export interface NodeInit extends EventHandlerProps {
  style: FlexStyle | (() => FlexStyle);
  children?: Node[] | (() => Node[]);
  measure?: MeasureFunction;
  render?: RenderFunction;
  _inheritableProps?: InheritableProps;
  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;
  activate?: () => void;
}

/**
 * The central data structure representing a UI element.
 *
 * Nodes either have children (container) or measure/render (leaf like Text).
 * Components run once; signals handle updates.
 */

let styleGeneration = 0;

export function bumpStyleGeneration(): void {
  styleGeneration++;
}

export class Node implements EventHandlerProps {
  style!: FlexStyle | (() => FlexStyle);
  children?: Node[] | (() => Node[]);
  measure?: MeasureFunction;
  render?: RenderFunction;

  _inheritableProps?: InheritableProps;
  _styleCache: FlexStyle | null = null;
  _styleGen = -1;

  _parent?: Node;

  /**
   * Cached segmented text data for the last content that was measured.
   * Written by measure, read by render — avoids re-segmenting the same text.
   */
  _textSegments?: { sourceText: string; lines: VisualSegment[][] };

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

  private _layoutGet: Accessor<LayoutSignals | undefined>;
  private _layoutSet: (v: LayoutSignals | undefined) => void;

  get _layout(): LayoutSignals | undefined {
    return this._layoutGet();
  }

  set _layout(value: LayoutSignals | undefined) {
    this._layoutSet(value);
  }

  constructor(init: NodeInit) {
    const [get, set] = createSignal<LayoutSignals | undefined>(undefined);
    this._layoutGet = get;
    this._layoutSet = set;
    Object.assign(this, init);
  }

  /** Resolve reactive style getter to a concrete FlexStyle. Cached per flush. */
  resolveStyle(): FlexStyle {
    if (this._styleGen === styleGeneration && this._styleCache !== null) {
      return this._styleCache;
    }
    const result = resolve(this.style);
    this._styleCache = result;
    this._styleGen = styleGeneration;
    return result;
  }

  /** Resolve children, handling both static arrays and reactive getters. */
  resolveChildren(): Node[] {
    return typeof this.children === "function"
      ? this.children()
      : (this.children ?? []);
  }

  /**
   * Resolve inherited style by merging this node's inheritable props
   * with the parent's inherited style.
   */
  resolveInheritedStyle(parentStyle: InheritedStyle): InheritedStyle {
    const props = this._inheritableProps;
    if (!props) {
      return parentStyle;
    }

    return {
      color: resolveInheritable(props.color, parentStyle.color),
      backgroundColor: resolveInheritable(
        props.backgroundColor,
        parentStyle.backgroundColor,
      ),
      borderColor: resolveInheritable(
        props.borderColor,
        parentStyle.borderColor,
      ),
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

  /** Clear layout signals for this node and its entire subtree. */
  clearLayoutSignals(): void {
    this._layout = undefined;

    for (const child of this.resolveChildren()) {
      child.clearLayoutSignals();
    }
  }

  /**
   * Find the deepest node containing a point using screen coordinates.
   * Returns this node if the point is within bounds but no child matches.
   */
  hitTest(layout: LayoutResult, x: number, y: number): Node | null {
    const { screenX, screenY, width, height } = layout;

    if (
      x < screenX ||
      x >= screenX + width ||
      y < screenY ||
      y >= screenY + height
    ) {
      return null;
    }

    const children = this.resolveChildren();
    const childLayouts = layout.children ?? [];

    const { hit } = Node.hitTestChildren(children, childLayouts, 0, x, y);
    return hit ?? this;
  }

  private static hitTestChildren(
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
        const result = Node.hitTestChildren(
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

      const hit = child.hitTest(childLayout, x, y);
      if (hit) {
        lastHit = hit;
      }
    }

    return { hit: lastHit, consumed };
  }
}
