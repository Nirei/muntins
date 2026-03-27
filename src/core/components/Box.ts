import {
  DEFAULT_COLOR
} from "../buffer.ts";
import type {
  ActivateEvent,
  KeyEvent,
  MouseEvent,
  ScrollEvent
} from "../input.ts";
import {
  DEFAULT_FLEX_STYLE,
  type FlexStyle,
  type ReactiveFlexStyle
} from "../layout.ts";
import {
  type BorderProp,
  type BorderStyleName,
  fillClippedRect,
  getBorderStyleName,
  parseBorderProp,
  renderBorder,
  resolveInheritable
} from "../render.ts";
import { type InheritableProps, Node, type EventHandlerProps, type Ref } from "../runtime/Node.ts";
import { resolve } from "../signals.ts";
import { Text } from "./Text.ts";

/** Child element that Box can accept - Node, string, or reactive string. */
export type BoxChild = Node | string | (() => string);

/** Props for Box component. */
export interface BoxProps extends Partial<ReactiveFlexStyle & InheritableProps & EventHandlerProps> {
  children?: BoxChild | BoxChild[];
  border?: BorderProp | (() => BorderProp);
  borderStyle?: BorderStyleName | (() => BorderStyleName);
  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;
}

/**
 * Creates a Box node - a layout container that supports reactive styles and event handlers.
 *
 * Box is the fundamental container primitive. When backgroundColor is set, Box renders
 * its background; when border is set, Box renders its border.
 * Size is determined by flexbox layout based on its children.
 */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function Box({
    children: childrenProp,
    backgroundColor,
    border,
    borderColor,
    borderStyle,
    color,
    bold,
    dim,
    italic,
    underline,
    strikethrough,
    inverse,
    focusable,
    autoFocus,
    ref,
    onKeyPress,
    onMousePress,
    onMouseRelease,
    onMouseMove,
    onScroll,
    onHover,
    onActivate,
    ...styleProps
  }: BoxProps): Node {

  const normalizeChild = (child: BoxChild): Node => {
    if (typeof child === "string") {
      return Text({ content: child });
    }
    if (typeof child === "function") {
      return Text({ content: child });
    }
    return child;
  };

  const children: Node[] = childrenProp
    ? Array.isArray(childrenProp)
      ? childrenProp.map(normalizeChild)
      : [normalizeChild(childrenProp)]
    : [];

  const getBorderFlags = () => {
    return parseBorderProp(resolve(border));
  };

  const node = new Node({
    style: () => {
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(styleProps)) {
        resolved[key] = resolve(value);
      }
      return {
        ...DEFAULT_FLEX_STYLE,
        ...compact(resolved),
        ...getBorderFlags(),
      } as FlexStyle;
    },
    children,
    focusable,
    autoFocus,
    onKeyPress,
    onMousePress,
    onMouseRelease,
    onMouseMove,
    onScroll,
    onHover,
    onActivate,
    activate: onActivate
      ? () => {
          const event: ActivateEvent = { type: "activate", target: node };
          onActivate(event);
        }
      : undefined,

    _inheritableProps: {
      backgroundColor,
      borderColor,
      color,
      bold,
      dim,
      italic,
      underline,
      strikethrough,
      inverse,
    },

    render(bounds, buffer, inherited, clip) {
      const { screenX: x, screenY: y, width, height } = bounds;
      if (
        x >= clip.x + clip.width ||
        x + width <= clip.x ||
        y >= clip.y + clip.height ||
        y + height <= clip.y
      ) {
        return;
      }

      const bg = resolveInheritable(
        backgroundColor,
        inherited.backgroundColor,
      );

      const hasBg = bg !== inherited.backgroundColor;
      if (hasBg) {
        fillClippedRect(buffer, bounds, clip, DEFAULT_COLOR, bg, 0);
      }

      const borderFlags = getBorderFlags();
      const hasBorder =
        borderFlags.borderTop ||
        borderFlags.borderEnd ||
        borderFlags.borderBottom ||
        borderFlags.borderStart;

      if (hasBorder) {
        const fg = resolveInheritable(borderColor, inherited.borderColor);
        const styleName = getBorderStyleName(
          resolve(border),
          resolve(borderStyle),
        );
        renderBorder(buffer, bounds, borderFlags, styleName, fg, bg, clip);
      }
    },
  });

  if (ref) {
    ref.current = node;
  }

  for (const child of children) {
    child._parent = node;
  }

  return node;
}