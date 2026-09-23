import { DEFAULT_COLOR } from "../buffer.js";
import { DEFAULT_FLEX_STYLE, } from "../layout.js";
import { compact } from "../objects.js";
import { rectOverlaps } from "../rects.js";
import { fillClippedRect, getBorderStyleName, parseBorderProp, renderBorder, resolveInheritable, } from "../render.js";
import { Node, } from "../runtime/Node.js";
import { isAccessor, resolve } from "../signals.js";
import { Text } from "./Text.js";
/**
 * Creates a Box node - a layout container that supports reactive styles and event handlers.
 *
 * Box is the fundamental container primitive. When backgroundColor is set, Box renders
 * its background; when border is set, Box renders its border.
 * Size is determined by flexbox layout based on its children.
 */
export function Box({ children: childrenProp, backgroundColor, border, borderColor, borderStyle, color, bold, dim, italic, underline, strikethrough, inverse, focusable, autoFocus, ref, onKeyPress, onMousePress, onMouseRelease, onMouseMove, onScroll, onHover, onActivate, ...styleProps }) {
    const normalizeChild = (child) => {
        if (typeof child === "string") {
            return Text({ content: child });
        }
        if (typeof child === "function") {
            return Text({ content: child });
        }
        return child;
    };
    const children = childrenProp
        ? Array.isArray(childrenProp)
            ? childrenProp.map(normalizeChild)
            : [normalizeChild(childrenProp)]
        : [];
    const getBorderFlags = () => {
        return parseBorderProp(resolve(border));
    };
    function computeStyle() {
        const resolved = {};
        for (const [key, value] of Object.entries(styleProps)) {
            resolved[key] = resolve(value);
        }
        return {
            ...DEFAULT_FLEX_STYLE,
            ...compact(resolved),
            ...getBorderFlags(),
        };
    }
    const hasReactiveStyle = Object.values(styleProps).some(isAccessor) || isAccessor(border);
    const style = hasReactiveStyle
        ? computeStyle
        : computeStyle();
    const node = new Node({
        style,
        children,
        focusable,
        autoFocus,
        onKeyPress,
        onMousePress,
        onMouseRelease,
        onMouseMove,
        onScroll,
        onHover,
        onActivate,
        activate: onActivate
            ? () => {
                const event = { type: "activate", target: node };
                onActivate(event);
            }
            : undefined,
        _inheritableProps: {
            backgroundColor,
            borderColor,
            color,
            bold,
            dim,
            italic,
            underline,
            strikethrough,
            inverse,
        },
        render(bounds, buffer, inherited, clip) {
            if (!rectOverlaps(bounds, clip))
                return;
            const bg = resolveInheritable(backgroundColor, inherited.backgroundColor);
            const hasBg = bg !== inherited.backgroundColor;
            if (hasBg) {
                fillClippedRect(buffer, bounds, clip, DEFAULT_COLOR, bg, 0);
            }
            const borderFlags = getBorderFlags();
            const hasBorder = borderFlags.borderTop ||
                borderFlags.borderEnd ||
                borderFlags.borderBottom ||
                borderFlags.borderStart;
            if (hasBorder) {
                const fg = resolveInheritable(borderColor, inherited.borderColor);
                const styleName = getBorderStyleName(resolve(border), resolve(borderStyle));
                renderBorder(buffer, bounds, borderFlags, styleName, fg, bg, clip);
            }
        },
    });
    if (ref) {
        ref.current = node;
    }
    for (const child of children) {
        child._parent = node;
    }
    return node;
}
//# sourceMappingURL=Box.js.map