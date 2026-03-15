// Label component - text label for form elements

import type { MouseEvent } from "../core/input.ts";
import type { FlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime.ts";
import { Box, Text, useFocus } from "../core/runtime.ts";

/**
 * Props for the Label component.
 */
export interface LabelProps {
  /** Label text content */
  children: string | (() => string);

  /** Associated element ref - clicking label focuses this element */
  for?: Ref;

  /** Style overrides for layout */
  style?: Partial<FlexStyle>;
}

/**
 * A text label for form elements, optionally associated with a focusable target.
 *
 * When `htmlFor` is provided and the label receives a mouse press, focus moves
 * to the referenced element. The label itself is not focusable.
 *
 * @example
 * ```typescript
 * const inputRef = createRef();
 *
 * Box({
 *   flexDirection: "column",
 *   gap: 1,
 *   children: [
 *     Label({ children: "Username", htmlFor: inputRef }),
 *     Input({ ref: inputRef, value, onChange }),
 *   ],
 * });
 * ```
 */
export function Label(props: LabelProps): Node {
  const { children, for: forRef, style } = props;

  // Get focus controller to handle htmlFor association
  // This will throw if called outside mount context, which is expected
  let focus: ReturnType<typeof useFocus> | undefined;
  try {
    focus = useFocus();
  } catch {
    // Outside mount context - htmlFor won't work but label still renders
  }

  const handleMousePress = forRef
    ? (_event: MouseEvent) => {
        focus?.set(forRef);
      }
    : undefined;

  // Wrap in Box if style overrides provided, otherwise just Text
  const textNode = Text({
    content: children,
    onMousePress: handleMousePress,
  });

  if (style) {
    return Box({
      ...style,
      children: [textNode],
      onMousePress: handleMousePress,
    });
  }

  return textNode;
}
