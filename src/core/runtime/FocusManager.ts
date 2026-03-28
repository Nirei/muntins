import type { Accessor, Setter } from "../signals.ts";
import { createSignal } from "../signals.ts";
import type { Node, Ref } from "./Node.ts";

/**
 * Focus scope for organizing focusable nodes.
 * Scopes can be nested and optionally trap focus within themselves.
 */
export interface FocusScope {
  parent: FocusScope | null;
  focusableNodes: Node[];
  focusedIndex: number;
  trap: boolean;
}

/**
 * Controller for programmatic focus management within a scope.
 */
export interface FocusController {
  next(): void;
  prev(): void;
  set(ref: Ref): void;
  current: Accessor<Node | null>;
}

/** Internal type for nodes that may have a focus scope attached */
export interface NodeWithFocusScope extends Node {
  _focusScope?: FocusScope;
}

/** Direction for focus navigation: 1 = next, -1 = prev */
type FocusDirection = 1 | -1;

/**
 * Owns and manages all focus-related state and navigation.
 *
 * Tracks which node has focus, manages focus scopes, and handles
 * focus navigation (next/prev/direct). Created and owned by App.
 */
export class FocusManager {
  readonly rootScope: FocusScope;
  readonly focusedNode: Accessor<Node | null>;
  private readonly setFocusedNode: Setter<Node | null>;

  constructor() {
    const [focusedNode, setFocusedNode] = createSignal<Node | null>(null);
    this.focusedNode = focusedNode;
    this.setFocusedNode = setFocusedNode;
    this.rootScope = {
      parent: null,
      focusableNodes: [],
      focusedIndex: -1,
      trap: false,
    };
  }

  /**
   * Initialize focus after the component tree is built.
   * Finds a node with autoFocus or the first focusable node.
   */
  initialize(root: Node): void {
    this.rootScope.focusableNodes = [];
    FocusManager.collectFocusableInScope(root, this.rootScope);

    const allFocusables = this.collectAllFocusables(root);

    if (allFocusables.length === 0) {
      return;
    }

    const targetNode =
      allFocusables.find((n) => n.autoFocus) ?? allFocusables[0];
    const scope = this.findScopeForNode(targetNode, this.rootScope);
    const index = scope.focusableNodes.indexOf(targetNode);
    if (index !== -1) {
      scope.focusedIndex = index;
    }
    this.setFocusedNode(targetNode);
  }

  /** Navigate focus to the next focusable node within a scope. */
  focusNext(scope: FocusScope): void {
    this.focusNavigate(scope, 1);
  }

  /** Navigate focus to the previous focusable node within a scope. */
  focusPrev(scope: FocusScope): void {
    this.focusNavigate(scope, -1);
  }

  /**
   * Focus a node directly (used for click-to-focus).
   * Finds the node's containing scope and updates focus state.
   */
  focusNode(node: Node): void {
    if (!node.focusable) return;

    const targetScope = this.findScopeContaining(this.rootScope, node);
    if (!targetScope) return;

    const index = targetScope.focusableNodes.indexOf(node);
    if (index !== -1) {
      targetScope.focusedIndex = index;
      this.setFocusedNode(node);
    }
  }

  /** Create a focus controller for a scope. */
  createController(scope: FocusScope): FocusController {
    return {
      next: () => this.focusNext(scope),
      prev: () => this.focusPrev(scope),
      set: (ref) => this.focusSet(scope, ref),
      current: this.focusedNode,
    };
  }

  /** Set focus to a specific node via ref. */
  focusSet(scope: FocusScope, ref: Ref): void {
    if (!ref.current?.focusable) return;

    const targetScope = this.findScopeContaining(this.rootScope, ref.current);
    if (!targetScope) return;

    const index = targetScope.focusableNodes.indexOf(ref.current);
    if (index !== -1) {
      scope.focusedIndex = -1;
      targetScope.focusedIndex = index;
      this.setFocusedNode(ref.current);
    }
  }

