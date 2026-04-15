import type { ActivateEvent } from "../input.ts";
import { DEFAULT_FLEX_STYLE } from "../layout.ts";
import { type ReactiveTextStyle, renderText } from "../render.ts";
import { type EventHandlerProps, Node, type Ref } from "../runtime/Node.ts";
import { getActiveContext } from "../runtime/context.ts";
import { type MaybeAccessor, createEffect, resolve } from "../signals.ts";
import {
  type VisualLine,
  type WrapMode,
  layoutLineFromSegments,
  measureTextFromSegments,
  segmentText,
  truncateLineFromSegments,
} from "../text.ts";

/** Props for Text component. */
export interface TextProps
  extends Partial<ReactiveTextStyle & EventHandlerProps> {
  content: MaybeAccessor<string>;
  wrap?: MaybeAccessor<WrapMode>;
  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;
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

  const getContent = () => resolve(content);
  const getWrap = () => resolve(wrap) ?? "wrap";

  function ensureSegments(node: Node, text: string) {
    if (node._textSegments?.sourceText !== text) {
      node._textSegments = segmentText(text);
    }
    return node._textSegments.lines;
  }

  let displayLinesCache: {
    sourceText: string;
    width: number;
    wrapMode: WrapMode;
    lines: VisualLine[];
  } | null = null;

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
      const text = getContent();
      const wrapMode = getWrap();
      const segmentedLines = ensureSegments(node, text);
      return measureTextFromSegments(segmentedLines, availableWidth, wrapMode);
    },

    render(bounds, buffer, inherited, clip) {
      const text = getContent();
      const wrapMode = getWrap();
      const segmentedLines = ensureSegments(node, text);

      const cached = displayLinesCache;
      const lines =
        cached?.sourceText === text &&
        cached.width === bounds.width &&
        cached.wrapMode === wrapMode
          ? cached.lines
          : wrapMode === "wrap"
            ? segmentedLines.flatMap((line) =>
                layoutLineFromSegments(line, bounds.width),
              )
            : segmentedLines.map((line) =>
                truncateLineFromSegments(line, bounds.width, wrapMode),
              );

      displayLinesCache = {
        sourceText: text,
        width: bounds.width,
        wrapMode,
        lines,
      };
      renderText(
        buffer,
        bounds,
        lines,
        {
          color,
          backgroundColor,
          bold,
          dim,
          italic,
          underline,
          strikethrough,
          inverse,
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
    const ctx = getActiveContext();
    if (ctx) {
      createEffect(() => {
        getContent(); // Track the content signal
        ctx.app.scheduleFlush(); // Schedule repaint when it changes
      });
    }
  }

  return node;
}
