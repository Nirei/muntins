// Label component - text label for form elements

import type { MouseEvent } from "../core/input.ts";
import type { FlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime.ts";
import { Box, Text, getActiveContext, useFocus } from "../core/runtime.ts";

/**
 * Props for the Label component.
 */
export interface LabelProps {
  /** Label text content */
  children: string | (() => string);

  /** Associated element ref - clicking label focuses and activates this element */
  for?: Ref;

  /** Style overrides for layout */
  style?: Partial<FlexStyle>;
}

/**
 * A text label for form elements, optionally associated with a focusable target.
 *
 * When `for` is provided and the label receives a mouse press, focus moves
 * to the referenced element and the element is activated (triggering its
 * onActivate handler). This enables labels to toggle checkboxes, switches,
 * and other activatable components. The label itself is not focusable.
 *
 * @example
 * ```typescript
 * const checkboxRef = createRef();
 *
 * Box({
 *   flexDirection: "row",
 *   gap: 1,
 *   children: [
 *     Checkbox({ ref: checkboxRef, checked, onChange }),
 *     Label({ children: "I agree", for: checkboxRef }),
 *   ],
 * });
 * ```
 */
export function Label(props: LabelProps): Node {
  const { children, for: forRef, style } = props;

  // Get focus controller to handle for association
  // Only available within mount context - outside context, for won't work but label still renders
  const ctx = getActiveContext();
  const focus = ctx ? useFocus() : undefined;

  const handleMousePress = forRef
    ? (_event: MouseEvent) => {
        focus?.set(forRef);
        forRef.current?.activate?.();
      }
    : undefined;

  // Wrap in Box if style overrides provided, otherwise just Text
  // Handler goes on the outermost element only to avoid double-firing
  if (style) {
    return Box({
      ...style,
      children: [Text({ content: children })],
      onMousePress: handleMousePress,
    });
  }

  return Text({
    content: children,
    onMousePress: handleMousePress,
  });
}
