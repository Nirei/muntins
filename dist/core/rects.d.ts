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
export declare const DEFAULT_CLIP: Rect;
/**
 * Compute the overlapping region of two rects.
 * Returns a zero-area rect if there's no overlap.
 */
export declare function rectIntersection(a: Rect, b: Rect): Rect;
/**
 * Check if a point is within a rect.
 */
export declare function rectContains(rect: Rect, x: number, y: number): boolean;
/**
 * Check if a screen-positioned rect overlaps a rect.
 */
export declare function rectOverlaps(a: ScreenRect, b: Rect): boolean;
//# sourceMappingURL=rects.d.ts.map