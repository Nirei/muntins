// Public API exports

export { theme, setTheme, styleFallback } from "../core/theme.ts";

// Basic components
export { Label, type LabelProps } from "./Label.ts";
export { Button, type ButtonProps } from "./Button.ts";
export {
  Separator,
  type SeparatorProps,
  type SeparatorOrientation,
} from "./Separator.ts";

// Form controls
export { Switch, type SwitchProps } from "./Switch.ts";
export {
  RadioGroup,
  type RadioGroupProps,
  type RadioOption,
  type RadioOptionRenderProps,
} from "./Radiogroup.ts";
export { Input, type InputProps } from "./Input.ts";
export { Textarea, type TextareaProps } from "./Textarea.ts";
export {
  Select,
  type SelectProps,
  type SelectOption,
} from "./Select.ts";

// Feedback
export { Progress, type ProgressProps } from "./Progress.ts";
export { Spinner, type SpinnerProps, type SpinnerVariant } from "./Spinner.ts";
export { Toast, type ToastProps, type ToastPosition } from "./Toast.ts";

// Overlays
export { Dialog, type DialogProps } from "./Dialog.ts";
export {
  Popover,
  type PopoverProps,
  type PopoverPlacement,
} from "./Popover.ts";
export { Drawer, type DrawerProps, type DrawerSide } from "./Drawer.ts";

// Navigation
export {
  Menubar,
  type MenubarProps,
  type Menu,
  type MenuItem,
  type MenuSeparator,
  type MenuLabelRenderProps,
  type MenuItemRenderProps,
} from "./Menubar.ts";

// Layout
export { ScrollArea, type ScrollAreaProps } from "../core/components/ScrollArea.ts";
