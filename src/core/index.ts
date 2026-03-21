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
export {
  computeLayout,
  DEFAULT_FLEX_STYLE,
  type FlexStyle,
  type ReactiveFlexStyle,
} from "./layout.ts";

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

// Runtime - Components
export { Box, type BoxProps, type BoxChild } from "./runtime/Box.ts";
export { Text, type TextProps } from "./runtime/Text.ts";
export { Portal, type PortalProps } from "./runtime/Portal.ts";
export { Show, type ShowProps } from "./runtime/Show.ts";
export { For, type ForProps } from "./runtime/For.ts";

// Runtime - Node
export { type Node, type Ref, createRef } from "./runtime/Node.ts";

// Runtime - App / Context
export {
  App,
  type MountOptions,
  DEFAULT_MOUNT_OPTIONS,
} from "./runtime/App.ts";

// Runtime - Focus
export {
  type FocusController,
  type FocusScopeProps,
  type TabFocusProps,
  FocusScopeComponent,
  TabFocus,
  useFocus,
} from "./runtime/focus.ts";

// Runtime - Mount
export { mount } from "./runtime/App.ts";

// Render (pass-through)
export {
  BORDER_CHARS,
  DEFAULT_INHERITED_STYLE,
  enterTuiMode,
  exitTuiMode,
  flushFrame,
} from "./render.ts";
export type {
  BorderStyleName,
  BorderProp,
  InheritedStyle,
  InheritableBool,
  TextStyle,
  ReactiveTextStyle,
} from "./render.ts";

// Text utilities (pass-through)
export {
  measureText,
  lineDisplayWidth,
  wrapLine,
  truncateLine,
} from "./text.ts";
