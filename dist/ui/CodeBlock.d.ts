import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor } from "../core/signals.ts";
/** Props for the CodeBlock component. */
export interface CodeBlockProps {
    /** Preformatted source text. Newlines are preserved; lines never wrap. */
    content: MaybeAccessor<string>;
    /** Reserved for future syntax highlighting; not rendered yet. */
    language?: MaybeAccessor<string>;
    /** Style overrides */
    style?: Partial<ReactiveFlexStyle>;
}
/**
 * A preformatted code block.
 *
 * Content is rendered verbatim with `wrap: "none"` — lines keep their
 * leading whitespace and are never wrapped or truncated; the intrinsic
 * width is the widest line, and callers clip via overflow. Background
 * and border colors come from the `code-block` theme slice.
 *
 * @example
 * ```typescript
 * CodeBlock({ content: "npm install muntins", language: "sh" });
 * ```
 */
export declare function CodeBlock(props: CodeBlockProps): Node;
//# sourceMappingURL=CodeBlock.d.ts.map