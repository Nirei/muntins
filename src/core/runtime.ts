// Render pipeline and component primitives

import {
  Buffer,
  DEFAULT_COLOR,
  type InheritableColor,
  graphemes,
} from "./buffer.ts";
import type { FocusEvent, PasteEvent } from "./input.ts";
import {
  type InputEvent,
  type KeyEvent,
  type MouseEvent,
  type ScrollEvent,
  createInputParser,
} from "./input.ts";
import {
  DEFAULT_FLEX_STYLE,
  type FlexStyle,
  type LayoutNode,
  type LayoutResult,
  type ReactiveFlexStyle,
  computeLayout,
} from "./layout.ts";
import {
  BORDER_CHARS,
  type BorderProp,
  type BorderStyleName,
  type ClipRect,
  DEFAULT_CLIP,
  DEFAULT_INHERITED_STYLE,
  type InheritableBool,
  type InheritedStyle,
  enterTuiMode,
  exitTuiMode,
  flushFrame,
  getBorderStyleName,
  intersectClipRect,
  isInClipRect,
  parseBorderProp,
  renderBorder,
  renderText,
  resolveInheritable,
} from "./render.ts";
import { batch } from "./signals.ts";
import {
  type Accessor,
  type Setter,
  createEffect,
  createRoot,
  createSignal,
  onCleanup,
} from "./signals.ts";
import { type WrapMode, measureText } from "./text.ts";

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

/**
 * Creates layout signals for a node.
 * These signals are updated when layout changes and can be tracked by effects.
 */
function createLayoutSignals(): LayoutSignals {
  const [x, setX] = createSignal(0);
  const [y, setY] = createSignal(0);
  const [width, setWidth] = createSignal(0);
  const [height, setHeight] = createSignal(0);
  const [screenX, setScreenX] = createSignal(0);
  const [screenY, setScreenY] = createSignal(0);

  return {
    x,
    y,
    width,
    height,
    screenX,
    screenY,
    setLayout(result: LayoutResult) {
      batch(() => {
        setX(result.x);
        setY(result.y);
        setWidth(result.width);
        setHeight(result.height);
        setScreenX(result.screenX);
        setScreenY(result.screenY);
      });
    },
  };
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

  // Portal marker (for root-level rendering)
  _isPortal?: boolean;

  // Layout signals (set during binding phase)
  _layout?: LayoutSignals;
}

/**
 * Resolves a node's style, handling reactive style getters.
 * Used internally to simplify the common pattern of checking if style is a function.
 */
function resolveNodeStyle(node: Node): FlexStyle {
  return typeof node.style === "function" ? node.style() : node.style;
}

/**
 * Resolves a node's children array, handling reactive children getters (from Show/For).
 * Returns an empty array if children is undefined.
 */
function resolveNodeChildren(node: Node): Node[] {
  return typeof node.children === "function"
    ? (node.children as () => Node[])()
    : (node.children ?? []);
}

/**
 * Layout information for reactive layout access via refs.
 * All values are integers representing terminal cells.
 */
export interface LayoutInfo {
  /** Position relative to parent */
  x: number;
  y: number;
  /** Computed width in cells */
  width: number;
  /** Computed height in cells */
  height: number;
  /** Absolute X position from screen origin */
  screenX: number;
  /** Absolute Y position from screen origin */
  screenY: number;
}

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
 * Configuration for mounting an application.
 */
export interface MountOptions {
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
  mouse?: boolean;
  alternateScreen?: boolean;
  /** Max renders per second. Default: 240. Set to 0 for unlimited. */
  fpsLimit?: number;
}

/**
 * Default values for mount options.
 */
export const DEFAULT_MOUNT_OPTIONS: Required<MountOptions> = {
  stdout: process.stdout,
  stdin: process.stdin,
  mouse: false,
  alternateScreen: true,
  fpsLimit: 240,
};

/**
 * Returned by mount().
 */
export interface App {
  unmount(): void;
}

// Internal interfaces (not exported, scaffolded for mount/render cycle implementation)

/**
 * State for throttled buffer flushing.
 */
export interface FlushState {
  scheduled: boolean;
  lastFlushTime: number;
  timeout: ReturnType<typeof setTimeout> | null;
  buffer: Buffer;
  stdout: NodeJS.WriteStream;
  fpsLimit: number;
}

/**
 * Internal state for a mounted application.
 * @internal Exported for testing purposes.
 */
export interface RuntimeState {
  // Core tree
  root: Node;
  rootDispose: () => void;

  // Layout
  layoutResult: import("./layout.ts").LayoutResult | null;

  // Flush scheduling (replaces renderScheduled, lastRenderTime, throttleTimeout)
  flushState: FlushState;

  // Relayout scheduling
  relayoutScheduled: boolean;

  // Mount options
  options: Required<MountOptions>;

  // Input
  stdin: NodeJS.ReadStream;
  inputParser: { destroy: () => void };

  // Focus (reactive signal for tracking focus changes)
  focusedNode: Accessor<Node | null>;
  setFocusedNode: Setter<Node | null>;
  rootScope: FocusScope;

  // Hover and terminal focus
  hoverState: HoverState;
  terminalFocused: boolean;
}

/**
 * Focus scope for organizing focusable nodes.
 * Scopes can be nested and optionally trap focus within themselves.
 * @internal Exported for testing purposes.
 */
export interface FocusScope {
  parent: FocusScope | null;
  focusableNodes: Node[];
  focusedIndex: number;
  trap: boolean;
}

/**
 * Controller for programmatic focus management within a scope.
 */
export interface FocusController {
  next(): void;
  prev(): void;
  set(ref: Ref): void;
  /** Returns a reactive accessor for the currently focused node. */
  current: Accessor<Node | null>;
}

/**
 * Runtime context threaded through component construction via closures.
 * Supports multiple concurrent mount() calls.
 * @internal Exported for testing purposes.
 */
export interface RuntimeContext {
  state: RuntimeState;
  currentScope: FocusScope;
  /** Schedule a relayout for when Show/For create new children */
  scheduleRelayout: () => void;
  /** Schedule a flush to repaint the screen */
  scheduleFlush: () => void;
}

interface HoverState {
  currentNode: Node | null;
}

/** Internal type for nodes that may have a focus scope attached */
interface NodeWithFocusScope extends Node {
  _focusScope?: FocusScope;
}

// The context is set during mount and captured by component closures
let activeContext: RuntimeContext | null = null;

/**
 * Get the current active context.
 * Exposed for testing purposes only.
 * @internal
 */
export function getActiveContext(): RuntimeContext | null {
  return activeContext;
}

/**
 * Set the active context.
 * Exposed for testing purposes only.
 * @internal
 */
export function setActiveContext(ctx: RuntimeContext | null): void {
  activeContext = ctx;
}

/**
 * Execute a function within a runtime context.
 * The context is set during the callback and restored after.
 */
export function withContext<T>(ctx: RuntimeContext, fn: () => T): T {
  const prev = activeContext;
  activeContext = ctx;
  try {
    return fn();
  } finally {
    activeContext = prev;
  }
}

