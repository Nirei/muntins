import { Buffer } from "../buffer.ts";
import { type LayoutResult } from "../layout.ts";
import type { Node } from "./Node.ts";
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
export declare class Renderer {
    readonly buffer: Buffer;
    layoutResult: LayoutResult | null;
    private readonly stdout;
    private readonly fpsLimit;
    private readonly getRoot;
    private active;
    private scheduled;
    private lastFlushTime;
    private timeout;
    private needsRebind;
    private layoutDirty;
    private cachedLayout;
    private cachedLayoutWidth;
    private cachedLayoutHeight;
    constructor(stdout: NodeJS.WriteStream, fpsLimit: number, getRoot: () => Node);
    /** Schedule a throttled flush to repaint the screen. */
    scheduleFlush(): void;
    /** Schedule a relayout for when Show/For create new children. */
    scheduleRelayout(): void;
    /** Perform an immediate flush (used for initial render). Forces layout recomputation. */
    flush(): void;
    /**
     * Flush using cached layout if available (no forced recomputation).
     * Useful for scenarios where the caller knows layout hasn't changed.
     */
    renderFrame(): void;
    /** Initial layout computation and signal binding after tree construction. */
    bind(root: Node): void;
    /** Handle terminal resize: resize buffer and schedule a flush. */
    handleResize(width: number, height: number): void;
    /** Deactivate rendering and clear pending timeouts. */
    shutdown(): void;
    private computeFreshLayout;
    private storeLayoutCache;
    private layoutCacheHit;
    private createRootAccessors;
    private doFlush;
    private paintTree;
    private paintNode;
    private createLayoutSignals;
    private bindNodes;
    private updateAllLayoutSignals;
    private static flattenBindableNodes;
    private static flattenLayoutResultsInner;
    private static flattenLayoutResults;
}
//# sourceMappingURL=Renderer.d.ts.map