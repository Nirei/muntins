import { type ReactiveFlexStyle } from "../layout.ts";
import { type BorderProp, type BorderStyleName } from "../render.ts";
import { type EventHandlerProps, type InheritableProps, Node, type Ref } from "../runtime/Node.ts";
/** Child element that Box can accept - Node, string, or reactive string. */
export type BoxChild = Node | string | (() => string);
/** Props for Box component. */
export interface BoxProps extends Partial<ReactiveFlexStyle & InheritableProps & EventHandlerProps> {
    children?: BoxChild | BoxChild[];
    border?: BorderProp | (() => BorderProp);
    borderStyle?: BorderStyleName | (() => BorderStyleName);
    focusable?: boolean;
    autoFocus?: boolean;
    ref?: Ref;
}
/**
 * Creates a Box node - a layout container that supports reactive styles and event handlers.
 *
 * Box is the fundamental container primitive. When backgroundColor is set, Box renders
 * its background; when border is set, Box renders its border.
 * Size is determined by flexbox layout based on its children.
 */
export declare function Box({ children: childrenProp, backgroundColor, border, borderColor, borderStyle, color, bold, dim, italic, underline, strikethrough, inverse, focusable, autoFocus, ref, onKeyPress, onMousePress, onMouseRelease, onMouseMove, onScroll, onHover, onActivate, ...styleProps }: BoxProps): Node;
//# sourceMappingURL=Box.d.ts.map