import type { Buffer, InheritableColor } from "../buffer.ts";
import type { ActivateEvent, KeyEvent, MouseEvent, ScrollEvent } from "../input.ts";
import type { FlexStyle, LayoutNode, LayoutResult } from "../layout.ts";
import type { Rect, ScreenRect } from "../rects.ts";
import type { InheritableBool, InheritedStyle } from "../render.ts";
import type { Accessor } from "../signals.ts";
import type { VisualSegment } from "../text.ts";
/**
 * A mutable reference to a node.
 * Enables imperative access to nodes (for focus control).
 */
export interface Ref {
    current: Node | null;
}
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
export declare function createRef(ref?: Ref): Ref;
/**
 * Layout information for reactive layout access via refs.
 * All values are integers representing terminal cells.
 */
export interface LayoutInfo {
    x: number;
    y: number;
    width: number;
    height: number;
    screenX: number;
    screenY: number;
}
/**
 * Layout signals for reactive layout coordinates.
 * Created during node binding and updated on resize/relayout.
 */
export interface LayoutSignals {
    x: Accessor<number>;
    y: Accessor<number>;
    width: Accessor<number>;
    height: Accessor<number>;
    screenX: Accessor<number>;
    screenY: Accessor<number>;
    setLayout: (result: LayoutResult) => void;
}
export type InheritableProps = {
    backgroundColor?: InheritableColor | (() => InheritableColor);
    borderColor?: InheritableColor | (() => InheritableColor);
    color?: InheritableColor | (() => InheritableColor);
    bold?: InheritableBool | (() => InheritableBool);
    dim?: InheritableBool | (() => InheritableBool);
    italic?: InheritableBool | (() => InheritableBool);
    underline?: InheritableBool | (() => InheritableBool);
    strikethrough?: InheritableBool | (() => InheritableBool);
    inverse?: InheritableBool | (() => InheritableBool);
};
type MeasureFunction = (width: number, height: number) => {
    width: number;
    height: number;
};
type RenderFunction = (bounds: ScreenRect, buffer: Buffer, inherited: InheritedStyle, clip: Rect) => void;
export interface EventHandlerProps {
    onKeyPress?: (key: KeyEvent) => boolean | undefined;
    onMousePress?: (event: MouseEvent) => void;
    onMouseRelease?: (event: MouseEvent) => void;
    onMouseMove?: (event: MouseEvent) => void;
    onScroll?: (event: ScrollEvent) => void;
    onHover?: (hovering: boolean) => void;
    onActivate?: (event: ActivateEvent) => void;
}
/**
 * Constructor argument for Node.
 * Same shape as Node minus runtime-set fields (_parent, _layout) and methods.
 */
export interface NodeInit extends EventHandlerProps {
    style: FlexStyle | (() => FlexStyle);
    children?: Node[] | (() => Node[]);
    measure?: MeasureFunction;
    render?: RenderFunction;
    _inheritableProps?: InheritableProps;
    focusable?: boolean;
    autoFocus?: boolean;
    ref?: Ref;
    activate?: () => void;
}
/**
 * The central data structure representing a UI element.
 *
 * Nodes either have children (container) or measure/render (leaf like Text).
 * Components run once; signals handle updates.
 */
export declare class Node implements EventHandlerProps {
    style: FlexStyle | (() => FlexStyle);
    children?: Node[] | (() => Node[]);
    measure?: MeasureFunction;
    render?: RenderFunction;
    _inheritableProps?: InheritableProps;
    _parent?: Node;
    /**
     * Cached segmented text data for the last content that was measured.
     * Written by measure, read by render — avoids re-segmenting the same text.
     */
    _textSegments?: {
        sourceText: string;
        lines: VisualSegment[][];
    };
    focusable?: boolean;
    autoFocus?: boolean;
    ref?: Ref;
    onKeyPress?: (key: KeyEvent) => boolean | undefined;
    onMousePress?: (event: MouseEvent) => void;
    onMouseRelease?: (event: MouseEvent) => void;
    onMouseMove?: (event: MouseEvent) => void;
    onScroll?: (event: ScrollEvent) => void;
    onHover?: (hovering: boolean) => void;
    onActivate?: (event: ActivateEvent) => void;
    activate?: () => void;
    private _layoutGet;
    private _layoutSet;
    get _layout(): LayoutSignals | undefined;
    set _layout(value: LayoutSignals | undefined);
    constructor(init: NodeInit);
    /** Resolve reactive style getter to a concrete FlexStyle. */
    resolveStyle(): FlexStyle;
    /** Resolve children, handling both static arrays and reactive getters. */
    resolveChildren(): Node[];
    /**
     * Resolve inherited style by merging this node's inheritable props
     * with the parent's inherited style.
     */
    resolveInheritedStyle(parentStyle: InheritedStyle): InheritedStyle;
    /**
     * Build path from this node to root by following _parent pointers.
     * First element is this node, last is root.
     */
    pathToRoot(): Node[];
    /**
     * Check if this node is contained within a subtree.
     * Walks up the _parent chain looking for the subtree root.
     */
    isInSubtree(subtreeRoot: Node): boolean;
    /**
     * Convert to layout system's LayoutNode format.
     * Resolves reactive styles and recursively converts children.
     */
    toLayoutNode(): LayoutNode;
    /**
     * Flatten this node tree into a list, hoisting children of
     * `display: "contents"` nodes and skipping `display: "none"` nodes.
     */
    flatten(result?: Node[]): Node[];
    /** Clear layout signals for this node and its entire subtree. */
    clearLayoutSignals(): void;
    /**
     * Find the deepest node containing a point using screen coordinates.
     * Returns this node if the point is within bounds but no child matches.
     */
    hitTest(layout: LayoutResult, x: number, y: number): Node | null;
    private static hitTestChildren;
}
export {};
//# sourceMappingURL=Node.d.ts.map