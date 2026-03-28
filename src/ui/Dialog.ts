// Dialog component - modal overlay with focus trapping

import type { KeyEvent } from "../core/input.ts";
import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node } from "../core/runtime.ts";
import { Box, Portal, Show, TabFocus } from "../core/runtime.ts";
import { type MaybeAccessor, resolve } from "../core/signals.ts";
import { styleFallback } from "../core/theme.ts";

/**
 * Props for the Dialog component.
 */
export interface DialogProps {
  /** Whether the dialog is open */
  open: MaybeAccessor<boolean>;

  /** Called when dialog should close (Escape key) */
  onClose?: () => void;

  /** Dialog content */
  children: Node | Node[];

  /** Style overrides for the dialog container */
  style?: Partial<ReactiveFlexStyle>;
}

/**
 * A modal dialog that renders centered in the viewport via Portal.
 *
 * When open, the dialog traps focus within its content using TabFocus.
 * Pressing Escape calls onClose to dismiss the dialog.
 *
 * The dialog is intentionally unstyled - it renders its children with no default
 * border, padding, or colors. Use composition or style overrides to add visual styling.
 *
 * Note: The dialog does not render a backdrop. Users who want a backdrop should
 * compose it separately using Portal.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const [isOpen, setIsOpen] = createSignal(false);
 *
 * Dialog({
 *   open: isOpen,
 *   onClose: () => setIsOpen(false),
 *   children: [
 *     Text({ content: "Are you sure?" }),
 *     Box({
 *       flexDirection: "row",
 *       gap: 2,
 *       children: [
 *         Button({ children: "Cancel", onClick: () => setIsOpen(false) }),
 *         Button({ children: "OK", onClick: handleConfirm }),
 *       ],
 *     }),
 *   ],
 * });
 *
 * // With styling
 * Dialog({
 *   open: isOpen,
 *   onClose: () => setIsOpen(false),
 *   children: dialogContent,
 *   style: {
 *     border: "double",
 *     padding: 2,
 *     width: 40,
 *   },
 * });
 * ```
 */
export function Dialog(props: DialogProps): Node {
  const isOpen = () => resolve(props.open) ?? false;

  const handleKeyPress = (key: KeyEvent): boolean | undefined => {
    if (key.name === "escape") {
      props.onClose?.();
      return true;
    }
    return false;
  };

  return Show({
    when: isOpen,
    children: () =>
      Portal({
        children: [
          Box({
            position: "absolute",
            top: 0,
            start: 0,
            bottom: 0,
            end: 0,
            alignItems: "center",
            justifyContent: "center",
            children: [
              TabFocus({
                trap: true,
                children: [
                  Box({
                    focusable: true,
                    onKeyPress: handleKeyPress,
                    ...styleFallback(props.style, "dialog"),
                    children: props.children,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
  });
}
