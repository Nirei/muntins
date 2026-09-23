import { createRef } from "../runtime/Node.js";
import { getActiveContext } from "../runtime/context.js";
import { createEffect, createSignal, resolve } from "../signals.js";
import { Box } from "./Box.js";
import { Text } from "./Text.js";
// Unicode box drawing characters for scrollbar
const TRACK_CHAR = "\u2502"; // Light vertical (|)
const THUMB_CHAR = "\u2503"; // Heavy vertical (|)
/** Default height when height prop resolves to undefined. */
const DEFAULT_HEIGHT = 10;
/**
 * Internal scrollbar component.
 */
function Scrollbar(props) {
    const renderScrollbar = () => {
        const viewportHeight = props.height();
        const contentHeight = props.contentHeight();
        const scrollTop = props.scrollTop();
        if (contentHeight <= viewportHeight) {
            return "";
        }
        const thumbHeight = Math.max(1, Math.floor((viewportHeight * viewportHeight) / contentHeight));
        const maxScroll = contentHeight - viewportHeight;
        const trackSpace = viewportHeight - thumbHeight;
        const thumbPosition = maxScroll > 0 ? Math.floor((scrollTop * trackSpace) / maxScroll) : 0;
        const lines = [];
        for (let i = 0; i < viewportHeight; i++) {
            if (i >= thumbPosition && i < thumbPosition + thumbHeight) {
                lines.push(THUMB_CHAR);
            }
            else {
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
export function ScrollArea(props) {
    const [internalOffset, setInternalOffset] = createSignal(0);
    const ctx = getActiveContext();
    const getScrollTop = () => resolve(props.scrollTop) ?? internalOffset();
    const getHeight = () => resolve(props.height) ?? DEFAULT_HEIGHT;
    const getWidth = () => resolve(props.width);
    const [contentHeight, setContentHeight] = createSignal(0);
    createEffect(() => {
        getScrollTop();
        ctx?.app.scheduleFlush();
    });
    const handleScroll = (delta) => {
        const currentOffset = getScrollTop();
        const viewportHeight = getHeight();
        const maxScroll = Math.max(0, contentHeight() - viewportHeight);
        const newOffset = Math.max(0, Math.min(maxScroll, currentOffset + delta));
        if (newOffset !== currentOffset) {
            setInternalOffset(newOffset);
            props.onScroll?.(newOffset);
        }
    };
    const handleKeyPress = (key) => {
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
    const handleScrollEvent = (event) => {
        const delta = event.direction === "down" ? 1 : -1;
        handleScroll(delta);
    };
    const children = Array.isArray(props.children)
        ? props.children
        : [props.children];
    const contentRef = createRef();
    const contentBox = Box({
        flexDirection: "column",
        minWidth: 0,
        height: () => Math.max(getHeight(), contentHeight()),
        marginTop: () => -getScrollTop(),
        ref: contentRef,
        children,
    });
    createEffect(() => {
        const node = contentRef.current;
        if (node?._layout) {
            const resolvedChildren = node.resolveChildren();
            const lastChild = resolvedChildren[resolvedChildren.length - 1];
            if (lastChild?._layout) {
                const contentBottom = lastChild._layout.y() + lastChild._layout.height();
                setContentHeight(contentBottom);
            }
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
                minWidth: 0,
                flexDirection: "column",
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
//# sourceMappingURL=ScrollArea.js.map