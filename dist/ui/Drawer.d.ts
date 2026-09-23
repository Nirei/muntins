import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor } from "../core/signals.ts";
/** Which edge the drawer appears from */
export type DrawerSide = "left" | "right" | "top" | "bottom";
/**
 * Props for the Drawer component.
 */
export interface DrawerProps {
    /** Whether the drawer is open */
    open: MaybeAccessor<boolean>;
    /** Called when drawer should close (Escape key) */
    onClose?: () => void;
    /** Which edge the drawer appears from. Default from theme. */
    side?: MaybeAccessor<DrawerSide>;
    /** Drawer content */
    children: Node | Node[];
    /** Size of the drawer (width for left/right, height for top/bottom) */
    size?: MaybeAccessor<number>;
    /** Style overrides for the drawer container */
    style?: Partial<ReactiveFlexStyle>;
}
/**
 * A drawer panel that slides in from the edge of the screen via Portal.
 *
 * When open, the drawer traps focus within its content using TabFocus.
 * Pressing Escape calls onClose to dismiss the drawer.
 *
 * The drawer is intentionally unstyled - it renders its children with no default
 * border, padding, or colors. Use composition or style overrides to add visual styling.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const [isOpen, setIsOpen] = createSignal(false);
 *
 * Drawer({
 *   open: isOpen,
 *   onClose: () => setIsOpen(false),
 *   side: "left",
 *   children: [
 *     Text({ content: "Navigation" }),
 *     Button({ children: "Home", onClick: goHome }),
 *     Button({ children: "Settings", onClick: goSettings }),
 *   ],
 * });
 *
 * // With styling
 * Drawer({
 *   open: isOpen,
 *   onClose: () => setIsOpen(false),
 *   side: "right",
 *   size: 40,
 *   children: drawerContent,
 *   style: {
 *     borderStart: true,
 *     padding: 1,
 *   },
 * });
 * ```
 */
export declare function Drawer(props: DrawerProps): Node;
//# sourceMappingURL=Drawer.d.ts.map