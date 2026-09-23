import { Buffer } from "../buffer.js";
import { computeLayout } from "../layout.js";
import { rectIntersection } from "../rects.js";
import { DEFAULT_INHERITED_STYLE, flushFrame } from "../render.js";
import { batch, createSignal } from "../signals.js";
/**
 * Owns the full render cycle: scheduling, layout computation, signal binding,
 * tree painting, and terminal flushing.
 *
 * Layout results are cached and reused when nothing has changed between
 * flushes. The cache is invalidated by any signal-driven scheduleFlush(),
 * structural changes (scheduleRelayout), and terminal resize.
 *
 * Created and owned by App. Dependencies injected via constructor.
 */
export class Renderer {
    buffer;
    layoutResult = null;
    stdout;
    fpsLimit;
    getRoot;
    active = true;
    scheduled = false;
    lastFlushTime = 0;
    timeout = null;
    needsRebind = false;
    layoutDirty = true;
    cachedLayout = null;
    cachedLayoutWidth = 0;
    cachedLayoutHeight = 0;
    constructor(stdout, fpsLimit, getRoot) {
        this.stdout = stdout;
        this.fpsLimit = fpsLimit;
        this.getRoot = getRoot;
        this.buffer = new Buffer(stdout.columns, stdout.rows);
    }
    /** Schedule a throttled flush to repaint the screen. */
    scheduleFlush() {
        this.layoutDirty = true;
        if (this.scheduled)
            return;
        this.scheduled = true;
        const now = performance.now();
        const elapsed = now - this.lastFlushTime;
        const frameInterval = this.fpsLimit > 0 ? 1000 / this.fpsLimit : 0;
        if (frameInterval === 0 || elapsed >= frameInterval) {
            queueMicrotask(() => this.doFlush());
        }
        else {
            const remaining = frameInterval - elapsed;
            this.timeout = setTimeout(() => this.doFlush(), remaining);
        }
    }
    /** Schedule a relayout for when Show/For create new children. */
    scheduleRelayout() {
        this.needsRebind = true;
        this.layoutDirty = true;
        this.scheduleFlush();
    }
    /** Perform an immediate flush (used for initial render). Forces layout recomputation. */
    flush() {
        this.layoutDirty = true;
        this.doFlush();
    }
    /**
     * Flush using cached layout if available (no forced recomputation).
     * Useful for scenarios where the caller knows layout hasn't changed.
     */
    renderFrame() {
        this.doFlush();
    }
    /** Initial layout computation and signal binding after tree construction. */
    bind(root) {
        this.buffer.clear();
        const layoutResult = this.computeFreshLayout(root);
        this.layoutResult = layoutResult;
        this.storeLayoutCache(layoutResult);
        const { clip, inherited } = this.createRootAccessors();
        this.bindNodes(root, layoutResult, inherited, clip);
    }
    /** Handle terminal resize: resize buffer and schedule a flush. */
    handleResize(width, height) {
        this.buffer.resize(width, height);
        this.layoutDirty = true;
        this.scheduleFlush();
    }
    /** Deactivate rendering and clear pending timeouts. */
    shutdown() {
        this.active = false;
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
    }
    computeFreshLayout(root) {
        const layoutNode = root.toLayoutNode();
        return computeLayout(layoutNode, this.stdout.columns, this.stdout.rows);
    }
    storeLayoutCache(result) {
        this.cachedLayout = result;
        this.cachedLayoutWidth = this.stdout.columns;
        this.cachedLayoutHeight = this.stdout.rows;
        this.layoutDirty = false;
    }
    layoutCacheHit() {
        return (!this.layoutDirty &&
            this.cachedLayout !== null &&
            this.cachedLayoutWidth === this.stdout.columns &&
            this.cachedLayoutHeight === this.stdout.rows);
    }
    createRootAccessors() {
        return {
            clip: () => ({
                x: 0,
                y: 0,
                width: this.stdout.columns,
                height: this.stdout.rows,
            }),
            inherited: () => DEFAULT_INHERITED_STYLE,
        };
    }
    doFlush() {
        if (!this.active)
            return;
        this.scheduled = false;
        this.lastFlushTime = performance.now();
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        const root = this.getRoot();
        let layoutResult;
        if (this.layoutCacheHit()) {
            layoutResult = this.cachedLayout;
        }
        else {
            layoutResult = this.computeFreshLayout(root);
            this.storeLayoutCache(layoutResult);
            this.updateAllLayoutSignals(root, layoutResult);
            if (this.needsRebind) {
                this.needsRebind = false;
                const { clip, inherited } = this.createRootAccessors();
                this.bindNodes(root, layoutResult, inherited, clip, true);
            }
        }
        this.layoutResult = layoutResult;
        this.buffer.clear();
        const rootClip = {
            x: 0,
            y: 0,
            width: this.stdout.columns,
            height: this.stdout.rows,
        };
        this.paintTree(root, layoutResult, rootClip);
        const output = this.buffer.flush();
        if (output.length > 0) {
            flushFrame(this.stdout, output);
        }
    }
    paintTree(root, layoutResult, clip) {
        const rootStyle = root.resolveStyle();
        if (rootStyle.display === "contents") {
            const wrapperInherited = root.resolveInheritedStyle(DEFAULT_INHERITED_STYLE);
            let childIndex = 0;
            for (const child of root.resolveChildren()) {
                childIndex += this.paintNode(child, layoutResult.children, childIndex, wrapperInherited, clip);
            }
            return;
        }
        this.paintNode(root, [layoutResult], 0, DEFAULT_INHERITED_STYLE, clip);
    }
    paintNode(node, layoutChildren, startIndex, inherited, clip) {
        const style = node.resolveStyle();
        if (style.display === "none") {
            return 1;
        }
        if (style.display === "contents") {
            const wrapperInherited = node.resolveInheritedStyle(inherited);
            let consumed = 0;
            for (const child of node.resolveChildren()) {
                consumed += this.paintNode(child, layoutChildren, startIndex + consumed, wrapperInherited, clip);
            }
            return consumed;
        }
        const layoutResult = layoutChildren[startIndex];
        if (!layoutResult)
            return 0;
        const nodeInherited = node.resolveInheritedStyle(inherited);
        if (node.render) {
            node.render(layoutResult, this.buffer, inherited, clip);
        }
        const childClip = style.overflow === "hidden"
            ? rectIntersection(clip, {
                x: layoutResult.screenX,
                y: layoutResult.screenY,
                width: layoutResult.width,
                height: layoutResult.height,
            })
            : clip;
        let childIndex = 0;
        for (const child of node.resolveChildren()) {
            childIndex += this.paintNode(child, layoutResult.children, childIndex, nodeInherited, childClip);
        }
        return 1;
    }
    createLayoutSignals() {
        const [x, setX] = createSignal(0);
        const [y, setY] = createSignal(0);
        const [width, setWidth] = createSignal(0);
        const [height, setHeight] = createSignal(0);
        const [screenX, setScreenX] = createSignal(0);
        const [screenY, setScreenY] = createSignal(0);
        return {
            x,
            y,
            width,
            height,
            screenX,
            screenY,
            setLayout(result) {
                batch(() => {
                    setX(result.x);
                    setY(result.y);
                    setWidth(result.width);
                    setHeight(result.height);
                    setScreenX(result.screenX);
                    setScreenY(result.screenY);
                });
            },
        };
    }
    bindNodes(root, layoutResult, rootInheritedAccessor, rootClipAccessor, onlyNew = false) {
        const bindableNodes = [];
        Renderer.flattenBindableNodes(root, rootInheritedAccessor, rootClipAccessor, bindableNodes);
        const layouts = [];
        Renderer.flattenLayoutResults(layoutResult, root, layouts);
        for (let i = 0; i < bindableNodes.length; i++) {
            const { node } = bindableNodes[i];
            if (onlyNew && node._layout)
                continue;
            if (!node._layout) {
                node._layout = this.createLayoutSignals();
            }
            node._layout.setLayout(layouts[i]);
        }
    }
    updateAllLayoutSignals(root, layoutResult) {
        const nodes = [];
        root.flatten(nodes);
        const layouts = [];
        Renderer.flattenLayoutResults(layoutResult, root, layouts);
        batch(() => {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (node._layout) {
                    node._layout.setLayout(layouts[i]);
                }
            }
        });
    }
    static flattenBindableNodes(node, inheritedAccessor, clipAccessor, result) {
        const style = node.resolveStyle();
        if (style.display === "none") {
            return;
        }
        if (style.display === "contents") {
            const wrapperInheritedAccessor = () => node.resolveInheritedStyle(inheritedAccessor());
            for (const child of node.resolveChildren()) {
                Renderer.flattenBindableNodes(child, wrapperInheritedAccessor, clipAccessor, result);
            }
            return;
        }
        result.push({ node, inheritedAccessor, clipAccessor });
        const childInheritedAccessor = () => node.resolveInheritedStyle(inheritedAccessor());
        const childClipAccessor = () => {
            const parentClip = clipAccessor();
            const s = node.resolveStyle();
            const layout = node._layout;
            if (s.overflow === "hidden" && layout) {
                return rectIntersection(parentClip, {
                    x: layout.screenX(),
                    y: layout.screenY(),
                    width: layout.width(),
                    height: layout.height(),
                });
            }
            return parentClip;
        };
        for (const child of node.resolveChildren()) {
            Renderer.flattenBindableNodes(child, childInheritedAccessor, childClipAccessor, result);
        }
    }
    static flattenLayoutResultsInner(node, layoutChildren, startIndex, result) {
        const style = node.resolveStyle();
        if (style.display === "none") {
            return 1;
        }
        if (style.display === "contents") {
            let consumed = 0;
            for (const child of node.resolveChildren()) {
                consumed += Renderer.flattenLayoutResultsInner(child, layoutChildren, startIndex + consumed, result);
            }
            return consumed;
        }
        const layout = layoutChildren[startIndex];
        if (!layout)
            return 0;
        result.push(layout);
        let childConsumed = 0;
        for (const child of node.resolveChildren()) {
            childConsumed += Renderer.flattenLayoutResultsInner(child, layout.children, childConsumed, result);
        }
        return 1;
    }
    static flattenLayoutResults(layoutResult, root, result) {
        const rootStyle = root.resolveStyle();
        if (rootStyle.display === "contents") {
            let consumed = 0;
            for (const child of root.resolveChildren()) {
                consumed += Renderer.flattenLayoutResultsInner(child, layoutResult.children, consumed, result);
            }
        }
        else {
            Renderer.flattenLayoutResultsInner(root, [layoutResult], 0, result);
        }
    }
}
//# sourceMappingURL=Renderer.js.map