/**
 * Get the current runtime context.
 * Throws if called outside of a mounted component.
 */
function getContext(): RuntimeContext {
  if (!activeContext) {
    throw new Error("useFocus must be called within a mounted component");
  }
  return activeContext;
}

// Focus management functions

/**
 * Collect focusable nodes into a scope via depth-first traversal.
 * Stops at nested FocusScope boundaries (nodes with _focusScope set to a different scope).
 */
export function collectFocusableInScope(node: Node, scope: FocusScope): void {
  // If this node has its own scope, don't collect its children here
  const nodeScope = (node as NodeWithFocusScope)._focusScope;
  if (nodeScope && nodeScope !== scope) {
    return;
  }

  if (node.focusable) {
    scope.focusableNodes.push(node);
  }

  for (const child of resolveNodeChildren(node)) {
    collectFocusableInScope(child, scope);
  }
}

/**
 * Find the focus scope that should contain a node by walking up the tree.
 * Returns the first scope encountered, or the root scope if none found.
 */
function findParentScope(state: RuntimeState, node: Node): FocusScope {
  let current: Node | undefined = node._parent;

  while (current) {
    const nodeScope = (current as NodeWithFocusScope)._focusScope;
    if (nodeScope) {
      return nodeScope;
    }
    current = current._parent;
  }

  return state.rootScope;
}

/**
 * Register focusable nodes from a newly created subtree into the appropriate scope.
 * Called when Show/For creates new child nodes.
 */
function registerSubtreeFocusables(
  state: RuntimeState,
  subtreeRoot: Node,
): void {
  // Find which scope should contain these nodes
  const scope = findParentScope(state, subtreeRoot);

  // Collect focusable nodes from the new subtree
  collectFocusableInScope(subtreeRoot, scope);
}

/**
 * Unregister all focusable nodes from a subtree being disposed.
 * Removes nodes from their containing scope's focusableNodes array.
 */
function unregisterSubtreeFocusables(
  state: RuntimeState,
  subtreeRoot: Node,
): void {
  // Find which scope contains these nodes
  const scope = findParentScope(state, subtreeRoot);

  // Collect all focusable nodes in the subtree
  const nodesToRemove: Node[] = [];
  collectFocusableInScope(subtreeRoot, {
    parent: null,
    focusableNodes: nodesToRemove,
    focusedIndex: -1,
    trap: false,
  });

  // Remove each from the scope's focusableNodes
  for (const node of nodesToRemove) {
    const index = scope.focusableNodes.indexOf(node);
    if (index !== -1) {
      scope.focusableNodes.splice(index, 1);
      // Adjust focusedIndex if needed
      if (scope.focusedIndex > index) {
        scope.focusedIndex--;
      } else if (scope.focusedIndex === index) {
        scope.focusedIndex = -1;
      }
    }
  }
}

/**
 * Count total focusable nodes in a scope and all its ancestors.
 */
function countFocusablesInAncestors(scope: FocusScope | null): number {
  let count = 0;
  let current = scope;
  while (current) {
    count += current.focusableNodes.length;
    current = current.parent;
  }
  return count;
}

/** Direction for focus navigation: 1 = next, -1 = prev */
type FocusDirection = 1 | -1;

/**
 * Navigate focus in a direction within a scope.
 * Handles wrapping and scope escaping based on trap setting.
 */
function focusNavigate(
  state: RuntimeState,
  scope: FocusScope,
  direction: FocusDirection,
): void {
  const { focusableNodes, focusedIndex } = scope;

  if (focusableNodes.length === 0) {
    // No focusables in this scope, try parent if not trapped
    if (!scope.trap && scope.parent) {
      focusNavigate(state, scope.parent, direction);
    }
    return;
  }

  if (focusedIndex === -1) {
    // Nothing focused: focus first (next) or last (prev)
    const index = direction === 1 ? 0 : focusableNodes.length - 1;
    scope.focusedIndex = index;
    state.setFocusedNode(focusableNodes[index]);
    return;
  }

  const targetIndex = focusedIndex + direction;
  const atBoundary =
    direction === 1 ? targetIndex >= focusableNodes.length : targetIndex < 0;

  if (atBoundary) {
    const wrapIndex = direction === 1 ? 0 : focusableNodes.length - 1;

    if (scope.trap) {
      // Wrap within scope
      scope.focusedIndex = wrapIndex;
      state.setFocusedNode(focusableNodes[wrapIndex]);
    } else if (scope.parent && countFocusablesInAncestors(scope.parent) > 0) {
      // Escape to parent (only if parent has focusables)
      scope.focusedIndex = -1;
      focusNavigate(state, scope.parent, direction);
    } else {
      // No parent focusables or at root, wrap
      scope.focusedIndex = wrapIndex;
      state.setFocusedNode(focusableNodes[wrapIndex]);
    }
  } else {
    scope.focusedIndex = targetIndex;
    state.setFocusedNode(focusableNodes[targetIndex]);
  }
}

/**
 * Navigate focus to the next focusable node within a scope.
 */
export function focusNext(state: RuntimeState, scope: FocusScope): void {
  focusNavigate(state, scope, 1);
}

/**
 * Navigate focus to the previous focusable node within a scope.
 */
export function focusPrev(state: RuntimeState, scope: FocusScope): void {
  focusNavigate(state, scope, -1);
}

/**
 * Find which scope contains a given node by traversing the node tree.
 *
 * Walks up from the target node using _parent pointers, looking for the
 * nearest ancestor that has a _focusScope containing the target node.
 * Falls back to checking the root scope.
 */
function findScopeContaining(
  rootScope: FocusScope,
  root: Node,
  node: Node,
): FocusScope | null {
  // First check if the node is in the root scope
  if (rootScope.focusableNodes.includes(node)) {
    return rootScope;
  }

  // Walk up the tree from the node, looking for a scope that contains it
  let current: Node | undefined = node._parent;
  while (current) {
    const nodeScope = (current as NodeWithFocusScope)._focusScope;
    if (nodeScope?.focusableNodes.includes(node)) {
      return nodeScope;
    }
    current = current._parent;
  }

  return null;
}

/**
 * Set focus to a specific node via ref.
 */
function focusSet(state: RuntimeState, scope: FocusScope, ref: Ref): void {
  if (!ref.current?.focusable) return;

  // Find which scope contains this node
  const targetScope = findScopeContaining(
    state.rootScope,
    state.root,
    ref.current,
  );
  if (!targetScope) return;

  const index = targetScope.focusableNodes.indexOf(ref.current);
  if (index !== -1) {
    // Clear focus from current scope
    scope.focusedIndex = -1;
    // Set focus in target scope
    targetScope.focusedIndex = index;
    state.setFocusedNode(ref.current);
  }
}

/**
 * Create a focus controller for a scope.
 */
function createFocusController(
  state: RuntimeState,
  scope: FocusScope,
): FocusController {
  return {
    next() {
      focusNext(state, scope);
    },
    prev() {
      focusPrev(state, scope);
    },
    set(ref: Ref) {
      focusSet(state, scope, ref);
    },
    current: state.focusedNode,
  };
}

