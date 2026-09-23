import { type FocusScope } from "../runtime/FocusManager.ts";
import type { Node } from "../runtime/Node.ts";
/** Props for FocusScopeComponent */
export interface FocusScopeProps {
    trap?: boolean;
    children: Node[];
}
/**
 * Creates a focus scope node with the given box factory.
 * Shared implementation for FocusScopeComponent and TabFocus.
 */
export declare function createFocusScopeNode(props: {
    children: Node[];
    trap?: boolean;
}, boxFactory: (children: Node[], scope: FocusScope) => Node): Node;
/**
 * Creates a nested focus scope for organizing focusable elements.
 *
 * When `trap` is true, Tab/Shift+Tab navigation wraps within this scope
 * instead of escaping to the parent. Useful for modal dialogs.
 */
export declare function FocusScopeComponent(props: FocusScopeProps): Node;
//# sourceMappingURL=FocusScopeComponent.d.ts.map