import type { ReactiveFlexStyle } from "../layout.ts";
import { type Node, type Ref } from "../runtime/Node.ts";
/**
 * Props for the ScrollArea component.
 */
export interface ScrollAreaProps {
    /** Fixed height of the scroll area */
    height: number | (() => number);
    /** Fixed width of the scroll area (optional, defaults to auto) */
    width?: number | (() => number);
    /** Minimum height for the content area. Enables flexGrow inside ScrollArea. */
    minHeight?: number | (() => number);
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
    style?: Partial<ReactiveFlexStyle>;
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
export declare function ScrollArea(props: ScrollAreaProps): Node;
//# sourceMappingURL=ScrollArea.d.ts.map