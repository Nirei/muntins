import { type Accessor, type Setter } from "../signals.ts";
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
/**
 * Owns and manages all focus-related state and navigation.
 *
 * Tracks which node has focus, manages focus scopes, and handles
 * focus navigation (next/prev/direct). Created and owned by App.
 */
export declare class FocusManager {
    readonly rootScope: FocusScope;
    readonly focusedNode: Accessor<Node | null>;
    private readonly _setFocusedNode;
    constructor();
    /**
     * Initialize focus after the component tree is built.
     * Finds a node with autoFocus or the first focusable node.
     */
    initialize(root: Node): void;
    /**
     * Programmatically set focus to a specific node (or clear it with null).
     * Accepts either a direct value or a setter function, matching the Setter type.
     * Used by App's backward-compat accessor and for direct focus control.
     */
    setFocus: Setter<Node | null>;
    /** Navigate focus to the next focusable node within a scope. */
    focusNext(scope: FocusScope): void;
    /** Navigate focus to the previous focusable node within a scope. */
    focusPrev(scope: FocusScope): void;
    /**
     * Focus a node directly (used for click-to-focus).
     * Finds the node's containing scope and updates focus state.
     */
    focusNode(node: Node): void;
    /** Create a focus controller for a scope. */
    createController(scope: FocusScope): FocusController;
    /** Set focus to a specific node via ref. */
    focusSet(scope: FocusScope, ref: Ref): void;
    /**
     * Register focusable nodes from a newly created subtree.
     * Called when Show/For creates new child nodes.
     */
    registerSubtreeFocusables(subtreeRoot: Node): void;
    /**
     * Unregister all focusable nodes from a subtree being disposed.
     */
    unregisterSubtreeFocusables(subtreeRoot: Node): void;
    /**
     * Clean up focus state when a subtree is being disposed.
     * Clears focus if the focused node is in the subtree, then unregisters.
     *
     * The focus read is untracked on purpose: Show/For dispose subtrees inside
     * their tracked effects, and subscribing those effects to the focus signal
     * would make the clear below re-enter the disposing effect mid-update.
     */
    cleanupFocus(subtreeRoot: Node): void;
    /**
     * Restore focus after the focused subtree was disposed: focus the nearest
     * surviving focusable ancestor, or clear focus when none exists.
     *
     * Runs after unregistration so focusNode computes the ancestor's scope
     * index against the surviving focusable list.
     */
    private restoreFocusAfterDisposal;
    /**
     * Collect focusable nodes into a scope via depth-first traversal.
     * Stops at nested FocusScope boundaries.
     */
    static collectFocusableInScope(node: Node, scope: FocusScope): void;
    private findParentScope;
    private focusNavigate;
    private findScopeContaining;
    private static countFocusablesInAncestors;
    private collectAllFocusables;
    private findScopeForNode;
}
//# sourceMappingURL=FocusManager.d.ts.map