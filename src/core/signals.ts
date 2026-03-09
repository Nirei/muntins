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

// Export state constants and Computation for tests (internal use)
export { Clean, Check, Dirty };
export type { Computation };