/**
 * Access the focus controller for the current scope.
 * Must be called within a mounted component context.
 */
export function useFocus(): FocusController {
  const ctx = getContext();
  return createFocusController(ctx.state, ctx.currentScope);
}

// Re-export from render.ts and text.ts for public API
export type { ClipRect, InheritableBool, InheritedStyle } from "./render.ts";
export {
  BORDER_CHARS,
  DEFAULT_CLIP,
  DEFAULT_INHERITED_STYLE,
  enterTuiMode,
  exitTuiMode,
  flushFrame,
} from "./render.ts";
export type { WrapMode } from "./text.ts";
export {
  lineDisplayWidth,
  measureText,
  truncateLine,
  wrapLine,
} from "./text.ts";

// Re-export types for BoxProps/TextProps
export type { BorderProp, BorderStyleName } from "./render.ts";

/**
 * Compute resolved inherited style from a node's inheritable props.
 * Merges with parent inherited style, resolving any "inherit" values.
 */
function computeInheritedStyle(
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

/** Child element that Box can accept - Node, string, or reactive string. */
export type BoxChild = Node | string | (() => string);

/** Props for Box component. */
export interface BoxProps extends Partial<ReactiveFlexStyle> {
  children?: BoxChild | BoxChild[];
  backgroundColor?: InheritableColor | (() => InheritableColor);
  border?: BorderProp | (() => BorderProp);
  borderColor?: InheritableColor | (() => InheritableColor);
  borderStyle?: BorderStyleName | (() => BorderStyleName);
  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;
  onKeyPress?: (key: KeyEvent) => boolean | undefined;
  onMousePress?: (event: MouseEvent) => void;
  onMouseRelease?: (event: MouseEvent) => void;
  onMouseMove?: (event: MouseEvent) => void;
  onScroll?: (event: ScrollEvent) => void;
  onHover?: (hovering: boolean) => void;
}

/** Props for Text component. */
export interface TextProps {
  content: string | (() => string);
  color?: InheritableColor | (() => InheritableColor);
  backgroundColor?: InheritableColor | (() => InheritableColor);
  bold?: InheritableBool | (() => InheritableBool);
  italic?: InheritableBool | (() => InheritableBool);
  underline?: InheritableBool | (() => InheritableBool);
  dim?: InheritableBool | (() => InheritableBool);
  strikethrough?: InheritableBool | (() => InheritableBool);
  inverse?: InheritableBool | (() => InheritableBool);
  wrap?: WrapMode | (() => WrapMode);
  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;
  onKeyPress?: (key: KeyEvent) => boolean | undefined;
  onMousePress?: (event: MouseEvent) => void;
  onMouseRelease?: (event: MouseEvent) => void;
  onMouseMove?: (event: MouseEvent) => void;
  onScroll?: (event: ScrollEvent) => void;
  onHover?: (hovering: boolean) => void;
}

/**
 * Creates a Box node - a layout container that supports reactive styles and event handlers.
 *
 * Box is the fundamental container primitive. When backgroundColor is set, Box renders
 * its background; when border is set, Box renders its border.
 * Size is determined by flexbox layout based on its children.
 */
export function Box(props: BoxProps): Node {
  const {
    children: childrenProp,
    backgroundColor,
    border,
    borderColor,
    borderStyle,
    focusable,
    autoFocus,
    ref,
    onKeyPress,
    onMousePress,
    onMouseRelease,
    onMouseMove,
    onScroll,
    onHover,
    ...styleProps
  } = props;

  const normalizeChild = (child: BoxChild): Node => {
    if (typeof child === "string") {
      return Text({ content: child });
    }
    if (typeof child === "function") {
      return Text({ content: child });
    }
    return child;
  };

  const children: Node[] = childrenProp
    ? Array.isArray(childrenProp)
      ? childrenProp.map(normalizeChild)
      : [normalizeChild(childrenProp)]
    : [];

  const getBorderFlags = () => {
    const borderValue = typeof border === "function" ? border() : border;
    return parseBorderProp(borderValue);
  };

  const node: Node = {
    get style() {
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(styleProps)) {
        resolved[key] =
          typeof value === "function" ? (value as () => unknown)() : value;
      }
      const borderFlags = getBorderFlags();
      return {
        ...DEFAULT_FLEX_STYLE,
        ...resolved,
        borderTop: borderFlags.top,
        borderEnd: borderFlags.end,
        borderBottom: borderFlags.bottom,
        borderStart: borderFlags.start,
      } as FlexStyle;
    },
    children,
    focusable,
    autoFocus,
    onKeyPress,
    onMousePress,
    onMouseRelease,
    onMouseMove,
    onScroll,
    onHover,

    _inheritableProps: {
      backgroundColor,
      borderColor,
    },

    render:
      backgroundColor !== undefined || border !== undefined
        ? (x, y, width, height, buffer, inherited, clip) => {
            if (
              x >= clip.x + clip.width ||
              x + width <= clip.x ||
              y >= clip.y + clip.height ||
              y + height <= clip.y
            ) {
              return;
            }

            const bg = resolveInheritable(
              backgroundColor,
              inherited.backgroundColor,
            );

            // Fill area with background color if specified
            if (backgroundColor !== undefined) {
              const fillX = Math.max(x, clip.x);
              const fillY = Math.max(y, clip.y);
              const fillRight = Math.min(x + width, clip.x + clip.width);
              const fillBottom = Math.min(y + height, clip.y + clip.height);
              const fillWidth = fillRight - fillX;
              const fillHeight = fillBottom - fillY;
              if (fillWidth > 0 && fillHeight > 0) {
                buffer.fillRect(
                  fillX,
                  fillY,
                  fillWidth,
                  fillHeight,
                  " ",
                  DEFAULT_COLOR,
                  bg,
                  0,
                );
              }
            }

            const borderFlags = getBorderFlags();
            const hasBorder =
              borderFlags.top ||
              borderFlags.end ||
              borderFlags.bottom ||
              borderFlags.start;

            if (hasBorder) {
              const fg = resolveInheritable(borderColor, inherited.borderColor);
              const borderValue =
                typeof border === "function" ? border() : border;
              const borderStyleValue =
                typeof borderStyle === "function" ? borderStyle() : borderStyle;
              const styleName = getBorderStyleName(
                borderValue,
                borderStyleValue,
              );
              renderBorder(
                buffer,
                x,
                y,
                width,
                height,
                borderFlags,
                styleName,
                fg,
                bg,
                clip,
              );
            }
          }
        : undefined,
  };

  if (ref) {
    ref.current = node;
  }

  for (const child of children) {
    child._parent = node;
  }

  return node;
}

/**
 * Creates a Text node - a leaf node that displays text content.
 *
 * Text is measured based on its content and renders text with styling.
 * Content and style props can be static values or reactive getters.
 */
