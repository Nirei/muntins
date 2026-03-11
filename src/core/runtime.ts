// Render pipeline and component primitives
// TODO: Implement mount, Box, Text, Show, For, useFocus, TabFocus

import type { Buffer } from "./buffer.ts";
import type { InputEvent, KeyEvent, MouseEvent, ScrollEvent } from "./input.ts";
import type { FlexStyle } from "./layout.ts";

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
 * Refs are bound during node creation (see Task 5.6).
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

// Internal interfaces (not exported, used within runtime.ts and referenced by later tasks)

/**
 * Internal state for a mounted application.
 * Defined here for reference; used across Tasks 5.4-5.6.
 */
interface RuntimeState {
  // Core tree (Task 5.4)
  root: Node;
  rootDispose: () => void;

  // Rendering (Task 5.4)
  buffer: Buffer;
  layoutResult: import("./layout.ts").LayoutResult | null;
  frameInterval: ReturnType<typeof setInterval> | null;
  options: Required<MountOptions>;

  // Input (Task 5.4)
  inputParser: { destroy: () => void };
  pendingEvents: InputEvent[];

  // Focus (Task 5.6)
  focusedNode: Node | null;
  rootScope: FocusScope;

  // Hover and terminal focus (Task 5.5)
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

// Suppress unused variable warnings for internal interfaces
// These are referenced by later tasks
void (0 as unknown as RuntimeState);
void (0 as unknown as FocusScope);
void (0 as unknown as HoverState);

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
 * Write frame content with cursor bracketing.
 *
 * Hides cursor during write to prevent flicker, then restores it.
 * No-op for empty content.
 */
export function flushFrame(stdout: NodeJS.WriteStream, content: string): void {
  if (content.length === 0) return;

  stdout.write(`\x1b[?25l${content}\x1b[?25h`);
}
