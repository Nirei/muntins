// Rectangle types and geometry utilities

/**
 * Axis-aligned rectangle: position + size.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Rectangle with absolute screen coordinates.
 */
export interface ScreenRect extends Rect {
  screenX: number;
  screenY: number;
}

/**
 * Default clip rect covering the full terminal.
 * Used when no parent clipping is in effect.
 */
export const DEFAULT_CLIP: Rect = {
  x: 0,
  y: 0,
  width: Number.POSITIVE_INFINITY,
  height: Number.POSITIVE_INFINITY,
};

/**
 * Compute the overlapping region of two rects.
 * Returns a zero-area rect if there's no overlap.
 */
export function rectIntersection(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

/**
 * Check if a point is within a rect.
 */
export function rectContains(rect: Rect, x: number, y: number): boolean {
  return (
    x >= rect.x &&
    x < rect.x + rect.width &&
    y >= rect.y &&
    y < rect.y + rect.height
  );
}

/**
 * Check if a screen-positioned rect overlaps a rect.
 */
export function rectOverlaps(a: ScreenRect, b: Rect): boolean {
  return (
    a.screenX < b.x + b.width &&
    a.screenX + a.width > b.x &&
    a.screenY < b.y + b.height &&
    a.screenY + a.height > b.y
  );
}
