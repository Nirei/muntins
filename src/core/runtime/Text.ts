import type {
    Buffer
} from "../buffer.ts";
import type {
    ActivateEvent,
    KeyEvent,
    MouseEvent,
    ScrollEvent
} from "../input.ts";
import {
    DEFAULT_FLEX_STYLE
} from "../layout.ts";
import {
    type ClipRect,
    type InheritedStyle,
    type ReactiveTextStyle,
    renderText
} from "../render.ts";
import { App } from "./App.ts";
import {
    createEffect
} from "../signals.ts";
import { type WrapMode, measureText } from "../text.ts";
import { Node, type Ref } from "./Node.ts";

/** Props for Text component. */
export interface TextProps extends Partial<ReactiveTextStyle> {
  content: string | (() => string);
  wrap?: WrapMode | (() => WrapMode);
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
 * Creates a Text node - a leaf node that displays text content.
 *
 * Text is measured based on its content and renders text with styling.
 * Content and style props can be static values or reactive getters.
 */
export function Text(props: TextProps): Node {
  const {
    content,
    color,
    backgroundColor,
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
    wrap,
  } = props;

  const getContent = typeof content === "function" ? content : () => content;
  const getWrap = (): WrapMode =>
    (typeof wrap === "function" ? wrap() : wrap) ?? "wrap";

  const node = new Node({
    style: DEFAULT_FLEX_STYLE,
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
      color,
      backgroundColor,
      bold,
      dim,
      italic,
      underline,
      strikethrough,
      inverse,
    },

    measure(availableWidth: number, _availableHeight: number) {
      return measureText(getContent(), availableWidth, getWrap());
    },

    render(
      x: number,
      y: number,
      width: number,
      height: number,
      buffer: Buffer,
      inherited: InheritedStyle,
      clip: ClipRect,
    ) {
      renderText(
        buffer,
        x,
        y,
        width,
        height,
        getContent(),
        {
          color,
          backgroundColor,
          bold,
          dim,
          italic,
          underline,
          strikethrough,
          inverse,
          wrap: getWrap(),
        },
        inherited,
        clip,
      );
    },
  });

  if (ref) {
    ref.current = node;
  }

  // If content is reactive, track it and schedule flush when it changes
  if (typeof content === "function") {
    const ctx = App.getActiveContext();
    if (ctx) {
      createEffect(() => {
        getContent(); // Track the content signal
        ctx.app.scheduleFlush(); // Schedule repaint when it changes
      });
    }
  }

  return node;
}