export function Text(props: TextProps): Node {
  const {
    content,
    color,
    backgroundColor,
    bold,
    dim,
    italic,
    underline,
    strikethrough,
    inverse,
    focusable,
    autoFocus,
    ref,
    onKeyPress,
    onMousePress,
    onMouseRelease,
    onMouseMove,
    onScroll,
    onHover,
    wrap,
  } = props;

  const getContent = typeof content === "function" ? content : () => content;
  const getWrap = (): WrapMode =>
    (typeof wrap === "function" ? wrap() : wrap) ?? "wrap";

  const node: Node = {
    style: DEFAULT_FLEX_STYLE,
    focusable,
    autoFocus,
    onKeyPress,
    onMousePress,
    onMouseRelease,
    onMouseMove,
    onScroll,
    onHover,

    _inheritableProps: {
      color,
      backgroundColor,
      bold,
      dim,
      italic,
      underline,
      strikethrough,
      inverse,
    },

    measure(availableWidth: number, _availableHeight: number) {
      return measureText(getContent(), availableWidth, getWrap());
    },

    render(
      x: number,
      y: number,
      width: number,
      height: number,
      buffer: Buffer,
      inherited: InheritedStyle,
      clip: ClipRect,
    ) {
      renderText(
        buffer,
        x,
        y,
        width,
        height,
        getContent(),
        {
          color,
          backgroundColor,
          bold,
          dim,
          italic,
          underline,
          strikethrough,
          inverse,
          wrap: getWrap(),
        },
        inherited,
        clip,
      );
    },
  };

  if (ref) {
    ref.current = node;
  }

  // If content is reactive, track it and schedule flush when it changes
  if (typeof content === "function") {
    const ctx = activeContext;
    if (ctx) {
      createEffect(() => {
        getContent(); // Track the content signal
        ctx.scheduleFlush(); // Schedule repaint when it changes
      });
    }
  }

  return node;
}

/** Props for Portal component. */
export interface PortalProps {
  /** Content to render at root level */
  children: Node | Node[];
}

/**
 * Renders children at the root of the render tree, regardless of where
 * the Portal appears in the component hierarchy.
 *
 * Portals enable viewport-level floating elements like dialogs, popovers,
 * and toasts. The children are rendered visually at root level (above all
 * other content) while maintaining their logical position in the tree for
 * reactivity and cleanup.
 *
 * Multiple Portals stack in document order (later Portals appear above earlier ones).
 * Portal children participate in focus management via the logical tree.
 */
export function Portal(props: PortalProps): Node {
  const children = Array.isArray(props.children)
    ? props.children
    : [props.children];

  const node: Node = {
    style: { ...DEFAULT_FLEX_STYLE, display: "contents" },
    children,
    _isPortal: true,
  };

  for (const child of children) {
    child._parent = node;
  }

  return node;
}

/** Props for Show component. */
export interface ShowProps<T> {
  when: () => T;
  children: (value: T) => Node;
  fallback?: () => Node;
}

/**
 * Conditionally renders one of two branches based on a reactive condition.
 *
 * When the condition is truthy, renders the `children` branch with the truthy value.
 * When falsy, renders the `fallback` branch if provided, otherwise renders nothing.
 * Branch changes dispose the previous subtree and create a new one with proper
 * ownership tracking.
 *
 * Must be called within a mounted component context (inside mount()'s component
 * function or a child thereof) for proper effect ownership.
 */
export function Show<T>(props: ShowProps<T>): Node {
  const { when: condition, children: childrenBranch, fallback } = props;

  const ctx = activeContext;
  const children: Node[] = [];
  let currentDispose: (() => void) | null = null;
  let currentChild: Node | null = null;

  const container: Node = {
    style: { ...DEFAULT_FLEX_STYLE, display: "contents" },
    get children() {
      return children;
    },
  };

  const disposeChild = () => {
    if (currentDispose) {
      if (ctx && currentChild) {
        cleanupSubtreeState(ctx.state, currentChild);
      }
      if (currentChild) {
        clearSubtreeLayoutSignals(currentChild);
      }
      currentDispose();
      currentDispose = null;
      currentChild = null;
    }
  };

  const createChildNode = (
    factory: () => Node,
    dispose: () => void,
  ): (() => void) => {
    const node = ctx ? withContext(ctx, factory) : factory();
    node._parent = container;
    children.push(node);
    currentChild = node;

    if (ctx) {
      registerSubtreeFocusables(ctx.state, node);
    }

    return dispose;
  };

  createEffect(() => {
    const value = condition();

    disposeChild();
    children.length = 0;

    if (value) {
      currentDispose = createRoot((dispose) =>
        createChildNode(() => childrenBranch(value), dispose),
      );
      ctx?.scheduleRelayout();
    } else if (fallback) {
      currentDispose = createRoot((dispose) =>
        createChildNode(fallback, dispose),
      );
      ctx?.scheduleRelayout();
    }
  });

  onCleanup(() => {
    disposeChild();
  });

  return container;
}

/** Props for For component. */
export interface ForProps<T> {
  each: () => T[];
  render: (item: () => T, index: () => number) => Node;
  key?: (item: T) => unknown;
}

interface ForItemEntry<T> {
  dispose: () => void;
  node: Node;
  setItem: (item: T) => void;
  setIndex: (index: number) => void;
}

/**
 * Renders a list of items with efficient updates using keyed reconciliation.
 *
 * Items are identified by key (defaults to object identity). When the array
 * changes:
 * - New items create new roots with reactive item/index getters
 * - Removed items have their roots disposed
 * - Reordered items update their index and item signals, keeping nodes alive
 *
 * Duplicate keys are supported: each occurrence gets its own node. The render
 * function receives getter functions for item and index, enabling reactive
 * updates when items change or reorder.
 *
 * Must be called within a mounted component context for proper effect ownership.
 */
