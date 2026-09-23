import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor } from "../core/signals.ts";
/** Orientation of the separator. */
export type SeparatorOrientation = "horizontal" | "vertical";
/**
 * Props for the Separator component.
 */
export interface SeparatorProps {
    /** Orientation of the separator. Default: "horizontal" */
    orientation?: MaybeAccessor<SeparatorOrientation>;
    /** Style overrides */
    style?: Partial<ReactiveFlexStyle>;
}
/**
 * A visual divider that separates content.
 *
 * Renders as a horizontal or vertical line using box drawing characters.
 * The separator fills available space in the appropriate direction:
 * - Horizontal: fills width, height is 1
 * - Vertical: fills height, width is 1
 *
 * Not focusable (purely decorative).
 */
export declare function Separator(props: SeparatorProps): Node;
//# sourceMappingURL=Separator.d.ts.map