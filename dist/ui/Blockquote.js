import { Box } from "../core/components/Box.js";
import { resolve } from "../core/signals.js";
import { styleFallback } from "../core/theme.js";
/**
 * A quotation block with a vertical bar on its start edge and inner padding.
 *
 * Nesting is plain composition: put a `Blockquote` inside a `Blockquote`.
 * The bar color and inner text color come from the `blockquote` theme slice.
 * Standalone use: callouts and asides.
 *
 * @example
 * ```typescript
 * Blockquote({ children: Text({ content: "Famous words." }) });
 * ```
 */
export function Blockquote(props) {
    const { children, style } = props;
    const themeStyle = styleFallback(style, "blockquote");
    const boxProps = {
        ...themeStyle,
        flexDirection: () => resolve(themeStyle.flexDirection) ?? "column",
        alignSelf: () => resolve(themeStyle.alignSelf) ?? "stretch",
        border: () => ({ left: true }),
        paddingStart: () => resolve(themeStyle.paddingStart) ?? 1,
        paddingBottom: () => resolve(themeStyle.paddingBottom) ?? 0,
        paddingTop: () => resolve(themeStyle.paddingTop) ?? 0,
        children,
    };
    return Box(boxProps);
}
//# sourceMappingURL=Blockquote.js.map