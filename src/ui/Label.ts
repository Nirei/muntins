// Label component - text label for form elements

import { Text } from "../core/components/Text.ts";
import { useFocus } from "../core/components/useFocus.ts";
import type { MouseEvent } from "../core/input.ts";
import type { ReactiveTextStyle } from "../core/render.ts";
import { App } from "../core/runtime/App.ts";
import type { Node, Ref } from "../core/runtime/Node.ts";
import { createEffect, createSignal } from "../core/signals.ts";
import { styleFallback } from "../core/theme.ts";

/**
 * Props for the Label component.
 */
export interface LabelProps {
  /** Label text content */
  children: string | (() => string);

  /** Associated element ref - clicking label focuses and activates this element */
  for?: Ref;

  /** Text style overrides */
  style?: Partial<ReactiveTextStyle>;
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
 * const switchRef = createRef();
 *
 * Box({
 *   flexDirection: "row",
 *   gap: 1,
 *   children: [
 *     Switch({ ref: switchRef, checked, onChange }),
 *     Label({ children: "I agree", for: switchRef }),
 *   ],
 * });
 * ```
 */
export function Label(props: LabelProps): Node {
  const { children, for: forRef, style } = props;

  // Get focus controller to handle for association
  // Only available within mount context - outside context, for won't work but label still renders
  const focus = useFocus();

  // Sync with for focused
  const isFocused = () => focus.current() === forRef?.current;

  const handleMousePress = forRef
    ? (_event: MouseEvent) => {
        focus?.set(forRef);
        forRef.current?.activate?.();
      }
    : undefined;

  return Text({
    content: children,
    ...styleFallback(
      style,
      () => (isFocused() ? "label--focused" : ""),
      "label",
    ),
    onMousePress: handleMousePress,
  });
}
