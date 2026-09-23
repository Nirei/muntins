import { resolveInheritable } from "../render.js";
import { createSignal, resolve } from "../signals.js";
/**
 * Create a mutable reference to a node.
 *
 * Refs are bound during node creation by Box/Text components.
 * When a node is disposed (e.g., via Show/For), the ref still holds
 * the stale reference. Users should check node validity before use,
 * or set ref.current = null in an onCleanup callback if needed.
 *
 * Allows passing another ref, in which case, it will passthrough.
 * This provides ergonomics for Components that need to capture their
 * parent's ref.
 */
export function createRef(ref) {
    return ref ?? { current: null };
}
/**
 * The central data structure representing a UI element.
 *
 * Nodes either have children (container) or measure/render (leaf like Text).
 * Components run once; signals handle updates.
 */
export class Node {
    style;
    children;
    measure;
    render;
    _inheritableProps;
    _parent;
    /**
     * Cached segmented text data for the last content that was measured.
     * Written by measure, read by render — avoids re-segmenting the same text.
     */
    _textSegments;
    focusable;
    autoFocus;
    ref;
    onKeyPress;
    onMousePress;
    onMouseRelease;
    onMouseMove;
    onScroll;
    onHover;
    onActivate;
    activate;
    _layoutGet;
    _layoutSet;
    get _layout() {
        return this._layoutGet();
    }
    set _layout(value) {
        this._layoutSet(value);
    }
    constructor(init) {
        const [get, set] = createSignal(undefined);
        this._layoutGet = get;
        this._layoutSet = set;
        Object.assign(this, init);
    }
    /** Resolve reactive style getter to a concrete FlexStyle. */
    resolveStyle() {
        return resolve(this.style);
    }
    /** Resolve children, handling both static arrays and reactive getters. */
    resolveChildren() {
        return typeof this.children === "function"
            ? this.children()
            : (this.children ?? []);
    }
    /**
     * Resolve inherited style by merging this node's inheritable props
     * with the parent's inherited style.
     */
    resolveInheritedStyle(parentStyle) {
        const props = this._inheritableProps;
        if (!props) {
            return parentStyle;
        }
        return {
            color: resolveInheritable(props.color, parentStyle.color),
            backgroundColor: resolveInheritable(props.backgroundColor, parentStyle.backgroundColor),
            borderColor: resolveInheritable(props.borderColor, parentStyle.borderColor),
            bold: resolveInheritable(props.bold, parentStyle.bold),
            dim: resolveInheritable(props.dim, parentStyle.dim),
            italic: resolveInheritable(props.italic, parentStyle.italic),
            underline: resolveInheritable(props.underline, parentStyle.underline),
            strikethrough: resolveInheritable(props.strikethrough, parentStyle.strikethrough),
            inverse: resolveInheritable(props.inverse, parentStyle.inverse),
        };
    }
    /**
     * Build path from this node to root by following _parent pointers.
     * First element is this node, last is root.
     */
    pathToRoot() {
        const path = [];
        let current = this;
        while (current) {
            path.push(current);
            current = current._parent;
        }
        return path;
    }
    /**
     * Check if this node is contained within a subtree.
     * Walks up the _parent chain looking for the subtree root.
     */
    isInSubtree(subtreeRoot) {
        let current = this;
        while (current) {
            if (current === subtreeRoot)
                return true;
            current = current._parent;
        }
        return false;
    }
    /**
     * Convert to layout system's LayoutNode format.
     * Resolves reactive styles and recursively converts children.
     */
    toLayoutNode() {
        const style = this.resolveStyle();
        const children = this.resolveChildren();
        return {
            style,
            children: children.map((child) => child.toLayoutNode()),
            measure: this.measure,
        };
    }
    /**
     * Flatten this node tree into a list, hoisting children of
     * `display: "contents"` nodes and skipping `display: "none"` nodes.
     */
    flatten(result) {
        const nodes = result ?? [];
        const style = this.resolveStyle();
        if (style.display === "none")
            return nodes;
        if (style.display === "contents") {
            for (const child of this.resolveChildren()) {
                child.flatten(nodes);
            }
            return nodes;
        }
        nodes.push(this);
        for (const child of this.resolveChildren()) {
            child.flatten(nodes);
        }
        return nodes;
    }
    /** Clear layout signals for this node and its entire subtree. */
    clearLayoutSignals() {
        this._layout = undefined;
        for (const child of this.resolveChildren()) {
            child.clearLayoutSignals();
        }
    }
    /**
     * Find the deepest node containing a point using screen coordinates.
     * Returns this node if the point is within bounds but no child matches.
     */
    hitTest(layout, x, y) {
        const { screenX, screenY, width, height } = layout;
        if (x < screenX ||
            x >= screenX + width ||
            y < screenY ||
            y >= screenY + height) {
            return null;
        }
        const children = this.resolveChildren();
        const childLayouts = layout.children ?? [];
        const { hit } = Node.hitTestChildren(children, childLayouts, 0, x, y);
        return hit ?? this;
    }
    static hitTestChildren(children, layoutChildren, startIndex, x, y) {
        let consumed = 0;
        let lastHit = null;
        for (const child of children) {
            const childStyle = child.resolveStyle();
            if (childStyle.display === "none") {
                consumed++;
                continue;
            }
            if (childStyle.display === "contents") {
                const grandchildren = child.resolveChildren();
                const result = Node.hitTestChildren(grandchildren, layoutChildren, startIndex + consumed, x, y);
                consumed += result.consumed;
                if (result.hit) {
                    lastHit = result.hit;
                }
                continue;
            }
            const childLayout = layoutChildren[startIndex + consumed];
            consumed++;
            if (!childLayout)
                continue;
            const hit = child.hitTest(childLayout, x, y);
            if (hit) {
                lastHit = hit;
            }
        }
        return { hit: lastHit, consumed };
    }
}
//# sourceMappingURL=Node.js.map