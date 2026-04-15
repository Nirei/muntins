// Drawer component - panel that slides in from the edge of the screen

import { Box } from "../core/components/Box.ts";
import { Portal } from "../core/components/Portal.ts";
import { Show } from "../core/components/Show.ts";
import { TabFocus } from "../core/components/TabFocus.ts";
import type { KeyEvent } from "../core/input.ts";
import type { FlexStyle, ReactiveFlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor, resolve } from "../core/signals.ts";
import { theme } from "../core/theme.ts";

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
export function Drawer(props: DrawerProps): Node {
  const t = () => theme("drawer");
  const isOpen = () => resolve(props.open) ?? false;
  const getSide = () => resolve(props.side) ?? (t().side as DrawerSide);
  const getSize = () => resolve(props.size) ?? (t().size as number);

  const handleKeyPress = (key: KeyEvent): boolean | undefined => {
    if (key.name === "escape") {
      props.onClose?.();
      return true;
    }
    return false;
  };

  const positionStyle = (): Partial<FlexStyle> => {
    const side = getSide();
    const size = getSize();

    switch (side) {
      case "left":
        return { start: 0, top: 0, bottom: 0, width: size };
      case "right":
        return { end: 0, top: 0, bottom: 0, width: size };
      case "top":
        return { top: 0, start: 0, end: 0, height: size };
      case "bottom":
        return { bottom: 0, start: 0, end: 0, height: size };
    }
  };

  return Show({
    when: isOpen,
    children: () =>
      Portal({
        children: [
          Box({
            position: "absolute",
            flexDirection: "column",
            ...positionStyle(),
            children: [
              TabFocus({
                trap: true,
                children: [
                  Box({
                    focusable: true,
                    onKeyPress: handleKeyPress,
                    flexGrow: 1,
                    flexDirection: "column",
                    ...props.style,
                    children: props.children,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
  });
}
