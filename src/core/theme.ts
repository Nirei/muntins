// Theme system: generic infrastructure for JSON-based theming

import type { Color } from "./buffer.ts";
import { DEFAULT_COLOR } from "./buffer.ts";
import { createSignal, resolve } from "./signals.ts";

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

const NAMED_COLORS: Record<string, number> = {
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
export function parseColor(
  value: ColorString,
  tokens: Record<string, Color>,
): Color {
  if (value === "default") return DEFAULT_COLOR;

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
 * A theme. `tokens` holds named colors. Everything else is a style
 * slice keyed by BEM-like name (e.g. "switch", "select--trigger").
 */
export interface Theme {
  tokens: Record<string, Color>;
  [key: string]: Record<string, unknown>;
}

/**
 * Resolve a style object in place: parse color strings and token references.
 */
function resolveStyleObject(
  obj: Record<string, unknown>,
  tokens: Record<string, Color>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (COLOR_KEYS.has(key) && typeof value === "string") {
      resolved[key] = parseColor(value, tokens);
    } else if (typeof value === "string" && value.startsWith("$")) {
      resolved[key] = parseColor(value, tokens);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * Resolve a raw JSON theme: parse tokens, then resolve color strings
 * and token references in every style slice.
 */
export function resolveTheme(input: Record<string, unknown>): Theme {
  // Resolve tokens first
  const rawTokens = (input.tokens ?? {}) as Record<string, ColorString>;
  const tokens: Record<string, Color> = {};
  for (const [name, value] of Object.entries(rawTokens)) {
    tokens[name] = parseColor(value, tokens);
  }

  // Resolve every other key as a style slice
  const result: Theme = { tokens };
  for (const [key, value] of Object.entries(input)) {
    if (key === "tokens") continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = resolveStyleObject(
        value as Record<string, unknown>,
        tokens,
      );
    }
  }

  return result;
}

import defaultThemeJson from "../default-theme.json" with { type: "json" };

const [getTheme, setThemeSignal] = createSignal<Theme>(
  resolveTheme(defaultThemeJson),
);

/**
 * Read a style slice from the current theme.
 * Reactive — triggers re-render when theme changes.
 *
 * @param key - BEM-like key, e.g. "switch", "select--trigger"
 */
export function theme(key: string): Record<string, unknown> {
  return (getTheme()[key] as Record<string, unknown>) ?? {};
}

/**
 * Replace the current theme. Resolves color strings and token references.
 */
export function setTheme(input: Record<string, unknown>): void {
  setThemeSignal(resolveTheme(input));
}

/**
 * Standardized merge: creates an object with reactive getters for
 * each theme property. Instance style properties override theme values.
 * Multiple theme keys form a fallback chain (first key wins).
 *
 * Usage: `Box({ ...styleFallback(props.style, 'select--trigger', 'input'), children })`
 */
export function styleFallback(
  instanceStyle: Record<string, unknown> | undefined,
  ...themeKeys: (string | (() => string))[]
): Record<string, unknown> {
  // Create reactive slices for theme keys
  const slices = themeKeys.map((key) => () => getTheme()[resolve(key)] ?? {});

  // Collect all keys across all slices and instance style
  const allKeys = new Set<string>();
  if (instanceStyle) {
    for (const key of Object.keys(instanceStyle)) {
      allKeys.add(key);
    }
  }
  for (const slice of slices) {
    for (const key of Object.keys(slice())) {
      allKeys.add(key);
    }
  }

  const result: Record<string, unknown> = {};
  for (const key of allKeys) {
    if (instanceStyle?.[key] !== undefined) {
      result[key] = instanceStyle[key];
    } else {
      result[key] = () => {
        for (const slice of slices) {
          const val = slice()[key];
          if (val !== undefined) return val;
        }
        return undefined;
      };
    }
  }
  return result;
}
