import {
  Buffer,
  DEFAULT_COLOR,
  type InheritableColor,
  graphemes,
} from "../buffer.ts";
import type { FocusEvent, PasteEvent } from "../input.ts";
import {
  type ActivateEvent,
  type InputEvent,
  type KeyEvent,
  type KeyInput,
  type MouseEvent,
  type MouseInput,
  type ScrollEvent,
  type ScrollInput,
  createInputParser,
} from "../input.ts";
import {
  DEFAULT_FLEX_STYLE,
  type FlexStyle,
  type LayoutNode,
  type LayoutResult,
  type ReactiveFlexStyle,
  computeLayout,
} from "../layout.ts";
import {
  BORDER_CHARS,
  type BorderProp,
  type BorderStyleName,
  type ClipRect,
  DEFAULT_CLIP,
  DEFAULT_INHERITED_STYLE,
  type InheritableBool,
  type InheritedStyle,
  type ReactiveTextStyle,
  enterTuiMode,
  exitTuiMode,
  fillClippedRect,
  flushFrame,
  getBorderStyleName,
  intersectClipRect,
  isInClipRect,
  parseBorderProp,
  renderBorder,
  renderText,
  resolveInheritable,
} from "../render.ts";
import { batch } from "../signals.ts";
import {
  type Accessor,
  type Setter,
  createEffect,
  createRoot,
  createSignal,
  onCleanup,
} from "../signals.ts";
import { type WrapMode, measureText } from "../text.ts";
import { Node, type Ref } from "../runtime/Node.ts";
import { Text } from "./Text.ts";

/** Child element that Box can accept - Node, string, or reactive string. */
export type BoxChild = Node | string | (() => string);

/** Props for Box component. */
export interface BoxProps extends Partial<ReactiveFlexStyle> {
  children?: BoxChild | BoxChild[];
  backgroundColor?: InheritableColor | (() => InheritableColor);
  border?: BorderProp | (() => BorderProp);
  borderColor?: InheritableColor | (() => InheritableColor);
  borderStyle?: BorderStyleName | (() => BorderStyleName);
  color?: InheritableColor | (() => InheritableColor);
  bold?: InheritableBool | (() => InheritableBool);
  dim?: InheritableBool | (() => InheritableBool);
  italic?: InheritableBool | (() => InheritableBool);
  underline?: InheritableBool | (() => InheritableBool);
  strikethrough?: InheritableBool | (() => InheritableBool);
  inverse?: InheritableBool | (() => InheritableBool);
  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;
  onKeyPress?: (key: KeyEvent) => boolean | undefined;
  onMousePress?: (event: MouseEvent) => void;
  onMouseRelease?: (event: MouseEvent) => void;
  onMouseMove?: (event: MouseEvent) => void;
  onScroll?: (event: ScrollEvent) => void;
  onHover?: (hovering: boolean) => void;
  onActivate?: (event: ActivateEvent) => void;
}

/**
 * Creates a Box node - a layout container that supports reactive styles and event handlers.
 *
 * Box is the fundamental container primitive. When backgroundColor is set, Box renders
 * its background; when border is set, Box renders its border.
 * Size is determined by flexbox layout based on its children.
 */
export function Box(props: BoxProps): Node {
  const {
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
  } = props;

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
    const borderValue = typeof border === "function" ? border() : border;
    return parseBorderProp(borderValue);
  };

  const node = new Node({
    style: () => {
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(styleProps)) {
        resolved[key] =
          typeof value === "function" ? (value as () => unknown)() : value;
      }
      const borderFlags = getBorderFlags();
      return {
        ...DEFAULT_FLEX_STYLE,
        ...resolved,
        borderTop: borderFlags.top,
        borderEnd: borderFlags.end,
        borderBottom: borderFlags.bottom,
        borderStart: borderFlags.start,
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

    render:
      backgroundColor !== undefined || border !== undefined
        ? (x, y, width, height, buffer, inherited, clip) => {
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

            if (backgroundColor !== undefined) {
              fillClippedRect(buffer, x, y, width, height, clip, DEFAULT_COLOR, bg, 0);
            }

            const borderFlags = getBorderFlags();
            const hasBorder =
              borderFlags.top ||
              borderFlags.end ||
              borderFlags.bottom ||
              borderFlags.start;

            if (hasBorder) {
              const fg = resolveInheritable(borderColor, inherited.borderColor);
              const borderValue =
                typeof border === "function" ? border() : border;
              const borderStyleValue =
                typeof borderStyle === "function" ? borderStyle() : borderStyle;
              const styleName = getBorderStyleName(
                borderValue,
                borderStyleValue,
              );
              renderBorder(
                buffer,
                x,
                y,
                width,
                height,
                borderFlags,
                styleName,
                fg,
                bg,
                clip,
              );
            }
          }
        : undefined,
  });

  if (ref) {
    ref.current = node;
  }

  for (const child of children) {
    child._parent = node;
  }

  return node;
}