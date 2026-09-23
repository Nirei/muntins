// Theme system: generic infrastructure for JSON-based theming
import { DEFAULT_COLOR } from "./buffer.js";
import { DEFAULT_FLEX_STYLE } from "./layout.js";
import { DEFAULT_INHERITED_STYLE } from "./render.js";
import { createSignal, resolve } from "./signals.js";
const STYLE_KEYS = [
    ...Object.keys(DEFAULT_FLEX_STYLE),
    ...Object.keys(DEFAULT_INHERITED_STYLE),
];
const NAMED_COLORS = {
    black: 0,
    red: 1,
    green: 2,
    yellow: 3,
    blue: 4,
    magenta: 5,
    cyan: 6,
    white: 7,
};
/** Known color property names that require parsing in theme values. */
const COLOR_KEYS = new Set(["color", "backgroundColor", "borderColor"]);
/**
 * Parse a compact color string into a Color object.
 * Token references ($name) are resolved against the provided tokens map.
 */
export function parseColor(value, tokens) {
    if (value === "default")
        return DEFAULT_COLOR;
    if (value.startsWith("$")) {
        const tokenName = value.slice(1);
        const resolved = tokens[tokenName];
        if (!resolved) {
            throw new Error(`Unknown theme token: "${tokenName}"`);
        }
        return resolved;
    }
    if (value.startsWith("#")) {
        const hex = value.slice(1);
        if (hex.length !== 6) {
            throw new Error(`Invalid hex color: "${value}"`);
        }
        return {
            type: "rgb",
            r: Number.parseInt(hex.slice(0, 2), 16),
            g: Number.parseInt(hex.slice(2, 4), 16),
            b: Number.parseInt(hex.slice(4, 6), 16),
        };
    }
    if (value.startsWith("palette:")) {
        const index = Number.parseInt(value.slice(8), 10);
        return { type: "palette", index };
    }
    if (value.startsWith("bright-")) {
        const name = value.slice(7);
        const index = NAMED_COLORS[name];
        if (index === undefined) {
            throw new Error(`Unknown bright color: "${value}"`);
        }
        return { type: "bright", index };
    }
    const namedIndex = NAMED_COLORS[value];
    if (namedIndex !== undefined) {
        return { type: "named", index: namedIndex };
    }
    throw new Error(`Unknown color format: "${value}"`);
}
/**
 * Resolve a style object in place: parse color strings and token references.
 */
function resolveStyleObject(obj, tokens) {
    const resolved = {};
    for (const [key, value] of Object.entries(obj)) {
        if (COLOR_KEYS.has(key) && typeof value === "string") {
            resolved[key] = parseColor(value, tokens);
        }
        else if (typeof value === "string" && value.startsWith("$")) {
            resolved[key] = parseColor(value, tokens);
        }
        else {
            resolved[key] = value;
        }
    }
    return resolved;
}
/**
 * Resolve a raw JSON theme: parse tokens, then resolve color strings
 * and token references in every style slice.
 */
export function resolveTheme(input) {
    // Resolve tokens first
    const rawTokens = (input.tokens ?? {});
    const tokens = {};
    for (const [name, value] of Object.entries(rawTokens)) {
        tokens[name] = parseColor(value, tokens);
    }
    // Resolve every other key as a style slice
    const result = { tokens };
    for (const [key, value] of Object.entries(input)) {
        if (key === "tokens")
            continue;
        if (value && typeof value === "object" && !Array.isArray(value)) {
            result[key] = resolveStyleObject(value, tokens);
        }
    }
    return result;
}
import defaultThemeJson from "../default-theme.json" with { type: "json" };
const [getTheme, setThemeSignal] = createSignal(resolveTheme(defaultThemeJson));
/**
 * Read a style slice from the current theme.
 * Reactive — triggers re-render when theme changes.
 *
 * @param key - BEM-like key, e.g. "switch", "select--trigger"
 */
export function theme(key) {
    return getTheme()[key] ?? {};
}
/**
 * Replace the current theme. Resolves color strings and token references.
 */
export function setTheme(input) {
    setThemeSignal(resolveTheme(input));
}
/**
 * Standardized merge: creates an object with reactive getters for
 * each theme property. Instance style properties override theme values.
 * Multiple theme keys form a fallback chain (first key wins).
 *
 * Usage: `Box({ ...styleFallback(props.style, 'select--trigger', 'input'), children })`
 */
export function styleFallback(instanceStyle, ...themeKeys) {
    const result = {};
    for (const key of STYLE_KEYS) {
        if (instanceStyle?.[key] !== undefined) {
            result[key] = instanceStyle[key];
        }
        else {
            result[key] = () => {
                for (const themeKey of themeKeys) {
                    const slice = getTheme()[resolve(themeKey)] ?? {};
                    const val = slice[key];
                    if (val !== undefined)
                        return val;
                }
                return undefined;
            };
        }
    }
    return result;
}
//# sourceMappingURL=theme.js.map