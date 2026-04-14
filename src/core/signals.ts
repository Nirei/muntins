// Signals reactivity core

// Public types
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
// biome-ignore lint/suspicious/noExplicitAny: required for function type detection
export type MaybeAccessor<T> = [T] extends [(...args: any[]) => any]
  ? Accessor<T>
  : T | Accessor<T>;

// State constants (must satisfy Clean < Check < Dirty for stale() comparison)
const Clean = 0;
const Check = 1;
const Dirty = 2;

// Core reactive node structure
interface Computation<T = unknown> {
  fn: (() => T) | undefined; // undefined for plain signals
  value: T;
  state: number; // Clean | Check | Dirty
  sources: Computation[] | null; // what this reads (up-links)
  observers: Computation[] | null; // what reads this (down-links)
  owner: Computation | null; // parent in ownership tree
  children: Computation[]; // owned computations
  cleanups: (() => void)[]; // cleanup callbacks
  mounts: (() => void)[] | null; // onMount callbacks (run once after initial execution, null after drained)
  effect: boolean; // true for effects, false for memos/signals
}

// Global context
let currentObserver: Computation | null = null;
let currentSourcesIndex = 0;
let currentOwner: Computation | null = null;
let batchDepth = 0;
const batchQueue: Set<Computation> = new Set();

// Circular dependency detection: tracks nodes currently being updated
const updatingNodes: Set<Computation> = new Set();

// Effect execution state: defers nested triggers to prevent stack overflow
const effectState = { isRunning: false };
const pendingEffects: Set<Computation> = new Set();

// Iteration limit to prevent infinite loops
const MAX_ITERATIONS = 100;

/**
 * Removes an observer from a source's observers list.
 */
function unlinkSourceFromObserver(
  source: Computation,
  observer: Computation,
): void {
  if (source.observers) {
    const idx = source.observers.indexOf(observer);
    if (idx !== -1) source.observers.splice(idx, 1);
  }
}

/**
 * Runs a node's cleanup callbacks in reverse order (LIFO).
 * Collects any errors thrown by cleanups and returns them.
 */
function runCleanups(node: Computation): unknown[] {
  const errors: unknown[] = [];
  for (let i = node.cleanups.length - 1; i >= 0; i--) {
    try {
      node.cleanups[i]();
    } catch (err) {
      errors.push(err);
    }
  }
  node.cleanups = [];
  return errors;
}

/**
 * Recursively disposes all children of a node.
 */
function disposeChildren(node: Computation): void {
  const children = node.children;
  node.children = [];
  for (const child of children) {
    dispose(child);
  }
}

/**
 * Throws collected cleanup errors (single error or AggregateError for multiple).
 */
function throwCleanupErrors(errors: unknown[]): void {
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "Multiple cleanup errors");
  }
}

/**
 * Disposes a computation node and all its children.
 * Runs cleanup callbacks, removes from parent ownership, and unlinks from sources.
 * Safe to call multiple times (no-op on disposed nodes).
 */
function dispose(node: Computation): void {
  // Double-dispose safety: check if already disposed (no fn and no cleanups/children)
  // Root nodes have fn = undefined but may have children, so check children too
  if (
    node.fn === undefined &&
    node.cleanups.length === 0 &&
    node.children.length === 0 &&
    node.sources === null
  ) {
    return;
  }

  const errors = runCleanups(node);
  disposeChildren(node);

  // Remove from all sources' observer lists
  if (node.sources) {
    for (const source of node.sources) {
      unlinkSourceFromObserver(source, node);
    }
    node.sources = null;
  }

  // Remove from parent's children list (O(1) swap-and-pop)
  if (node.owner) {
    const idx = node.owner.children.indexOf(node);
    if (idx >= 0) {
      const last = node.owner.children.pop();
      if (last && idx < node.owner.children.length) {
        node.owner.children[idx] = last;
      }
    }
    node.owner = null;
  }

  // Clear fn to mark as disposed
  node.fn = undefined;

  throwCleanupErrors(errors);
}

/**
 * Cleans up a node's cleanups and disposes all children, but does not
 * remove the node from its parent or unlink from sources.
 * Used during effect re-run to clean up before re-executing.
 */
