// Public API exports

// Signals (reactivity)
export {
  batch,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  onCleanup,
  onMount,
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
  BLINK,
  BOLD,
  Buffer,
  DEFAULT_COLOR,
  DIM,
  displayWidth,
  graphemeDisplayWidth,
  graphemes,
  HIDDEN,
  INVERSE,
  ITALIC,
  STRIKETHROUGH,
  UNDERLINE,
  type Color,
  type InheritableColor,
} from "./buffer.ts";

// Text editing utilities
export { textDelete, textInsert, textLength, textSlice } from "./text.ts";

// Input
export {
  createInputParser,
  setupTerminal,
  teardownTerminal,
  type FocusEvent,
  type InputEvent,
  type KeyEvent,
  type MouseEvent,
  type PasteEvent,
  type ResizeEvent,
  type ScrollEvent,
} from "./input.ts";

// Components
export { Box, type BoxChild, type BoxProps } from "./components/Box.ts";
export { For, type ForProps } from "./components/For.ts";
export { Portal, type PortalProps } from "./components/Portal.ts";
export { Show, type ShowProps } from "./components/Show.ts";
export { Text, type TextProps } from "./components/Text.ts";
export {
  RichText,
  type RichTextProps,
} from "./components/RichText.ts";

// Runtime - Node
export { createRef, Node, type Ref } from "./runtime/Node.ts";

// Runtime - App / Context
export {
  App,
  DEFAULT_MOUNT_OPTIONS,
  type MountOptions,
} from "./runtime/App.ts";

// Runtime - Focus
export {
  FocusScopeComponent,
  type FocusScopeProps,
} from "./components/FocusScopeComponent.ts";
export { TabFocus, type TabFocusProps } from "./components/TabFocus.ts";
export { useFocus } from "./components/useFocus.ts";
export type { FocusController } from "./runtime/FocusManager.ts";

// Render (pass-through)
export {
  BORDER_CHARS,
  DEFAULT_INHERITED_STYLE,
  enterTuiMode,
  exitTuiMode,
  flushFrame,
} from "./render.ts";
export type {
  BorderProp,
  BorderStyleName,
  InheritableBool,
  InheritedStyle,
  ReactiveTextStyle,
  TextStyle,
} from "./render.ts";
export { renderStyledText } from "./render.ts";

// Text utilities (pass-through)
export {
  layoutLine,
  layoutLineFromSegments,
  layoutWordWrapFromSegments,
  layoutWords,
  measureText,
  measureTextFromSegments,
  segmentLine,
  segmentText,
  truncateLine,
  truncateLineFromSegments,
  type SpanWrapMode,
  type StyledSegment,
  type StyledSpan,
  type StyledVisualLine,
  type VisualLine,
  type VisualSegment,
  type WrapMode,
} from "./text.ts";

// Theme (generic infrastructure — UI layer provides defaults and re-exports)
export {
  parseColor,
  resolveTheme,
  setTheme,
  styleFallback,
  theme,
} from "./theme.ts";
export type { ColorString, Theme } from "./theme.ts";
