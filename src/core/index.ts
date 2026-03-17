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
} from "./signals.ts";

// Layout
export { computeLayout, DEFAULT_FLEX_STYLE, type FlexStyle } from "./layout.ts";

// Buffer (rendering)
export {
  Buffer,
  type Color,
  type InheritableColor,
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
} from "./buffer.ts";

// Text editing utilities
export { textLength, textSlice, textInsert, textDelete } from "./text.ts";

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
} from "./input.ts";

// Runtime (components and mount)
export {
  Box,
  Text,
  Portal,
  Show,
  For,
  TabFocus,
  FocusScopeComponent,
  mount,
  createRef,
  useFocus,
  enterTuiMode,
  exitTuiMode,
  flushFrame,
  measureText,
  lineDisplayWidth,
  wrapLine,
  truncateLine,
  BORDER_CHARS,
  DEFAULT_MOUNT_OPTIONS,
  DEFAULT_INHERITED_STYLE,
  type Node,
  type Ref,
  type BoxProps,
  type TextProps,
  type PortalProps,
  type ShowProps,
  type ForProps,
  type TabFocusProps,
  type FocusScopeProps,
  type FocusController,
  type MountOptions,
  type App,
  type BorderStyleName,
  type BorderProp,
  type InheritedStyle,
  type InheritableBool,
} from "./runtime.ts";
