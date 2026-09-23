import type { ReactiveTextStyle } from "../core/render.ts";
import type { Node, Ref } from "../core/runtime/Node.ts";
/**
 * Props for the Label component.
 */
export interface LabelProps {
    /** Label text content */
    children: string | (() => string);
    /** Associated element ref - clicking label focuses and activates this element */
    for?: Ref;
    /** Text style overrides */
    style?: Partial<ReactiveTextStyle>;
}
/**
 * A text label for form elements, optionally associated with a focusable target.
 *
 * When `for` is provided and the label receives a mouse press, focus moves
 * to the referenced element and the element is activated (triggering its
 * onActivate handler). This enables labels to toggle checkboxes, switches,
 * and other activatable components. The label itself is not focusable.
 *
 * @example
 * ```typescript
 * const switchRef = createRef();
 *
 * Box({
 *   flexDirection: "row",
 *   gap: 1,
 *   children: [
 *     Switch({ ref: switchRef, checked, onChange }),
 *     Label({ children: "I agree", for: switchRef }),
 *   ],
 * });
 * ```
 */
export declare function Label(props: LabelProps): Node;
//# sourceMappingURL=Label.d.ts.map