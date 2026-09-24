// Public API exports
// Signals (reactivity)
export { batch, createEffect, createMemo, createRoot, createSignal, onCleanup, onMount, untrack, } from "./signals.js";
// Layout
export { computeLayout, DEFAULT_FLEX_STYLE, } from "./layout.js";
// Buffer (rendering)
export { BLINK, BOLD, Buffer, DEFAULT_COLOR, DIM, displayWidth, graphemeDisplayWidth, graphemes, HIDDEN, INVERSE, ITALIC, STRIKETHROUGH, UNDERLINE, } from "./buffer.js";
// Text editing utilities
export { textDelete, textInsert, textLength, textSlice } from "./text.js";
// Input
export { createInputParser, setupTerminal, teardownTerminal, } from "./input.js";
// Components
export { Box } from "./components/Box.js";
export { For } from "./components/For.js";
export { Portal } from "./components/Portal.js";
export { Show } from "./components/Show.js";
export { Text } from "./components/Text.js";
export { RichText, } from "./components/RichText.js";
// Runtime - Node
export { createRef, Node } from "./runtime/Node.js";
// Runtime - App / Context
export { App, DEFAULT_MOUNT_OPTIONS, } from "./runtime/App.js";
// Runtime - Focus
export { FocusScopeComponent, } from "./components/FocusScopeComponent.js";
export { TabFocus } from "./components/TabFocus.js";
export { useFocus } from "./components/useFocus.js";
// Render (pass-through)
export { BORDER_CHARS, DEFAULT_INHERITED_STYLE, enterTuiMode, exitTuiMode, flushFrame, } from "./render.js";
export { renderStyledText } from "./render.js";
// Text utilities (pass-through)
export { layoutLine, layoutLineFromSegments, layoutWordWrapFromSegments, layoutWords, measureText, measureTextFromSegments, segmentLine, segmentText, truncateLine, truncateLineFromSegments, } from "./text.js";
// Theme (generic infrastructure — UI layer provides defaults and re-exports)
export { parseColor, resolveTheme, setTheme, styleFallback, theme, } from "./theme.js";
//# sourceMappingURL=index.js.map