// Public API exports

// Signals (reactivity)
export {
  createSignal,
  createEffect,
  createMemo,
  createRoot,
  onCleanup,
  onMount,
  batch,
  untrack,
  type Accessor,
  type Setter,
} from "./signals.js";

// Layout
export { computeLayout, DEFAULT_FLEX_STYLE, type FlexStyle } from "./layout.js";

// Buffer (rendering)
export {
  Buffer,
  type Color,
  DEFAULT_COLOR,
  BOLD,
  DIM,
  ITALIC,
  UNDERLINE,
  STRIKETHROUGH,
  INVERSE,
  BLINK,
  HIDDEN,
  graphemes,
  graphemeDisplayWidth,
  displayWidth,
} from "./buffer.js";

// Input
export {
  type KeyEvent,
  type MouseEvent,
  type ScrollEvent,
  type InputEvent,
  type ResizeEvent,
  type PasteEvent,
  type FocusEvent,
  createInputParser,
  setupTerminal,
  teardownTerminal,
} from "./input.js";

// Runtime (components and mount)
export {
  Box,
  Text,
  createRef,
  enterTuiMode,
  exitTuiMode,
  flushFrame,
  measureText,
  lineDisplayWidth,
  wrapLine,
  truncateLine,
  type Node,
  type Ref,
  type BoxProps,
  type TextProps,
  type MountOptions,
  type App,
  DEFAULT_MOUNT_OPTIONS,
} from "./runtime.js";