  /**
   * Register focusable nodes from a newly created subtree.
   * Called when Show/For creates new child nodes.
   */
  registerSubtreeFocusables(subtreeRoot: Node): void {
    const scope = this.findParentScope(subtreeRoot);
    FocusManager.collectFocusableInScope(subtreeRoot, scope);
  }

  /**
   * Unregister all focusable nodes from a subtree being disposed.
   */
  unregisterSubtreeFocusables(subtreeRoot: Node): void {
    const scope = this.findParentScope(subtreeRoot);

    const nodesToRemove: Node[] = [];
    FocusManager.collectFocusableInScope(subtreeRoot, {
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
   * Clean up focus state when a subtree is being disposed.
   * Clears focus if the focused node is in the subtree, then unregisters.
   */
  cleanupFocus(subtreeRoot: Node): void {
    const focused = this.focusedNode();
    if (focused?.isInSubtree(subtreeRoot)) {
      this.setFocusedNode(null);
    }

    this.unregisterSubtreeFocusables(subtreeRoot);
  }

  /**
   * Collect focusable nodes into a scope via depth-first traversal.
   * Stops at nested FocusScope boundaries.
   */
  static collectFocusableInScope(node: Node, scope: FocusScope): void {
    const nodeScope = (node as NodeWithFocusScope)._focusScope;
    if (nodeScope && nodeScope !== scope) {
      return;
    }

    if (node.focusable) {
      scope.focusableNodes.push(node);
    }

    for (const child of node.resolveChildren()) {
      FocusManager.collectFocusableInScope(child, scope);
    }
  }

  private findParentScope(node: Node): FocusScope {
    let current: Node | undefined = node._parent;

    while (current) {
      const nodeScope = (current as NodeWithFocusScope)._focusScope;
      if (nodeScope) {
        return nodeScope;
      }
      current = current._parent;
    }

    return this.rootScope;
  }

  private focusNavigate(scope: FocusScope, direction: FocusDirection): void {
    const { focusableNodes, focusedIndex } = scope;

    if (focusableNodes.length === 0) {
      if (!scope.trap && scope.parent) {
        this.focusNavigate(scope.parent, direction);
      }
      return;
    }

    if (focusedIndex === -1) {
      const index = direction === 1 ? 0 : focusableNodes.length - 1;
      scope.focusedIndex = index;
      this.setFocusedNode(focusableNodes[index]);
      return;
    }

    const targetIndex = focusedIndex + direction;
    const atBoundary =
      direction === 1 ? targetIndex >= focusableNodes.length : targetIndex < 0;

    if (atBoundary) {
      const wrapIndex = direction === 1 ? 0 : focusableNodes.length - 1;

      if (scope.trap) {
        scope.focusedIndex = wrapIndex;
        this.setFocusedNode(focusableNodes[wrapIndex]);
      } else if (
        scope.parent &&
        FocusManager.countFocusablesInAncestors(scope.parent) > 0
      ) {
        scope.focusedIndex = -1;
        this.focusNavigate(scope.parent, direction);
      } else {
        scope.focusedIndex = wrapIndex;
        this.setFocusedNode(focusableNodes[wrapIndex]);
      }
    } else {
      scope.focusedIndex = targetIndex;
      this.setFocusedNode(focusableNodes[targetIndex]);
    }
  }

  private findScopeContaining(
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

  private static countFocusablesInAncestors(scope: FocusScope | null): number {
    let count = 0;
    let current = scope;
    while (current) {
      count += current.focusableNodes.length;
      current = current.parent;
    }
    return count;
  }

  private collectAllFocusables(node: Node): Node[] {
    const result: Node[] = [];

    if (node.focusable) {
      result.push(node);
    }

    for (const child of node.resolveChildren()) {
      result.push(...this.collectAllFocusables(child));
    }

    return result;
  }

  private findScopeForNode(target: Node, defaultScope: FocusScope): FocusScope {
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
}
