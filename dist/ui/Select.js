// Select component - dropdown selection control
import { Box } from "../core/components/Box.js";
import { For } from "../core/components/For.js";
import { Text } from "../core/components/Text.js";
import { useFocus } from "../core/components/useFocus.js";
import { createRef } from "../core/runtime/Node.js";
import { createSignal, resolve } from "../core/signals.js";
import { styleFallback, theme } from "../core/theme.js";
import { Popover } from "./Popover.js";
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
export function Select(props) {
    const [isOpen, setIsOpen] = createSignal(false);
    const [highlightedIndex, setHighlightedIndex] = createSignal(0);
    const ref = createRef(props.ref);
    const focus = useFocus();
    const isFocused = () => focus.current() === ref.current;
    const getValue = () => resolve(props.value);
    const isDisabled = () => resolve(props.disabled) ?? false;
    const getPlaceholder = () => resolve(props.placeholder) ?? "";
    const selectedLabel = () => {
        const val = getValue();
        const opt = props.options.find((o) => o.value === val);
        return opt?.label ?? getPlaceholder();
    };
    const handleKeyPress = (key) => {
        if (isDisabled())
            return false;
        if (!isOpen()) {
            if (key.name === "enter" || key.name === "space" || key.name === "down") {
                setIsOpen(true);
                const val = getValue();
                const idx = props.options.findIndex((o) => o.value === val);
                setHighlightedIndex(idx >= 0 ? idx : 0);
                return true;
            }
        }
        else {
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
    const handleTriggerMousePress = (_event) => {
        if (isDisabled())
            return;
        if (!isOpen()) {
            setIsOpen(true);
            const val = getValue();
            const idx = props.options.findIndex((o) => o.value === val);
            setHighlightedIndex(idx >= 0 ? idx : 0);
        }
    };
    const handleOptionMousePress = (index) => (_event) => {
        if (isDisabled())
            return;
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
        content: () => Box({
            flexDirection: "column",
            focusable: false,
            children: For({
                each: props.options,
                render: (opt, index) => {
                    const isHighlighted = () => highlightedIndex() === index();
                    return Box({
                        ...styleFallback(undefined, () => (isHighlighted() ? "select--dropdown--highlight" : ""), "select--dropdown"),
                        onMousePress: handleOptionMousePress(index()),
                        children: [Text({ content: opt().label })],
                    });
                },
            }),
        }),
        children: (anchorProps) => {
            const node = Box({
                ...styleFallback(props.style, () => (isFocused() ? "select--focused" : ""), "select--trigger", "input"),
                ref: anchorProps.ref,
                focusable: props.focusable ?? true,
                autoFocus: props.autoFocus,
                onKeyPress: handleKeyPress,
                onMousePress: handleTriggerMousePress,
                flexGrow: 1,
                flexDirection: "row",
                justifyContent: "space-between",
                children: [
                    Text({
                        ...styleFallback(undefined, () => isDisabled() ? "select--disabled" : ""),
                        content: selectedLabel,
                    }),
                    Text({
                        ...styleFallback(undefined, () => isDisabled() ? "select--disabled" : ""),
                        content: () => {
                            const t = theme("select--indicator");
                            return isOpen()
                                ? t.openChar
                                : t.closedChar;
                        },
                    }),
                ],
            });
            if (ref) {
                ref.current = node;
            }
            return node;
        },
    });
}
//# sourceMappingURL=Select.js.map