import { Node } from "../runtime/Node.ts";
/** Props for Show component. */
export interface ShowProps<T> {
    when: () => T;
    children: (value: T) => Node;
    fallback?: () => Node;
}
/**
 * Conditionally renders one of two branches based on a reactive condition.
 *
 * When the condition is truthy, renders the `children` branch with the truthy value.
 * When falsy, renders the `fallback` branch if provided, otherwise renders nothing.
 * Branch changes dispose the previous subtree and create a new one with proper
 * ownership tracking.
 *
 * Must be called within a mounted component context (inside mount()'s component
 * function or a child thereof) for proper effect ownership.
 */
export declare function Show<T>(props: ShowProps<T>): Node;
//# sourceMappingURL=Show.d.ts.map