function cleanupNode(node: Computation): void {
  const errors = runCleanups(node);
  disposeChildren(node);
  throwCleanupErrors(errors);
}

/**
 * Propagates staleness through the dependency graph.
 * Direct observers get Dirty, transitive observers get Check.
 * Returns true if the node's state changed (was upgraded).
 */
function stale(node: Computation, state: number): boolean {
  if (node.state < state) {
    node.state = state;
    if (node.observers) {
      for (const observer of node.observers) {
        stale(observer, Check);
      }
    }
    return true;
  }
  return false;
}

/**
 * Marks all observers as stale, then schedules any effects that need to run.
 * This two-phase approach ensures all observers are marked before any effects
 * run, preventing partial updates in diamond dependency patterns.
 */
function notifyObservers(node: Computation): void {
  if (!node.observers) return;

  // Phase 1: Mark all observers stale (propagates transitively)
  const effectsToSchedule: Set<Computation> = new Set();
  for (const observer of node.observers) {
    const wasUpgraded = stale(observer, Dirty);
    // Collect effects that were newly marked (not already pending)
    if (wasUpgraded && observer.effect) {
      effectsToSchedule.add(observer);
    }
    // Also collect transitive effects that became Check
    if (observer.observers) {
      collectStaleEffects(observer, effectsToSchedule);
    }
  }

  // Phase 2: Schedule all collected effects
  for (const effect of effectsToSchedule) {
    scheduleEffect(effect);
  }
}

/**
 * Recursively collects effects that are in Check state after stale propagation.
 */
function collectStaleEffects(
  node: Computation,
  effects: Set<Computation>,
): void {
  if (!node.observers) return;
  for (const observer of node.observers) {
    if (observer.effect && observer.state >= Check) {
      effects.add(observer);
    }
    collectStaleEffects(observer, effects);
  }
}

/**
 * Called by signal getters during effect execution to register dependencies.
 * Uses index-based tracking to avoid allocations when effects read signals
 * in the same order on each execution.
 */
function trackRead(signal: Computation): void {
  if (!currentObserver) return;

  if (!currentObserver.sources) currentObserver.sources = [];
  const sources = currentObserver.sources;

  // Fast path: signal is at the expected position
  if (currentSourcesIndex < sources.length) {
    if (sources[currentSourcesIndex] === signal) {
      currentSourcesIndex++;
      return;
    }
    // Slow path: dependency order changed, remove stale sources from this point
    for (let i = currentSourcesIndex; i < sources.length; i++) {
      unlinkSourceFromObserver(sources[i], currentObserver);
    }
    sources.length = currentSourcesIndex;
  }

  // Add the new source
  sources.push(signal);
  if (!signal.observers) signal.observers = [];
  if (!signal.observers.includes(currentObserver)) {
    signal.observers.push(currentObserver);
  }
  currentSourcesIndex++;
}

/**
 * Executes a computation's function with dependency and ownership tracking.
 * Saves and restores context to support nested effects/memos.
 * For memos, stores the return value in node.value.
 * Sets currentOwner so any created computations become children of this node.
 */
function executeWithTracking(node: Computation): void {
  if (!node.fn) return;

  const prevObserver = currentObserver;
  const prevIndex = currentSourcesIndex;
  const prevOwner = currentOwner;

  currentObserver = node;
  currentSourcesIndex = 0;
  currentOwner = node;

  try {
    node.value = node.fn();
  } finally {
    // Remove sources that weren't accessed this run
    if (node.sources) {
      for (let i = currentSourcesIndex; i < node.sources.length; i++) {
        unlinkSourceFromObserver(node.sources[i], node);
      }
      node.sources.length = currentSourcesIndex;
    }

    currentObserver = prevObserver;
    currentSourcesIndex = prevIndex;
    currentOwner = prevOwner;
  }
}

/**
 * The pull phase: recursively verifies if a computation needs to update.
 * For Check state, verifies if any source actually changed.
 * For Dirty state, re-runs the computation.
 */
