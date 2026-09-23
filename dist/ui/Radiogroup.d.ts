import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime/Node.ts";
import { type Accessor, type MaybeAccessor } from "../core/signals.ts";
/**
 * An option in a RadioGroup.
 */
export interface RadioOption<T> {
    value: T;
    label: string;
}
/**
 * Props for the option renderer.
 * Boolean values are accessors to support reactivity.
 */
export interface RadioOptionRenderProps<T> {
    option: RadioOption<T>;
    highlighted: Accessor<boolean>;
    disabled: Accessor<boolean>;
    focused: Accessor<boolean>;
}
/**
 * Props for the RadioGroup component.
 */
export interface RadioGroupProps<T> {
    /** Currently selected value */
    value: MaybeAccessor<T>;
    /** Called when selection changes */
    onChange?: (value: T) => void;
    /** Available options */
    options: Array<RadioOption<T>>;
    /** Disable the entire group */
    disabled?: MaybeAccessor<boolean>;
    /** Focus control */
    focusable?: boolean;
    autoFocus?: boolean;
    ref?: Ref;
    /** Style overrides */
    style?: Partial<ReactiveFlexStyle>;
}
/**
 * A group of radio options for exclusive selection.
 *
 * Arrow keys navigate between options and select automatically on focus,
 * following standard radio group behavior. Home/End jump to first/last option.
 *
 * The default layout is column (vertical). Use `direction: "row"` for horizontal.
 * When disabled, all options are dimmed and input is ignored.
 *
 * @example
 * ```typescript
 * const [size, setSize] = createSignal("medium");
 *
 * RadioGroup({
 *   value: size,
 *   onChange: setSize,
 *   options: [
 *     { value: "small", label: "Small" },
 *     { value: "medium", label: "Medium" },
 *     { value: "large", label: "Large" },
 *   ],
 * });
 * ```
 */
export declare function RadioGroup<T>(props: RadioGroupProps<T>): Node;
//# sourceMappingURL=Radiogroup.d.ts.map