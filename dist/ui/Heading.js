import { Box } from "../core/components/Box.js";
import { Text } from "../core/components/Text.js";
import { resolve } from "../core/signals.js";
import { styleFallback } from "../core/theme.js";
/**
 * A section title, the terminal counterpart of an HTML heading.
 *
 * Levels 1 and 2 render a full-width bottom rule (like a setext heading);
 * levels 3-6 render styled text only. Styling comes from the theme slices
 * `heading--h1` … `heading--h6` with fallback to `heading` (bold by default).
 *
 * @example
 * ```typescript
 * Heading({ level: 1, children: "Installation" });
 * ```
 */
export function Heading(props) {
    const { level, children, style } = props;
    const getLevel = () => resolve(level);
    const hasRule = () => getLevel() <= 2;
    const themeStyle = styleFallback(style, () => `heading--h${getLevel()}`, "heading");
    const boxProps = {
        ...themeStyle,
        flexDirection: () => resolve(themeStyle.flexDirection) ?? "column",
        alignSelf: () => resolve(themeStyle.alignSelf) ?? "stretch",
        border: () => (hasRule() ? { bottom: true } : false),
        children: [
            Text({
                content: children,
                wrap: "word",
                ...themeStyle,
            }),
        ],
    };
    return Box(boxProps);
}
//# sourceMappingURL=Heading.js.map