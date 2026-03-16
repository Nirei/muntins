// RadioGroup component - exclusive selection from a list of options

import type { KeyEvent } from "../core/input.ts";
import type { FlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime.ts";
import { Box, Text } from "../core/runtime.ts";
import { createEffect, createSignal } from "../core/signals.ts";

/**
 * An option in a RadioGroup.
 */
export interface RadioOption<T> {
  value: T;
  label: string;
}

/**
 * Props for the default option renderer.
 */
export interface RadioOptionRenderProps<T> {
  option: RadioOption<T>;
  selected: boolean;
  focused: boolean;
  disabled: boolean;
}

/**
 * Props for the RadioGroup component.
 */
export interface RadioGroupProps<T> {
  /** Currently selected value */
  value: T | (() => T);

  /** Called when selection changes */
  onChange?: (value: T) => void;

  /** Available options */
  options: Array<RadioOption<T>>;

  /** Disable the entire group */
  disabled?: boolean | (() => boolean);

  /** Render function for option - controls all styling */
  renderOption?: (props: RadioOptionRenderProps<T>) => Node;

  /** Layout direction. Default: "column" */
  direction?: "row" | "column" | (() => "row" | "column");

  /** Focus control */
  focusable?: boolean;
  autoFocus?: boolean;
  ref?: Ref;

  /** Style overrides */
  style?: Partial<FlexStyle>;
}

/**
 * Resolve a value that may be static or a getter function.
 */
function resolve<T>(value: T | (() => T) | undefined): T | undefined {
  return typeof value === "function" ? (value as () => T)() : value;
}

/**
 * Default option renderer.
 * Renders as: ● Label (selected) or ○ Label (unselected)
 */
function defaultRenderOption<T>(props: RadioOptionRenderProps<T>): Node {
  return Box({
    flexDirection: "row",
    gap: 1,
    children: [
      Text({
        content: props.selected ? "●" : "○",
        dim: props.disabled,
      }),
      Text({
        content: props.option.label,
        dim: props.disabled,
      }),
    ],
  });
}

/**
 * A group of radio options for exclusive selection.
 *
 * Arrow keys navigate between options and select automatically on focus,
 * following standard radio group behavior. Home/End jump to first/last option.
 *
 * Renders as:
 * - Unchecked: `○` (U+25CB WHITE CIRCLE)
 * - Checked: `●` (U+25CF BLACK CIRCLE)
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
export function RadioGroup<T>(props: RadioGroupProps<T>): Node {
  const [focusedIndex, setFocusedIndex] = createSignal(0);

  const getValue = () => resolve(props.value);
  const isDisabled = () => resolve(props.disabled) ?? false;
  const getDirection = () => resolve(props.direction) ?? "column";

  const renderOption = props.renderOption ?? defaultRenderOption;

  // Sync focused index with selected value
  createEffect(() => {
    const val = getValue();
    const idx = props.options.findIndex((o) => o.value === val);
    if (idx !== -1) {
      setFocusedIndex(idx);
    }
  });

  const selectIndex = (index: number) => {
    const opt = props.options[index];
    if (opt) {
      setFocusedIndex(index);
      props.onChange?.(opt.value);
    }
  };

  const handleKeyPress = (key: KeyEvent): boolean | undefined => {
    if (isDisabled()) return false;

    const len = props.options.length;
    if (len === 0) return false;

    if (key.name === "up" || key.name === "left") {
      const newIndex = (focusedIndex() - 1 + len) % len;
      selectIndex(newIndex);
      return true;
    }
    if (key.name === "down" || key.name === "right") {
      const newIndex = (focusedIndex() + 1) % len;
      selectIndex(newIndex);
      return true;
    }
    if (key.name === "home") {
      selectIndex(0);
      return true;
    }
    if (key.name === "end") {
      selectIndex(len - 1);
      return true;
    }
    return false;
  };

  // Build children reactively by mapping over options
  const buildChildren = (): Node[] => {
    const currentValue = getValue();
    const disabled = isDisabled();
    const currentFocusedIndex = focusedIndex();

    return props.options.map((opt, index) =>
      renderOption({
        option: opt,
        selected: currentValue === opt.value,
        focused: currentFocusedIndex === index,
        disabled,
      }),
    );
  };

  const node: Node = {
    get style() {
      return {
        flexDirection: getDirection(),
        ...props.style,
      } as FlexStyle;
    },
    get children() {
      return buildChildren();
    },
    focusable: props.focusable ?? true,
    autoFocus: props.autoFocus,
    ref: props.ref,
    onKeyPress: handleKeyPress,
  };

  // Bind ref
  if (props.ref) {
    props.ref.current = node;
  }

  return node;
}
