// Render pipeline and component primitives

import {
  BOLD,
  Buffer,
  type Color,
  DEFAULT_COLOR,
  DIM,
  INVERSE,
  ITALIC,
  type InheritableColor,
  STRIKETHROUGH,
  UNDERLINE,
  graphemeDisplayWidth,
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
import { batch } from "./signals.ts";
import {
  type Accessor,
  type Setter,
  createEffect,
  createRoot,
  createSignal,
  onCleanup,
} from "./signals.ts";

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

  // Dispose function for the render effect (called on unmount or Show/For change)
  _disposeRenderEffect?: () => void;
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

  // Get children (may be a getter for Show/For)
  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : (node.children ?? []);

  for (const child of children) {
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

/**
 * Navigate focus to the next focusable node within a scope.
 * Handles wrapping and scope escaping based on trap setting.
 */
export function focusNext(state: RuntimeState, scope: FocusScope): void {
  const { focusableNodes, focusedIndex } = scope;

  if (focusableNodes.length === 0) {
    // No focusables in this scope, try parent if not trapped
    if (!scope.trap && scope.parent) {
      focusNext(state, scope.parent);
    }
    return;
  }

  if (focusedIndex === -1) {
    // Nothing focused, focus first
    scope.focusedIndex = 0;
    state.setFocusedNode(focusableNodes[0]);
    return;
  }

  const nextIndex = focusedIndex + 1;

  if (nextIndex >= focusableNodes.length) {
    // At end of scope
    if (scope.trap) {
      // Wrap within scope
      scope.focusedIndex = 0;
      state.setFocusedNode(focusableNodes[0]);
    } else if (scope.parent && countFocusablesInAncestors(scope.parent) > 0) {
      // Escape to parent (only if parent has focusables)
      scope.focusedIndex = -1;
      focusNext(state, scope.parent);
    } else {
      // No parent focusables or at root, wrap
      scope.focusedIndex = 0;
      state.setFocusedNode(focusableNodes[0]);
    }
  } else {
    scope.focusedIndex = nextIndex;
    state.setFocusedNode(focusableNodes[nextIndex]);
  }
}

/**
 * Navigate focus to the previous focusable node within a scope.
 * Handles wrapping and scope escaping based on trap setting.
 */
export function focusPrev(state: RuntimeState, scope: FocusScope): void {
  const { focusableNodes, focusedIndex } = scope;

  if (focusableNodes.length === 0) {
    if (!scope.trap && scope.parent) {
      focusPrev(state, scope.parent);
    }
    return;
  }

  if (focusedIndex === -1) {
    // Nothing focused, focus last
    scope.focusedIndex = focusableNodes.length - 1;
    state.setFocusedNode(focusableNodes[scope.focusedIndex]);
    return;
  }

  const prevIndex = focusedIndex - 1;

  if (prevIndex < 0) {
    if (scope.trap) {
      // Wrap within scope
      scope.focusedIndex = focusableNodes.length - 1;
      state.setFocusedNode(focusableNodes[scope.focusedIndex]);
    } else if (scope.parent && countFocusablesInAncestors(scope.parent) > 0) {
      // Escape to parent (only if parent has focusables)
      scope.focusedIndex = -1;
      focusPrev(state, scope.parent);
    } else {
      // No parent focusables or at root, wrap
      scope.focusedIndex = focusableNodes.length - 1;
      state.setFocusedNode(focusableNodes[scope.focusedIndex]);
    }
  } else {
    scope.focusedIndex = prevIndex;
    state.setFocusedNode(focusableNodes[prevIndex]);
  }
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

// Screen control functions

/**
 * Enter TUI mode (display setup).
 *
 * Optionally enters alternate screen buffer, hides cursor, clears screen,
 * and moves cursor home.
 */
export function enterTuiMode(
  stdout: NodeJS.WriteStream,
  options: { alternateScreen: boolean },
): void {
  let seq = "";

  if (options.alternateScreen) {
    seq += "\x1b[?1049h"; // Enter alternate screen
  }

  seq += "\x1b[?25l"; // Hide cursor
  seq += "\x1b[2J"; // Clear screen
  seq += "\x1b[H"; // Move cursor home

  stdout.write(seq);
}

/**
 * Exit TUI mode (display teardown).
 *
 * Shows cursor and optionally exits alternate screen buffer.
 */
export function exitTuiMode(
  stdout: NodeJS.WriteStream,
  options: { alternateScreen: boolean },
): void {
  let seq = "";

  seq += "\x1b[?25h"; // Show cursor

  if (options.alternateScreen) {
    seq += "\x1b[?1049l"; // Exit alternate screen
  }

  stdout.write(seq);
}

/**
 * Write frame content to stdout.
 *
 * The cursor is already hidden by enterTuiMode and restored by exitTuiMode,
 * so this function simply writes the content without cursor manipulation.
 * No-op for empty content.
 */
export function flushFrame(stdout: NodeJS.WriteStream, content: string): void {
  if (content.length === 0) return;

  stdout.write(content);
}

/**
 * Inherited style values passed down through the node tree during paint.
 * All properties are resolved (no "inherit" values).
 */
export interface InheritedStyle {
  color: Color;
  backgroundColor: Color;
  borderColor: Color;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  inverse: boolean;
}

/**
 * Default inherited style values.
 * Used at the root when no parent style exists.
 */
export const DEFAULT_INHERITED_STYLE: InheritedStyle = {
  color: DEFAULT_COLOR,
  backgroundColor: DEFAULT_COLOR,
  borderColor: DEFAULT_COLOR,
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  strikethrough: false,
  inverse: false,
};

/** Inheritable boolean value for text modifiers. */
export type InheritableBool = boolean | "inherit";

/**
 * Clipping rectangle for paint-time clipping.
 * Coordinates are absolute screen positions.
 */
export interface ClipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Default clip rect covering the full terminal.
 * Used when no parent clipping is in effect.
 */
export const DEFAULT_CLIP: ClipRect = {
  x: 0,
  y: 0,
  width: Number.POSITIVE_INFINITY,
  height: Number.POSITIVE_INFINITY,
};

/**
 * Intersect two clip rects, returning the overlapping region.
 * Returns a zero-area rect if there's no overlap.
 */
export function intersectClipRect(a: ClipRect, b: ClipRect): ClipRect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

/**
 * Check if a point is within the clip rect.
 */
export function isInClipRect(x: number, y: number, clip: ClipRect): boolean {
  return (
    x >= clip.x &&
    x < clip.x + clip.width &&
    y >= clip.y &&
    y < clip.y + clip.height
  );
}

/**
 * Resolve an inheritable color value.
 * Returns the inherited value if the prop is undefined or "inherit".
 */
function resolveInheritableColor(
  value: InheritableColor | (() => InheritableColor) | undefined,
  inherited: Color,
): Color {
  if (value === undefined || value === "inherit") {
    return inherited;
  }
  if (typeof value === "function") {
    const resolved = value();
    return resolved === "inherit" ? inherited : resolved;
  }
  return value;
}

/**
 * Resolve an inheritable boolean value.
 * Returns the inherited value if the prop is undefined or "inherit".
 */
function resolveInheritableBool(
  value: InheritableBool | (() => InheritableBool) | undefined,
  inherited: boolean,
): boolean {
  if (value === undefined || value === "inherit") {
    return inherited;
  }
  if (typeof value === "function") {
    const resolved = value();
    return resolved === "inherit" ? inherited : resolved;
  }
  return value;
}

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
    color: resolveInheritableColor(props.color, parentStyle.color),
    backgroundColor: resolveInheritableColor(
      props.backgroundColor,
      parentStyle.backgroundColor,
    ),
    borderColor: resolveInheritableColor(
      props.borderColor,
      parentStyle.borderColor,
    ),
    bold: resolveInheritableBool(props.bold, parentStyle.bold),
    dim: resolveInheritableBool(props.dim, parentStyle.dim),
    italic: resolveInheritableBool(props.italic, parentStyle.italic),
    underline: resolveInheritableBool(props.underline, parentStyle.underline),
    strikethrough: resolveInheritableBool(
      props.strikethrough,
      parentStyle.strikethrough,
    ),
    inverse: resolveInheritableBool(props.inverse, parentStyle.inverse),
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

/** Border style names. */
export type BorderStyleName =
  | "single"
  | "round"
  | "double"
  | "bold"
  | "dashed"
  | "ascii";

/**
 * Border prop for BoxProps.
 * - boolean: true = 'single' on all sides
 * - BorderStyleName: style on all sides
 * - object: selective borders per side
 */
export type BorderProp =
  | boolean
  | BorderStyleName
  | {
      top?: boolean;
      right?: boolean;
      bottom?: boolean;
      left?: boolean;
    };

/**
 * Border character set for a style.
 */
interface BorderChars {
  tl: string; // top-left corner
  tr: string; // top-right corner
  bl: string; // bottom-left corner
  br: string; // bottom-right corner
  h: string; // horizontal
  v: string; // vertical
}

/**
 * Border character sets for each style.
 */
export const BORDER_CHARS: Record<BorderStyleName, BorderChars> = {
  single: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" },
  round: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" },
  double: { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" },
  bold: { tl: "┏", tr: "┓", bl: "┗", br: "┛", h: "━", v: "┃" },
  dashed: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "┄", v: "┆" },
  ascii: { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" },
};

/** Text wrap mode. */
export type WrapMode = "wrap" | "truncate" | "truncate-end" | "truncate-start";

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
 * Calculates the display width of a line of text.
 */
export function lineDisplayWidth(line: string): number {
  let width = 0;
  for (const grapheme of graphemes(line)) {
    width += graphemeDisplayWidth(grapheme);
  }
  return width;
}

/**
 * Wraps a single line of text at grapheme boundaries to fit within maxWidth.
 * Returns an array of wrapped line segments.
 */
export function wrapLine(line: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [line];

  const result: string[] = [];
  let current = "";
  let currentWidth = 0;

  for (const grapheme of graphemes(line)) {
    const w = graphemeDisplayWidth(grapheme);

    if (currentWidth + w > maxWidth && current.length > 0) {
      result.push(current);
      current = "";
      currentWidth = 0;
    }

    current += grapheme;
    currentWidth += w;
  }

  if (current.length > 0) {
    result.push(current);
  }

  return result.length > 0 ? result : [""];
}

/**
 * Measures text for layout purposes.
 * Returns the width and height needed to display the text.
 *
 * @param text - The text to measure
 * @param availableWidth - Available width for wrapping
 * @param wrap - Wrapping mode: "wrap" for line wrapping, or truncate modes for single line
 */
export function measureText(
  text: string,
  availableWidth: number,
  wrap: WrapMode,
): { width: number; height: number } {
  if (text.length === 0) {
    return { width: 0, height: 0 };
  }

  const lines = text.split("\n");

  if (wrap === "wrap") {
    // Wrap lines to available width
    const wrappedLines = lines.flatMap((line) =>
      wrapLine(line, availableWidth),
    );
    const maxWidth = Math.max(
      ...wrappedLines.map((line) => lineDisplayWidth(line)),
    );
    return {
      width: Math.min(maxWidth, availableWidth),
      height: wrappedLines.length,
    };
  }

  // No wrapping, single line per input line
  const maxWidth = Math.max(...lines.map((line) => lineDisplayWidth(line)));
  return {
    width: Math.min(maxWidth, availableWidth),
    height: lines.length,
  };
}

/**
 * Truncates a line from the end, adding ellipsis.
 */
function truncateEnd(line: string, maxWidth: number): string {
  const ellipsis = "…";
  const ellipsisWidth = 1;
  const targetWidth = maxWidth - ellipsisWidth;

  if (targetWidth <= 0) return ellipsis.slice(0, maxWidth);

  let result = "";
  let width = 0;

  for (const grapheme of graphemes(line)) {
    const w = graphemeDisplayWidth(grapheme);
    if (width + w > targetWidth) break;
    result += grapheme;
    width += w;
  }

  return result + ellipsis;
}

/**
 * Truncates a line from the start, adding ellipsis.
 */
function truncateStart(line: string, maxWidth: number): string {
  const ellipsis = "…";
  const ellipsisWidth = 1;
  const targetWidth = maxWidth - ellipsisWidth;

  if (targetWidth <= 0) return ellipsis.slice(0, maxWidth);

  // Collect graphemes in reverse
  const chars = [...graphemes(line)];
  let result = "";
  let width = 0;

  for (let i = chars.length - 1; i >= 0; i--) {
    const w = graphemeDisplayWidth(chars[i]);
    if (width + w > targetWidth) break;
    result = chars[i] + result;
    width += w;
  }

  return ellipsis + result;
}

/**
 * Truncates a line to fit within maxWidth, using the specified mode.
 * Returns the line unchanged if it already fits.
 */
export function truncateLine(
  line: string,
  maxWidth: number,
  mode: "truncate" | "truncate-end" | "truncate-start",
): string {
  const width = lineDisplayWidth(line);
  if (width <= maxWidth) return line;

  if (mode === "truncate" || mode === "truncate-end") {
    return truncateEnd(line, maxWidth);
  }

  return truncateStart(line, maxWidth);
}

/**
 * Resolves a value that may be static or a getter function.
 */
function resolveValue<T>(value: T | (() => T) | undefined): T | undefined {
  return typeof value === "function" ? (value as () => T)() : value;
}

/**
 * Computes the modifier bitmask from TextProps using inherited styles.
 */
function computeModifiers(props: TextProps, inherited: InheritedStyle): number {
  let mods = 0;
  if (resolveInheritableBool(props.bold, inherited.bold)) mods |= BOLD;
  if (resolveInheritableBool(props.dim, inherited.dim)) mods |= DIM;
  if (resolveInheritableBool(props.italic, inherited.italic)) mods |= ITALIC;
  if (resolveInheritableBool(props.underline, inherited.underline))
    mods |= UNDERLINE;
  if (resolveInheritableBool(props.strikethrough, inherited.strikethrough))
    mods |= STRIKETHROUGH;
  if (resolveInheritableBool(props.inverse, inherited.inverse)) mods |= INVERSE;
  return mods;
}

/**
 * Renders text into the buffer with styling and wrapping/truncation.
 */
function renderText(
  buffer: Buffer,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  props: TextProps,
  inherited: InheritedStyle,
  clip: ClipRect,
): void {
  // Early out if entirely outside clip rect
  if (
    x >= clip.x + clip.width ||
    x + width <= clip.x ||
    y >= clip.y + clip.height ||
    y + height <= clip.y
  ) {
    return;
  }

  // Resolve reactive props with inheritance
  const fg = resolveInheritableColor(props.color, inherited.color);
  const bg = resolveInheritableColor(
    props.backgroundColor,
    inherited.backgroundColor,
  );
  const modifiers = computeModifiers(props, inherited);
  const wrapValue = resolveValue(props.wrap) ?? "wrap";

  const lines = text.split("\n");
  const displayLines =
    wrapValue === "wrap"
      ? lines.flatMap((line) => wrapLine(line, width))
      : lines.map((line) => truncateLine(line, width, wrapValue));

  for (let row = 0; row < Math.min(displayLines.length, height); row++) {
    const screenY = y + row;
    // Skip rows outside clip
    if (screenY < clip.y || screenY >= clip.y + clip.height) continue;

    const line = displayLines[row];
    // For each grapheme, check if it's in clip
    let col = x;
    for (const char of graphemes(line)) {
      const charWidth = graphemeDisplayWidth(char);
      if (col >= clip.x && col < clip.x + clip.width) {
        buffer.set(col, screenY, char, fg, bg, modifiers);
      }
      col += charWidth;
      if (col >= clip.x + clip.width) break;
    }
  }
}

/**
 * Parse BorderProp into individual border flags for each side.
 */
function parseBorderProp(border: BorderProp | undefined): {
  top: boolean;
  end: boolean;
  bottom: boolean;
  start: boolean;
} {
  if (border === undefined || border === false) {
    return { top: false, end: false, bottom: false, start: false };
  }

  if (border === true || typeof border === "string") {
    // All sides
    return { top: true, end: true, bottom: true, start: true };
  }

  // Selective borders object - map right to end, left to start
  return {
    top: border.top ?? false,
    end: border.right ?? false,
    bottom: border.bottom ?? false,
    start: border.left ?? false,
  };
}

/**
 * Determine the border style name from props.
 */
function getBorderStyleName(
  border: BorderProp | undefined,
  borderStyle: BorderStyleName | undefined,
): BorderStyleName {
  // borderStyle prop overrides everything
  if (borderStyle) {
    return borderStyle;
  }
  // If border is a style name string, use it
  if (typeof border === "string") {
    return border;
  }
  // Default to 'single'
  return "single";
}

/**
 * Get the character for a corner position based on which adjacent edges exist.
 * Returns corner char if both edges exist, edge char if one exists, undefined if neither.
 */
function getCornerChar(
  chars: BorderChars,
  hasEdge1: boolean,
  hasEdge2: boolean,
  corner: string,
  edge1Char: string,
  edge2Char: string,
): string | undefined {
  if (hasEdge1 && hasEdge2) return corner;
  if (hasEdge1) return edge1Char;
  if (hasEdge2) return edge2Char;
  return undefined;
}

/**
 * Render border onto the buffer.
 * Uses correct corner logic: corners only render when both adjacent edges exist.
 */
function renderBorder(
  buffer: Buffer,
  x: number,
  y: number,
  width: number,
  height: number,
  borders: { top: boolean; end: boolean; bottom: boolean; start: boolean },
  styleName: BorderStyleName,
  fg: Color,
  bg: Color,
  clip: ClipRect,
): void {
  const chars = BORDER_CHARS[styleName];
  const { top, end, bottom, start } = borders;

  // Draw horizontal edges
  if (top) {
    const startCol = start ? x + 1 : x;
    const endCol = end ? x + width - 1 : x + width;
    for (let col = startCol; col < endCol; col++) {
      if (isInClipRect(col, y, clip)) {
        buffer.set(col, y, chars.h, fg, bg, 0);
      }
    }
  }
  if (bottom) {
    const startCol = start ? x + 1 : x;
    const endCol = end ? x + width - 1 : x + width;
    for (let col = startCol; col < endCol; col++) {
      if (isInClipRect(col, y + height - 1, clip)) {
        buffer.set(col, y + height - 1, chars.h, fg, bg, 0);
      }
    }
  }

  // Draw vertical edges
  if (start) {
    const startRow = top ? y + 1 : y;
    const endRow = bottom ? y + height - 1 : y + height;
    for (let row = startRow; row < endRow; row++) {
      if (isInClipRect(x, row, clip)) {
        buffer.set(x, row, chars.v, fg, bg, 0);
      }
    }
  }
  if (end) {
    const startRow = top ? y + 1 : y;
    const endRow = bottom ? y + height - 1 : y + height;
    for (let row = startRow; row < endRow; row++) {
      if (isInClipRect(x + width - 1, row, clip)) {
        buffer.set(x + width - 1, row, chars.v, fg, bg, 0);
      }
    }
  }

  // Draw corners using table-driven approach
  const corners: [number, number, boolean, boolean, string, string, string][] =
    [
      [x, y, top, start, chars.tl, chars.h, chars.v], // top-left
      [x + width - 1, y, top, end, chars.tr, chars.h, chars.v], // top-right
      [x, y + height - 1, bottom, start, chars.bl, chars.h, chars.v], // bottom-left
      [x + width - 1, y + height - 1, bottom, end, chars.br, chars.h, chars.v], // bottom-right
    ];

  for (const [cx, cy, hasHoriz, hasVert, corner, hChar, vChar] of corners) {
    const char = getCornerChar(chars, hasHoriz, hasVert, corner, hChar, vChar);
    if (char && isInClipRect(cx, cy, clip)) {
      buffer.set(cx, cy, char, fg, bg, 0);
    }
  }
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

  // Normalize children to always be an array of Nodes
  // Strings and string accessors are wrapped in Text nodes
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

  // Reactive border getter - evaluates border prop (which may be a signal)
  const getBorderFlags = () => {
    const borderValue = typeof border === "function" ? border() : border;
    return parseBorderProp(borderValue);
  };

  // Determine if we need a render function (border prop could be reactive)
  const needsRender = backgroundColor !== undefined || border !== undefined;

  const node: Node = {
    get style() {
      // Resolve any reactive style props
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(styleProps)) {
        resolved[key] =
          typeof value === "function" ? (value as () => unknown)() : value;
      }
      // Add border flags to FlexStyle for layout (reactive)
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

    // Store inheritable props for style resolution during paint
    _inheritableProps: {
      backgroundColor,
      borderColor,
    },

    // Render function when backgroundColor or border is set
    render: needsRender
      ? (x, y, width, height, buffer, inherited, clip) => {
          // Early out if entirely outside clip rect
          if (
            x >= clip.x + clip.width ||
            x + width <= clip.x ||
            y >= clip.y + clip.height ||
            y + height <= clip.y
          ) {
            return;
          }

          // Resolve background color with inheritance
          const bg = resolveInheritableColor(
            backgroundColor,
            inherited.backgroundColor,
          );

          // Render background first (if set or inherited)
          // Only fill if we have an explicit backgroundColor prop
          if (backgroundColor !== undefined) {
            // Clip background fill to clip rect
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

          // Render border (if set) - reactive evaluation
          const borderFlags = getBorderFlags();
          const hasBorder =
            borderFlags.top ||
            borderFlags.end ||
            borderFlags.bottom ||
            borderFlags.start;

          if (hasBorder) {
            const fg = resolveInheritableColor(
              borderColor,
              inherited.borderColor,
            );
            const borderValue =
              typeof border === "function" ? border() : border;
            const borderStyleValue =
              typeof borderStyle === "function" ? borderStyle() : borderStyle;
            const styleName = getBorderStyleName(borderValue, borderStyleValue);
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

  // Bind ref
  if (ref) {
    ref.current = node;
  }

  // Set parent references on children for O(depth) tree traversal
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

    // Store inheritable props for style resolution during paint
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
          content,
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

  // Bind ref
  if (ref) {
    ref.current = node;
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
    // Portal uses display: "contents" so it's invisible in layout
    // (only its children render, and they render at root level)
    style: { ...DEFAULT_FLEX_STYLE, display: "contents" },
    children,
    _isPortal: true,
  };

  // Set parent references on children
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

  // Capture context for cleanup (may be null if used outside mount)
  const ctx = activeContext;

  const children: Node[] = [];
  let currentDispose: (() => void) | null = null;
  let currentChild: Node | null = null;

  // Define container first so children can reference it.
  // Use display: "contents" so Show doesn't affect parent layout.
  const container: Node = {
    style: { ...DEFAULT_FLEX_STYLE, display: "contents" },
    get children() {
      return children;
    },
  };

  // Helper to clean up previous subtree
  const disposeChild = () => {
    if (currentDispose) {
      // Clean up focus/hover state before disposing
      if (ctx && currentChild) {
        cleanupSubtreeState(ctx.state, currentChild);
      }
      // Dispose render effects for the removed subtree
      if (currentChild) {
        disposeSubtreeRenderEffects(currentChild);
      }
      currentDispose();
      currentDispose = null;
      currentChild = null;
    }
  };

  // Helper to create child node with proper context
  const createChildNode = (
    factory: () => Node,
    dispose: () => void,
  ): (() => void) => {
    // Run factory with captured context to support components that need it
    // (e.g., TabFocus which calls getContext())
    const node = ctx ? withContext(ctx, factory) : factory();
    node._parent = container;
    children.push(node);
    currentChild = node;

    // Register focusable nodes from new subtree
    if (ctx) {
      registerSubtreeFocusables(ctx.state, node);
    }

    return dispose;
  };

  // Create a reactive effect that updates the child
  createEffect(() => {
    const value = condition();

    // Dispose previous subtree
    disposeChild();

    // Clear children array
    children.length = 0;

    // Create new subtree in a fresh root
    if (value) {
      currentDispose = createRoot((dispose) =>
        createChildNode(() => childrenBranch(value), dispose),
      );
      // Schedule relayout to bind new nodes
      ctx?.scheduleRelayout();
    } else if (fallback) {
      currentDispose = createRoot((dispose) =>
        createChildNode(fallback, dispose),
      );
      // Schedule relayout to bind new nodes
      ctx?.scheduleRelayout();
    }
  });

  // Ensure we clean up when Show itself is disposed
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

  // Capture context for cleanup (may be null if used outside mount)
  const ctx = activeContext;

  const children: Node[] = [];
  // Map from key to array of entries (supports duplicates)
  const itemRoots: Map<unknown, ForItemEntry<T>[]> = new Map();

  // Key function defaults to identity
  const getKey = keyFn ?? ((item: T) => item);

  // Define container first so children can reference it.
  // Use display: "contents" so For doesn't affect parent layout.
  const container: Node = {
    style: { ...DEFAULT_FLEX_STYLE, display: "contents" },
    get children() {
      return children;
    },
  };

  // Helper to dispose an entry with proper focus/hover cleanup
  const disposeEntry = (entry: ForItemEntry<T>) => {
    if (ctx) {
      cleanupSubtreeState(ctx.state, entry.node);
    }
    // Dispose render effects for the removed subtree
    disposeSubtreeRenderEffects(entry.node);
    entry.node._parent = undefined;
    entry.dispose();
  };

  // Helper to create a new entry with its own detached root.
  // Detached roots are not children of the effect, so they persist across
  // effect re-runs. We manage their lifecycle manually via dispose().
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

        // Add to entries array for this key
        const existing = itemRoots.get(key);
        if (existing) {
          existing.push(entry);
        } else {
          itemRoots.set(key, [entry]);
        }

        // Register focusable nodes from new subtree
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

    // Count how many times each key appears in the new array
    const keyCounts = new Map<unknown, number>();
    for (const item of currentItems) {
      const key = getKey(item);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }

    // Track how many entries we've used per key
    const keyUsed = new Map<unknown, number>();

    // Update children array in new order
    children.length = 0;

    for (let i = 0; i < currentItems.length; i++) {
      const item = currentItems[i];
      const key = getKey(item);

      const entries = itemRoots.get(key);
      const usedCount = keyUsed.get(key) ?? 0;

      if (entries && usedCount < entries.length) {
        // Reuse existing entry
        const entry = entries[usedCount];
        entry.setItem(item);
        entry.setIndex(i);
        children.push(entry.node);
      } else {
        // Create new entry (outside effect ownership)
        const entry = createEntry(item, i, key);
        children.push(entry.node);
      }

      keyUsed.set(key, usedCount + 1);
    }

    // Dispose entries that are no longer needed
    for (const [key, entries] of itemRoots) {
      const needed = keyCounts.get(key) ?? 0;
      if (needed === 0) {
        // Key no longer exists, dispose all entries
        for (const entry of entries) {
          disposeEntry(entry);
        }
        itemRoots.delete(key);
      } else if (entries.length > needed) {
        // More entries than needed, dispose excess
        const excess = entries.splice(needed);
        for (const entry of excess) {
          disposeEntry(entry);
        }
      }
    }

    // Schedule relayout to bind new nodes
    ctx?.scheduleRelayout();
  });

  // Ensure we clean up all item roots when For itself is disposed
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

/**
 * Creates a nested focus scope for organizing focusable elements.
 *
 * When `trap` is true, Tab/Shift+Tab navigation wraps within this scope
 * instead of escaping to the parent. Useful for modal dialogs.
 */
export function FocusScopeComponent(props: FocusScopeProps): Node {
  const ctx = getContext();

  // Create new scope as child of current
  const scope: FocusScope = {
    parent: ctx.currentScope,
    focusableNodes: [],
    focusedIndex: -1,
    trap: props.trap ?? false,
  };

  // Build children within new scope context
  const childCtx: RuntimeContext = {
    state: ctx.state,
    currentScope: scope,
    scheduleRelayout: ctx.scheduleRelayout,
  };

  const node = withContext(childCtx, () => Box({ children: props.children }));

  // Store scope reference on node for cleanup and boundary detection
  (node as NodeWithFocusScope)._focusScope = scope;

  // Collect focusable nodes into this scope
  collectFocusableInScope(node, scope);

  // Don't auto-focus here; let initializeFocus handle it after tree construction.
  // This ensures autoFocus props anywhere in the tree are considered together.

  return node;
}

/** Props for TabFocus component */
export interface TabFocusProps {
  children: Node[];
  trap?: boolean;
}

/**
 * Convenience component that combines a FocusScope with Tab key handling.
 *
 * Wraps children in a focus scope and handles Tab/Shift+Tab to navigate
 * between focusable children.
 */
export function TabFocus(props: TabFocusProps): Node {
  const ctx = getContext();

  // Create new scope as child of current
  const scope: FocusScope = {
    parent: ctx.currentScope,
    focusableNodes: [],
    focusedIndex: -1,
    trap: props.trap ?? false,
  };

  // Build children within new scope context
  const childCtx: RuntimeContext = {
    state: ctx.state,
    currentScope: scope,
    scheduleRelayout: ctx.scheduleRelayout,
  };

  const node = withContext(childCtx, () => {
    const focus = createFocusController(ctx.state, scope);

    return Box({
      children: props.children,
      onKeyPress(event) {
        if (event.name === "tab") {
          if (event.shift) {
            focus.prev();
          } else {
            focus.next();
          }
          return true;
        }
        return false;
      },
    });
  });

  // Store scope reference on node
  (node as NodeWithFocusScope)._focusScope = scope;

  // Collect focusable nodes into this scope
  collectFocusableInScope(node, scope);

  // Don't auto-focus here; let initializeFocus handle it after tree construction.
  // This ensures autoFocus props anywhere in the tree are considered together.

  return node;
}

/**
 * Convert runtime Node to layout system's LayoutNode.
 * Resolves reactive styles and handles children as either array or getter function.
 * Skips portal nodes (their children are laid out separately at root level).
 */
function nodeToLayoutNode(node: Node): LayoutNode {
  const style = typeof node.style === "function" ? node.style() : node.style;

  // Handle children as either array or getter function (for Show/For)
  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : node.children;

  // Filter out portal children - they're laid out separately at root level
  const filteredChildren = children?.filter((child) => !child._isPortal);

  return {
    style,
    children: filteredChildren?.map(nodeToLayoutNode),
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

  // Build path from focused node to root using parent pointers
  const path = buildPathToRoot(focused);

  // Dispatch from focused node upward (bubbling)
  for (const node of path) {
    if (node.onKeyPress) {
      const consumed = node.onKeyPress(event);
      if (consumed === true) {
        return; // Event consumed, stop bubbling
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
  // Use screen coordinates for hit testing (mouse x,y are absolute)
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

  // Get children (may be a getter for Show/For)
  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : (node.children ?? []);
  const childLayouts = layout.children ?? [];

  // Check children in reverse order for proper z-ordering
  // Later children are considered "on top" and checked first
  for (let i = children.length - 1; i >= 0; i--) {
    const childLayout = childLayouts[i];
    if (!childLayout) continue;

    const hit = hitTest(children[i], childLayout, x, y);
    if (hit) {
      return hit;
    }
  }

  // No child contains point, return this node
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

  // Find node under cursor
  const target = hitTest(root, layoutResult, event.x, event.y);

  // Update hover state
  if (target !== hoverState.currentNode) {
    if (hoverState.currentNode?.onHover) {
      hoverState.currentNode.onHover(false);
    }
    if (target?.onHover) {
      target.onHover(true);
    }
    hoverState.currentNode = target;
  }

  // Dispatch event to target
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

  // Build path from target to root and bubble
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

  // Build path from focused node to root for bubbling
  const path = buildPathToRoot(focused);

  // Process each grapheme (not codepoint) to handle emoji correctly
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

    // Bubble the event up the tree
    let consumed = false;
    for (const node of path) {
      if (node.onKeyPress) {
        const result = node.onKeyPress(keyEvent);
        if (result === true) {
          consumed = true;
          break; // Event consumed, stop bubbling this character
        }
      }
    }

    // If a handler consumed the event, stop processing remaining characters
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

  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : (node.children ?? []);

  for (const child of children) {
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
  // Clear and collect focusable nodes into root scope
  state.rootScope.focusableNodes = [];
  collectFocusableInScope(state.root, state.rootScope);

  // Search ALL focusables (including nested scopes) for autoFocus or first focusable
  const allFocusables = collectAllFocusables(state.root);

  if (allFocusables.length === 0) {
    return; // Nothing focusable
  }

  // Prefer autoFocus node, otherwise use first focusable
  const targetNode = allFocusables.find((n) => n.autoFocus) ?? allFocusables[0];

  // Find which scope contains this node and update its state
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
  // Walk up from target to find the nearest scope
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
 * Performs the actual buffer flush to terminal.
 */
function doFlush(state: RuntimeState): void {
  const fs = state.flushState;
  fs.scheduled = false;
  fs.lastFlushTime = performance.now();

  if (fs.timeout) {
    clearTimeout(fs.timeout);
    fs.timeout = null;
  }

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
  const { buffer, stdout } = flushState;

  // Clear buffer to remove stale content from removed nodes
  buffer.clear();

  // Recompute layout for full tree
  const layoutNode = nodeToLayoutNode(root);
  const layoutResult = computeLayout(layoutNode, stdout.columns, stdout.rows);
  state.layoutResult = layoutResult;

  // Update existing nodes' layout signals
  updateLayoutSignals(root, layoutResult);

  // Bind any new nodes (created by Show/For since last bind)
  const rootClipAccessor: Accessor<ClipRect> = () => ({
    x: 0,
    y: 0,
    width: stdout.columns,
    height: stdout.rows,
  });
  const rootInheritedAccessor: InheritedStyleAccessor = () =>
    DEFAULT_INHERITED_STYLE;

  bindNewNodes(
    root,
    layoutResult,
    buffer,
    rootInheritedAccessor,
    rootClipAccessor,
    scheduleFlush,
    scheduleRelayout,
  );

  // Bind new portals
  bindPortals(root, buffer, scheduleFlush, scheduleRelayout, stdout);
}

/**
 * Creates a closure for relayout scheduling.
 */
function createScheduleRelayout(
  state: RuntimeState,
  scheduleFlush: () => void,
): () => void {
  // Create scheduleRelayout closure that captures itself
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
 * Binds a node by creating layout signals and render effects.
 */
function bindNode(
  node: Node,
  layoutResult: LayoutResult,
  buffer: Buffer,
  parentInheritedAccessor: InheritedStyleAccessor,
  parentClipAccessor: Accessor<ClipRect>,
  scheduleFlush: () => void,
  scheduleRelayout: () => void,
): void {
  // Create layout signals if not already present
  if (!node._layout) {
    node._layout = createLayoutSignals();
  }
  node._layout.setLayout(layoutResult);

  // Create accessor for this node's inherited style (reactive)
  const nodeInheritedAccessor: InheritedStyleAccessor = () => {
    return computeInheritedStyle(node, parentInheritedAccessor());
  };

  // Create accessor for this node's clip rect (reactive)
  const nodeClipAccessor: Accessor<ClipRect> = () => {
    const parentClip = parentClipAccessor();
    const style = typeof node.style === "function" ? node.style() : node.style;
    const layout = node._layout;
    if (style.overflow === "hidden" && layout) {
      const x = layout.screenX();
      const y = layout.screenY();
      const w = layout.width();
      const h = layout.height();
      return intersectClipRect(parentClip, { x, y, width: w, height: h });
    }
    return parentClip;
  };

  // Create render effect if node has a render function
  if (node.render && !node._disposeRenderEffect) {
    // Track previous intrinsic size for nodes with measure
    // Initialize from current intrinsic size to avoid false positives on first run
    const initialIntrinsic = node.measure
      ? node.measure(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
      : { width: layoutResult.width, height: layoutResult.height };
    let prevIntrinsicW = initialIntrinsic.width;
    let prevIntrinsicH = initialIntrinsic.height;

    // Track previous render position to mark old area dirty when moving
    let prevX = layoutResult.screenX;
    let prevY = layoutResult.screenY;
    let prevW = layoutResult.width;
    let prevH = layoutResult.height;

    createRoot(
      (dispose) => {
        node._disposeRenderEffect = dispose;

        createEffect(() => {
          const layout = node._layout;
          if (!layout || !node.render) return;

          const w = layout.width();
          const h = layout.height();

          // Check if intrinsic size changed (for nodes with measure like Text)
          // Trigger relayout if intrinsic size differs from layout (grow or shrink)
          if (node.measure) {
            const intrinsic = node.measure(
              Number.POSITIVE_INFINITY,
              Number.POSITIVE_INFINITY,
            );
            const intrinsicChanged =
              intrinsic.width !== prevIntrinsicW ||
              intrinsic.height !== prevIntrinsicH;
            prevIntrinsicW = intrinsic.width;
            prevIntrinsicH = intrinsic.height;

            if (
              intrinsicChanged &&
              (intrinsic.width !== w || intrinsic.height !== h)
            ) {
              scheduleRelayout();
              return;
            }
          }

          const x = layout.screenX();
          const y = layout.screenY();
          const inherited = nodeInheritedAccessor();
          const clip = nodeClipAccessor();

          // Fill old position with inherited background if layout changed
          if (x !== prevX || y !== prevY || w !== prevW || h !== prevH) {
            buffer.fillRect(
              prevX,
              prevY,
              prevW,
              prevH,
              " ",
              DEFAULT_COLOR,
              inherited.backgroundColor,
              0,
            );
          }
          prevX = x;
          prevY = y;
          prevW = w;
          prevH = h;

          node.render(x, y, w, h, buffer, inherited, clip);
          scheduleFlush();
        });
      },
      { detached: true },
    );
  }

  // Recursively bind children (handling display: "contents")
  bindChildren(
    node,
    layoutResult,
    buffer,
    nodeInheritedAccessor,
    nodeClipAccessor,
    scheduleFlush,
    scheduleRelayout,
  );
}

/**
 * Binds children nodes with their corresponding layout results.
 * Handles display: "contents" nodes by recursively binding their children.
 */
function bindChildren(
  node: Node,
  layoutResult: LayoutResult,
  buffer: Buffer,
  inheritedAccessor: InheritedStyleAccessor,
  clipAccessor: Accessor<ClipRect>,
  scheduleFlush: () => void,
  scheduleRelayout: () => void,
): void {
  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : (node.children ?? []);
  const childLayouts = layoutResult.children ?? [];

  let layoutIndex = 0;

  for (const child of children) {
    // Skip portals (bound separately at root level)
    if (child._isPortal) continue;

    const style =
      typeof child.style === "function" ? child.style() : child.style;

    if (style.display === "contents") {
      // display: "contents" nodes don't get layout boxes.
      // Their children consume layout results directly.
      const wrapperInheritedAccessor: InheritedStyleAccessor = () => {
        return computeInheritedStyle(child, inheritedAccessor());
      };

      // Recursively bind grandchildren, consuming layout results
      layoutIndex += bindContentsChildren(
        child,
        childLayouts,
        layoutIndex,
        buffer,
        wrapperInheritedAccessor,
        clipAccessor,
        scheduleFlush,
        scheduleRelayout,
      );
    } else if (childLayouts[layoutIndex]) {
      bindNode(
        child,
        childLayouts[layoutIndex],
        buffer,
        inheritedAccessor,
        clipAccessor,
        scheduleFlush,
        scheduleRelayout,
      );
      layoutIndex++;
    }
  }
}

/**
 * Binds children of a display: "contents" node.
 * Returns the number of layout results consumed.
 */
function bindContentsChildren(
  contentsNode: Node,
  layouts: LayoutResult[],
  startIndex: number,
  buffer: Buffer,
  inheritedAccessor: InheritedStyleAccessor,
  clipAccessor: Accessor<ClipRect>,
  scheduleFlush: () => void,
  scheduleRelayout: () => void,
): number {
  const children =
    typeof contentsNode.children === "function"
      ? (contentsNode.children as () => Node[])()
      : (contentsNode.children ?? []);

  let consumed = 0;

  for (const child of children) {
    if (child._isPortal) continue;

    const style =
      typeof child.style === "function" ? child.style() : child.style;

    if (style.display === "contents") {
      // Nested display: "contents" - recurse
      const nestedInheritedAccessor: InheritedStyleAccessor = () => {
        return computeInheritedStyle(child, inheritedAccessor());
      };
      consumed += bindContentsChildren(
        child,
        layouts,
        startIndex + consumed,
        buffer,
        nestedInheritedAccessor,
        clipAccessor,
        scheduleFlush,
        scheduleRelayout,
      );
    } else if (layouts[startIndex + consumed]) {
      bindNode(
        child,
        layouts[startIndex + consumed],
        buffer,
        inheritedAccessor,
        clipAccessor,
        scheduleFlush,
        scheduleRelayout,
      );
      consumed++;
    }
  }

  return consumed;
}

/**
 * Updates layout signals for existing nodes on resize/relayout.
 */
function updateLayoutSignals(node: Node, layoutResult: LayoutResult): void {
  const style = typeof node.style === "function" ? node.style() : node.style;

  if (style.display === "contents") {
    // Recurse into children, consuming layout results for hoisted children
    updateContentsChildren(node, layoutResult.children ?? [], 0);
    return;
  }

  if (node._layout) {
    node._layout.setLayout(layoutResult);
  }

  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : (node.children ?? []);
  const childLayouts = layoutResult.children ?? [];

  let layoutIndex = 0;
  for (const child of children) {
    if (child._isPortal) continue;

    const childStyle =
      typeof child.style === "function" ? child.style() : child.style;
    if (childStyle.display === "contents") {
      layoutIndex += updateContentsChildren(child, childLayouts, layoutIndex);
    } else if (childLayouts[layoutIndex]) {
      updateLayoutSignals(child, childLayouts[layoutIndex]);
      layoutIndex++;
    }
  }
}

/**
 * Updates layout signals for children of a display: "contents" node.
 * Returns the number of layout results consumed.
 */
function updateContentsChildren(
  contentsNode: Node,
  layouts: LayoutResult[],
  startIndex: number,
): number {
  const children =
    typeof contentsNode.children === "function"
      ? (contentsNode.children as () => Node[])()
      : (contentsNode.children ?? []);

  let consumed = 0;
  for (const child of children) {
    if (child._isPortal) continue;

    const style =
      typeof child.style === "function" ? child.style() : child.style;
    if (style.display === "contents") {
      consumed += updateContentsChildren(child, layouts, startIndex + consumed);
    } else if (layouts[startIndex + consumed]) {
      updateLayoutSignals(child, layouts[startIndex + consumed]);
      consumed++;
    }
  }
  return consumed;
}

/**
 * Binds nodes that don't yet have layout signals (new nodes from Show/For).
 */
function bindNewNodes(
  node: Node,
  layoutResult: LayoutResult,
  buffer: Buffer,
  inheritedAccessor: InheritedStyleAccessor,
  clipAccessor: Accessor<ClipRect>,
  scheduleFlush: () => void,
  scheduleRelayout: () => void,
): void {
  const style = typeof node.style === "function" ? node.style() : node.style;

  if (style.display === "contents") {
    // display: "contents" nodes don't have layout, but their children do
    const wrapperInheritedAccessor: InheritedStyleAccessor = () => {
      return computeInheritedStyle(node, inheritedAccessor());
    };

    const children =
      typeof node.children === "function"
        ? (node.children as () => Node[])()
        : (node.children ?? []);
    const childLayouts = layoutResult.children ?? [];

    let layoutIndex = 0;
    for (const child of children) {
      if (child._isPortal) continue;

      const childStyle =
        typeof child.style === "function" ? child.style() : child.style;
      if (childStyle.display === "contents") {
        layoutIndex += bindNewContentsChildren(
          child,
          childLayouts,
          layoutIndex,
          buffer,
          wrapperInheritedAccessor,
          clipAccessor,
          scheduleFlush,
          scheduleRelayout,
        );
      } else if (childLayouts[layoutIndex]) {
        bindNewNodes(
          child,
          childLayouts[layoutIndex],
          buffer,
          wrapperInheritedAccessor,
          clipAccessor,
          scheduleFlush,
          scheduleRelayout,
        );
        layoutIndex++;
      }
    }
    return;
  }

  // Non-contents node: bind if not already bound
  if (!node._layout) {
    node._layout = createLayoutSignals();
  }
  node._layout.setLayout(layoutResult);

  // Create render effect if needed (not already bound)
  if (node.render && !node._disposeRenderEffect) {
    const renderNodeInheritedAccessor: InheritedStyleAccessor = () => {
      return computeInheritedStyle(node, inheritedAccessor());
    };
    const renderNodeClipAccessor: Accessor<ClipRect> = () => {
      const parentClip = clipAccessor();
      const s = typeof node.style === "function" ? node.style() : node.style;
      const layout = node._layout;
      if (s.overflow === "hidden" && layout) {
        const x = layout.screenX();
        const y = layout.screenY();
        const w = layout.width();
        const h = layout.height();
        return intersectClipRect(parentClip, { x, y, width: w, height: h });
      }
      return parentClip;
    };

    // Track previous intrinsic size for nodes with measure
    // Initialize from current intrinsic size to avoid false positives on first run
    const initialIntrinsic = node.measure
      ? node.measure(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
      : { width: layoutResult.width, height: layoutResult.height };
    let prevIntrinsicW = initialIntrinsic.width;
    let prevIntrinsicH = initialIntrinsic.height;

    // Track previous render position to mark old area dirty when moving
    let prevX = layoutResult.screenX;
    let prevY = layoutResult.screenY;
    let prevW = layoutResult.width;
    let prevH = layoutResult.height;

    createRoot(
      (dispose) => {
        node._disposeRenderEffect = dispose;

        createEffect(() => {
          const layout = node._layout;
          if (!layout || !node.render) return;

          const w = layout.width();
          const h = layout.height();

          // Check if intrinsic size changed (for nodes with measure like Text)
          // Trigger relayout if intrinsic size differs from layout (grow or shrink)
          if (node.measure) {
            const intrinsic = node.measure(
              Number.POSITIVE_INFINITY,
              Number.POSITIVE_INFINITY,
            );
            const intrinsicChanged =
              intrinsic.width !== prevIntrinsicW ||
              intrinsic.height !== prevIntrinsicH;
            prevIntrinsicW = intrinsic.width;
            prevIntrinsicH = intrinsic.height;

            if (
              intrinsicChanged &&
              (intrinsic.width !== w || intrinsic.height !== h)
            ) {
              scheduleRelayout();
              return;
            }
          }

          const x = layout.screenX();
          const y = layout.screenY();
          const inherited = renderNodeInheritedAccessor();
          const clip = renderNodeClipAccessor();

          // Fill old position with inherited background if layout changed
          if (x !== prevX || y !== prevY || w !== prevW || h !== prevH) {
            buffer.fillRect(
              prevX,
              prevY,
              prevW,
              prevH,
              " ",
              DEFAULT_COLOR,
              inherited.backgroundColor,
              0,
            );
          }
          prevX = x;
          prevY = y;
          prevW = w;
          prevH = h;

          node.render(x, y, w, h, buffer, inherited, clip);
          scheduleFlush();
        });
      },
      { detached: true },
    );
  }

  // Recurse to children
  const nodeInheritedAccessor: InheritedStyleAccessor = () => {
    return computeInheritedStyle(node, inheritedAccessor());
  };
  const nodeClipAccessor: Accessor<ClipRect> = () => {
    const parentClip = clipAccessor();
    const s = typeof node.style === "function" ? node.style() : node.style;
    const layout = node._layout;
    if (s.overflow === "hidden" && layout) {
      const x = layout.screenX();
      const y = layout.screenY();
      const w = layout.width();
      const h = layout.height();
      return intersectClipRect(parentClip, { x, y, width: w, height: h });
    }
    return parentClip;
  };

  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : (node.children ?? []);
  const childLayouts = layoutResult.children ?? [];

  let layoutIndex = 0;
  for (const child of children) {
    if (child._isPortal) continue;

    const childStyle =
      typeof child.style === "function" ? child.style() : child.style;
    if (childStyle.display === "contents") {
      layoutIndex += bindNewContentsChildren(
        child,
        childLayouts,
        layoutIndex,
        buffer,
        nodeInheritedAccessor,
        nodeClipAccessor,
        scheduleFlush,
        scheduleRelayout,
      );
    } else if (childLayouts[layoutIndex]) {
      bindNewNodes(
        child,
        childLayouts[layoutIndex],
        buffer,
        nodeInheritedAccessor,
        nodeClipAccessor,
        scheduleFlush,
        scheduleRelayout,
      );
      layoutIndex++;
    }
  }
}

/**
 * Binds new children of a display: "contents" node.
 * Returns the number of layout results consumed.
 */
function bindNewContentsChildren(
  contentsNode: Node,
  layouts: LayoutResult[],
  startIndex: number,
  buffer: Buffer,
  inheritedAccessor: InheritedStyleAccessor,
  clipAccessor: Accessor<ClipRect>,
  scheduleFlush: () => void,
  scheduleRelayout: () => void,
): number {
  const wrapperInheritedAccessor: InheritedStyleAccessor = () => {
    return computeInheritedStyle(contentsNode, inheritedAccessor());
  };

  const children =
    typeof contentsNode.children === "function"
      ? (contentsNode.children as () => Node[])()
      : (contentsNode.children ?? []);

  let consumed = 0;
  for (const child of children) {
    if (child._isPortal) continue;

    const style =
      typeof child.style === "function" ? child.style() : child.style;
    if (style.display === "contents") {
      consumed += bindNewContentsChildren(
        child,
        layouts,
        startIndex + consumed,
        buffer,
        wrapperInheritedAccessor,
        clipAccessor,
        scheduleFlush,
        scheduleRelayout,
      );
    } else if (layouts[startIndex + consumed]) {
      bindNewNodes(
        child,
        layouts[startIndex + consumed],
        buffer,
        wrapperInheritedAccessor,
        clipAccessor,
        scheduleFlush,
        scheduleRelayout,
      );
      consumed++;
    }
  }
  return consumed;
}

/**
 * Disposes render effects for a subtree being removed.
 */
function disposeSubtreeRenderEffects(node: Node): void {
  // Dispose this node's render effect
  if (node._disposeRenderEffect) {
    node._disposeRenderEffect();
    node._disposeRenderEffect = undefined;
  }

  // Clear stale layout
  node._layout = undefined;

  // Recurse to children
  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : (node.children ?? []);

  for (const child of children) {
    disposeSubtreeRenderEffects(child);
  }
}

/**
 * Collects portals and binds them at root level (used during relayout).
 */
function bindPortals(
  root: Node,
  buffer: Buffer,
  scheduleFlush: () => void,
  scheduleRelayout: () => void,
  stdout: NodeJS.WriteStream,
): void {
  const portals = collectPortalsForBinding(
    root,
    () => DEFAULT_INHERITED_STYLE,
    stdout,
  );

  for (const { node, inheritedAccessor, stdout: portalStdout } of portals) {
    // Skip if already bound
    if (node._layout) continue;

    // Layout this portal child as if it were a root
    const layoutNode = nodeToLayoutNode(node);
    const layout = computeLayout(
      layoutNode,
      portalStdout.columns,
      portalStdout.rows,
    );

    // Portal uses full viewport clip
    const portalClipAccessor: Accessor<ClipRect> = () => ({
      x: 0,
      y: 0,
      width: portalStdout.columns,
      height: portalStdout.rows,
    });

    bindNode(
      node,
      layout,
      buffer,
      inheritedAccessor,
      portalClipAccessor,
      scheduleFlush,
      scheduleRelayout,
    );
  }
}

/**
 * Collects portal children with their inherited style accessors.
 */
function collectPortalsForBinding(
  node: Node,
  inheritedAccessor: InheritedStyleAccessor,
  stdout: NodeJS.WriteStream,
): Array<{
  node: Node;
  inheritedAccessor: InheritedStyleAccessor;
  stdout: NodeJS.WriteStream;
}> {
  const portals: Array<{
    node: Node;
    inheritedAccessor: InheritedStyleAccessor;
    stdout: NodeJS.WriteStream;
  }> = [];

  // Compute this node's inherited style accessor
  const nodeInheritedAccessor: InheritedStyleAccessor = () => {
    return computeInheritedStyle(node, inheritedAccessor());
  };

  // If this is a portal, collect its children
  if (node._isPortal) {
    const children =
      typeof node.children === "function"
        ? (node.children as () => Node[])()
        : (node.children ?? []);
    for (const child of children) {
      portals.push({
        node: child,
        inheritedAccessor: nodeInheritedAccessor,
        stdout,
      });
    }
  }

  // Recursively search children
  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : (node.children ?? []);

  for (const child of children) {
    portals.push(
      ...collectPortalsForBinding(child, nodeInheritedAccessor, stdout),
    );
  }

  return portals;
}

/**
 * Handle incoming input events.
 * Resize events trigger relayout; others route events (effects handle rendering).
 */
function handleEvent(
  state: RuntimeState,
  event: InputEvent,
  scheduleFlush: () => void,
): void {
  // Handle resize: update buffer size and trigger relayout
  if (event.type === "resize") {
    state.flushState.buffer.resize(event.width, event.height);
    state.flushState.buffer.clear();

    // Re-run layout
    const layoutNode = nodeToLayoutNode(state.root);
    const layoutResult = computeLayout(layoutNode, event.width, event.height);
    state.layoutResult = layoutResult;

    // Update layout signals (effects will re-run automatically)
    updateLayoutSignals(state.root, layoutResult);
    return;
  }

  // Route event to nodes within a batch
  // This ensures all signal updates from event handlers are coalesced
  batch(() => {
    routeEvent(state, event);
  });

  // Effects triggered by signal updates will schedule flush automatically
}

/**
 * Internal unmount function.
 */
function unmountState(state: RuntimeState, cleanupHandlers?: () => void): void {
  const { options } = state;
  const { stdout } = options;

  // Remove signal handlers if provided
  if (cleanupHandlers) {
    cleanupHandlers();
  }

  // Clear any pending flush timeout
  if (state.flushState.timeout) {
    clearTimeout(state.flushState.timeout);
    state.flushState.timeout = null;
  }

  // Dispose root (disposes component effects)
  state.rootDispose();

  // Dispose all render effects by walking the tree
  disposeSubtreeRenderEffects(state.root);

  // Destroy input parser (restores terminal input state)
  state.inputParser.destroy();

  // Exit TUI mode (display)
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

  // Create reactive signal for focus tracking
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

  // Create schedule closures that capture state
  const scheduleFlush = createScheduleFlush(state);
  const scheduleRelayout = createScheduleRelayout(state, scheduleFlush);

  // Enter TUI mode (display)
  enterTuiMode(stdout, { alternateScreen: opts.alternateScreen });

  // Setup input parsing
  state.inputParser = createInputParser(
    stdin,
    stdout,
    (event) => handleEvent(state, event, scheduleFlush),
    { mouse: opts.mouse },
  );

  // Create runtime context for component construction
  const ctx: RuntimeContext = {
    state,
    currentScope: state.rootScope,
    scheduleRelayout,
  };

  // Build component tree AND bind effects inside the same root
  state.rootDispose = createRoot((dispose) => {
    state.root = withContext(ctx, () => component());

    // Initialize focus
    initializeFocus(state);

    // Initial layout
    buffer.clear();
    const layoutNode = nodeToLayoutNode(state.root);
    const layoutResult = computeLayout(layoutNode, stdout.columns, stdout.rows);
    state.layoutResult = layoutResult;

    // Root clip accessor reads viewport dimensions dynamically (for resize)
    const rootClipAccessor: Accessor<ClipRect> = () => ({
      x: 0,
      y: 0,
      width: stdout.columns,
      height: stdout.rows,
    });
    const rootInheritedAccessor: InheritedStyleAccessor = () =>
      DEFAULT_INHERITED_STYLE;

    // Bind phase: create render effects
    bindNode(
      state.root,
      layoutResult,
      buffer,
      rootInheritedAccessor,
      rootClipAccessor,
      scheduleFlush,
      scheduleRelayout,
    );

    // Bind portals separately
    bindPortals(state.root, buffer, scheduleFlush, scheduleRelayout, stdout);

    return dispose;
  });

  // Initial flush
  doFlush(state);

  // Track if already unmounted to prevent double cleanup
  let unmounted = false;

  // Setup signal handlers for clean terminal restoration on exit
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

  // Store handlers for removal
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
