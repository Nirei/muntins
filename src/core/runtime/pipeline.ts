import type { Buffer } from "../buffer.ts";
import { computeLayout } from "../layout.ts";
import type { ClipRect, InheritedStyle } from "../render.ts";
import { DEFAULT_INHERITED_STYLE, flushFrame } from "../render.ts";
import type { Accessor } from "../signals.ts";
import type { App } from "./App.ts";
import { bindNodes, updateAllLayoutSignals } from "./binding.ts";
import { paintTree } from "./paint.ts";
import { nodeToLayoutNode } from "./tree.ts";

/**
 * State for throttled buffer flushing.
 */
export interface FlushState {
  active: boolean;
  scheduled: boolean;
  lastFlushTime: number;
  timeout: ReturnType<typeof setTimeout> | null;
  buffer: Buffer;
  stdout: NodeJS.WriteStream;
  fpsLimit: number;
}

/**
 * Performs the actual buffer flush to terminal.
 * Recomputes layout, paints the full tree, then flushes.
 */
export function doFlush(app: App): void {
  const fs = app.flushState;
  if (!fs.active) return;
  fs.scheduled = false;
  fs.lastFlushTime = performance.now();

  if (fs.timeout) {
    clearTimeout(fs.timeout);
    fs.timeout = null;
  }

  const layoutNode = nodeToLayoutNode(app.root);
  const layoutResult = computeLayout(
    layoutNode,
    fs.stdout.columns,
    fs.stdout.rows,
  );
  app.layoutResult = layoutResult;

  updateAllLayoutSignals(app.root, layoutResult);

  fs.buffer.clear();

  const rootClip: ClipRect = {
    x: 0,
    y: 0,
    width: fs.stdout.columns,
    height: fs.stdout.rows,
  };
  paintTree(
    app.root,
    layoutResult,
    fs.buffer,
    DEFAULT_INHERITED_STYLE,
    rootClip,
    fs.stdout,
  );

  const output = fs.buffer.flush();
  if (output.length > 0) {
    flushFrame(fs.stdout, output);
  }
}

/**
 * Schedule a throttled flush to repaint the screen.
 */
export function scheduleFlush(app: App): void {
  const fs = app.flushState;
  if (fs.scheduled) return;
  fs.scheduled = true;

  const now = performance.now();
  const elapsed = now - fs.lastFlushTime;
  const frameInterval = fs.fpsLimit > 0 ? 1000 / fs.fpsLimit : 0;

  if (frameInterval === 0 || elapsed >= frameInterval) {
    queueMicrotask(() => doFlush(app));
  } else {
    const remaining = frameInterval - elapsed;
    fs.timeout = setTimeout(() => doFlush(app), remaining);
  }
}

/**
 * Performs relayout and binds any new nodes.
 */
export function doRelayout(app: App): void {
  app.relayoutScheduled = false;

  const { root, flushState } = app;
  const { stdout } = flushState;

  const layoutNode = nodeToLayoutNode(root);
  const layoutResult = computeLayout(layoutNode, stdout.columns, stdout.rows);
  app.layoutResult = layoutResult;

  updateAllLayoutSignals(root, layoutResult);

  const rootClipAccessor: Accessor<ClipRect> = () => ({
    x: 0,
    y: 0,
    width: stdout.columns,
    height: stdout.rows,
  });
  const rootInheritedAccessor: Accessor<InheritedStyle> = () =>
    DEFAULT_INHERITED_STYLE;

  bindNodes(
    root,
    layoutResult,
    rootInheritedAccessor,
    rootClipAccessor,
    true,
  );

  scheduleFlush(app);
}

/**
 * Schedule a relayout for when Show/For create new children.
 */
export function scheduleRelayout(app: App): void {
  if (app.relayoutScheduled) return;
  app.relayoutScheduled = true;

  queueMicrotask(() => doRelayout(app));
}
