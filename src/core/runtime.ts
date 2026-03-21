// Re-exports for backward compatibility during runtime/ module migration.
// All implementation has moved to src/core/runtime/*.ts submodules.

// Components
export { Box, type BoxProps, type BoxChild } from "./runtime/Box.ts";
export { Text, type TextProps } from "./runtime/Text.ts";
export { Portal, type PortalProps } from "./runtime/Portal.ts";
export { Show, type ShowProps } from "./runtime/Show.ts";
export { For, type ForProps } from "./runtime/For.ts";

// Node
export { Node, type NodeInit, type Ref, createRef } from "./runtime/Node.ts";

// App / Context
export {
  App,
  type MountOptions,
  DEFAULT_MOUNT_OPTIONS,
  type RuntimeContext,
} from "./runtime/App.ts";

// Focus
export {
  type FocusScope,
  type FocusController,
  type FocusScopeProps,
  type TabFocusProps,
  FocusScopeComponent,
  TabFocus,
  useFocus,
  collectFocusableInScope,
  focusNext,
  focusPrev,
  initializeFocus,
  cleanupSubtreeState,
  focusNode,
  registerSubtreeFocusables,
  unregisterSubtreeFocusables,
} from "./runtime/focus.ts";

// Tree
export { hitTest } from "./runtime/tree.ts";

// Paint
export { computeInheritedStyle, paintTree } from "./runtime/paint.ts";

// Binding
export {
  bindNodes,
  updateAllLayoutSignals,
  clearSubtreeLayoutSignals,
} from "./runtime/binding.ts";

// Events
export { routeEvent, handleEvent } from "./runtime/events.ts";

// Pipeline
export type { FlushState } from "./runtime/pipeline.ts";

// Layout signals
export { type LayoutSignals, createLayoutSignals, type LayoutInfo } from "./runtime/binding.ts";

// Pass-through re-exports from render.ts
export {
  BORDER_CHARS,
  DEFAULT_CLIP,
  DEFAULT_INHERITED_STYLE,
  enterTuiMode,
  exitTuiMode,
  flushFrame,
} from "./render.ts";
export type {
  ClipRect,
  InheritableBool,
  InheritedStyle,
  ReactiveTextStyle,
  TextStyle,
  BorderProp,
  BorderStyleName,
} from "./render.ts";

// Pass-through re-exports from text.ts
export {
  lineDisplayWidth,
  measureText,
  truncateLine,
  wrapLine,
} from "./text.ts";
export type { WrapMode } from "./text.ts";
