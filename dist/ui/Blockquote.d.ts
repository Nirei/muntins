import { type BoxChild } from "../core/components/Box.ts";
import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime/Node.ts";
/** Props for the Blockquote component. */
export interface BlockquoteProps {
    /** Quoted content: nodes (or strings) laid out vertically inside the quote */
    children: BoxChild | BoxChild[];
    /** Style overrides */
    style?: Partial<ReactiveFlexStyle>;
}
/**
 * A quotation block with a vertical bar on its start edge and inner padding.
 *
 * Nesting is plain composition: put a `Blockquote` inside a `Blockquote`.
 * The bar color and inner text color come from the `blockquote` theme slice.
 * Standalone use: callouts and asides.
 *
 * @example
 * ```typescript
 * Blockquote({ children: Text({ content: "Famous words." }) });
 * ```
 */
export declare function Blockquote(props: BlockquoteProps): Node;
//# sourceMappingURL=Blockquote.d.ts.map