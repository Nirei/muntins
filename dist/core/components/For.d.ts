import { Node } from "../runtime/Node.ts";
import { type MaybeAccessor } from "../signals.ts";
/** Props for For component. */
export interface ForProps<T> {
    each: MaybeAccessor<T[]>;
    render: (item: () => T, index: () => number) => Node;
    key?: (item: T) => unknown;
}
/**
 * Renders a list of items with efficient updates using keyed reconciliation.
 *
 * Items are identified by key (defaults to object identity). When the array
 * changes:
 * - New items create new roots with reactive item/index getters
 * - Removed items have their roots disposed
 * - Reordered items update their index and item signals, keeping nodes alive
 *
 * Duplicate keys are supported: each occurrence gets its own node. The render
 * function receives getter functions for item and index, enabling reactive
 * updates when items change or reorder.
 *
 * Must be called within a mounted component context for proper effect ownership.
 */
export declare function For<T>(props: ForProps<T>): Node;
//# sourceMappingURL=For.d.ts.map