function updateIfNecessary(node: Computation): void {
  // Circular dependency detection
  if (updatingNodes.has(node)) {
    throw new Error("Circular dependency detected");
  }

  if (node.state === Check) {
    // Verify if any source actually changed
    if (node.sources) {
      for (const source of node.sources) {
        updateIfNecessary(source);
        // Source update may have marked us Dirty via stale()
        if ((node.state as number) === Dirty) break;
      }
    }
  }

  const shouldRun = node.state === Dirty;

  // Set Clean BEFORE running so self-triggering effects get marked Dirty again
  node.state = Clean;

  if (shouldRun) {
    update(node);
  }
}

/**
 * Re-executes a computation with dependency tracking.
 * For memos, stores the computed value and stops propagation if unchanged.
 * Cleans up node's cleanups and disposes children before re-executing.
 * Runs onMount callbacks after initial execution.
 */
function update(node: Computation): void {
  cleanupNode(node);
  updatingNodes.add(node);

  try {
    const oldValue = node.value;
    executeWithTracking(node);

    // Run mount callbacks after initial execution (mounts is null after first drain)
    if (node.mounts) {
      const mounts = node.mounts;
      node.mounts = null; // Mark as drained so future onMount calls are ignored

      // Run mounts in owner context so onCleanup works inside mount callbacks
      const prevOwner = currentOwner;
      currentOwner = node;
      try {
        for (const mount of mounts) {
          mount();
        }
      } finally {
        currentOwner = prevOwner;
      }
    }

    // Memos: equality check for stopping propagation
    // If value changed, mark observers Dirty so they recompute.
    // If value unchanged, observers stay at Check and will verify clean.
    // Skip observers that are currently being updated (they're reading us).
    if (node.observers && !Object.is(oldValue, node.value)) {
      for (const observer of node.observers) {
        if (observer.state === Check && !updatingNodes.has(observer)) {
          observer.state = Dirty;
        }
      }
    }
  } finally {
    updatingNodes.delete(node);
  }
}

/**
 * Schedules an effect to run. If not batching, runs immediately.
 * If batching, adds to the batch queue for later execution.
 * If already running effects, defers to prevent stack overflow.
 */
function scheduleEffect(node: Computation): void {
  if (batchDepth > 0) {
    batchQueue.add(node);
  } else if (effectState.isRunning) {
    pendingEffects.add(node);
  } else {
    runTopLevelEffect(node);
  }
}

/**
 * Runs an effect and any effects it triggers, with re-entrancy protection.
 * Limits iterations to prevent infinite loops from effects that
 * trigger themselves through signal writes.
 */
function runTopLevelEffect(node: Computation): void {
  effectState.isRunning = true;
  let iterations = 0;

  try {
    pendingEffects.add(node);

    while (pendingEffects.size > 0 && iterations < MAX_ITERATIONS) {
      iterations++;
      const next = pendingEffects.values().next().value as Computation;
      pendingEffects.delete(next);
      updateIfNecessary(next);
    }

    if (iterations >= MAX_ITERATIONS) {
      throw new Error(
        "Effect exceeded maximum iterations - possible infinite loop",
      );
    }
  } finally {
    effectState.isRunning = false;
    pendingEffects.clear();
  }
}

/**
 * Flushes all pending effects from the batch queue.
 * Called when the outermost batch completes.
 */
function flushBatchQueue(): void {
  const errors: unknown[] = [];
  for (const node of batchQueue) {
    try {
      updateIfNecessary(node);
    } catch (err) {
      errors.push(err);
    }
  }
  batchQueue.clear();
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, "Multiple errors during batch flush");
}

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
export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      flushBatchQueue();
    }
  }
}

/**
 * Reads signals without creating dependencies.
 *
 * Any signal reads within the provided function will not be tracked,
 * meaning the enclosing effect or memo will not re-run when those
 * signals change.
 *
 * Returns the value returned by the provided function.
 */
