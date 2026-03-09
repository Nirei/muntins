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
const currentObserver: Computation | null = null;
const currentOwner: Computation | null = null;
const batchDepth = 0;
const batchQueue: Set<Computation> = new Set();

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

  const getter: Accessor<T> = () => {
    if (currentObserver) {
      // Register dependency: signal -> observer
      if (!node.observers) node.observers = [];
      if (!node.observers.includes(currentObserver)) {
        node.observers.push(currentObserver);
      }
      // Register source: observer -> signal
      if (!currentObserver.sources) currentObserver.sources = [];
      if (!currentObserver.sources.includes(node as Computation)) {
        currentObserver.sources.push(node as Computation);
      }
    }
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
      }
    }
  };

  return [getter, setter];
}

// Export state constants and Computation for tests (internal use)
export { Clean, Check, Dirty };
export type { Computation };
