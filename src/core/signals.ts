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
}

// Global context
let currentObserver: Computation | null = null;
let currentSourcesIndex = 0;
const currentOwner: Computation | null = null;
const batchDepth = 0;
const batchQueue: Set<Computation> = new Set();

// Re-entrancy guard to prevent infinite loops
const MAX_ITERATIONS = 100;

/**
 * Propagates staleness through the dependency graph.
 * Direct observers get Dirty, transitive observers get Check.
 */
function stale(node: Computation, state: number): void {
  if (node.state < state) {
    node.state = state;
    if (node.observers) {
      for (const observer of node.observers) {
        stale(observer, Check);
      }
    }
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
      const staleSource = sources[i];
      if (staleSource.observers) {
        const idx = staleSource.observers.indexOf(currentObserver);
        if (idx !== -1) staleSource.observers.splice(idx, 1);
      }
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
 */
function executeWithTracking(node: Computation): void {
  if (!node.fn) return;

  const prevObserver = currentObserver;
  const prevIndex = currentSourcesIndex;

  currentObserver = node;
  currentSourcesIndex = 0;

  try {
    node.fn();
  } finally {
    // Remove sources that weren't accessed this run
    if (node.sources) {
      for (let i = currentSourcesIndex; i < node.sources.length; i++) {
        const staleSource = node.sources[i];
        if (staleSource.observers) {
          const idx = staleSource.observers.indexOf(node);
          if (idx !== -1) staleSource.observers.splice(idx, 1);
        }
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
  if (node.state === Check) {
    // Verify if any source actually changed
    if (node.sources) {
      for (const source of node.sources) {
        updateIfNecessary(source);
        // Re-read state since updateIfNecessary can trigger stale() which mutates it
        if ((node.state as number) === Dirty) {
          break; // Stop early, we know we need to update
        }
      }
    }
  }

  if (node.state === Dirty) {
    update(node);
  }

  node.state = Clean;
}

/**
 * Re-executes a computation with dependency tracking.
 * Handles cleanup, child disposal (placeholders until Task 1.5), and error recovery.
 */
function update(node: Computation): void {
  // Run cleanups (placeholder until Task 1.5)
  // Dispose children (placeholder until Task 1.5)

  executeWithTracking(node);
  node.state = Clean;
}

/**
 * Schedules an effect to run. If not batching, runs immediately.
 * If batching, adds to the batch queue for later execution.
 */
function scheduleEffect(node: Computation): void {
  if (batchDepth > 0) {
    batchQueue.add(node);
  } else {
    runEffect(node);
  }
}

/**
 * Runs an effect with re-entrancy protection.
 * Limits iterations to prevent infinite loops from effects that
 * trigger themselves through signal writes.
 */
function runEffect(node: Computation): void {
  let iterations = 0;
  while (node.state !== Clean && iterations < MAX_ITERATIONS) {
    iterations++;
    updateIfNecessary(node);
  }
  if (iterations >= MAX_ITERATIONS) {
    throw new Error(
      "Effect exceeded maximum iterations - possible infinite loop",
    );
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

    if (node.observers) {
      for (const observer of node.observers) {
        stale(observer, Dirty);
        // Schedule effects (computations with fn) to run
        if (observer.fn) {
          scheduleEffect(observer);
        }
      }
    }
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
  };

  // Register with owner (placeholder until Task 1.5)
  if (currentOwner) {
    currentOwner.children.push(node);
  }

  // Run immediately
  runEffect(node);
}

// Export state constants and Computation for tests (internal use)
export { Clean, Check, Dirty };
export type { Computation };
