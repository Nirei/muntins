import type { Node } from "../runtime/Node.ts";
/** Props for TabFocus component */
export interface TabFocusProps {
    children: Node[];
    trap?: boolean;
}
/**
 * Convenience component that combines a FocusScope with Tab key handling.
 *
 * Wraps children in a focus scope and handles Tab/Shift+Tab to navigate
 * between focusable children.
 */
export declare function TabFocus(props: TabFocusProps): Node;
//# sourceMappingURL=TabFocus.d.ts.map