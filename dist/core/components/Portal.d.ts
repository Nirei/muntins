import { Node } from "../runtime/Node.ts";
/** Props for Portal component. */
export interface PortalProps {
    /** Content to render at root level */
    children: Node | Node[];
}
/**
 * Renders children at the root of the render tree, regardless of where
 * the Portal appears in the component hierarchy.
 *
 * Portal's children are literally attached to root's children array.
 * The component tree reflects visual reality - portal children ARE root's
 * children, not descendants of Portal's logical position.
 *
 * Multiple Portals stack in document order (later Portals appear above earlier ones).
 * Portal children participate in focus management via root scope.
 */
export declare function Portal(props: PortalProps): Node;
//# sourceMappingURL=Portal.d.ts.map