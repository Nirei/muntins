import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime/Node.ts";
import { type MaybeAccessor } from "../core/signals.ts";
/**
 * Placement options for the popover relative to its trigger.
 */
export type PopoverPlacement = "top" | "top-start" | "top-end" | "bottom" | "bottom-start" | "bottom-end" | "left" | "left-start" | "left-end" | "right" | "right-start" | "right-end";
/**
 * Props for the Popover component.
 */
export interface PopoverProps {
    /** Whether the popover is open */
    open: MaybeAccessor<boolean>;
    /** Called when popover should close */
    onClose?: () => void;
    /** Popover content */
    content: () => Node | Node[];
    /** Trigger element (receives anchor props) */
    children: (anchorProps: {
        ref: Ref;
    }) => Node;
    /** Placement relative to trigger. Default: "bottom-start" */
    placement?: MaybeAccessor<PopoverPlacement>;
    /** Style overrides for popover container */
    style?: Partial<ReactiveFlexStyle>;
}
/**
 * A floating panel anchored to a trigger element.
 *
 * Popover is a foundational component for building dropdowns, tooltips,
 * and other floating UI elements. The trigger renders in normal document
 * flow, while the content floats via Portal when open.
 *
 * The popover is intentionally unstyled - it renders content with no default
 * border, padding, or colors. Use style overrides to add visual styling.
 *
 * @example
 * ```typescript
 * const [open, setOpen] = createSignal(false);
 *
 * Popover({
 *   open,
 *   onClose: () => setOpen(false),
 *   placement: "bottom-start",
 *   content: () => [
 *     Text({ content: "Popover content" }),
 *   ],
 *   children: (props) =>
 *     Button({
 *       ...props,
 *       children: "Open",
 *       onClick: () => setOpen(true),
 *     }),
 * });
 *
 * // With styling
 * Popover({
 *   open,
 *   onClose: () => setOpen(false),
 *   content: () => menuItems,
 *   children: (props) => trigger,
 *   style: {
 *     border: "single",
 *     padding: 1,
 *   },
 * });
 * ```
 */
export declare function Popover(props: PopoverProps): Node;
//# sourceMappingURL=Popover.d.ts.map