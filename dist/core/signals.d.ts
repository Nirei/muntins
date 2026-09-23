export type Accessor<T> = () => T;
export type Setter<T> = (value: T | ((prev: T) => T)) => void;
/**
 * A value that may be static or wrapped in a reactive accessor.
 *
 * When T is a function type, it must be wrapped in an Accessor to distinguish
 * it from a reactive getter. This prevents resolve() from accidentally calling
 * a function value instead of returning it.
 *
 * The [T] wrapper prevents distributive conditional types - without it,
 * MaybeAccessor<boolean> would become Accessor<true> | Accessor<false>
 * instead of the intended boolean | Accessor<boolean>.
 */
export type MaybeAccessor<T> = [T] extends [(...args: unknown[]) => unknown] ? Accessor<T> : T | Accessor<T>;
/**
 * Defers effect execution until all signal writes complete.
 *
 * When multiple signals are updated within a batch, effects that depend on
 * any of those signals will only run once at the end of the batch, seeing
 * all the final values. Nested batches are supported - only the outermost
 * batch triggers the flush.
 *
 * Returns the value returned by the provided function.
 */
export declare function batch<T>(fn: () => T): T;
/**
 * Reads signals without creating dependencies.
 *
 * Any signal reads within the provided function will not be tracked,
 * meaning the enclosing effect or memo will not re-run when those
 * signals change.
 *
 * Returns the value returned by the provided function.
 */
export declare function untrack<T>(fn: () => T): T;
/**
 * Creates a reactive signal with a getter and setter.
 *
 * The getter returns the current value and registers dependencies when called
 * inside a tracking computation (effect or memo).
 *
 * The setter updates the value and marks all observers as dirty. It accepts
 * either a new value directly or a function that receives the previous value.
 * If the new value is equal (via Object.is), the update is skipped.
 */
export declare function createSignal<T>(initial: T): [Accessor<T>, Setter<T>];
/**
 * Creates an effect that runs immediately and re-runs whenever its
 * dependencies change. Dependencies are automatically tracked.
 *
 * Effects are the primary way to perform side effects in response to
 * reactive state changes. The provided function runs synchronously
 * on creation and again whenever any signal it reads changes.
 */
export declare function createEffect(fn: () => void): void;
/**
 * Creates a cached derived value that tracks dependencies and only recomputes
 * when those dependencies change. Memos act as both observers (tracking sources)
 * and signals (having observers).
 *
 * Unlike effects, memos are lazy - they don't compute until read. They also
 * stop propagation when the computed value is equal to the previous value
 * (using Object.is comparison), preventing unnecessary updates downstream.
 *
 * Memo functions should be pure (no side effects). Side effects in memos
 * will run on every recomputation, which may lead to unexpected behavior.
 */
export declare function createMemo<T>(fn: () => T): Accessor<T>;
interface CreateRootOptions {
    /**
     * When true, the root is not registered as a child of the current owner.
     * This means the root won't be automatically disposed when its parent is
     * disposed - the caller must manually call the dispose function.
     *
     * Useful for creating roots inside effects that should persist across
     * effect re-runs (e.g., For component item roots).
     */
    detached?: boolean;
}
/**
 * Creates an ownership boundary for reactive computations.
 *
 * All effects and memos created within the callback become children of this
 * root. When dispose is called, all children are cleaned up recursively.
 *
 * The dispose function is passed to the callback and can be called to clean
 * up the entire subtree. The caller is responsible for calling dispose;
 * it is not automatic.
 *
 * @param options.detached - When true, root is not registered with parent owner
 */
export declare function createRoot<T>(fn: (dispose: () => void) => T, options?: CreateRootOptions): T;
/**
 * Registers a cleanup callback to run when the owning computation re-runs
 * or is disposed.
 *
 * Must be called within a reactive context (inside createRoot, createEffect,
 * or createMemo). Cleanups run in reverse order (LIFO).
 *
 * @throws Error if called outside a reactive context
 */
export declare function onCleanup(fn: () => void): void;
/**
 * Registers a callback that runs once after the owning computation's
 * initial execution completes.
 *
 * Unlike effects, onMount callbacks do not re-run when dependencies change.
 * This is useful for one-time setup like DOM manipulation or subscribing to
 * external resources. Callbacks registered with onMount can use onCleanup
 * to register cleanup logic that runs when the owner is disposed.
 *
 * Must be called within a reactive context (inside createRoot, createEffect,
 * or createMemo). If called outside a reactive context, a warning is logged
 * and the callback is not registered.
 */
export declare function onMount(fn: () => void): void;
/**
 * Resolves a value that may be static or a reactive accessor.
 *
 * This is the inverse of Accessor - it unwraps a potentially reactive
 * value to get the current concrete value.
 *
 * Use with MaybeAccessor<T> in prop types to get compile-time safety
 * when T could be a function type.
 */
/**
 * Checks whether a value is a reactive accessor (getter function).
 * Use to distinguish `Accessor<T>` from a plain `T` in `MaybeAccessor<T>` values
 * without calling the function.
 */
export declare function isAccessor<T>(value: MaybeAccessor<T>): value is Accessor<T>;
export declare function resolve<T>(value: MaybeAccessor<T>): T;
export declare function resolve<T>(value: MaybeAccessor<T> | undefined): T | undefined;
export {};
//# sourceMappingURL=signals.d.ts.map