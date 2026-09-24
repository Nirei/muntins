import { Box } from "../core/components/Box.ts";
import { RichText } from "../core/components/RichText.ts";
import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime/Node.ts";
import { type MaybeAccessor, resolve } from "../core/signals.ts";
import { styleFallback } from "../core/theme.ts";

/** Props for the CodeBlock component. */
export interface CodeBlockProps {
  /** Preformatted source text. Newlines are preserved; lines never wrap. */
  content: MaybeAccessor<string>;

  /** Reserved for future syntax highlighting; not rendered yet. */
  language?: MaybeAccessor<string>;

  /** Style overrides */
  style?: Partial<ReactiveFlexStyle>;
}

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
export function CodeBlock(props: CodeBlockProps): Node {
  const { content, language, style } = props;
  void resolve(language); // reserved: future syntax highlighting

  const themeStyle = styleFallback(style, "code-block", "code");

  const boxProps: Record<string, unknown> = {
    ...themeStyle,
    flexDirection: () => resolve(themeStyle.flexDirection) ?? "column",
    alignSelf: () => resolve(themeStyle.alignSelf) ?? "stretch",
    paddingStart: () =>
      resolve(themeStyle.paddingStart as number | undefined) ?? 1,
    paddingEnd: () => resolve(themeStyle.paddingEnd as number | undefined) ?? 1,
    paddingTop: () => resolve(themeStyle.paddingTop as number | undefined) ?? 1,
    paddingBottom: () =>
      resolve(themeStyle.paddingBottom as number | undefined) ?? 1,
    children: [
      RichText({
        spans: () => [{ text: resolve(content) }],
        wrap: "none",
        ...themeStyle,
      }),
    ],
  };

  return Box(boxProps as Parameters<typeof Box>[0]);
}
