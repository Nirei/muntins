// Re-exports for backward compatibility during runtime/ module migration.
// All implementation has moved to src/core/runtime/*.ts submodules.

// Components
export { Box, type BoxProps, type BoxChild } from "./components/Box.ts";
export { Text, type TextProps } from "./components/Text.ts";
export { Portal, type PortalProps } from "./components/Portal.ts";
export { Show, type ShowProps } from "./components/Show.ts";
export { For, type ForProps } from "./components/For.ts";

// Node
export {
  Node,
  type NodeInit,
  type Ref,
  createRef,
  type LayoutSignals,
  type LayoutInfo,
} from "./runtime/Node.ts";

// App / Context
export {
  App,
  type MountOptions,
  DEFAULT_MOUNT_OPTIONS,
  type RuntimeContext,
} from "./runtime/App.ts";

// Focus
export { FocusManager } from "./runtime/FocusManager.ts";
export type { FocusScope, FocusController } from "./runtime/FocusManager.ts";
export {
  FocusScopeComponent,
  type FocusScopeProps,
} from "./components/FocusScopeComponent.ts";
export { TabFocus, type TabFocusProps } from "./components/TabFocus.ts";
export { useFocus } from "./components/useFocus.ts";

// Renderer
export { Renderer } from "./runtime/Renderer.ts";

// EventDispatcher
export { EventDispatcher } from "./runtime/EventDispatcher.ts";

// Pass-through re-exports from render.ts
export {
  BORDER_CHARS,
  DEFAULT_INHERITED_STYLE,
  enterTuiMode,
  exitTuiMode,
  flushFrame,
} from "./render.ts";
export type {
  InheritableBool,
  InheritedStyle,
  ReactiveTextStyle,
  TextStyle,
  BorderProp,
  BorderStyleName,
} from "./render.ts";

// Pass-through re-exports from rects.ts
export { DEFAULT_CLIP } from "./rects.ts";
export type { Rect, ScreenRect } from "./rects.ts";

// Pass-through re-exports from text.ts
export {
  measureText,
  truncateLine,
  segmentLine,
  segmentText,
  layoutLine,
  layoutLineFromSegments,
  truncateLineFromSegments,
  measureTextFromSegments,
} from "./text.ts";
export type { WrapMode, VisualSegment, VisualLine } from "./text.ts";
