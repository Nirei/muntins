import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor } from "../core/signals.ts";
/** Spinner animation variant. */
export type SpinnerVariant = "dots" | "line" | "arc";
/**
 * Props for the Spinner component.
 */
export interface SpinnerProps {
    /** Spinner style/frames. Default: "dots" */
    variant?: MaybeAccessor<SpinnerVariant>;
    /** Animation interval in ms. Default from theme. */
    interval?: MaybeAccessor<number>;
    /** Label shown next to spinner */
    label?: MaybeAccessor<string>;
    /** Style overrides */
    style?: Partial<ReactiveFlexStyle>;
}
/**
 * An animated loading indicator that cycles through frames to show activity.
 *
 * The spinner animates at the specified interval, cycling through the frames
 * for the selected variant. When disposed, the animation interval is cleaned up.
 *
 * @example
 * ```typescript
 * // Basic spinner
 * Spinner({});
 *
 * // Spinner with label
 * Spinner({ label: "Loading..." });
 *
 * // Custom variant and speed
 * Spinner({ variant: "arc", interval: 100 });
 * ```
 */
export declare function Spinner(props: SpinnerProps): Node;
//# sourceMappingURL=Spinner.d.ts.map