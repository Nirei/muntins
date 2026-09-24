import { Box } from "../core/components/Box.js";
import { Text } from "../core/components/Text.js";
import { resolve } from "../core/signals.js";
import { styleFallback, theme } from "../core/theme.js";
function bulletText() {
    const markers = theme("list").markers ?? [
        "•",
        "◦",
        "▪",
    ];
    return `${markers[0] ?? "•"} `;
}
function taskText(task) {
    const slice = theme("list--task-checked");
    const checked = slice.checkedChar ?? "☑";
    const unchecked = slice.uncheckedChar ?? "☐";
    return `${task === "checked" ? checked : unchecked} `;
}
function defaultMarkerText(getTask) {
    const task = getTask();
    return task === undefined ? bulletText() : taskText(task);
}
/**
 * A single list item: a fixed-width marker column (bullet, task checkbox,
 * or a number injected by an ordered `List`) followed by the item content.
 *
 * Standalone ListItems render a bullet marker. Inside an ordered `List`,
 * the List replaces the marker with a right-aligned number.
 */
function ListItem(props) {
    const { children, style } = props;
    const getTask = () => resolve(props.task);
    const tag = {
        override: { text: null, width: null },
        defaultText: () => defaultMarkerText(getTask),
    };
    const themeStyle = styleFallback(style, "list--item");
    const node = Box({
        alignItems: "flex-start",
        ...themeStyle,
        flexDirection: () => resolve(themeStyle.flexDirection) ?? "row",
        children: [
            Box({
                width: () => tag.override.width ?? tag.defaultText().length,
                flexShrink: 0,
                children: [
                    Text({
                        content: () => tag.override.text ?? tag.defaultText(),
                        color: () => theme("list--marker").color ?? "inherit",
                        wrap: "none",
                    }),
                ],
            }),
            Box({
                flexDirection: "column",
                flexShrink: 1,
                children,
            }),
        ],
    });
    // Tag the node so an ordered List can renumber it (internal convention)
    node._listMarker = tag;
    return node;
}
function markerOf(node) {
    if (typeof node !== "object" || node === null)
        return undefined;
    return node._listMarker;
}
/**
 * An unordered or ordered list of `ListItem`s (or arbitrary nodes).
 *
 * Unordered items keep their bullet (or task checkbox) markers. Ordered
 * lists replace each direct ListItem's marker with a number, right-aligned
 * to the widest number in the list (`" 9. "` / `"10. "`). `gap: 0` renders
 * a tight list; the default gap of 1 renders a loose one.
 *
 * @example
 * ```typescript
 * List({
 *   children: [
 *     ListItem({ children: "First" }),
 *     ListItem({ task: "checked", children: "Done" }),
 *   ],
 * });
 * ```
 */
export function List(props) {
    const { children, style } = props;
    const isOrdered = () => resolve(props.ordered) ?? false;
    const themeStyle = styleFallback(style, "list");
    const buildChildren = () => {
        const items = (Array.isArray(children) ? children : [children]).slice();
        if (isOrdered()) {
            const start = resolve(props.start) ?? 1;
            const tagged = items.map((child) => markerOf(child));
            const width = String(start + items.length - 1).length + 2; // "N. "
            for (let i = 0; i < items.length; i++) {
                const marker = tagged[i];
                if (!marker)
                    continue;
                const label = `${start + i}. `.padStart(width);
                marker.override.text = label;
                marker.override.width = width;
            }
        }
        return items;
    };
    const boxProps = {
        ...themeStyle,
        flexDirection: () => resolve(themeStyle.flexDirection) ?? "column",
        alignSelf: () => resolve(themeStyle.alignSelf) ?? "stretch",
        gap: () => resolve(props.gap) ?? resolve(themeStyle.gap) ?? 1,
        children: buildChildren(),
    };
    return Box(boxProps);
}
export { ListItem };
//# sourceMappingURL=List.js.map