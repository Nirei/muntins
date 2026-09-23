// Drawer component - panel that slides in from the edge of the screen
import { Box } from "../core/components/Box.js";
import { Portal } from "../core/components/Portal.js";
import { Show } from "../core/components/Show.js";
import { TabFocus } from "../core/components/TabFocus.js";
import { resolve } from "../core/signals.js";
import { theme } from "../core/theme.js";
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
export function Drawer(props) {
    const t = () => theme("drawer");
    const isOpen = () => resolve(props.open) ?? false;
    const getSide = () => resolve(props.side) ?? t().side;
    const getSize = () => resolve(props.size) ?? t().size;
    const handleKeyPress = (key) => {
        if (key.name === "escape") {
            props.onClose?.();
            return true;
        }
        return false;
    };
    const positionStyle = () => {
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
        children: () => Portal({
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
//# sourceMappingURL=Drawer.js.map