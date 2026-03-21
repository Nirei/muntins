// ScrollArea component - scrollable container with scrollbar

import type { KeyEvent, ScrollEvent } from "../core/input.ts";
import type { FlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime.ts";
import { App, Box, Text, createRef } from "../core/runtime.ts";
import { createEffect, createSignal, resolve } from "../core/signals.ts";

// Unicode box drawing characters for scrollbar
const TRACK_CHAR = "\u2502"; // Light vertical (|)
const THUMB_CHAR = "\u2503"; // Heavy vertical (|)

/** Default height when height prop resolves to undefined. */
const DEFAULT_HEIGHT = 10;

/**
 * Props for the ScrollArea component.
 */
export interface ScrollAreaProps {
  /** Fixed height of the scroll area */
  height: number | (() => number);

  /** Fixed width of the scroll area (optional, defaults to auto) */
  width?: number | (() => number);

  /** Content to scroll */
  children: Node | Node[];

  /** Current scroll offset (controlled) */
  scrollTop?: number | (() => number);

  /** Called when scroll position changes */
  onScroll?: (scrollTop: number) => void;

  /** Focus control */
  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;

  /** Style overrides */
  style?: Partial<FlexStyle>;
}

/**
 * Internal scrollbar component.
 */
function Scrollbar(props: {
  height: () => number;
  contentHeight: () => number;
  scrollTop: () => number;
}): Node {
  const renderScrollbar = (): string => {
    const viewportHeight = props.height();
    const contentHeight = props.contentHeight();
    const scrollTop = props.scrollTop();

    if (contentHeight <= viewportHeight) {
      return THUMB_CHAR.repeat(viewportHeight).split("").join("\n");
    }

    const thumbHeight = Math.max(
      1,
      Math.floor((viewportHeight * viewportHeight) / contentHeight),
    );

    const maxScroll = contentHeight - viewportHeight;
    const trackSpace = viewportHeight - thumbHeight;
    const thumbPosition =
      maxScroll > 0 ? Math.floor((scrollTop * trackSpace) / maxScroll) : 0;

    const lines: string[] = [];
    for (let i = 0; i < viewportHeight; i++) {
      if (i >= thumbPosition && i < thumbPosition + thumbHeight) {
        lines.push(THUMB_CHAR);
      } else {
        lines.push(TRACK_CHAR);
      }
    }
    return lines.join("\n");
  };

  return Text({
    content: renderScrollbar,
  });
}

/**
 * A scrollable container that clips content and provides scroll navigation.
 *
 * The scrollbar uses box-drawing characters for the track (|) and thumb (|).
 * Content is clipped to the specified height and can be scrolled via keyboard
 * or mouse scroll events.
 *
 * ScrollArea is intentionally unstyled except for the scrollbar. Use composition
 * or style overrides to add borders, padding, or colors.
 *
 * @example
 * ```typescript
 * // Basic usage
 * ScrollArea({
 *   height: 10,
 *   children: [
 *     For({
 *       each: () => items,
 *       children: (item) => Text({ content: item().name }),
 *     }),
 *   ],
 * });
 *
 * // With border
 * Box({
 *   border: "single",
 *   children: [
 *     ScrollArea({
 *       height: 10,
 *       children: longContentList,
 *     }),
 *   ],
 * });
 *
 * // Controlled scrolling
 * const [scrollPos, setScrollPos] = createSignal(0);
 * ScrollArea({
 *   height: 10,
 *   scrollTop: scrollPos,
 *   onScroll: setScrollPos,
 *   children: content,
 * });
 * ```
 */
export function ScrollArea(props: ScrollAreaProps): Node {
  const [internalOffset, setInternalOffset] = createSignal(0);

  const ctx = App.getActiveContext();

  const getScrollTop = () => resolve(props.scrollTop) ?? internalOffset();
  const getHeight = () => resolve(props.height) ?? DEFAULT_HEIGHT;
  const getWidth = () => resolve(props.width);

  const [contentHeight, setContentHeight] = createSignal(0);

  createEffect(() => {
    getScrollTop(); // Track scroll position
    ctx?.app.scheduleRelayout();
  });

  const handleScroll = (delta: number): void => {
    const currentOffset = getScrollTop();
    const viewportHeight = getHeight();
    const maxScroll = Math.max(0, contentHeight() - viewportHeight);
    const newOffset = Math.max(0, Math.min(maxScroll, currentOffset + delta));

    if (newOffset !== currentOffset) {
      setInternalOffset(newOffset);
      props.onScroll?.(newOffset);
    }
  };

  const handleKeyPress = (key: KeyEvent): boolean | undefined => {
    const viewportHeight = getHeight();

    if (key.name === "up") {
      handleScroll(-1);
      return true;
    }
    if (key.name === "down") {
      handleScroll(1);
      return true;
    }
    if (key.name === "pageup") {
      handleScroll(-viewportHeight);
      return true;
    }
    if (key.name === "pagedown") {
      handleScroll(viewportHeight);
      return true;
    }
    if (key.name === "home") {
      const currentOffset = getScrollTop();
      if (currentOffset !== 0) {
        setInternalOffset(0);
        props.onScroll?.(0);
      }
      return true;
    }
    if (key.name === "end") {
      const viewportHeight = getHeight();
      const maxScroll = Math.max(0, contentHeight() - viewportHeight);
      const currentOffset = getScrollTop();
      if (currentOffset !== maxScroll) {
        setInternalOffset(maxScroll);
        props.onScroll?.(maxScroll);
      }
      return true;
    }
    return false;
  };

  const handleScrollEvent = (event: ScrollEvent): void => {
    const delta = event.direction === "down" ? 1 : -1;
    handleScroll(delta);
  };

  const children = Array.isArray(props.children)
    ? props.children
    : [props.children];

  const estimateContentHeight = (): number => {
    let height = 0;
    const countHeight = (node: Node): number => {
      if (node.measure) {
        const size = node.measure(1000, 1000);
        return size.height;
      }
      const children = node.resolveChildren();
      if (children.length > 0) {
        let total = 0;
        for (const child of children) {
          total += countHeight(child);
        }
        return total;
      }
      return 1;
    };

    for (const child of children) {
      height += countHeight(child);
    }
    return height;
  };

  // Estimate content height by calling measure() on children.
  // This is called in an effect so it tracks reactive dependencies
  // (e.g., Textarea's value signal) and re-runs when content changes.
  createEffect(() => {
    setContentHeight(estimateContentHeight());
  });

  const contentRef = createRef();

  const contentBox = Box({
    flexDirection: "column",
    marginTop: () => -getScrollTop(),
    ref: contentRef,
    children,
  });

  // Also update from actual layout when available (more accurate)
  createEffect(() => {
    const node = contentRef.current;
    if (node?._layout) {
      const height = node._layout.height();
      setContentHeight(height);
    }
  });

  return Box({
    flexDirection: "row",
    height: props.height,
    maxHeight: props.height,
    width: props.width,
    focusable: props.focusable ?? true,
    autoFocus: props.autoFocus,
    ref: props.ref,
    onKeyPress: handleKeyPress,
    onScroll: handleScrollEvent,
    ...props.style,
    children: [
      Box({
        flexGrow: 1,
        overflow: "hidden",
        maxHeight: props.height,
        children: [contentBox],
      }),
      Scrollbar({
        height: getHeight,
        contentHeight: () => contentHeight(),
        scrollTop: getScrollTop,
      }),
    ],
  });
}
