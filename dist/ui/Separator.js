// Separator component - visual divider for content
import { Box } from "../core/components/Box.js";
import { resolve } from "../core/signals.js";
import { styleFallback } from "../core/theme.js";
/**
 * A visual divider that separates content.
 *
 * Renders as a horizontal or vertical line using box drawing characters.
 * The separator fills available space in the appropriate direction:
 * - Horizontal: fills width, height is 1
 * - Vertical: fills height, width is 1
 *
 * Not focusable (purely decorative).
 */
export function Separator(props) {
    const { orientation, style } = props;
    const getOrientation = () => resolve(orientation) ?? "horizontal";
    const isHorizontal = () => getOrientation() === "horizontal";
    // styleFallback emits an entry for every style key, so spreading it after
    // our own props would clobber them with theme getters. Resolve through it
    // instead: instance style > theme > component default.
    const themeStyle = styleFallback(style, "separator");
    // Build props as Record so Box resolves functions at runtime
    const boxProps = {
        // Use a single border edge to create the line
        border: () => (isHorizontal() ? { top: true } : { left: true }),
        ...themeStyle,
        // Horizontal: width is 'auto' (fills via stretch), fixed height of 1
        // Vertical: fixed width of 1, height is 'auto' (fills via stretch)
        alignSelf: () => resolve(themeStyle.alignSelf) ?? "stretch",
        width: () => resolve(themeStyle.width) ?? (isHorizontal() ? "auto" : 1),
        height: () => resolve(themeStyle.height) ?? (isHorizontal() ? 1 : "auto"),
    };
    return Box(boxProps);
}
//# sourceMappingURL=Separator.js.map