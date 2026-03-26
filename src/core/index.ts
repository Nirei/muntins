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

// Components
export { Box, type BoxProps, type BoxChild } from "./components/Box.ts";
export { Text, type TextProps } from "./components/Text.ts";
export { Portal, type PortalProps } from "./components/Portal.ts";
export { Show, type ShowProps } from "./components/Show.ts";
export { For, type ForProps } from "./components/For.ts";

// Runtime - Node
export { Node, type Ref, createRef } from "./runtime/Node.ts";

// Runtime - App / Context
export {
  App,
  type MountOptions,
  DEFAULT_MOUNT_OPTIONS,
} from "./runtime/App.ts";

// Runtime - Focus
export type { FocusController } from "./runtime/FocusManager.ts";
export {
  FocusScopeComponent,
  type FocusScopeProps,
} from "./components/FocusScopeComponent.ts";
export { TabFocus, type TabFocusProps } from "./components/TabFocus.ts";
export { useFocus } from "./components/useFocus.ts";


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

// Theme (generic infrastructure — UI layer provides defaults and re-exports)
export {
  theme,
  setTheme,
  resolveTheme,
  parseColor,
  styleFallback,
} from "./theme.ts";
export type { Theme, ColorString } from "./theme.ts";
