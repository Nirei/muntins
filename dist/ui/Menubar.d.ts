import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime/Node.ts";
/**
 * A single menu item with label, optional shortcut, and action.
 */
export interface MenuItem {
    label: string;
    shortcut?: string;
    disabled?: boolean;
    onSelect?: () => void;
}
/**
 * A separator between menu items.
 */
export interface MenuSeparator {
    separator: true;
}
/**
 * A menu definition with label and items.
 */
export interface Menu {
    label: string;
    items: Array<MenuItem | MenuSeparator>;
}
/**
 * Props for rendering a menu label in the menubar.
 * All boolean values are accessors to support reactivity.
 */
export interface MenuLabelRenderProps {
    label: string;
    open: () => boolean;
    focused: () => boolean;
}
/**
 * Props for rendering a menu item.
 * highlighted is an accessor to support reactivity.
 */
export interface MenuItemRenderProps {
    item: MenuItem;
    highlighted: () => boolean;
}
/**
 * Props for the Menubar component.
 */
export interface MenubarProps {
    /** Menu definitions */
    menus: Menu[];
    /** Render function for menu label - controls all styling */
    renderMenuLabel?: (props: MenuLabelRenderProps) => Node;
    /** Render function for menu item - controls all styling */
    renderMenuItem?: (props: MenuItemRenderProps) => Node;
    /** Focus control */
    focusable?: boolean;
    autoFocus?: boolean;
    ref?: Ref;
    /** Style overrides */
    style?: Partial<ReactiveFlexStyle>;
}
/**
 * A horizontal menu bar with dropdown menus.
 *
 * Menubar uses Popover for the dropdown menus. Each menu label renders in the
 * menubar, and when activated, a dropdown menu appears with selectable items.
 *
 * The component is intentionally unstyled - use the render functions to
 * control all visual appearance including selected/focused states.
 *
 * @example
 * ```typescript
 * Menubar({
 *   menus: [
 *     {
 *       label: "File",
 *       items: [
 *         { label: "New", shortcut: "^N", onSelect: handleNew },
 *         { label: "Open", shortcut: "^O", onSelect: handleOpen },
 *         { separator: true },
 *         { label: "Exit", shortcut: "^Q", onSelect: handleExit },
 *       ],
 *     },
 *     {
 *       label: "Edit",
 *       items: [
 *         { label: "Undo", shortcut: "^Z", onSelect: handleUndo },
 *         { label: "Redo", shortcut: "^Y", onSelect: handleRedo },
 *       ],
 *     },
 *   ],
 * });
 *
 * // With custom styling
 * Menubar({
 *   menus: menuDefinitions,
 *   renderMenuLabel: (props) =>
 *     Text({
 *       content: props.label,
 *       inverse: props.open,
 *       bold: props.focused,
 *     }),
 *   renderMenuItem: (props) =>
 *     Text({
 *       content: props.item.label,
 *       inverse: props.highlighted,
 *       dim: props.item.disabled,
 *     }),
 * });
 * ```
 */
export declare function Menubar(props: MenubarProps): Node;
//# sourceMappingURL=Menubar.d.ts.map