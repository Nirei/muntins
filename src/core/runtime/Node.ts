import type {
    Buffer,
    InheritableColor
} from "../buffer.ts";
import type {
    ActivateEvent,
    KeyEvent,
    MouseEvent,
    ScrollEvent
} from "../input.ts";
import type {
    FlexStyle
} from "../layout.ts";
import type {
    ClipRect,
    InheritableBool,
    InheritedStyle
} from "../render.ts";
import type { LayoutSignals } from "./LayoutSignals.ts";

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

/**
 * The central data structure representing a UI element.
 *
 * Nodes either have children (container) or measure/render (leaf like Text).
 * Components run once; signals handle updates.
 */
export interface Node {
  // Layout
  style: FlexStyle | (() => FlexStyle);
  children?: Node[];
  measure?: (
    width: number,
    height: number,
  ) => { width: number; height: number };
  render?: (
    x: number,
    y: number,
    width: number,
    height: number,
    buffer: Buffer,
    inherited: InheritedStyle,
    clip: ClipRect,
  ) => void;

  // Inheritable style props (resolved at paint time)
  _inheritableProps?: {
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

  // Tree structure (set during tree construction by runtime)
  _parent?: Node;

  // Focus
  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;

  // Event handlers
  onKeyPress?: (key: KeyEvent) => boolean | undefined;
  onMousePress?: (event: MouseEvent) => void;
  onMouseRelease?: (event: MouseEvent) => void;
  onMouseMove?: (event: MouseEvent) => void;
  onScroll?: (event: ScrollEvent) => void;
  onHover?: (hovering: boolean) => void;
  onActivate?: (event: ActivateEvent) => void;

  /** Programmatically activate this node (creates and dispatches ActivateEvent) */
  activate?: () => void;

  // Layout signals (set during binding phase)
  _layout?: LayoutSignals;
}