// Menubar component - horizontal menu bar with dropdown menus

import type { KeyEvent } from "../core/input.ts";
import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime.ts";
import { Box, Show, Text } from "../core/runtime.ts";
import { createSignal } from "../core/signals.ts";
import { theme } from "../core/theme.ts";
import { Popover } from "./Popover.ts";

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
 * Default renderer for menu labels.
 */
function defaultRenderMenuLabel(props: MenuLabelRenderProps): Node {
  return Text({ content: props.label });
}

/**
 * Default renderer for menu items.
 */
function defaultRenderMenuItem(props: MenuItemRenderProps): Node {
  return Box({
    flexDirection: "row",
    justifyContent: "space-between",
    gap: () => theme("menubar--item").gap as number,
    children: [
      Text({ content: props.item.label }),
      Show({
        when: () => props.item.shortcut !== undefined,
        children: () => Text({ content: props.item.shortcut ?? "" }),
      }),
    ],
  });
}

/**
 * Default renderer for separators.
 */
function defaultRenderSeparator(): Node {
  return Text({ content: () => theme("menubar--separator").content as string });
}

/**
 * Check if an item is a separator.
 */
function isSeparator(item: MenuItem | MenuSeparator): item is MenuSeparator {
  return "separator" in item;
}

/**
 * Find the next non-separator item index in a menu.
 */
function findNextItem(menu: Menu, current: number, direction: 1 | -1): number {
  let next = current + direction;
  while (next >= 0 && next < menu.items.length) {
    if (!isSeparator(menu.items[next])) return next;
    next += direction;
  }
  return current;
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
export function Menubar(props: MenubarProps): Node {
  const [activeMenuIndex, setActiveMenuIndex] = createSignal<number | null>(
    null,
  );
  const [focusedMenuIndex, setFocusedMenuIndex] = createSignal(0);
  const [highlightedItemIndex, setHighlightedItemIndex] = createSignal(0);

  const isOpen = () => activeMenuIndex() !== null;

  const renderMenuLabel = props.renderMenuLabel ?? defaultRenderMenuLabel;
  const renderMenuItem = props.renderMenuItem ?? defaultRenderMenuItem;

  const handleKeyPress = (key: KeyEvent): boolean | undefined => {
    if (!isOpen()) {
      if (key.name === "left") {
        setFocusedMenuIndex((i) => Math.max(0, i - 1));
        return true;
      }
      if (key.name === "right") {
        setFocusedMenuIndex((i) => Math.min(props.menus.length - 1, i + 1));
        return true;
      }
      if (key.name === "enter" || key.name === "space" || key.name === "down") {
        setActiveMenuIndex(focusedMenuIndex());
        const menu = props.menus[focusedMenuIndex()];
        setHighlightedItemIndex(findNextItem(menu, -1, 1));
        return true;
      }
    } else {
      const activeIdx = activeMenuIndex();
      if (activeIdx === null) return false;
      const menu = props.menus[activeIdx];

      if (key.name === "escape") {
        setActiveMenuIndex(null);
        return true;
      }
      if (key.name === "up") {
        setHighlightedItemIndex((i) => findNextItem(menu, i, -1));
        return true;
      }
      if (key.name === "down") {
        setHighlightedItemIndex((i) => findNextItem(menu, i, 1));
        return true;
      }
      if (key.name === "left") {
        const newIndex = Math.max(0, activeIdx - 1);
        setActiveMenuIndex(newIndex);
        setFocusedMenuIndex(newIndex);
        const newMenu = props.menus[newIndex];
        setHighlightedItemIndex(findNextItem(newMenu, -1, 1));
        return true;
      }
      if (key.name === "right") {
        const newIndex = Math.min(props.menus.length - 1, activeIdx + 1);
        setActiveMenuIndex(newIndex);
        setFocusedMenuIndex(newIndex);
        const newMenu = props.menus[newIndex];
        setHighlightedItemIndex(findNextItem(newMenu, -1, 1));
        return true;
      }
      if (key.name === "home") {
        setHighlightedItemIndex(findNextItem(menu, -1, 1));
        return true;
      }
      if (key.name === "end") {
        setHighlightedItemIndex(findNextItem(menu, menu.items.length, -1));
        return true;
      }
      if (key.name === "enter" || key.name === "space") {
        const item = menu.items[highlightedItemIndex()];
        if (item && !isSeparator(item) && !item.disabled) {
          item.onSelect?.();
          setActiveMenuIndex(null);
        }
        return true;
      }
    }
    return false;
  };

  return Box({
    flexDirection: "row",
    focusable: props.focusable ?? true,
    autoFocus: props.autoFocus,
    ref: props.ref,
    onKeyPress: handleKeyPress,
    ...props.style,
    children: props.menus.map((menu, menuIndex) =>
      Popover({
        open: () => activeMenuIndex() === menuIndex,
        onClose: () => setActiveMenuIndex(null),
        placement: "bottom-start",
        content: () =>
          Box({
            flexDirection: "column",
            children: menu.items.map((item, itemIndex) =>
              isSeparator(item)
                ? defaultRenderSeparator()
                : renderMenuItem({
                    item,
                    highlighted: () => highlightedItemIndex() === itemIndex,
                  }),
            ),
          }),
        children: (anchorProps) =>
          Box({
            ...anchorProps,
            children: [
              renderMenuLabel({
                label: menu.label,
                open: () => activeMenuIndex() === menuIndex,
                focused: () => focusedMenuIndex() === menuIndex,
              }),
            ],
          }),
      }),
    ),
  });
}