export function For<T>(props: ForProps<T>): Node {
  const { each: items, render, key: keyFn } = props;

  const ctx = activeContext;
  const children: Node[] = [];
  const itemRoots: Map<unknown, ForItemEntry<T>[]> = new Map();
  const getKey = keyFn ?? ((item: T) => item);

  const container: Node = {
    style: { ...DEFAULT_FLEX_STYLE, display: "contents" },
    get children() {
      return children;
    },
  };

  const disposeEntry = (entry: ForItemEntry<T>) => {
    if (ctx) {
      cleanupSubtreeState(ctx.state, entry.node);
    }
    // Clear layout signals for the removed subtree
    clearSubtreeLayoutSignals(entry.node);
    entry.node._parent = undefined;
    entry.dispose();
  };

  // Detached roots persist across effect re-runs. We manage lifecycle manually.
  const createEntry = (
    item: T,
    index: number,
    key: unknown,
  ): ForItemEntry<T> => {
    const [getItem, setItem] = createSignal(item);
    const [getIndex, setIndex] = createSignal(index);

    let entry!: ForItemEntry<T>;

    createRoot(
      (dispose) => {
        const node = render(getItem, getIndex);
        node._parent = container;
        entry = { dispose, node, setItem, setIndex };

        const existing = itemRoots.get(key);
        if (existing) {
          existing.push(entry);
        } else {
          itemRoots.set(key, [entry]);
        }

        if (ctx) {
          registerSubtreeFocusables(ctx.state, node);
        }

        return dispose;
      },
      { detached: true },
    );

    return entry;
  };

  createEffect(() => {
    const currentItems = items();

    const keyCounts = new Map<unknown, number>();
    for (const item of currentItems) {
      const key = getKey(item);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }

    const keyUsed = new Map<unknown, number>();
    children.length = 0;

    for (let i = 0; i < currentItems.length; i++) {
      const item = currentItems[i];
      const key = getKey(item);

      const entries = itemRoots.get(key);
      const usedCount = keyUsed.get(key) ?? 0;

      if (entries && usedCount < entries.length) {
        const entry = entries[usedCount];
        entry.setItem(item);
        entry.setIndex(i);
        children.push(entry.node);
      } else {
        const entry = createEntry(item, i, key);
        children.push(entry.node);
      }

      keyUsed.set(key, usedCount + 1);
    }

    for (const [key, entries] of itemRoots) {
      const needed = keyCounts.get(key) ?? 0;
      if (needed === 0) {
        for (const entry of entries) {
          disposeEntry(entry);
        }
        itemRoots.delete(key);
      } else if (entries.length > needed) {
        const excess = entries.splice(needed);
        for (const entry of excess) {
          disposeEntry(entry);
        }
      }
    }

    ctx?.scheduleRelayout();
  });

  onCleanup(() => {
    for (const entries of itemRoots.values()) {
      for (const entry of entries) {
        disposeEntry(entry);
      }
    }
    itemRoots.clear();
  });

  return container;
}

/** Props for FocusScopeComponent */
export interface FocusScopeProps {
  trap?: boolean;
  children: Node[];
}

/** Props for TabFocus component */
export interface TabFocusProps {
  children: Node[];
  trap?: boolean;
}

/**
 * Creates a focus scope node with the given box factory.
 * Shared implementation for FocusScopeComponent and TabFocus.
 */
function createFocusScopeNode(
  props: { children: Node[]; trap?: boolean },
  boxFactory: (children: Node[], scope: FocusScope) => Node,
): Node {
  const ctx = getContext();

  const scope: FocusScope = {
    parent: ctx.currentScope,
    focusableNodes: [],
    focusedIndex: -1,
    trap: props.trap ?? false,
  };

  const childCtx: RuntimeContext = {
    state: ctx.state,
    currentScope: scope,
    scheduleRelayout: ctx.scheduleRelayout,
    scheduleFlush: ctx.scheduleFlush,
  };

  const node = withContext(childCtx, () => boxFactory(props.children, scope));

  (node as NodeWithFocusScope)._focusScope = scope;
  collectFocusableInScope(node, scope);

  return node;
}

/**
 * Creates a nested focus scope for organizing focusable elements.
 *
 * When `trap` is true, Tab/Shift+Tab navigation wraps within this scope
 * instead of escaping to the parent. Useful for modal dialogs.
 */
export function FocusScopeComponent(props: FocusScopeProps): Node {
  return createFocusScopeNode(props, (children) => Box({ children }));
}

/**
 * Convenience component that combines a FocusScope with Tab key handling.
 *
 * Wraps children in a focus scope and handles Tab/Shift+Tab to navigate
 * between focusable children.
 */
export function TabFocus(props: TabFocusProps): Node {
  const ctx = getContext();

  return createFocusScopeNode(props, (children, scope) => {
    const focus = createFocusController(ctx.state, scope);

    return Box({
      children,
      onKeyPress(event) {
        if (event.name === "tab") {
          event.shift ? focus.prev() : focus.next();
          return true;
        }
        return false;
      },
    });
  });
}

/**
 * Convert runtime Node to layout system's LayoutNode.
 * Resolves reactive styles and handles children as either array or getter function.
 * Skips portal nodes (their children are laid out separately at root level).
 */
