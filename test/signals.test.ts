import assert from "node:assert";
import { describe, it } from "node:test";
import {
  Check,
  Clean,
  type Computation,
  Dirty,
  createSignal,
} from "../src/core/signals.ts";

describe("signals core types", () => {
  it("state constants are ordered Clean < Check < Dirty", () => {
    assert.ok(Clean < Check);
    assert.ok(Check < Dirty);
  });

  it("Computation can be created with all required fields", () => {
    const node: Computation = {
      fn: undefined,
      value: 42,
      state: Clean,
      sources: null,
      observers: null,
      owner: null,
      children: [],
      cleanups: [],
      mounts: [],
    };

    assert.strictEqual(node.value, 42);
    assert.strictEqual(node.state, Clean);
    assert.deepStrictEqual(node.children, []);
  });
});

describe("createSignal", () => {
  it("returns getter and setter", () => {
    const [get, set] = createSignal(0);
    assert.strictEqual(typeof get, "function");
    assert.strictEqual(typeof set, "function");
  });

  it("getter returns initial value", () => {
    const [count] = createSignal(42);
    assert.strictEqual(count(), 42);
  });

  it("setter updates value", () => {
    const [count, setCount] = createSignal(0);
    setCount(5);
    assert.strictEqual(count(), 5);
  });

  it("setter accepts function with previous value", () => {
    const [count, setCount] = createSignal(10);
    setCount((prev) => prev + 1);
    assert.strictEqual(count(), 11);
  });

  it("setter with same value is no-op (Object.is comparison)", () => {
    const [count, setCount] = createSignal(5);
    setCount(5);
    assert.strictEqual(count(), 5);
  });

  it("handles NaN equality correctly", () => {
    const [val, setVal] = createSignal(Number.NaN);
    // Object.is(NaN, NaN) is true, so this should be a no-op
    setVal(Number.NaN);
    assert.ok(Number.isNaN(val()));
  });

  it("distinguishes +0 and -0", () => {
    const [val, setVal] = createSignal(0);
    // Object.is(0, -0) is false, so this should update
    setVal(-0);
    assert.strictEqual(Object.is(val(), -0), true);
  });

  // Tests that require createEffect - marked as todo until Task 1.3
  it.todo("setter with same value does not trigger observers");
  it.todo("setting marks observers as Dirty");
});

describe("signals", () => {
  it.todo("createEffect");
  it.todo("createMemo");
  it.todo("batch");
  it.todo("untrack");
  it.todo("createRoot");
});
