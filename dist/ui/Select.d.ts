import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime/Node.ts";
import { type MaybeAccessor } from "../core/signals.ts";
/**
 * A single option in the Select dropdown.
 */
export interface SelectOption<T> {
    value: T;
    label: string;
}
/**
 * Props for the Select component.
 */
export interface SelectProps<T> {
    /** Currently selected value */
    value: MaybeAccessor<T>;
    /** Called when selection changes */
    onChange?: (value: T) => void;
    /** Available options */
    options: SelectOption<T>[];
    /** Placeholder when no value selected */
    placeholder?: MaybeAccessor<string>;
    /** Disable the select */
    disabled?: MaybeAccessor<boolean>;
    /** Focus control */
    focusable?: boolean;
    autoFocus?: boolean;
    ref?: Ref;
    /** Style overrides */
    style?: Partial<ReactiveFlexStyle>;
}
/**
 * A dropdown selection component for choosing one option from a list.
 *
 * Uses Popover for the floating dropdown.
 *
 * @example
 * ```typescript
 * const [country, setCountry] = createSignal("us");
 *
 * Select({
 *   value: country,
 *   onChange: setCountry,
 *   options: [
 *     { value: "us", label: "United States" },
 *     { value: "uk", label: "United Kingdom" },
 *   ],
 * });
 * ```
 */
export declare function Select<T>(props: SelectProps<T>): Node;
//# sourceMappingURL=Select.d.ts.map