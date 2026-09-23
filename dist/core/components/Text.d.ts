import { type ReactiveTextStyle } from "../render.ts";
import { type EventHandlerProps, Node, type Ref } from "../runtime/Node.ts";
import { type MaybeAccessor } from "../signals.ts";
import { type WrapMode } from "../text.ts";
/** Props for Text component. */
export interface TextProps extends Partial<ReactiveTextStyle & EventHandlerProps> {
    content: MaybeAccessor<string>;
    wrap?: MaybeAccessor<WrapMode>;
    focusable?: boolean;
    autoFocus?: boolean;
    ref?: Ref;
}
/**
 * Creates a Text node - a leaf node that displays text content.
 *
 * Text is measured based on its content and renders text with styling.
 * Content and style props can be static values or reactive getters.
 */
export declare function Text(props: TextProps): Node;
//# sourceMappingURL=Text.d.ts.map