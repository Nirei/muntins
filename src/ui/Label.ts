// Label component - text label for form elements

import { Text } from "../core/components/Text.ts";
import type { MouseEvent } from "../core/input.ts";
import type { ReactiveTextStyle } from "../core/render.ts";
import type { Node, Ref } from "../core/runtime/Node.ts";
import { getActiveContext } from "../core/runtime/context.ts";
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

  // Focus controller for the for association. Only available within a
  // mount context - outside one, for is inert but the label still renders.
  const activeContext = getActiveContext();
  const focus =
    activeContext === null
      ? null
      : activeContext.app.focus.createController(activeContext.currentScope);

  // Sync with for focused
  const isFocused = () => focus !== null && focus.current() === forRef?.current;

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
