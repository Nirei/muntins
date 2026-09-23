import { DEFAULT_FLEX_STYLE } from "../layout.js";
import { Node } from "../runtime/Node.js";
import { getActiveContext } from "../runtime/context.js";
import { onCleanup } from "../signals.js";
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
export function Portal(props) {
    const ctx = getActiveContext();
    const app = ctx?.app;
    const children = Array.isArray(props.children)
        ? props.children
        : [props.children];
    const root = app?.root;
    if (root) {
        // Root exists - attach children immediately (dynamic portal via Show/For)
        // Root's children is always a static array (created by Box)
        const rootChildren = root.children ?? [];
        if (!root.children)
            root.children = rootChildren;
        rootChildren.push(...children);
        for (const child of children) {
            child._parent = root;
            // Register focusables here: Show/For walk the returned placeholder
            // node, which has no children, so they cannot see the portaled nodes
            app?.focus.registerSubtreeFocusables(child);
        }
        app?.scheduleRelayout();
    }
    else if (app) {
        // Initial mount - queue for later attachment. Focus registration is
        // not needed here: App attaches these before focus.initialize(root),
        // which collects them as part of the root subtree.
        app.pendingPortalAttachments.push(children);
    }
    onCleanup(() => {
        const currentRoot = app?.root;
        if (currentRoot?.children) {
            // Clean up focus and hover state for the portaled subtree: the
            // owning Show/For only walks the placeholder, not these children
            for (const child of children) {
                app?.cleanupSubtreeState(child);
            }
            currentRoot.children = currentRoot.children.filter((c) => !children.includes(c));
            app?.scheduleRelayout();
        }
    });
    // Return invisible placeholder
    return new Node({ style: { ...DEFAULT_FLEX_STYLE, display: "none" } });
}
//# sourceMappingURL=Portal.js.map