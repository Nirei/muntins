import { Box } from "../core/components/Box.js";
import { RichText } from "../core/components/RichText.js";
import { resolve } from "../core/signals.js";
import { styleFallback } from "../core/theme.js";
/**
 * A preformatted code block.
 *
 * Content is rendered verbatim with `wrap: "none"` — lines keep their
 * leading whitespace and are never wrapped or truncated; the intrinsic
 * width is the widest line, and callers clip via overflow. Background
 * and border colors come from the `code-block` theme slice.
 *
 * @example
 * ```typescript
 * CodeBlock({ content: "npm install muntins", language: "sh" });
 * ```
 */
export function CodeBlock(props) {
    const { content, language, style } = props;
    void resolve(language); // reserved: future syntax highlighting
    const themeStyle = styleFallback(style, "code-block", "code");
    const boxProps = {
        ...themeStyle,
        flexDirection: () => resolve(themeStyle.flexDirection) ?? "column",
        alignSelf: () => resolve(themeStyle.alignSelf) ?? "stretch",
        paddingStart: () => resolve(themeStyle.paddingStart) ?? 1,
        paddingEnd: () => resolve(themeStyle.paddingEnd) ?? 1,
        paddingTop: () => resolve(themeStyle.paddingTop) ?? 1,
        paddingBottom: () => resolve(themeStyle.paddingBottom) ?? 1,
        children: [
            RichText({
                spans: () => [{ text: resolve(content) }],
                wrap: "none",
                ...themeStyle,
            }),
        ],
    };
    return Box(boxProps);
}
//# sourceMappingURL=CodeBlock.js.map