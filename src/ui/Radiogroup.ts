// RadioGroup component - exclusive selection from a list of options

import type { KeyEvent, MouseEvent } from "../core/input.ts";
import type { FlexStyle, ReactiveFlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime.ts";
import { Box, Text } from "../core/runtime.ts";
import {
  type MaybeAccessor,
  createEffect,
  createSignal,
  resolve,
} from "../core/signals.ts";
import { styleFallback, theme } from "../core/theme.ts";

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
  selected: () => boolean;
  focused: () => boolean;
  disabled: () => boolean;
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
 * Default option renderer.
 * Renders as: ● Label (selected) or ○ Label (unselected)
 */
function defaultRenderOption<T>(props: RadioOptionRenderProps<T>): Node {
  return Box({
    flexDirection: "row",
    gap: 1,
    children: [
      Text({
        content: () => {
          const t = theme("radio-group");
          return props.selected()
            ? (t.selectedChar as string)
            : (t.unselectedChar as string);
        },
        ...styleFallback(undefined, () =>
          props.disabled() ? "radio-group--disabled" : "radio-group",
        ),
      }),
      Text({
        content: props.option.label,
        ...styleFallback(
          undefined,
          () =>
            props.disabled() ? "radio-group--disabled" : "radio-group--label",
          "radio-group",
        ),
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

  const handleOptionMousePress = (index: number) => (_event: MouseEvent) => {
    if (isDisabled()) return;
    selectIndex(index);
  };

  return Box({
    focusable: props.focusable ?? true,
    autoFocus: props.autoFocus,
    ref: props.ref,
    onKeyPress: handleKeyPress,
    ...styleFallback(props.style, "radio-group"),
    children: props.options.map((opt, index) =>
      Box({
        onMousePress: handleOptionMousePress(index),
        children: [
          defaultRenderOption({
            option: opt,
            selected: () => getValue() === opt.value,
            focused: () => focusedIndex() === index,
            disabled: isDisabled,
          }),
        ],
      }),
    ),
  });
}
