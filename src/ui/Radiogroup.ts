// RadioGroup component - exclusive selection from a list of options

import { Box } from "../core/components/Box.ts";
import { For } from "../core/components/For.ts";
import { Text } from "../core/components/Text.ts";
import { useFocus } from "../core/components/useFocus.ts";
import type { KeyEvent, MouseEvent } from "../core/input.ts";
import type { ReactiveFlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime/Node.ts";
import { createRef } from "../core/runtime/Node.ts";
import {
  type Accessor,
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
          return props.highlighted()
            ? (t.selectedChar as string)
            : (t.unselectedChar as string);
        },
        ...styleFallback(
          undefined,
          () =>
            props.highlighted() && props.focused()
              ? "radio-group--focused"
              : "",
          () => (props.disabled() ? "radio-group--disabled" : ""),
          "radio-group",
        ),
      }),
      Text({
        content: props.option.label,
        ...styleFallback(
          undefined,
          () => (props.disabled() ? "radio-group--disabled" : ""),
          "radio-group--label",
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
  const [highlightedIndex, setHighlightedIndex] = createSignal(0);
  const ref = createRef(props.ref);
  const focus = useFocus();
  const focused = () => focus.current() === ref.current;

  const getValue = () => resolve(props.value);
  const isDisabled = () => resolve(props.disabled) ?? false;

  // Sync highlighted index with selected value
  createEffect(() => {
    const val = getValue();
    const idx = props.options.findIndex((o) => o.value === val);
    if (idx !== -1) {
      setHighlightedIndex(idx);
    }
  });

  const selectIndex = (index: number) => {
    const opt = props.options[index];
    if (opt) {
      setHighlightedIndex(index);
      props.onChange?.(opt.value);
    }
  };

  const handleKeyPress = (key: KeyEvent): boolean | undefined => {
    if (isDisabled()) return false;

    const len = props.options.length;
    if (len === 0) return false;

    if (key.name === "up" || key.name === "left") {
      const newIndex = (highlightedIndex() - 1 + len) % len;
      selectIndex(newIndex);
      return true;
    }
    if (key.name === "down" || key.name === "right") {
      const newIndex = (highlightedIndex() + 1) % len;
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
    ref: ref,
    onKeyPress: handleKeyPress,
    ...styleFallback(props.style, "radio-group"),
    children: For({
      each: props.options,
      render: (opt, index) =>
        Box({
          onMousePress: handleOptionMousePress(index()),
          children: [
            defaultRenderOption({
              option: opt(),
              focused,
              highlighted: () => highlightedIndex() === index(),
              disabled: isDisabled,
            }),
          ],
        }),
    }),
  });
}
