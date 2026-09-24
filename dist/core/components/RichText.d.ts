import { type ReactiveTextStyle } from "../render.ts";
import { type EventHandlerProps, Node, type Ref } from "../runtime/Node.ts";
import { type MaybeAccessor } from "../signals.ts";
import { type SpanWrapMode, type StyledSpan } from "../text.ts";
/** Props for RichText component. */
export interface RichTextProps extends Partial<ReactiveTextStyle & EventHandlerProps> {
    spans: MaybeAccessor<StyledSpan[]>;
    wrap?: MaybeAccessor<SpanWrapMode>;
    ref?: Ref;
}
/**
 * Creates a leaf node that displays styled text runs (spans).
 *
 * Spans form one continuous text flow: `"\\n"` inside span text is a hard
 * break, wrapping may split spans and cross span boundaries, and every
 * grapheme keeps its span's style (span value > node prop > inherited
 * style). Defaults to word-boundary wrapping, unlike `Text` which wraps at
 * grapheme boundaries — use RichText for prose, Text for single-style runs.
 */
export declare function RichText(props: RichTextProps): Node;
//# sourceMappingURL=RichText.d.ts.map