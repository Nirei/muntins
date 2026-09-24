import { Box, type BoxChild } from "../core/components/Box.ts";
import { Text } from "../core/components/Text.ts";
import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor, resolve } from "../core/signals.ts";
import { styleFallback, theme } from "../core/theme.ts";

/** Task state for a list item marker (GFM task lists). */
export type ListItemTask = "checked" | "unchecked";

/** Props for the ListItem component. */
export interface ListItemProps {
  /** GFM task state: renders a checkbox marker instead of a bullet */
  task?: MaybeAccessor<ListItemTask | undefined>;

  /** Item content, laid out to the right of the marker */
  children: BoxChild | BoxChild[];

  /** Style overrides */
  style?: Partial<ReactiveFlexStyle>;
}

/** Props for the List component. */
export interface ListProps {
  /** Render an ordered list (numbered markers) instead of bullets */
  ordered?: MaybeAccessor<boolean | undefined>;

  /** Starting number for ordered lists. Default: 1 */
  start?: MaybeAccessor<number | undefined>;

  /** Vertical gap between items: 0 = tight list, 1 = loose list (default) */
  gap?: MaybeAccessor<number | undefined>;

  /** List items (usually `ListItem` nodes) */
  children: BoxChild | BoxChild[];

  /** Style overrides */
  style?: Partial<ReactiveFlexStyle>;
}

/**
 * Marker state shared between a ListItem and its containing ordered List.
 * The List overrides text/width so numbers right-align to the widest one.
 */
interface MarkerOverride {
  text: string | null;
  width: number | null;
}

interface ListMarkerTag {
  override: MarkerOverride;
  defaultText: () => string;
}

function bulletText(): string {
  const markers = (theme("list").markers as string[] | undefined) ?? [
    "•",
    "◦",
    "▪",
  ];
  return `${markers[0] ?? "•"} `;
}

function taskText(task: ListItemTask): string {
  const slice = theme("list--task-checked");
  const checked = (slice.checkedChar as string | undefined) ?? "☑";
  const unchecked = (slice.uncheckedChar as string | undefined) ?? "☐";
  return `${task === "checked" ? checked : unchecked} `;
}

function defaultMarkerText(getTask: () => ListItemTask | undefined): string {
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
function ListItem(props: ListItemProps): Node {
  const { children, style } = props;
  const getTask = () => resolve(props.task);

  const tag: ListMarkerTag = {
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
            color: () => (theme("list--marker").color as never) ?? "inherit",
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
  } as Parameters<typeof Box>[0]);

  // Tag the node so an ordered List can renumber it (internal convention)
  (node as Node & { _listMarker?: ListMarkerTag })._listMarker = tag;

  return node;
}

function markerOf(node: BoxChild): ListMarkerTag | undefined {
  if (typeof node !== "object" || node === null) return undefined;
  return (node as Node & { _listMarker?: ListMarkerTag })._listMarker;
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
export function List(props: ListProps): Node {
  const { children, style } = props;
  const isOrdered = () => resolve(props.ordered) ?? false;

  const themeStyle = styleFallback(style, "list");

  const buildChildren = (): BoxChild[] => {
    const items = (Array.isArray(children) ? children : [children]).slice();

    if (isOrdered()) {
      const start = resolve(props.start) ?? 1;
      const tagged = items.map((child) => markerOf(child));
      const width = String(start + items.length - 1).length + 2; // "N. "
      for (let i = 0; i < items.length; i++) {
        const marker = tagged[i];
        if (!marker) continue;
        const label = `${start + i}. `.padStart(width);
        marker.override.text = label;
        marker.override.width = width;
      }
    }

    return items;
  };

  const boxProps: Record<string, unknown> = {
    ...themeStyle,
    flexDirection: () => resolve(themeStyle.flexDirection) ?? "column",
    alignSelf: () => resolve(themeStyle.alignSelf) ?? "stretch",
    gap: () => resolve(props.gap) ?? resolve(themeStyle.gap as number) ?? 1,
    children: buildChildren(),
  };

  return Box(boxProps as Parameters<typeof Box>[0]);
}

export { ListItem };
