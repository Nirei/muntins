// Signals reactivity core

// Public types
export type Accessor<T> = () => T;
export type Setter<T> = (value: T | ((prev: T) => T)) => void;

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
  mounts: (() => void)[]; // onMount callbacks (run once after initial execution)
  effect: boolean; // true for effects, false for memos/signals
}

// Global context
let currentObserver: Computation | null = null;
let currentSourcesIndex = 0;
const currentOwner: Computation | null = null;
const batchDepth = 0;
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
 * Executes a computation's function with dependency tracking.
 * Saves and restores the tracking context to support nested effects.
 * For memos, stores the return value in node.value.
 */
function executeWithTracking(node: Computation): void {
  if (!node.fn) return;

  const prevObserver = currentObserver;
  const prevIndex = currentSourcesIndex;

  currentObserver = node;
  currentSourcesIndex = 0;

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
 */
function update(node: Computation): void {
  // TODO(Task 1.5): Run cleanups and dispose children before re-executing
  updatingNodes.add(node);

  try {
    const oldValue = node.value;
    executeWithTracking(node);

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
    owner: currentOwner,
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

  // TODO(Task 1.5): Register with owner for disposal
  if (currentOwner) {
    currentOwner.children.push(node);
  }

  // Run immediately
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

// Export state constants and Computation for tests (internal use)
export { Clean, Check, Dirty };
export type { Computation };
