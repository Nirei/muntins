import type { InheritableColor } from "../core/buffer.ts";
import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor } from "../core/signals.ts";
/**
 * Props for the Progress component.
 */
export interface ProgressProps {
    /** Progress value from 0 to 100. */
    value: MaybeAccessor<number>;
    /** Total width of the progress bar in cells. Default from theme. */
    width?: MaybeAccessor<number>;
    /** Color of the filled portion (block characters). */
    color?: MaybeAccessor<InheritableColor>;
    /** Background color (visible in empty portion). */
    backgroundColor?: MaybeAccessor<InheritableColor>;
    /** Style overrides */
    style?: Partial<ReactiveFlexStyle>;
}
/**
 * A progress bar showing completion percentage with sub-cell precision.
 *
 * Renders as a horizontal bar using Unicode block characters to achieve
 * smooth visual progression. With a width of 20 cells, there are 160
 * possible visual states (20 cells × 8 eighths per cell).
 *
 * Not focusable (purely visual).
 *
 * @example
 * ```typescript
 * // Basic progress bar
 * Progress({ value: 50 });
 *
 * // Custom width and colors
 * Progress({
 *   value: 75,
 *   width: 30,
 *   color: { type: "named", index: 2 },        // green
 *   backgroundColor: { type: "named", index: 0 }, // black
 * });
 * ```
 */
export declare function Progress(props: ProgressProps): Node;
//# sourceMappingURL=Progress.d.ts.map