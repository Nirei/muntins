// Select component - dropdown selection control

import type { KeyEvent, MouseEvent } from "../core/input.ts";
import type { FlexStyle } from "../core/layout.ts";
import type { Node, Ref } from "../core/runtime.ts";
import { Box, Text } from "../core/runtime.ts";
import { type MaybeAccessor, createSignal, resolve } from "../core/signals.ts";
import { Popover } from "./Popover.ts";

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
  style?: Partial<FlexStyle>;
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
export function Select<T>(props: SelectProps<T>): Node {
  const [isOpen, setIsOpen] = createSignal(false);
  const [highlightedIndex, setHighlightedIndex] = createSignal(0);

  const getValue = () => resolve(props.value);
  const isDisabled = () => resolve(props.disabled) ?? false;
  const getPlaceholder = () => resolve(props.placeholder) ?? "";

  const selectedLabel = (): string => {
    const val = getValue();
    const opt = props.options.find((o) => o.value === val);
    return opt?.label ?? getPlaceholder();
  };

  const handleKeyPress = (key: KeyEvent): boolean | undefined => {
    if (isDisabled()) return false;

    if (!isOpen()) {
      if (key.name === "enter" || key.name === "space" || key.name === "down") {
        setIsOpen(true);
        const val = getValue();
        const idx = props.options.findIndex((o) => o.value === val);
        setHighlightedIndex(idx >= 0 ? idx : 0);
        return true;
      }
    } else {
      if (key.name === "escape") {
        setIsOpen(false);
        return true;
      }
      if (key.name === "up") {
        setHighlightedIndex((i) => Math.max(0, i - 1));
        return true;
      }
      if (key.name === "down") {
        setHighlightedIndex((i) => Math.min(props.options.length - 1, i + 1));
        return true;
      }
      if (key.name === "home") {
        setHighlightedIndex(0);
        return true;
      }
      if (key.name === "end") {
        setHighlightedIndex(props.options.length - 1);
        return true;
      }
      if (key.name === "enter" || key.name === "space") {
        const opt = props.options[highlightedIndex()];
        if (opt) {
          props.onChange?.(opt.value);
        }
        setIsOpen(false);
        return true;
      }
    }
    return false;
  };

  const handleTriggerMousePress = (_event: MouseEvent): void => {
    if (isDisabled()) return;
    if (!isOpen()) {
      setIsOpen(true);
      const val = getValue();
      const idx = props.options.findIndex((o) => o.value === val);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    }
  };

  const handleOptionMousePress = (index: number) => (_event: MouseEvent) => {
    if (isDisabled()) return;
    const opt = props.options[index];
    if (opt) {
      props.onChange?.(opt.value);
    }
    setIsOpen(false);
  };

  return Popover({
    open: isOpen,
    onClose: () => setIsOpen(false),
    placement: "bottom-start",
    content: () =>
      Box({
        flexDirection: "column",
        backgroundColor: { type: "default" },
        paddingStart: 2,
        paddingEnd: 1,
        focusable: false,
        children: props.options.map((opt, index) =>
          Box({
            onMousePress: handleOptionMousePress(index),
            children: [
              Text({ content: opt.label }),
            ],
          }),
        ),
      }),
    children: (anchorProps) => {
      const node = Box({
        ref: anchorProps.ref,
        focusable: props.focusable ?? true,
        autoFocus: props.autoFocus,
        onKeyPress: handleKeyPress,
        onMousePress: handleTriggerMousePress,
        flexGrow: 1,
        flexDirection: "row",
        justifyContent: "space-between",
        border: "single",
        paddingStart: 1,
        paddingEnd: 1,
        ...props.style,
        children: [
          Text({ content: selectedLabel, dim: isDisabled }),
          Text({ content: () => (isOpen() ? "▲" : "▼"), dim: isDisabled }),
        ],
      });

      if (props.ref) {
        props.ref.current = node;
      }

      return node;
    },
  });
}
