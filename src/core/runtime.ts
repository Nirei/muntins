// Render pipeline and component primitives
// TODO: Implement useFocus, TabFocus (Task 5.6)

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

/** Internal state for a mounted application. */
interface RuntimeState {
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

  // Focus
  focusedNode: Node | null;
  rootScope: FocusScope;

  // Hover and terminal focus
  hoverState: HoverState;
  terminalFocused: boolean;
}

interface FocusScope {
  parent: FocusScope | null;
  focusableNodes: Node[];
  focusedIndex: number;
  trap: boolean;
}

interface HoverState {
  currentNode: Node | null;
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

  const children: Node[] = [];
  let currentDispose: (() => void) | null = null;

  // Define container first so children can reference it.
  // Use display: "contents" so Show doesn't affect parent layout.
  const container: Node = {
    style: { ...DEFAULT_FLEX_STYLE, display: "contents" },
    get children() {
      return children;
    },
  };

  // Create a reactive effect that updates the child
  createEffect(() => {
    const value = condition();

    // Dispose previous subtree
    if (currentDispose) {
      currentDispose();
      currentDispose = null;
    }

    // Clear children array
    children.length = 0;

    // Create new subtree in a fresh root
    if (value) {
      currentDispose = createRoot((dispose) => {
        const node = childrenBranch(value);
        node._parent = container;
        children.push(node);
        return dispose;
      });
    } else if (fallback) {
      currentDispose = createRoot((dispose) => {
        const node = fallback();
        node._parent = container;
        children.push(node);
        return dispose;
      });
    }
  });

  // Ensure we clean up when Show itself is disposed
  onCleanup(() => {
    if (currentDispose) {
      currentDispose();
      currentDispose = null;
    }
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
          entry.node._parent = undefined;
          entry.dispose();
        }
        itemRoots.delete(key);
      } else if (entries.length > needed) {
        // More entries than needed — dispose excess
        const excess = entries.splice(needed);
        for (const entry of excess) {
          entry.node._parent = undefined;
          entry.dispose();
        }
      }
    }
  });

  // Ensure we clean up all item roots when For itself is disposed
  onCleanup(() => {
    for (const entries of itemRoots.values()) {
      for (const entry of entries) {
        entry.dispose();
      }
    }
    itemRoots.clear();
  });

  return container;
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
 * Route keyboard event to focused node with bubbling.
 *
 * Events start at the focused node and bubble up to the root.
 * Handlers return true to consume the event and stop bubbling.
 */
function routeKeyEvent(state: RuntimeState, event: KeyEvent): void {
  const focused = state.focusedNode;
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
 * Route scroll event to node under cursor.
 *
 * Scroll events don't bubble. They go directly to the node under
 * the cursor. This matches browser behavior where scroll events target
 * the scrollable element directly.
 */
function routeScrollEvent(state: RuntimeState, event: ScrollEvent): void {
  const { root, layoutResult } = state;
  if (!layoutResult) return;

  const target = hitTest(root, layoutResult, event.x, event.y);

  if (target?.onScroll) {
    target.onScroll(event);
  }
}

/**
 * Route paste event to focused node.
 *
 * Paste is converted to synthetic key events for each character.
 */
function routePasteEvent(state: RuntimeState, event: PasteEvent): void {
  const focused = state.focusedNode;
  if (!focused) return;

  // Synthesize key events for each character
  for (const char of event.text) {
    if (focused.onKeyPress) {
      focused.onKeyPress({
        type: "key",
        name: char === "\n" ? "enter" : char,
        char: char,
        ctrl: false,
        alt: false,
        shift: false,
        sequence: char,
      });
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
 * Find first focusable node in depth-first order.
 * Used to initialize focus after mount.
 */
function findFocusable(node: Node, preferAutoFocus: boolean): Node | null {
  // If preferAutoFocus, look for autoFocus first
  if (preferAutoFocus && node.autoFocus && node.focusable) {
    return node;
  }

  // Get children (may be a getter for Show/For)
  const children =
    typeof node.children === "function"
      ? (node.children as () => Node[])()
      : (node.children ?? []);

  // Check children recursively
  for (const child of children) {
    const result = findFocusable(child, preferAutoFocus);
    if (result) return result;
  }

  // If not preferAutoFocus pass, check this node
  if (!preferAutoFocus && node.focusable) {
    return node;
  }

  return null;
}

/**
 * Initialize focus after component tree is built.
 * First tries to find a node with autoFocus, otherwise falls back to first focusable.
 */
function initializeFocus(state: RuntimeState): void {
  // First pass: look for autoFocus
  let focused = findFocusable(state.root, true);

  // Second pass: first focusable if no autoFocus found
  if (!focused) {
    focused = findFocusable(state.root, false);
  }

  state.focusedNode = focused;
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
function unmountState(state: RuntimeState): void {
  const { options } = state;
  const { stdout } = options;

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
    focusedNode: null,
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

  // Build component tree in a root scope
  state.rootDispose = createRoot((dispose) => {
    state.root = component();
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

  // Return app handle
  return {
    unmount() {
      unmountState(state);
    },
  };
}
