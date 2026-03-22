import { App, type RuntimeContext } from "../runtime/App.ts";
import {
  FocusManager,
  type FocusScope,
  type NodeWithFocusScope,
} from "../runtime/FocusManager.ts";
import type { Node } from "../runtime/Node.ts";
import { Box } from "./Box.ts";

/** Props for FocusScopeComponent */
export interface FocusScopeProps {
  trap?: boolean;
  children: Node[];
}

/**
 * Creates a focus scope node with the given box factory.
 * Shared implementation for FocusScopeComponent and TabFocus.
 */
export function createFocusScopeNode(
  props: { children: Node[]; trap?: boolean },
  boxFactory: (children: Node[], scope: FocusScope) => Node,
): Node {
  const ctx = App.getContext();

  const scope: FocusScope = {
    parent: ctx.currentScope,
    focusableNodes: [],
    focusedIndex: -1,
    trap: props.trap ?? false,
  };

  const childCtx: RuntimeContext = {
    app: ctx.app,
    currentScope: scope,
  };

  const node = App.withContext(childCtx, () =>
    boxFactory(props.children, scope),
  );

  (node as NodeWithFocusScope)._focusScope = scope;
  FocusManager.collectFocusableInScope(node, scope);

  return node;
}

/**
 * Creates a nested focus scope for organizing focusable elements.
 *
 * When `trap` is true, Tab/Shift+Tab navigation wraps within this scope
 * instead of escaping to the parent. Useful for modal dialogs.
 */
export function FocusScopeComponent(props: FocusScopeProps): Node {
  return createFocusScopeNode(props, (children) => Box({ children }));
}