function nodeToLayoutNode(node: Node): LayoutNode {
  const style = resolveNodeStyle(node);
  const children = resolveNodeChildren(node);
  const filteredChildren = children.filter((child) => !child._isPortal);

  return {
    style,
    children: filteredChildren.map(nodeToLayoutNode),
    measure: node.measure,
  };
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
 * Clean up focus and hover state when a subtree is being disposed.
 * Removes all focusable nodes in the subtree from their scope, clears focus
 * if the focused node is being disposed, and clears hover state if needed.
 *
 * Must be called before disposing a subtree to prevent stale references.
 */
export function cleanupSubtreeState(
  state: RuntimeState,
  subtreeRoot: Node,
): void {
  // Check if focused node is in the subtree being disposed
  const focused = state.focusedNode();
  if (focused && isNodeInSubtree(focused, subtreeRoot)) {
    state.setFocusedNode(null);
  }

  // Remove all focusable nodes in the subtree from their scope
  unregisterSubtreeFocusables(state, subtreeRoot);

  // Check if hovered node is in the subtree being disposed
  if (
    state.hoverState.currentNode &&
    isNodeInSubtree(state.hoverState.currentNode, subtreeRoot)
  ) {
    // Call onHover(false) before clearing
    if (state.hoverState.currentNode.onHover) {
      state.hoverState.currentNode.onHover(false);
    }
    state.hoverState.currentNode = null;
  }
}

/**
 * Route keyboard event to focused node with bubbling.
 *
 * Events start at the focused node and bubble up to the root.
 * Handlers return true to consume the event and stop bubbling.
 */
function routeKeyEvent(state: RuntimeState, event: KeyEvent): void {
  const focused = state.focusedNode();
  if (!focused) return;

  const path = buildPathToRoot(focused);

  for (const node of path) {
    if (node.onKeyPress) {
      const consumed = node.onKeyPress(event);
      if (consumed === true) {
        return;
      }
    }
  }
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

  // Check if point is within this node's bounds
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

  // Check children in reverse order (later = on top)
  for (let i = children.length - 1; i >= 0; i--) {
    const childLayout = childLayouts[i];
    if (!childLayout) continue;

    const hit = hitTest(children[i], childLayout, x, y);
    if (hit) {
      return hit;
    }
  }

  return node;
}

/**
 * Route mouse event to node under cursor, with hover tracking.
 *
 * Updates hover state and dispatches press/release/move events
 * to the target node.
 */
function routeMouseEvent(state: RuntimeState, event: MouseEvent): void {
  const { root, layoutResult, hoverState } = state;
  if (!layoutResult) return;

  const target = hitTest(root, layoutResult, event.x, event.y);

  if (target !== hoverState.currentNode) {
    if (hoverState.currentNode?.onHover) {
      hoverState.currentNode.onHover(false);
    }
    if (target?.onHover) {
      target.onHover(true);
    }
    hoverState.currentNode = target;
  }

  if (!target) return;

  switch (event.action) {
    case "press":
      if (target.onMousePress) {
        target.onMousePress(event);
      }
      break;
    case "release":
      if (target.onMouseRelease) {
        target.onMouseRelease(event);
      }
      break;
    case "move":
      if (target.onMouseMove) {
        target.onMouseMove(event);
      }
      break;
  }
}

/**
 * Route scroll event to node under cursor with bubbling.
 *
 * Scroll events bubble up the tree until a handler is found.
 * This matches browser behavior where scroll events propagate
 * to scrollable ancestors.
 */
function routeScrollEvent(state: RuntimeState, event: ScrollEvent): void {
  const { root, layoutResult } = state;
  if (!layoutResult) return;

  const target = hitTest(root, layoutResult, event.x, event.y);
  if (!target) return;

  const path = buildPathToRoot(target);

  for (const node of path) {
    if (node.onScroll) {
      node.onScroll(event);
      return; // Scroll events stop at first handler
    }
  }
}

/**
 * Route paste event to focused node with bubbling.
 *
 * Paste text is converted to synthetic key events for each grapheme.
 * Events bubble up the tree like regular keyboard events.
 * Handlers can return true to consume an event and stop processing.
 */
function routePasteEvent(state: RuntimeState, event: PasteEvent): void {
  const focused = state.focusedNode();
  if (!focused) return;

  const path = buildPathToRoot(focused);

  for (const char of graphemes(event.text)) {
    const keyEvent: KeyEvent = {
      type: "key",
      name: char === "\n" ? "enter" : char,
      char: char,
      ctrl: false,
      alt: false,
      shift: false,
      sequence: char,
    };

    let consumed = false;
    for (const node of path) {
      if (node.onKeyPress) {
        const result = node.onKeyPress(keyEvent);
        if (result === true) {
          consumed = true;
          break;
        }
      }
    }

    if (consumed) {
      return;
    }
  }
}

/**
 * Route terminal focus event.
 *
 * Tracks whether the terminal window has focus.
 */
function routeFocusEvent(state: RuntimeState, event: FocusEvent): void {
  state.terminalFocused = event.focused;
}

/**
 * Route an input event to the appropriate handler.
 *
 * Dispatches based on event type:
 * - key: Sent to focused node with bubbling
 * - mouse: Sent to node under cursor
 * - scroll: Sent to node under cursor (no bubbling)
 * - paste: Converted to key events for focused node
 * - focus: Updates terminal focus state
 * - resize: Handled separately in handleEvent
 */
function routeEvent(state: RuntimeState, event: InputEvent): void {
  switch (event.type) {
    case "key":
      routeKeyEvent(state, event);
      break;
    case "mouse":
      routeMouseEvent(state, event);
      break;
    case "scroll":
      routeScrollEvent(state, event);
      break;
    case "paste":
      routePasteEvent(state, event);
      break;
    case "focus":
      routeFocusEvent(state, event);
      break;
    case "resize":
      // Handled separately in handleEvent
      break;
  }
}

/**
 * Collect ALL focusable nodes in the tree, ignoring scope boundaries.
 * Used by initializeFocus to find autoFocus nodes anywhere in the tree.
 */
function collectAllFocusables(node: Node): Node[] {
  const result: Node[] = [];

  if (node.focusable) {
    result.push(node);
  }

  for (const child of resolveNodeChildren(node)) {
    result.push(...collectAllFocusables(child));
  }

  return result;
}

/**
 * Initialize focus after component tree is built.
 *
 * Searches the entire tree for a node with autoFocus. If found, focuses it.
 * Otherwise, focuses the first focusable node in tree order.
 */
export function initializeFocus(state: RuntimeState): void {
  state.rootScope.focusableNodes = [];
  collectFocusableInScope(state.root, state.rootScope);

  const allFocusables = collectAllFocusables(state.root);

  if (allFocusables.length === 0) {
    return;
  }

  const targetNode = allFocusables.find((n) => n.autoFocus) ?? allFocusables[0];
  const scope = findScopeForNode(targetNode, state.rootScope);
  const index = scope.focusableNodes.indexOf(targetNode);
  if (index !== -1) {
    scope.focusedIndex = index;
  }
  state.setFocusedNode(targetNode);
}

/**
 * Find the scope that contains a node by traversing scope boundaries.
 */
function findScopeForNode(target: Node, defaultScope: FocusScope): FocusScope {
  let current: Node | undefined = target;
  while (current) {
    const scope = (current as NodeWithFocusScope)._focusScope;
    if (scope?.focusableNodes.includes(target)) {
      return scope;
    }
    current = current._parent;
  }
  return defaultScope;
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

  // Handle display: contents nodes - they don't have their own layout,
  // their children use layouts from the parent's children array
  if (style.display === "contents") {
    const wrapperInherited = computeInheritedStyle(node, inherited);
    let consumed = 0;

    for (const child of resolveNodeChildren(node)) {
      if (child._isPortal) {
        // Paint portal children at root level (no layout consumed)
        paintPortalChildren(child, buffer, wrapperInherited, stdout);
        continue;
      }
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

  // Compute inherited style for this node
  const nodeInherited = computeInheritedStyle(node, inherited);

  // Call render if node has one
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
    if (child._isPortal) {
      paintPortalChildren(child, buffer, nodeInherited, stdout);
      continue;
    }
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

  return 1; // This node consumed one layout slot
}

/**
 * Paints portal children at root level with separate layout computation.
 */
function paintPortalChildren(
  portal: Node,
  buffer: Buffer,
  inherited: InheritedStyle,
  stdout: NodeJS.WriteStream,
): void {
  const rootClip: ClipRect = {
    x: 0,
    y: 0,
    width: stdout.columns,
    height: stdout.rows,
  };

  for (const portalChild of resolveNodeChildren(portal)) {
    const portalLayoutNode = nodeToLayoutNode(portalChild);
    const portalLayout = computeLayout(
      portalLayoutNode,
      stdout.columns,
      stdout.rows,
    );
    paintNode(
      portalChild,
      [portalLayout],
      0,
      buffer,
      inherited,
      rootClip,
      stdout,
    );
  }
}

/**
 * Paints all nodes in the tree by calling their render() functions.
 * Entry point for tree painting.
 */
function paintTree(
  root: Node,
  layoutResult: LayoutResult,
  buffer: Buffer,
  inherited: InheritedStyle,
  clip: ClipRect,
  stdout: NodeJS.WriteStream,
): void {
  const rootStyle = resolveNodeStyle(root);

  // If root is a contents node, it doesn't render itself but its children
  // use layouts from layoutResult.children
  if (rootStyle.display === "contents") {
    const wrapperInherited = computeInheritedStyle(root, inherited);
    let childIndex = 0;

    for (const child of resolveNodeChildren(root)) {
      if (child._isPortal) {
        paintPortalChildren(child, buffer, wrapperInherited, stdout);
        continue;
      }
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

  // Normal root - paint it using its own layout
  paintNode(root, [layoutResult], 0, buffer, inherited, clip, stdout);
}

/**
 * Performs the actual buffer flush to terminal.
 * Clears the back buffer, recomputes layout, paints the full tree, then flushes.
 */
function doFlush(state: RuntimeState): void {
  const fs = state.flushState;
  fs.scheduled = false;
  fs.lastFlushTime = performance.now();

  if (fs.timeout) {
    clearTimeout(fs.timeout);
    fs.timeout = null;
  }

  // Recompute layout - signal-driven content may have changed sizes
  const layoutNode = nodeToLayoutNode(state.root);
  const layoutResult = computeLayout(
    layoutNode,
    fs.stdout.columns,
    fs.stdout.rows,
  );
  state.layoutResult = layoutResult;

  // Update all layout signals for the new layout
  updateAllLayoutSignals(state.root, layoutResult);

  // Clear the back buffer before painting
  fs.buffer.clear();

  // Paint the entire tree
  const rootClip: ClipRect = {
    x: 0,
    y: 0,
    width: fs.stdout.columns,
    height: fs.stdout.rows,
  };
  paintTree(
    state.root,
    layoutResult,
    fs.buffer,
    DEFAULT_INHERITED_STYLE,
    rootClip,
    fs.stdout,
  );

  // Diff against front buffer and output only changed cells
  const output = fs.buffer.flush();
  if (output.length > 0) {
    flushFrame(fs.stdout, output);
  }
}

/**
 * Creates a closure for throttled flush scheduling.
 */
function createScheduleFlush(state: RuntimeState): () => void {
  return () => {
    const fs = state.flushState;
    if (fs.scheduled) return;
    fs.scheduled = true;

    const now = performance.now();
    const elapsed = now - fs.lastFlushTime;
    const frameInterval = fs.fpsLimit > 0 ? 1000 / fs.fpsLimit : 0;

    if (frameInterval === 0 || elapsed >= frameInterval) {
      queueMicrotask(() => doFlush(state));
    } else {
      const remaining = frameInterval - elapsed;
      fs.timeout = setTimeout(() => doFlush(state), remaining);
    }
  };
}

/**
 * Performs relayout and binds any new nodes.
 */
function doRelayout(
  state: RuntimeState,
  scheduleFlush: () => void,
  scheduleRelayout: () => void,
): void {
  state.relayoutScheduled = false;

  const { root, flushState } = state;
  const { stdout } = flushState;

  // Recompute layout for full tree
  const layoutNode = nodeToLayoutNode(root);
  const layoutResult = computeLayout(layoutNode, stdout.columns, stdout.rows);
  state.layoutResult = layoutResult;

  // Update existing nodes' layout signals
  updateAllLayoutSignals(root, layoutResult);

  // Bind any new nodes (created by Show/For since last bind)
  const rootClipAccessor: Accessor<ClipRect> = () => ({
    x: 0,
    y: 0,
    width: stdout.columns,
    height: stdout.rows,
  });
  const rootInheritedAccessor: InheritedStyleAccessor = () =>
    DEFAULT_INHERITED_STYLE;

  bindNodes(
    root,
    layoutResult,
    rootInheritedAccessor,
    rootClipAccessor,
    stdout,
    true, // onlyNew: only bind nodes created by Show/For since last bind
  );

  // Schedule a flush to repaint with new layout
  scheduleFlush();
}

/**
 * Creates a closure for relayout scheduling.
 */
function createScheduleRelayout(
  state: RuntimeState,
  scheduleFlush: () => void,
): () => void {
  const scheduleRelayout = (): void => {
    if (state.relayoutScheduled) return;
    state.relayoutScheduled = true;

    queueMicrotask(() => {
      doRelayout(state, scheduleFlush, scheduleRelayout);
    });
  };
  return scheduleRelayout;
}

/** Accessor for inherited style values */
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

/** A portal child node with its inherited style accessor. */
interface PortalChild {
  node: Node;
  inheritedAccessor: InheritedStyleAccessor;
}

/**
 * Flattens a node tree into bindable nodes and portal children.
 * Hoists children of `display: "contents"` nodes.
 * Portal children are collected separately for root-level layout.
 */
function flattenBindableNodes(
  node: Node,
  inheritedAccessor: InheritedStyleAccessor,
  clipAccessor: Accessor<ClipRect>,
  result: BindableNode[],
  portals: PortalChild[],
): void {
  const style = resolveNodeStyle(node);

  if (style.display === "contents") {
    const wrapperInheritedAccessor: InheritedStyleAccessor = () =>
      computeInheritedStyle(node, inheritedAccessor());

    for (const child of resolveNodeChildren(node)) {
      if (child._isPortal) {
        // Collect portal's children with current inherited style
        for (const portalChild of resolveNodeChildren(child)) {
          portals.push({
            node: portalChild,
            inheritedAccessor: wrapperInheritedAccessor,
          });
        }
        continue;
      }
      flattenBindableNodes(
        child,
        wrapperInheritedAccessor,
        clipAccessor,
        result,
        portals,
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
    if (child._isPortal) {
      // Collect portal's children with current inherited style
      for (const portalChild of resolveNodeChildren(child)) {
        portals.push({
          node: portalChild,
          inheritedAccessor: childInheritedAccessor,
        });
      }
      continue;
    }
    flattenBindableNodes(
      child,
      childInheritedAccessor,
      childClipAccessor,
      result,
      portals,
    );
  }
}

/**
 * Flattens a LayoutResult tree into a list matching the order produced by
 * `flattenBindableNodes`. Traverses node tree and layout tree in parallel,
 * skipping contents nodes (which don't have layout results).
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

  if (style.display === "contents") {
    let consumed = 0;
    for (const child of resolveNodeChildren(node)) {
      if (child._isPortal) continue;
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
    if (child._isPortal) continue;
    childConsumed += flattenLayoutResultsInner(
      child,
      layout.children,
      childConsumed,
      result,
    );
  }

  return 1; // We consumed one layout result from layoutChildren
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
      if (child._isPortal) continue;
      consumed += flattenLayoutResultsInner(
        child,
        layoutResult.children,
        consumed,
        result,
      );
    }
  } else {
    // Normal root - bind to it and recurse
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
 * Binds nodes in the tree including portals.
 * Sets up layout signals for each node.
 * Portal children are collected during traversal and bound at root level.
 *
 * @param onlyNew - If true, only binds nodes that don't have layout signals yet.
 *                  Used during relayout to bind newly created nodes (Show/For).
 */
function bindNodes(
  root: Node,
  layoutResult: LayoutResult,
  rootInheritedAccessor: InheritedStyleAccessor,
  rootClipAccessor: Accessor<ClipRect>,
  stdout: NodeJS.WriteStream,
  onlyNew = false,
): void {
  const bindableNodes: BindableNode[] = [];
  const portals: PortalChild[] = [];
  flattenBindableNodes(
    root,
    rootInheritedAccessor,
    rootClipAccessor,
    bindableNodes,
    portals,
  );

  const layouts: LayoutResult[] = [];
  flattenLayoutResults(layoutResult, root, layouts);

  for (let i = 0; i < bindableNodes.length; i++) {
    const { node } = bindableNodes[i];
    if (onlyNew && node._layout) continue;
    bindSingleNode(bindableNodes[i], layouts[i]);
  }

  for (const { node, inheritedAccessor } of portals) {
    if (onlyNew && node._layout) continue;

    const portalLayoutNode = nodeToLayoutNode(node);
    const portalLayout = computeLayout(
      portalLayoutNode,
      stdout.columns,
      stdout.rows,
    );

    const portalClipAccessor: Accessor<ClipRect> = () => ({
      x: 0,
      y: 0,
      width: stdout.columns,
      height: stdout.rows,
    });

    bindNodes(
      node,
      portalLayout,
      inheritedAccessor,
      portalClipAccessor,
      stdout,
      onlyNew,
    );
  }
}

/**
 * Updates layout signals for all existing nodes.
 * Uses flattened parallel iteration.
 */
function updateAllLayoutSignals(root: Node, layoutResult: LayoutResult): void {
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
 * Flattens a node tree into a list, hoisting children of `display: "contents"` nodes.
 * Used by updateAllLayoutSignals where we only need the nodes, not accessors.
 */
function flattenNodes(node: Node, result: Node[]): void {
  const style = resolveNodeStyle(node);

  if (style.display === "contents") {
    for (const child of resolveNodeChildren(node)) {
      if (child._isPortal) continue;
      flattenNodes(child, result);
    }
    return;
  }

  result.push(node);

  for (const child of resolveNodeChildren(node)) {
    if (child._isPortal) continue;
    flattenNodes(child, result);
  }
}

/**
 * Clears layout signals for a subtree being removed.
 */
function clearSubtreeLayoutSignals(node: Node): void {
  node._layout = undefined;

  for (const child of resolveNodeChildren(node)) {
    clearSubtreeLayoutSignals(child);
  }
}

/**
 * Handle incoming input events.
 * Resize events trigger relayout and repaint; others route events.
 */
function handleEvent(
  state: RuntimeState,
  event: InputEvent,
  scheduleFlush: () => void,
): void {
  if (event.type === "resize") {
    state.flushState.buffer.resize(event.width, event.height);

    const layoutNode = nodeToLayoutNode(state.root);
    const layoutResult = computeLayout(layoutNode, event.width, event.height);
    state.layoutResult = layoutResult;

    updateAllLayoutSignals(state.root, layoutResult);

    // Schedule repaint with new layout
    scheduleFlush();
    return;
  }

  // Batch ensures all signal updates from event handlers are coalesced
  batch(() => {
    routeEvent(state, event);
  });

  // After processing any event, schedule a repaint to reflect any signal changes
  scheduleFlush();
}

/**
 * Internal unmount function.
 */
function unmountState(state: RuntimeState, cleanupHandlers?: () => void): void {
  const { options } = state;
  const { stdout } = options;

  if (cleanupHandlers) {
    cleanupHandlers();
  }

  if (state.flushState.timeout) {
    clearTimeout(state.flushState.timeout);
    state.flushState.timeout = null;
  }

  state.rootDispose();
  clearSubtreeLayoutSignals(state.root);
  state.inputParser.destroy();
  exitTuiMode(stdout, { alternateScreen: options.alternateScreen });
}

/**
 * Mount an application to the terminal.
 *
 * Creates the component tree, sets up input handling, and starts the
 * render loop. Returns an App handle with an unmount() method.
 *
 * @param component - Function that returns the root node
 * @param options - Optional mount configuration
 * @returns App handle with unmount() method
 */
export function mount(component: () => Node, options?: MountOptions): App {
  const opts: Required<MountOptions> = { ...DEFAULT_MOUNT_OPTIONS, ...options };
  const { stdin, stdout } = opts;

  const [focusedNode, setFocusedNode] = createSignal<Node | null>(null);

  const buffer = new Buffer(stdout.columns, stdout.rows);

  // Initialize state with flushState
  const state: RuntimeState = {
    root: undefined as unknown as Node,
    rootDispose: undefined as unknown as () => void,
    layoutResult: null,
    flushState: {
      scheduled: false,
      lastFlushTime: 0,
      timeout: null,
      buffer,
      stdout,
      fpsLimit: opts.fpsLimit,
    },
    relayoutScheduled: false,
    inputParser: undefined as unknown as { destroy: () => void },
    options: opts,
    focusedNode,
    setFocusedNode,
    rootScope: {
      parent: null,
      focusableNodes: [],
      focusedIndex: -1,
      trap: false,
    },
    hoverState: { currentNode: null },
    terminalFocused: true,
    stdin,
  };

  const scheduleFlush = createScheduleFlush(state);
  const scheduleRelayout = createScheduleRelayout(state, scheduleFlush);

  enterTuiMode(stdout, { alternateScreen: opts.alternateScreen });

  state.inputParser = createInputParser(
    stdin,
    stdout,
    (event) => handleEvent(state, event, scheduleFlush),
    { mouse: opts.mouse },
  );

  const ctx: RuntimeContext = {
    state,
    currentScope: state.rootScope,
    scheduleRelayout,
    scheduleFlush,
  };

  state.rootDispose = createRoot((dispose) => {
    state.root = withContext(ctx, () => component());

    initializeFocus(state);

    buffer.clear();
    const layoutNode = nodeToLayoutNode(state.root);
    const layoutResult = computeLayout(layoutNode, stdout.columns, stdout.rows);
    state.layoutResult = layoutResult;

    const rootClipAccessor: Accessor<ClipRect> = () => ({
      x: 0,
      y: 0,
      width: stdout.columns,
      height: stdout.rows,
    });
    const rootInheritedAccessor: InheritedStyleAccessor = () =>
      DEFAULT_INHERITED_STYLE;

    bindNodes(
      state.root,
      layoutResult,
      rootInheritedAccessor,
      rootClipAccessor,
      stdout,
    );

    return dispose;
  });

  doFlush(state);

  let unmounted = false;

  const handleExit = () => {
    if (!unmounted) {
      unmounted = true;
      unmountState(state, removeSignalHandlers);
    }
  };

  const handleSignal = (signal: NodeJS.Signals) => {
    handleExit();
    // Re-raise signal with default handler
    process.exit(signal === "SIGINT" ? 130 : 143);
  };

  const handleUncaughtException = (err: Error) => {
    handleExit();
    console.error(err);
    process.exit(1);
  };

  const sigintHandler = () => handleSignal("SIGINT");
  const sigtermHandler = () => handleSignal("SIGTERM");

  process.on("exit", handleExit);
  process.on("SIGINT", sigintHandler);
  process.on("SIGTERM", sigtermHandler);
  process.on("uncaughtException", handleUncaughtException);

  const removeSignalHandlers = () => {
    process.off("exit", handleExit);
    process.off("SIGINT", sigintHandler);
    process.off("SIGTERM", sigtermHandler);
    process.off("uncaughtException", handleUncaughtException);
  };

  // Return app handle
  return {
    unmount() {
      if (!unmounted) {
        unmounted = true;
        unmountState(state, removeSignalHandlers);
      }
    },
  };
}
