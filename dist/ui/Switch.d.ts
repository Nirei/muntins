import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime/Node.ts";
import { type MaybeAccessor } from "../core/signals.ts";
/**
 * Props for the Switch component.
 */
export interface SwitchProps {
    /** Whether the switch is on */
    checked: MaybeAccessor<boolean>;
    /** Called when switch state changes */
    onChange?: (checked: boolean) => void;
    /** Disable the switch */
    disabled?: MaybeAccessor<boolean>;
    /** Focus control */
    focusable?: boolean;
    autoFocus?: boolean;
    ref?: Ref;
    /** Style overrides for layout */
    style?: Partial<ReactiveFlexStyle>;
}
/**
 * An on/off toggle control that renders as a 2-character track with a sliding indicator.
 *
 * The switch toggles on Enter or Space key press when focused.
 * When disabled, the switch is dimmed and does not respond to input.
 *
 * @example
 * ```typescript
 * const [darkMode, setDarkMode] = createSignal(false);
 *
 * Box({
 *   flexDirection: "row",
 *   gap: 1,
 *   children: [
 *     Label({ children: "Dark mode" }),
 *     Switch({
 *       checked: darkMode,
 *       onChange: setDarkMode,
 *     }),
 *   ],
 * });
 * ```
 */
export declare function Switch(props: SwitchProps): Node;
//# sourceMappingURL=Switch.d.ts.map