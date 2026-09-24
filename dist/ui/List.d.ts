import { type BoxChild } from "../core/components/Box.ts";
import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor } from "../core/signals.ts";
/** Task state for a list item marker (GFM task lists). */
export type ListItemTask = "checked" | "unchecked";
/** Props for the ListItem component. */
export interface ListItemProps {
    /** GFM task state: renders a checkbox marker instead of a bullet */
    task?: MaybeAccessor<ListItemTask | undefined>;
    /** Item content, laid out to the right of the marker */
    children: BoxChild | BoxChild[];
    /** Style overrides */
    style?: Partial<ReactiveFlexStyle>;
}
/** Props for the List component. */
export interface ListProps {
    /** Render an ordered list (numbered markers) instead of bullets */
    ordered?: MaybeAccessor<boolean | undefined>;
    /** Starting number for ordered lists. Default: 1 */
    start?: MaybeAccessor<number | undefined>;
    /** Vertical gap between items: 0 = tight list, 1 = loose list (default) */
    gap?: MaybeAccessor<number | undefined>;
    /** List items (usually `ListItem` nodes) */
    children: BoxChild | BoxChild[];
    /** Style overrides */
    style?: Partial<ReactiveFlexStyle>;
}
/**
 * A single list item: a fixed-width marker column (bullet, task checkbox,
 * or a number injected by an ordered `List`) followed by the item content.
 *
 * Standalone ListItems render a bullet marker. Inside an ordered `List`,
 * the List replaces the marker with a right-aligned number.
 */
declare function ListItem(props: ListItemProps): Node;
/**
 * An unordered or ordered list of `ListItem`s (or arbitrary nodes).
 *
 * Unordered items keep their bullet (or task checkbox) markers. Ordered
 * lists replace each direct ListItem's marker with a number, right-aligned
 * to the widest number in the list (`" 9. "` / `"10. "`). `gap: 0` renders
 * a tight list; the default gap of 1 renders a loose one.
 *
 * @example
 * ```typescript
 * List({
 *   children: [
 *     ListItem({ children: "First" }),
 *     ListItem({ task: "checked", children: "Done" }),
 *   ],
 * });
 * ```
 */
export declare function List(props: ListProps): Node;
export { ListItem };
//# sourceMappingURL=List.d.ts.map