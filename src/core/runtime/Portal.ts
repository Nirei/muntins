import { DEFAULT_FLEX_STYLE } from "../layout.ts";
import { onCleanup } from "../signals.ts";
import { getActiveContext } from "./App.ts";
import type { Node } from "./Node.ts";

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
export function Portal(props: PortalProps): Node {
  const ctx = getActiveContext();
  const app = ctx?.app;
  const children = Array.isArray(props.children)
    ? props.children
    : [props.children];

  const root = app?.root;

  if (root) {
    // Root exists - attach children immediately (dynamic portal via Show/For)
    if (!root.children) root.children = [];
    root.children.push(...children);
    for (const child of children) {
      child._parent = root;
    }
    app?.scheduleRelayout();
  } else if (app) {
    // Initial mount - queue for later attachment
    app.pendingPortalAttachments.push(children);
  }

  onCleanup(() => {
    const currentRoot = app?.root;
    if (currentRoot?.children) {
      currentRoot.children = currentRoot.children.filter(
        (c) => !children.includes(c),
      );
      app?.scheduleRelayout();
    }
  });

  // Return invisible placeholder
  return { style: { ...DEFAULT_FLEX_STYLE, display: "none" } };
}