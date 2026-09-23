import { type Buffer, type Color, type InheritableColor } from "./buffer.ts";
import { type Rect, type ScreenRect } from "./rects.ts";
import type { VisualLine, WrapMode } from "./text.ts";
/**
 * Inherited style values passed down through the node tree during paint.
 * All properties are resolved (no "inherit" values).
 */
export interface InheritedStyle {
    color: Color;
    backgroundColor: Color;
    borderColor: Color;
    bold: boolean;
    dim: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
    inverse: boolean;
}
/**
 * Default inherited style values.
 * Used at the root when no parent style exists.
 */
export declare const DEFAULT_INHERITED_STYLE: InheritedStyle;
/** Inheritable boolean value for text modifiers. */
export type InheritableBool = boolean | "inherit";
/**
 * Text styling properties (unresolved - may include "inherit").
 * Analogous to FlexStyle for layout, this defines the shape of text styling.
 */
export interface TextStyle {
    color: InheritableColor;
    backgroundColor: InheritableColor;
    bold: InheritableBool;
    dim: InheritableBool;
    italic: InheritableBool;
    underline: InheritableBool;
    strikethrough: InheritableBool;
    inverse: InheritableBool;
}
/**
 * TextStyle with reactive (getter function) support for all properties.
 * Analogous to ReactiveFlexStyle for layout.
 */
export type ReactiveTextStyle = {
    [K in keyof TextStyle]: TextStyle[K] | (() => TextStyle[K]);
};
/** A value that can be inherited from a parent. */
type Inheritable<T> = T | "inherit";
/**
 * Resolve an inheritable value (color or boolean).
 * Returns the inherited value if the prop is undefined or "inherit".
 */
export declare function resolveInheritable<T>(value: Inheritable<T> | (() => Inheritable<T>) | undefined, inherited: T): T;
/** Border style names. */
export type BorderStyleName = "single" | "round" | "double" | "bold" | "dashed" | "ascii";
/**
 * Border prop for BoxProps.
 * - boolean: true = 'single' on all sides
 * - BorderStyleName: style on all sides
 * - object: selective borders per side
 */
export type BorderProp = boolean | BorderStyleName | {
    top?: boolean;
    right?: boolean;
    bottom?: boolean;
    left?: boolean;
};
/**
 * Border character set for a style.
 */
interface BorderChars {
    tl: string;
    tr: string;
    bl: string;
    br: string;
    h: string;
    v: string;
}
/**
 * Border character sets for each style.
 */
export declare const BORDER_CHARS: Record<BorderStyleName, BorderChars>;
/**
 * Parse BorderProp into individual border flags for each side.
 */
export declare function parseBorderProp(border: BorderProp | undefined): {
    borderTop: boolean;
    borderEnd: boolean;
    borderBottom: boolean;
    borderStart: boolean;
};
/**
 * Determine the border style name from props.
 */
export declare function getBorderStyleName(border: BorderProp | undefined, borderStyle: BorderStyleName | undefined): BorderStyleName;
/**
 * Render border onto the buffer.
 * Uses correct corner logic: corners only render when both adjacent edges exist.
 */
export declare function renderBorder(buffer: Buffer, rect: ScreenRect, borders: {
    borderTop: boolean;
    borderEnd: boolean;
    borderBottom: boolean;
    borderStart: boolean;
}, styleName: BorderStyleName, fg: Color, bg: Color, clip: Rect): void;
/** Props for text rendering (subset of TextProps used by renderText). */
export interface TextRenderProps {
    color?: InheritableColor | (() => InheritableColor);
    backgroundColor?: InheritableColor | (() => InheritableColor);
    bold?: InheritableBool | (() => InheritableBool);
    dim?: InheritableBool | (() => InheritableBool);
    italic?: InheritableBool | (() => InheritableBool);
    underline?: InheritableBool | (() => InheritableBool);
    strikethrough?: InheritableBool | (() => InheritableBool);
    inverse?: InheritableBool | (() => InheritableBool);
    wrap?: WrapMode;
}
export declare function fillClippedRect(buffer: Buffer, rect: ScreenRect, clip: Rect, fg: Color, bg: Color, modifiers: number): void;
/**
 * Renders pre-laid-out visual lines into the buffer with styling.
 * Fills the entire area with background color first to clear any stale content.
 *
 * This is a pure painting function — all text segmentation and layout
 * (wrapping/truncation) must be done before calling this.
 */
export declare function renderText(buffer: Buffer, rect: ScreenRect, displayLines: readonly VisualLine[], props: TextRenderProps, inherited: InheritedStyle, clip: Rect): void;
/**
 * Enter TUI mode (display setup).
 *
 * Optionally enters alternate screen buffer, hides cursor, clears screen,
 * and moves cursor home.
 */
export declare function enterTuiMode(stdout: NodeJS.WriteStream, options: {
    alternateScreen: boolean;
}): void;
/**
 * Exit TUI mode (display teardown).
 *
 * Shows cursor and optionally exits alternate screen buffer.
 */
export declare function exitTuiMode(stdout: NodeJS.WriteStream, options: {
    alternateScreen: boolean;
}): void;
/**
 * Write frame content to stdout.
 *
 * The cursor is already hidden by enterTuiMode and restored by exitTuiMode,
 * so this function simply writes the content without cursor manipulation.
 * No-op for empty content.
 */
export declare function flushFrame(stdout: NodeJS.WriteStream, content: string): void;
export {};
//# sourceMappingURL=render.d.ts.map