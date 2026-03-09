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

  it("works with null and undefined values", () => {
    const [val1, setVal1] = createSignal<string | null>(null);
    assert.strictEqual(val1(), null);
    setVal1("hello");
    assert.strictEqual(val1(), "hello");
    setVal1(null);
    assert.strictEqual(val1(), null);

    const [val2, setVal2] = createSignal<number | undefined>(undefined);
    assert.strictEqual(val2(), undefined);
    setVal2(42);
    assert.strictEqual(val2(), 42);
    setVal2(undefined);
    assert.strictEqual(val2(), undefined);
  });

  it("works with object values (reference equality)", () => {
    const obj1 = { a: 1 };
    const obj2 = { a: 1 };
    const [val, setVal] = createSignal(obj1);
    assert.strictEqual(val(), obj1);

    // Same reference - no update
    setVal(obj1);
    assert.strictEqual(val(), obj1);

    // Different reference (even with same content) - updates
    setVal(obj2);
    assert.strictEqual(val(), obj2);
    assert.notStrictEqual(val(), obj1);
  });

  it("function values require wrapper to set directly", () => {
    // When storing functions, direct set is ambiguous with functional update
    const fn1 = () => 42;
    const [val, setVal] = createSignal(fn1);
    assert.strictEqual(val(), fn1);
    assert.strictEqual(val()(), 42);

    // To set a new function, wrap it in another function
    const fn2 = () => 99;
    setVal(() => fn2);
    assert.strictEqual(val(), fn2);
    assert.strictEqual(val()(), 99);
  });

  it("multiple independent signals", () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    const [c, setC] = createSignal(3);

    assert.strictEqual(a(), 1);
    assert.strictEqual(b(), 2);
    assert.strictEqual(c(), 3);

    setA(10);
    setB(20);

    assert.strictEqual(a(), 10);
    assert.strictEqual(b(), 20);
    assert.strictEqual(c(), 3);

    setC((prev) => prev * 10);
    assert.strictEqual(c(), 30);
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