export function untrack<T>(fn: () => T): T {
  const prev = currentObserver;
  currentObserver = null;
  try {
    return fn();
  } finally {
    currentObserver = prev;
  }
}

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
export function createSignal<T>(initial: T): [Accessor<T>, Setter<T>] {
  const node: Computation<T> = {
    fn: undefined,
    value: initial,
    state: Clean,
    sources: null,
    observers: null,
    owner: null, // Signals don't participate in ownership - they're passive data containers
    children: [],
    cleanups: [],
    mounts: [],
    effect: false,
  };
  // Widen to Computation for use in untyped arrays (sources/observers)
  const untypedNode: Computation = node;

  const getter: Accessor<T> = () => {
    trackRead(untypedNode);
    return node.value;
  };

  const setter: Setter<T> = (value: T | ((prev: T) => T)) => {
    const newValue =
      typeof value === "function"
        ? (value as (prev: T) => T)(node.value)
        : value;

    if (Object.is(node.value, newValue)) return;

    node.value = newValue;

    // Mark all observers stale, then schedule effects (two-phase to avoid partial updates)
    notifyObservers(untypedNode);
  };

  return [getter, setter];
}

/**
 * Creates an effect that runs immediately and re-runs whenever its
 * dependencies change. Dependencies are automatically tracked.
 *
 * Effects are the primary way to perform side effects in response to
 * reactive state changes. The provided function runs synchronously
 * on creation and again whenever any signal it reads changes.
 */
export function createEffect(fn: () => void): void {
  const node: Computation = {
    fn,
    value: undefined,
    state: Dirty,
    sources: null,
    observers: null,
    owner: currentOwner,
    children: [],
    cleanups: [],
    mounts: [],
    effect: true,
  };

  if (currentOwner) {
    currentOwner.children.push(node);
  }

  runTopLevelEffect(node);
}

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
export function createMemo<T>(fn: () => T): Accessor<T> {
  const node: Computation<T> = {
    fn,
    value: undefined as T, // Will be computed on first read
    state: Dirty, // Needs initial computation
    sources: null,
    observers: null,
    owner: currentOwner,
    children: [],
    cleanups: [],
    mounts: [],
    effect: false,
  };

  // Register with owner for disposal
  if (currentOwner) {
    currentOwner.children.push(node as Computation);
  }

  // Widen to Computation for use in untyped arrays (sources/observers)
  const untypedNode: Computation = node;

  const getter: Accessor<T> = () => {
    trackRead(untypedNode);
    // Lazy evaluation: compute if dirty or needs verification
    updateIfNecessary(untypedNode);
    return node.value;
  };

  return getter;
}

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
export function createRoot<T>(
  fn: (dispose: () => void) => T,
  options?: CreateRootOptions,
): T {
  const detached = options?.detached ?? false;

  const root: Computation = {
    fn: undefined, // Roots have no fn
    value: undefined,
    state: Clean,
    sources: null,
    observers: null,
    owner: currentOwner,
    children: [],
    cleanups: [],
    mounts: [],
    effect: false,
  };

  // Register with parent owner if exists (unless detached)
  if (currentOwner && !detached) {
    currentOwner.children.push(root);
  }

  const prevOwner = currentOwner;
  currentOwner = root;

  try {
    return fn(() => dispose(root));
  } finally {
    currentOwner = prevOwner;
  }
}

/**
 * Registers a cleanup callback to run when the owning computation re-runs
 * or is disposed.
 *
 * Must be called within a reactive context (inside createRoot, createEffect,
 * or createMemo). Cleanups run in reverse order (LIFO).
 *
 * @throws Error if called outside a reactive context
 */
export function onCleanup(fn: () => void): void {
  if (!currentOwner) {
    throw new Error("onCleanup must be called within a reactive context");
  }
  currentOwner.cleanups.push(fn);
}

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
export function onMount(fn: () => void): void {
  if (!currentOwner) {
    console.warn("onMount called outside reactive context");
    return;
  }
  // mounts is null after initial execution has completed (mounts were drained)
  // Only register mount callbacks during initial execution
  if (currentOwner.mounts) {
    currentOwner.mounts.push(fn);
  }
}

/**
 * Resolves a value that may be static or a reactive accessor.
 *
 * This is the inverse of Accessor - it unwraps a potentially reactive
 * value to get the current concrete value.
 *
 * Use with MaybeAccessor<T> in prop types to get compile-time safety
 * when T could be a function type.
 */
export function resolve<T>(value: MaybeAccessor<T>): T;
export function resolve<T>(value: MaybeAccessor<T> | undefined): T | undefined;
export function resolve<T>(value: T | Accessor<T> | undefined): T | undefined {
  return typeof value === "function" ? (value as Accessor<T>)() : value;
}
