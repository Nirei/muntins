import type { Accessor } from "../signals.ts";
import {
  type App,
  type FocusScope,
  type RuntimeContext,
  getContext,
  withContext,
} from "./App.ts";
import { Box } from "./Box.ts";
import type { Node, Ref } from "./Node.ts";
import { isNodeInSubtree, resolveNodeChildren } from "./tree.ts";

/** Internal type for nodes that may have a focus scope attached */
interface NodeWithFocusScope extends Node {
  _focusScope?: FocusScope;
}

/**
 * Controller for programmatic focus management within a scope.
 */
export interface FocusController {
  next(): void;
  prev(): void;
  set(ref: Ref): void;
  /** Returns a reactive accessor for the currently focused node. */
  current: Accessor<Node | null>;
}

/**
 * Collect focusable nodes into a scope via depth-first traversal.
 * Stops at nested FocusScope boundaries (nodes with _focusScope set to a different scope).
 */
export function collectFocusableInScope(node: Node, scope: FocusScope): void {
  const nodeScope = (node as NodeWithFocusScope)._focusScope;
  if (nodeScope && nodeScope !== scope) {
    return;
  }

  if (node.focusable) {
    scope.focusableNodes.push(node);
  }

  for (const child of resolveNodeChildren(node)) {
    collectFocusableInScope(child, scope);
  }
}

/**
 * Find the focus scope that should contain a node by walking up the tree.
 * Returns the first scope encountered, or the root scope if none found.
 */
function findParentScope(app: App, node: Node): FocusScope {
  let current: Node | undefined = node._parent;

  while (current) {
    const nodeScope = (current as NodeWithFocusScope)._focusScope;
    if (nodeScope) {
      return nodeScope;
    }
    current = current._parent;
  }

  return app.rootScope;
}

/**
 * Register focusable nodes from a newly created subtree into the appropriate scope.
 * Called when Show/For creates new child nodes.
 */
export function registerSubtreeFocusables(
  app: App,
  subtreeRoot: Node,
): void {
  const scope = findParentScope(app, subtreeRoot);
  collectFocusableInScope(subtreeRoot, scope);
}

/**
 * Unregister all focusable nodes from a subtree being disposed.
 * Removes nodes from their containing scope's focusableNodes array.
 */
export function unregisterSubtreeFocusables(
  app: App,
  subtreeRoot: Node,
): void {
  const scope = findParentScope(app, subtreeRoot);

  const nodesToRemove: Node[] = [];
  collectFocusableInScope(subtreeRoot, {
    parent: null,
    focusableNodes: nodesToRemove,
    focusedIndex: -1,
    trap: false,
  });

  for (const node of nodesToRemove) {
    const index = scope.focusableNodes.indexOf(node);
    if (index !== -1) {
      scope.focusableNodes.splice(index, 1);
      if (scope.focusedIndex > index) {
        scope.focusedIndex--;
      } else if (scope.focusedIndex === index) {
        scope.focusedIndex = -1;
      }
    }
  }
}

/**
 * Clean up focus and hover state when a subtree is being disposed.
 * Removes all focusable nodes in the subtree from their scope, clears focus
 * if the focused node is being disposed, and clears hover state if needed.
 *
 * Must be called before disposing a subtree to prevent stale references.
 */
export function cleanupSubtreeState(
  app: App,
  subtreeRoot: Node,
): void {
  const focused = app.focusedNode();
  if (focused && isNodeInSubtree(focused, subtreeRoot)) {
    app.setFocusedNode(null);
  }

  unregisterSubtreeFocusables(app, subtreeRoot);

  if (
    app.hoverState.currentNode &&
    isNodeInSubtree(app.hoverState.currentNode, subtreeRoot)
  ) {
    if (app.hoverState.currentNode.onHover) {
      app.hoverState.currentNode.onHover(false);
    }
    app.hoverState.currentNode = null;
  }
}

/**
 * Count total focusable nodes in a scope and all its ancestors.
 */
function countFocusablesInAncestors(scope: FocusScope | null): number {
  let count = 0;
  let current = scope;
  while (current) {
    count += current.focusableNodes.length;
    current = current.parent;
  }
  return count;
}

/** Direction for focus navigation: 1 = next, -1 = prev */
type FocusDirection = 1 | -1;

/**
 * Navigate focus in a direction within a scope.
 * Handles wrapping and scope escaping based on trap setting.
 */
function focusNavigate(
  app: App,
  scope: FocusScope,
  direction: FocusDirection,
): void {
  const { focusableNodes, focusedIndex } = scope;

  if (focusableNodes.length === 0) {
    if (!scope.trap && scope.parent) {
      focusNavigate(app, scope.parent, direction);
    }
    return;
  }

  if (focusedIndex === -1) {
    const index = direction === 1 ? 0 : focusableNodes.length - 1;
    scope.focusedIndex = index;
    app.setFocusedNode(focusableNodes[index]);
    return;
  }

  const targetIndex = focusedIndex + direction;
  const atBoundary =
    direction === 1 ? targetIndex >= focusableNodes.length : targetIndex < 0;

  if (atBoundary) {
    const wrapIndex = direction === 1 ? 0 : focusableNodes.length - 1;

    if (scope.trap) {
      scope.focusedIndex = wrapIndex;
      app.setFocusedNode(focusableNodes[wrapIndex]);
    } else if (scope.parent && countFocusablesInAncestors(scope.parent) > 0) {
      scope.focusedIndex = -1;
      focusNavigate(app, scope.parent, direction);
    } else {
      scope.focusedIndex = wrapIndex;
      app.setFocusedNode(focusableNodes[wrapIndex]);
    }
  } else {
    scope.focusedIndex = targetIndex;
    app.setFocusedNode(focusableNodes[targetIndex]);
  }
}

