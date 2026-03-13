// Render pipeline and component primitives

import {
  BOLD,
  Buffer,
  type Color,
  DEFAULT_COLOR,
  DIM,
  INVERSE,
  ITALIC,
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
  ) => void;

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
  fps?: number;
  mouse?: boolean;
  alternateScreen?: boolean;
}

/**
 * Default values for mount options.
 */
export const DEFAULT_MOUNT_OPTIONS: Required<MountOptions> = {
  stdout: process.stdout,
  stdin: process.stdin,
  fps: 60,
  mouse: false,
  alternateScreen: true,
};

/**
 * Returned by mount().
 */
export interface App {
  unmount(): void;
}

// Internal interfaces (not exported, scaffolded for mount/render cycle implementation)

/**
 * Internal state for a mounted application.
 * @internal Exported for testing purposes.
 */
export interface RuntimeState {
  // Core tree
  root: Node;
  rootDispose: () => void;

  // Rendering
  buffer: Buffer;
  layoutResult: import("./layout.ts").LayoutResult | null;
  frameInterval: ReturnType<typeof setInterval> | null;
  options: Required<MountOptions>;

  // Input
  stdin: NodeJS.ReadStream;
  inputParser: { destroy: () => void };
  pendingEvents: InputEvent[];

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
    // No focusables in this scope — try parent if not trapped
    if (!scope.trap && scope.parent) {
      focusNext(state, scope.parent);
    }
    return;
  }

  if (focusedIndex === -1) {
    // Nothing focused — focus first
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
      // No parent focusables or at root — wrap
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
    // Nothing focused — focus last
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
      // No parent focusables or at root — wrap
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

/** Props for Box component. */
export interface BoxProps extends Partial<FlexStyle> {
  children?: Node[];
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
  color?: Color | (() => Color);
  backgroundColor?: Color | (() => Color);
  bold?: boolean | (() => boolean);
  italic?: boolean | (() => boolean);
  underline?: boolean | (() => boolean);
  dim?: boolean | (() => boolean);
  strikethrough?: boolean | (() => boolean);
  inverse?: boolean | (() => boolean);
  wrap?: "wrap" | "truncate" | "truncate-end" | "truncate-start";
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
  wrap: "wrap" | "truncate" | "truncate-end" | "truncate-start",
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

  // No wrapping — single line per input line
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
 * Computes the modifier bitmask from TextProps.
 */
function computeModifiers(props: TextProps): number {
  let mods = 0;
  if (resolveValue(props.bold)) mods |= BOLD;
  if (resolveValue(props.dim)) mods |= DIM;
  if (resolveValue(props.italic)) mods |= ITALIC;
  if (resolveValue(props.underline)) mods |= UNDERLINE;
  if (resolveValue(props.strikethrough)) mods |= STRIKETHROUGH;
  if (resolveValue(props.inverse)) mods |= INVERSE;
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
): void {
  // Resolve reactive props
  const fg = resolveValue(props.color) ?? DEFAULT_COLOR;
  const bg = resolveValue(props.backgroundColor) ?? DEFAULT_COLOR;
  const modifiers = computeModifiers(props);
  const wrap = props.wrap ?? "wrap";

  const lines = text.split("\n");
  const displayLines =
    wrap === "wrap"
      ? lines.flatMap((line) => wrapLine(line, width))
      : lines.map((line) => truncateLine(line, width, wrap));

  for (let row = 0; row < Math.min(displayLines.length, height); row++) {
    const line = displayLines[row];
    buffer.writeText(x, y + row, line, fg, bg, modifiers);
  }
}

/**
 * Creates a Box node - a layout container that supports reactive styles and event handlers.
 *
 * Box is the fundamental container primitive. It has no measure or render functions;
 * its size is determined by flexbox layout based on its children.
 */
export function Box(props: BoxProps): Node {
  const {
    children = [],
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

  const node: Node = {
    get style() {
      // Resolve any reactive style props
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(styleProps)) {
        resolved[key] =
          typeof value === "function" ? (value as () => unknown)() : value;
      }
      return { ...DEFAULT_FLEX_STYLE, ...resolved } as FlexStyle;
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
    focusable,
    autoFocus,
    ref,
    onKeyPress,
    onMousePress,
    onMouseRelease,
    onMouseMove,
    onScroll,
    onHover,
    wrap = "wrap",
    ...styleProps
  } = props;

  const getContent = typeof content === "function" ? content : () => content;

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

    measure(availableWidth: number, _availableHeight: number) {
      return measureText(getContent(), availableWidth, wrap);
    },

    render(
      x: number,
      y: number,
      width: number,
      height: number,
      buffer: Buffer,
    ) {
      renderText(buffer, x, y, width, height, getContent(), {
        ...styleProps,
        content,
        wrap,
      });
    },
  };

  // Bind ref
  if (ref) {
    ref.current = node;
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
      currentDispose();
      currentDispose = null;
      currentChild = null;
    }
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
      currentDispose = createRoot((dispose) => {
        const node = childrenBranch(value);
        node._parent = container;
        children.push(node);
        currentChild = node;

        // Register focusable nodes from new subtree
        if (ctx) {
          registerSubtreeFocusables(ctx.state, node);
        }

        return dispose;
      });
    } else if (fallback) {
      currentDispose = createRoot((dispose) => {
        const node = fallback();
        node._parent = container;
        children.push(node);
        currentChild = node;

        // Register focusable nodes from new subtree
        if (ctx) {
          registerSubtreeFocusables(ctx.state, node);
        }

        return dispose;
      });
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
        // Key no longer exists — dispose all entries
        for (const entry of entries) {
          disposeEntry(entry);
        }
        itemRoots.delete(key);
      } else if (entries.length > needed) {
        // More entries than needed — dispose excess
        const excess = entries.splice(needed);
        for (const entry of excess) {
          disposeEntry(entry);
        }
      }
    }
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
  const childCtx: RuntimeContext = { state: ctx.state, currentScope: scope };

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
  const childCtx: RuntimeContext = { state: ctx.state, currentScope: scope };

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
 */
function nodeToLayoutNode(node: Node): LayoutNode {
  const style = typeof node.style === "function" ? node.style() : node.style;

  // Handle children as either array or getter function (for Show/For)
  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : node.children;

  return {
    style,
    children: children?.map(nodeToLayoutNode),
    measure: node.measure,
  };
}

/**
 * Recursively paint nodes using layout results.
 * Uses screenX/screenY from layout results for absolute positioning.
 */
function paintNode(node: Node, layout: LayoutResult, buffer: Buffer): void {
  const { screenX, screenY, width, height } = layout;

  // Paint this node if it has a render function
  if (node.render) {
    node.render(screenX, screenY, width, height, buffer);
  }

  // Get children (may be a getter for Show/For)
  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : (node.children ?? []);
  const childLayouts = layout.children ?? [];

  // Paint children
  for (let i = 0; i < children.length; i++) {
    if (childLayouts[i]) {
      paintNode(children[i], childLayouts[i], buffer);
    }
  }
}

/**
 * The three-phase render pipeline.
 */
function renderFrame(state: RuntimeState): void {
  const { root, options, buffer } = state;
  const { stdout } = options;

  // Phase 1: Build — already done reactively
  // (component tree exists, signals drive updates)

  // Phase 2: Layout
  const layoutNode = nodeToLayoutNode(root);
  state.layoutResult = computeLayout(layoutNode, stdout.columns, stdout.rows);

  // Phase 3: Paint
  buffer.clear();
  paintNode(root, state.layoutResult, buffer);

  // Diff, serialize, and sync (all internal to Buffer)
  const output = buffer.flush();
  if (output.length > 0) {
    flushFrame(stdout, output);
  }

  // Clear pending events
  state.pendingEvents = [];
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
 * Handle incoming input events.
 * Resize events are handled immediately; others are routed and queued.
 */
function handleEvent(state: RuntimeState, event: InputEvent): void {
  // Handle resize immediately
  if (event.type === "resize") {
    state.buffer.resize(event.width, event.height);
    renderFrame(state);
    return;
  }

  // Route event to nodes within a batch
  // This ensures all signal updates from event handlers are coalesced
  batch(() => {
    routeEvent(state, event);
  });

  // Queue event for render
  state.pendingEvents.push(event);

  // If no fps limit, render immediately
  if (state.options.fps === 0) {
    renderFrame(state);
  }
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

  // Stop render loop
  if (state.frameInterval) {
    clearInterval(state.frameInterval);
    state.frameInterval = null;
  }

  // Dispose component tree
  state.rootDispose();

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

  // Initialize state
  const state: RuntimeState = {
    root: undefined as unknown as Node,
    rootDispose: undefined as unknown as () => void,
    buffer: new Buffer(stdout.columns, stdout.rows),
    layoutResult: null,
    inputParser: undefined as unknown as { destroy: () => void },
    frameInterval: null,
    options: opts,
    pendingEvents: [],
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

  // Enter TUI mode (display)
  enterTuiMode(stdout, { alternateScreen: opts.alternateScreen });

  // Setup input parsing (Phase 4)
  state.inputParser = createInputParser(
    stdin,
    stdout,
    (event) => handleEvent(state, event),
    { mouse: opts.mouse },
  );

  // Create runtime context for component construction
  const ctx: RuntimeContext = { state, currentScope: state.rootScope };

  // Build component tree within context
  state.rootDispose = createRoot((dispose) => {
    state.root = withContext(ctx, () => component());
    return dispose;
  });

  // Initialize focus after tree is built
  initializeFocus(state);

  // Initial render
  renderFrame(state);

  // Start render loop if fps is set
  if (opts.fps > 0) {
    const interval = Math.floor(1000 / opts.fps);
    state.frameInterval = setInterval(() => {
      if (state.pendingEvents.length > 0) {
        renderFrame(state);
      }
    }, interval);
  }

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
