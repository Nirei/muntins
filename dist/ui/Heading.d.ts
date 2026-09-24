import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor } from "../core/signals.ts";
/** Props for the Heading component. */
export interface HeadingProps {
    /** Heading level 1 (largest) through 6 (smallest) */
    level: MaybeAccessor<1 | 2 | 3 | 4 | 5 | 6>;
    /** Heading text */
    children: MaybeAccessor<string>;
    /** Style overrides */
    style?: Partial<ReactiveFlexStyle>;
}
/**
 * A section title, the terminal counterpart of an HTML heading.
 *
 * Levels 1 and 2 render a full-width bottom rule (like a setext heading);
 * levels 3-6 render styled text only. Styling comes from the theme slices
 * `heading--h1` … `heading--h6` with fallback to `heading` (bold by default).
 *
 * @example
 * ```typescript
 * Heading({ level: 1, children: "Installation" });
 * ```
 */
export declare function Heading(props: HeadingProps): Node;
//# sourceMappingURL=Heading.d.ts.map