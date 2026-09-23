// Popover component - floating panel anchored to a trigger element
import { Box } from "../core/components/Box.js";
import { Portal } from "../core/components/Portal.js";
import { Show } from "../core/components/Show.js";
import { createRef } from "../core/runtime/Node.js";
import { getActiveContext } from "../core/runtime/context.js";
import { resolve } from "../core/signals.js";
import { styleFallback } from "../core/theme.js";
function searchChildren(targetNode, children, childLayouts, layout) {
    let layoutIndex = 0;
    for (const child of children) {
        const childStyle = typeof child.style === "function" ? child.style() : child.style;
        if (childStyle.display === "contents") {
            const result = findNodeLayout(targetNode, child, {
                ...layout,
                children: childLayouts.slice(layoutIndex),
            });
            if (result)
                return result;
            const grandchildren = typeof child.children === "function"
                ? child.children()
                : (child.children ?? []);
            layoutIndex += countLayoutNodes(grandchildren);
        }
        else {
            const childLayout = childLayouts[layoutIndex];
            if (childLayout) {
                const result = findNodeLayout(targetNode, child, childLayout);
                if (result)
                    return result;
            }
            layoutIndex++;
        }
    }
    return undefined;
}
/**
 * Find the layout result for a specific node by traversing both trees in parallel.
 * Returns undefined if the node is not found or if layout hasn't been computed yet.
 */
function findNodeLayout(targetNode, node, layout) {
    if (node === targetNode) {
        return layout;
    }
    const children = typeof node.children === "function"
        ? node.children()
        : (node.children ?? []);
    const childLayouts = layout.children ?? [];
    return searchChildren(targetNode, children, childLayouts, layout);
}
/**
 * Count how many layout nodes a subtree produces (excluding display: "contents" wrappers).
 */
function countLayoutNodes(nodes) {
    let count = 0;
    for (const node of nodes) {
        const style = typeof node.style === "function" ? node.style() : node.style;
        if (style.display === "contents") {
            const children = typeof node.children === "function"
                ? node.children()
                : (node.children ?? []);
            count += countLayoutNodes(children);
        }
        else {
            count++;
        }
    }
    return count;
}
/**
 * Compute the intrinsic (content-based) size of a node.
 * For leaf nodes with measure(), returns the measured size.
 * For containers, recursively computes based on children.
 */
function computeIntrinsicSize(node, layout) {
    if (node.measure) {
        return node.measure(layout.width, layout.height);
    }
    const children = typeof node.children === "function"
        ? node.children()
        : (node.children ?? []);
    const childLayouts = layout.children ?? [];
    if (children.length === 0) {
        return { width: layout.width, height: layout.height };
    }
    const style = typeof node.style === "function" ? node.style() : node.style;
    const isRow = style.flexDirection === "row";
    let width = 0;
    let height = 0;
    let layoutIndex = 0;
    for (const child of children) {
        const childStyle = typeof child.style === "function" ? child.style() : child.style;
        if (childStyle.display === "none")
            continue;
        if (childStyle.position === "absolute")
            continue;
        const childLayout = childLayouts[layoutIndex];
        if (!childLayout) {
            layoutIndex++;
            continue;
        }
        const childSize = computeIntrinsicSize(child, childLayout);
        if (isRow) {
            width += childSize.width;
            height = Math.max(height, childSize.height);
        }
        else {
            width = Math.max(width, childSize.width);
            height += childSize.height;
        }
        layoutIndex++;
    }
    const paddingH = (style.paddingStart ?? 0) + (style.paddingEnd ?? 0);
    const paddingV = (style.paddingTop ?? 0) + (style.paddingBottom ?? 0);
    const borderH = (style.borderStart ? 1 : 0) + (style.borderEnd ? 1 : 0);
    const borderV = (style.borderTop ? 1 : 0) + (style.borderBottom ? 1 : 0);
    return {
        width: width + paddingH + borderH,
        height: height + paddingV + borderV,
    };
}
/**
 * Get the screen position and size of a node from the current layout.
 * Returns the node's screen position and intrinsic (content-based) size.
 * Returns undefined if the node is not found or layout hasn't been computed.
 */
function getNodePosition(ctx, node) {
    const { app } = ctx;
    if (!app.layoutResult)
        return undefined;
    const layout = findNodeLayout(node, app.root, app.layoutResult);
    if (!layout)
        return undefined;
    const intrinsicSize = computeIntrinsicSize(node, layout);
    return {
        screenX: layout.screenX,
        screenY: layout.screenY,
        width: intrinsicSize.width,
        height: intrinsicSize.height,
    };
}
/**
 * Calculate position for the popover based on anchor position and placement.
 */
function calculatePosition(anchor, placement) {
    const { screenX, screenY, width, height } = anchor;
    switch (placement) {
        case "bottom-start":
        case "bottom":
        case "bottom-end":
            return { top: screenY + height, start: screenX };
        case "top-start":
        case "top":
        case "top-end":
            return { top: screenY - 1, start: screenX };
        case "left-start":
        case "left":
        case "left-end":
            return { top: screenY, start: screenX - 1 };
        case "right-start":
        case "right":
        case "right-end":
            return { top: screenY, start: screenX + width };
        default:
            return { top: screenY + height, start: screenX };
    }
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
export function Popover(props) {
    const anchorRef = createRef();
    const isOpen = () => resolve(props.open) ?? false;
    const getPlacement = () => resolve(props.placement) ?? "bottom-start";
    const ctx = getActiveContext();
    const handleKeyPress = (key) => {
        if (key.name === "escape") {
            props.onClose?.();
            return true;
        }
        return false;
    };
    const getPositionStyle = () => {
        if (!ctx || !anchorRef.current) {
            return { top: 0, start: 0 };
        }
        const anchorPos = getNodePosition(ctx, anchorRef.current);
        if (!anchorPos) {
            return { top: 0, start: 0 };
        }
        return calculatePosition(anchorPos, getPlacement());
    };
    const trigger = props.children({ ref: anchorRef });
    return Box({
        display: "contents",
        children: [
            trigger,
            Show({
                when: isOpen,
                children: () => Portal({
                    children: [
                        Box({
                            position: "absolute",
                            top: 0,
                            start: 0,
                            bottom: 0,
                            end: 0,
                            onMousePress: () => props.onClose?.(),
                            children: [
                                Box({
                                    ...styleFallback(props.style, "popover"),
                                    position: "absolute",
                                    top: () => getPositionStyle().top,
                                    start: () => getPositionStyle().start,
                                    onKeyPress: handleKeyPress,
                                    onMousePress: () => { },
                                    focusable: true,
                                    children: props.content(),
                                }),
                            ],
                        }),
                    ],
                }),
            }),
        ],
    });
}
//# sourceMappingURL=Popover.js.map