/**
 * Navigate focus to the next focusable node within a scope.
 */
export function focusNext(app: App, scope: FocusScope): void {
  focusNavigate(app, scope, 1);
}

/**
 * Navigate focus to the previous focusable node within a scope.
 */
export function focusPrev(app: App, scope: FocusScope): void {
  focusNavigate(app, scope, -1);
}

/**
 * Find which scope contains a given node by traversing the node tree.
 */
function findScopeContaining(
  rootScope: FocusScope,
  node: Node,
): FocusScope | null {
  if (rootScope.focusableNodes.includes(node)) {
    return rootScope;
  }

  let current: Node | undefined = node._parent;
  while (current) {
    const nodeScope = (current as NodeWithFocusScope)._focusScope;
    if (nodeScope?.focusableNodes.includes(node)) {
      return nodeScope;
    }
    current = current._parent;
  }

  return null;
}

/**
 * Set focus to a specific node via ref.
 */
function focusSet(app: App, scope: FocusScope, ref: Ref): void {
  if (!ref.current?.focusable) return;

  const targetScope = findScopeContaining(
    app.rootScope,
    ref.current,
  );
  if (!targetScope) return;

  const index = targetScope.focusableNodes.indexOf(ref.current);
  if (index !== -1) {
    scope.focusedIndex = -1;
    targetScope.focusedIndex = index;
    app.setFocusedNode(ref.current);
  }
}

/**
 * Focus a node directly (used for click-to-focus).
 * Finds the node's containing scope and updates focus state.
 */
export function focusNode(app: App, node: Node): void {
  if (!node.focusable) return;

  const targetScope = findScopeContaining(app.rootScope, node);
  if (!targetScope) return;

  const index = targetScope.focusableNodes.indexOf(node);
  if (index !== -1) {
    targetScope.focusedIndex = index;
    app.setFocusedNode(node);
  }
}

/**
 * Create a focus controller for a scope.
 */
function createFocusController(
  app: App,
  scope: FocusScope,
): FocusController {
  return {
    next() {
      focusNext(app, scope);
    },
    prev() {
      focusPrev(app, scope);
    },
    set(ref: Ref) {
      focusSet(app, scope, ref);
    },
    current: app.focusedNode,
  };
}

/**
 * Access the focus controller for the current scope.
 * Must be called within a mounted component context.
 */
export function useFocus(): FocusController {
  const ctx = getContext();
  return createFocusController(ctx.app, ctx.currentScope);
}

/** Props for FocusScopeComponent */
export interface FocusScopeProps {
  trap?: boolean;
  children: Node[];
}

/** Props for TabFocus component */
export interface TabFocusProps {
  children: Node[];
  trap?: boolean;
}

/**
 * Creates a focus scope node with the given box factory.
 * Shared implementation for FocusScopeComponent and TabFocus.
 */
function createFocusScopeNode(
  props: { children: Node[]; trap?: boolean },
  boxFactory: (children: Node[], scope: FocusScope) => Node,
): Node {
  const ctx = getContext();

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

  const node = withContext(childCtx, () => boxFactory(props.children, scope));

  (node as NodeWithFocusScope)._focusScope = scope;
  collectFocusableInScope(node, scope);

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

/**
 * Convenience component that combines a FocusScope with Tab key handling.
 *
 * Wraps children in a focus scope and handles Tab/Shift+Tab to navigate
 * between focusable children.
 */
export function TabFocus(props: TabFocusProps): Node {
  const ctx = getContext();

  const propsWithTrap = { ...props, trap: props.trap ?? true };

  return createFocusScopeNode(propsWithTrap, (children, scope) => {
    const focus = createFocusController(ctx.app, scope);

    return Box({
      children,
      onKeyPress(event) {
        if (event.name === "tab") {
          event.shift ? focus.prev() : focus.next();
          return true;
        }
        return false;
      },
    });
  });
}

/**
 * Collect ALL focusable nodes in the tree, ignoring scope boundaries.
 * Used by initializeFocus to find autoFocus nodes anywhere in the tree.
 */
function collectAllFocusables(node: Node): Node[] {
  const result: Node[] = [];

  if (node.focusable) {
    result.push(node);
  }

  for (const child of resolveNodeChildren(node)) {
    result.push(...collectAllFocusables(child));
  }

  return result;
}

/**
 * Find the scope that contains a node by traversing scope boundaries.
 */
function findScopeForNode(target: Node, defaultScope: FocusScope): FocusScope {
  let current: Node | undefined = target;
  while (current) {
    const scope = (current as NodeWithFocusScope)._focusScope;
    if (scope?.focusableNodes.includes(target)) {
      return scope;
    }
    current = current._parent;
  }
  return defaultScope;
}

/**
 * Initialize focus after component tree is built.
 *
 * Searches the entire tree for a node with autoFocus. If found, focuses it.
 * Otherwise, focuses the first focusable node in tree order.
 */
export function initializeFocus(app: App): void {
  app.rootScope.focusableNodes = [];
  collectFocusableInScope(app.root, app.rootScope);

  const allFocusables = collectAllFocusables(app.root);

  if (allFocusables.length === 0) {
    return;
  }

  const targetNode = allFocusables.find((n) => n.autoFocus) ?? allFocusables[0];
  const scope = findScopeForNode(targetNode, app.rootScope);
  const index = scope.focusableNodes.indexOf(targetNode);
  if (index !== -1) {
    scope.focusedIndex = index;
  }
  app.setFocusedNode(targetNode);
}
