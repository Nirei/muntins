import type { Color } from "./buffer.ts";
/**
 * Compact color string for JSON theme files.
 *
 * Supported formats:
 * - `"default"` → terminal default
 * - `"red"`, `"green"`, etc. → named (8 standard colors)
 * - `"bright-red"`, etc. → bright variants
 * - `"palette:N"` → 256-color palette
 * - `"#rrggbb"` → true color (24-bit)
 * - `"$tokenName"` → resolved from tokens
 */
export type ColorString = string;
/**
 * Parse a compact color string into a Color object.
 * Token references ($name) are resolved against the provided tokens map.
 */
export declare function parseColor(value: ColorString, tokens: Record<string, Color>): Color;
/**
 * A theme. `tokens` holds named colors. Everything else is a style
 * slice keyed by BEM-like name (e.g. "switch", "select--trigger").
 */
export interface Theme {
    tokens: Record<string, Color>;
    [key: string]: Record<string, unknown>;
}
/**
 * Resolve a raw JSON theme: parse tokens, then resolve color strings
 * and token references in every style slice.
 */
export declare function resolveTheme(input: Record<string, unknown>): Theme;
/**
 * Read a style slice from the current theme.
 * Reactive — triggers re-render when theme changes.
 *
 * @param key - BEM-like key, e.g. "switch", "select--trigger"
 */
export declare function theme(key: string): Record<string, unknown>;
/**
 * Replace the current theme. Resolves color strings and token references.
 */
export declare function setTheme(input: Record<string, unknown>): void;
/**
 * Standardized merge: creates an object with reactive getters for
 * each theme property. Instance style properties override theme values.
 * Multiple theme keys form a fallback chain (first key wins).
 *
 * Usage: `Box({ ...styleFallback(props.style, 'select--trigger', 'input'), children })`
 */
export declare function styleFallback(instanceStyle: Record<string, unknown> | undefined, ...themeKeys: (string | (() => string))[]): Record<string, unknown>;
//# sourceMappingURL=theme.d.ts.map