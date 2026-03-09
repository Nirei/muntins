import assert from "node:assert";
import { describe, it } from "node:test";
import {
  Check,
  Clean,
  type Computation,
  Dirty,
  batch,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  onCleanup,
  untrack,
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
      effect: false,
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

  it("setter with same value does not trigger observers", () => {
    const [count, setCount] = createSignal(5);
    let effectRuns = 0;
    createEffect(() => {
      count();
      effectRuns++;
    });
    assert.strictEqual(effectRuns, 1);

    // Set to same value - should not trigger
    setCount(5);
    assert.strictEqual(effectRuns, 1);

    // Set to different value - should trigger
    setCount(6);
    assert.strictEqual(effectRuns, 2);
  });

  it("setting marks observers as Dirty", () => {
    const [count, setCount] = createSignal(0);
    let observed = -1;
    createEffect(() => {
      observed = count();
    });
    assert.strictEqual(observed, 0);

    // Setting triggers the effect, proving the observer was marked dirty
    setCount(42);
    assert.strictEqual(observed, 42);
  });
});

describe("createEffect", () => {
  it("runs immediately on creation", () => {
    let ran = false;
    createEffect(() => {
      ran = true;
    });
    assert.strictEqual(ran, true);
  });

  it("re-runs when dependency changes", () => {
    const [count, setCount] = createSignal(0);
    let value = -1;
    createEffect(() => {
      value = count();
    });
    assert.strictEqual(value, 0);
    setCount(1);
    assert.strictEqual(value, 1);
  });

  it("tracks multiple dependencies", () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    let sum = 0;
    createEffect(() => {
      sum = a() + b();
    });
    assert.strictEqual(sum, 3);
    setA(10);
    assert.strictEqual(sum, 12);
    setB(20);
    assert.strictEqual(sum, 30);
  });

  it("cleans up old dependencies", () => {
    const [cond, setCond] = createSignal(true);
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    let runs = 0;
    createEffect(() => {
      runs++;
      return cond() ? a() : b();
    });
    assert.strictEqual(runs, 1);

    setA(10); // should trigger (a is tracked)
    assert.strictEqual(runs, 2);

    setCond(false); // now tracks b, not a
    assert.strictEqual(runs, 3);

    setA(20); // should NOT trigger (a no longer tracked)
    assert.strictEqual(runs, 3);

    setB(30); // should trigger (b is now tracked)
    assert.strictEqual(runs, 4);
  });

  it("does not re-run if signal set to same value", () => {
    const [count, setCount] = createSignal(0);
    let runs = 0;
    createEffect(() => {
      count();
      runs++;
    });
    assert.strictEqual(runs, 1);
    setCount(0); // same value
    assert.strictEqual(runs, 1);
  });

  it("diamond problem: effect runs once with correct values", () => {
    // NOTE: This test uses plain functions, NOT memos. It does NOT actually
    // test the diamond problem correctly because plain functions re-execute
    // on every call (no caching). The effect tracks `a` twice (through b()
    // and c()), but both reads happen in a single effect execution.
    //
    // The TRUE diamond problem test is in Task 1.4 (createMemo) where memos
    // prevent duplicate computation. This test just verifies the effect runs
    // once per signal change, not that diamond dependencies are deduplicated.
    const [a, setA] = createSignal(1);
    const b = () => a() * 2; // plain function, NOT a memo
    const c = () => a() * 3; // plain function, NOT a memo
    let runs = 0;
    let result = 0;
    createEffect(() => {
      runs++;
      result = b() + c();
    });
    assert.strictEqual(runs, 1);
    assert.strictEqual(result, 5); // 2 + 3

    setA(2);
    assert.strictEqual(runs, 2); // only one re-run
    assert.strictEqual(result, 10); // 4 + 6
  });

  it("supports nested effects", () => {
    // NOTE: This test does NOT re-run the outer effect. Re-running outer would
    // create duplicate inner effects (effect accumulation). This is fixed once
    // ownership/disposal is implemented (Task 1.5) - outer will dispose its
    // children before re-executing.
    const [outer, setOuter] = createSignal(1);
    const [inner, setInner] = createSignal(10);
    let outerRuns = 0;
    let innerRuns = 0;
    let outerValue = 0;
    let innerValue = 0;

    createEffect(() => {
      outerRuns++;
      outerValue = outer();
      createEffect(() => {
        innerRuns++;
        innerValue = inner();
      });
    });

    assert.strictEqual(outerRuns, 1);
    assert.strictEqual(innerRuns, 1);
    assert.strictEqual(outerValue, 1);
    assert.strictEqual(innerValue, 10);

    setInner(20);
    assert.strictEqual(outerRuns, 1); // outer should not re-run
    assert.strictEqual(innerRuns, 2);
    assert.strictEqual(innerValue, 20);
  });

  it("throws on infinite loop", () => {
    const [count, setCount] = createSignal(0);
    assert.throws(
      () => {
        createEffect(() => {
          setCount(count() + 1);
        });
      },
      { message: /maximum iterations/ },
    );
  });
});

describe("createMemo", () => {
  it("returns computed value", () => {
    const [count] = createSignal(5);
    const double = createMemo(() => count() * 2);
    assert.strictEqual(double(), 10);
  });

  it("caches value (fn called once initially)", () => {
    let calls = 0;
    const [count] = createSignal(5);
    const double = createMemo(() => {
      calls++;
      return count() * 2;
    });

    double();
    double();
    double();
    assert.strictEqual(calls, 1);
  });

  it("recomputes when dependency changes", () => {
    const [count, setCount] = createSignal(5);
    const double = createMemo(() => count() * 2);

    assert.strictEqual(double(), 10);
    setCount(10);
    assert.strictEqual(double(), 20);
  });

  it("does not recompute when dependency unchanged", () => {
    let calls = 0;
    const [count, setCount] = createSignal(5);
    const double = createMemo(() => {
      calls++;
      return count() * 2;
    });

    double();
    assert.strictEqual(calls, 1);

    setCount(5); // same value
    double();
    assert.strictEqual(calls, 1); // no recompute
  });

  it("same result stops propagation", () => {
    const [count, setCount] = createSignal(5);
    // Memo that always returns same value
    const stable = createMemo(() => {
      count();
      return "constant";
    });

    let effectRuns = 0;
    createEffect(() => {
      stable();
      effectRuns++;
    });
    assert.strictEqual(effectRuns, 1);

    setCount(10); // memo recomputes but returns same value
    assert.strictEqual(effectRuns, 1); // effect should NOT re-run
  });

  it("memo chains work", () => {
    const [count, setCount] = createSignal(2);
    const double = createMemo(() => count() * 2);
    const quadruple = createMemo(() => double() * 2);

    assert.strictEqual(quadruple(), 8);
    setCount(3);
    assert.strictEqual(quadruple(), 12);
  });

  it("diamond with memos: computes once per change", () => {
    const [a, setA] = createSignal(1);
    const b = createMemo(() => a() * 2);
    const c = createMemo(() => a() * 3);

    let effectRuns = 0;
    let result = 0;
    createEffect(() => {
      effectRuns++;
      result = b() + c();
    });

    assert.strictEqual(effectRuns, 1);
    assert.strictEqual(result, 5);

    setA(2);
    assert.strictEqual(effectRuns, 2); // effect runs once
    assert.strictEqual(result, 10);
  });

  it("detects circular memo dependencies", () => {
    // This should throw, not hang
    // Using an array to hold references so both can be assigned before either runs
    const memos: Array<() => number> = [];

    memos[0] = createMemo(() => memos[1]() + 1);
    memos[1] = createMemo(() => memos[0]() + 1);

    assert.throws(() => memos[0](), /circular/i);
  });
});

describe("createRoot", () => {
  it("provides working dispose function", () => {
    let disposed = false;
    createRoot((dispose) => {
      onCleanup(() => {
        disposed = true;
      });
      dispose();
    });
    assert.strictEqual(disposed, true);
  });

  it("dispose stops nested effects", () => {
    const [count, setCount] = createSignal(0);
    let effectRuns = 0;

    const dispose = createRoot((dispose) => {
      createEffect(() => {
        count();
        effectRuns++;
      });
      return dispose;
    });

    assert.strictEqual(effectRuns, 1);
    setCount(1);
    assert.strictEqual(effectRuns, 2);

    dispose();
    setCount(2);
    assert.strictEqual(effectRuns, 2); // effect no longer runs
  });

  it("nested roots: inner dispose does not affect outer", () => {
    const [count, setCount] = createSignal(0);
    let outerRuns = 0;
    let innerRuns = 0;

    createRoot(() => {
      createEffect(() => {
        count();
        outerRuns++;
      });

      const disposeInner = createRoot((dispose) => {
        createEffect(() => {
          count();
          innerRuns++;
        });
        return dispose;
      });

      disposeInner();
    });

    setCount(1);
    assert.strictEqual(outerRuns, 2); // outer still runs
    assert.strictEqual(innerRuns, 1); // inner stopped
  });

  it("returns value from fn", () => {
    const result = createRoot(() => {
      return 42;
    });
    assert.strictEqual(result, 42);
  });

  it("double dispose is safe (no-op)", () => {
    let cleanupCount = 0;
    const dispose = createRoot((dispose) => {
      onCleanup(() => {
        cleanupCount++;
      });
      return dispose;
    });

    dispose();
    assert.strictEqual(cleanupCount, 1);

    dispose(); // Should not throw or run cleanup again
    assert.strictEqual(cleanupCount, 1);
  });
});

describe("onCleanup", () => {
  it("runs on effect re-run", () => {
    const [count, setCount] = createSignal(0);
    let cleanupRan = false;

    createRoot(() => {
      createEffect(() => {
        count();
        onCleanup(() => {
          cleanupRan = true;
        });
      });
    });

    assert.strictEqual(cleanupRan, false);
    setCount(1); // triggers re-run
    assert.strictEqual(cleanupRan, true);
  });

  it("runs on dispose", () => {
    let cleanupRan = false;

    const dispose = createRoot((dispose) => {
      createEffect(() => {
        onCleanup(() => {
          cleanupRan = true;
        });
      });
      return dispose;
    });

    assert.strictEqual(cleanupRan, false);
    dispose();
    assert.strictEqual(cleanupRan, true);
  });

  it("multiple cleanups run in reverse order", () => {
    const order: number[] = [];

    createRoot((dispose) => {
      createEffect(() => {
        onCleanup(() => order.push(1));
        onCleanup(() => order.push(2));
        onCleanup(() => order.push(3));
      });
      dispose();
    });

    assert.deepStrictEqual(order, [3, 2, 1]);
  });

  it("effect re-run disposes children", () => {
    const [cond, setCond] = createSignal(true);
    let innerDisposed = false;

    createRoot(() => {
      createEffect(() => {
        if (cond()) {
          createEffect(() => {
            onCleanup(() => {
              innerDisposed = true;
            });
          });
        }
      });
    });

    assert.strictEqual(innerDisposed, false);
    setCond(false); // outer re-runs, inner should be disposed
    assert.strictEqual(innerDisposed, true);
  });

  it("throws when called outside reactive context", () => {
    assert.throws(() => onCleanup(() => {}), { message: /reactive context/ });
  });

  it("continues running cleanups after one throws", () => {
    const order: number[] = [];

    const dispose = createRoot((dispose) => {
      onCleanup(() => order.push(1));
      onCleanup(() => {
        throw new Error("cleanup error");
      });
      onCleanup(() => order.push(3));
      return dispose;
    });

    assert.throws(() => dispose());
    assert.deepStrictEqual(order, [3, 1]); // All cleanups ran (reverse order)
  });

  it("nested effect cleanups run in correct order", () => {
    const order: number[] = [];

    createRoot((dispose) => {
      createEffect(() => {
        onCleanup(() => order.push(1));
        createEffect(() => {
          onCleanup(() => order.push(2));
        });
      });
      dispose();
    });

    // Parent cleanup runs first, then children are disposed
    assert.deepStrictEqual(order, [1, 2]);
  });
});

describe("batch", () => {
  it("defers effect execution until end", () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    const values: number[] = [];

    createRoot(() => {
      createEffect(() => {
        values.push(a() + b());
      });
    });

    assert.deepStrictEqual(values, [3]);

    batch(() => {
      setA(10);
      // Effect has NOT run yet
      setB(20);
      // Effect has NOT run yet
    });
    // Effect runs ONCE here with final values

    assert.deepStrictEqual(values, [3, 30]);
  });

  it("effect sees all values updated", () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    let seen: [number, number] | null = null;

    createRoot(() => {
      createEffect(() => {
        seen = [a(), b()];
      });
    });

    batch(() => {
      setA(10);
      setB(20);
    });

    assert.deepStrictEqual(seen, [10, 20]);
  });

  it("nested batches: only outer flush", () => {
    const [count, setCount] = createSignal(0);
    let runs = 0;

    createRoot(() => {
      createEffect(() => {
        count();
        runs++;
      });
    });

    assert.strictEqual(runs, 1);

    batch(() => {
      setCount(1);
      batch(() => {
        setCount(2);
        // Inner batch ends, but no flush yet
      });
      setCount(3);
      // Still no flush
    });
    // Outer batch ends, flush happens

    assert.strictEqual(runs, 2); // only one additional run
  });

  it("returns fn return value", () => {
    const result = batch(() => 42);
    assert.strictEqual(result, 42);
  });

  it("restores state and flushes on exception", () => {
    const [count, setCount] = createSignal(0);
    let runs = 0;

    createRoot(() => {
      createEffect(() => {
        count();
        runs++;
      });
    });

    assert.strictEqual(runs, 1);

    assert.throws(() => {
      batch(() => {
        setCount(1);
        throw new Error("test error");
      });
    }, /test error/);

    // Effect should have run despite the exception (queue flushed in finally)
    assert.strictEqual(runs, 2);

    // Batch state should be restored - subsequent batch should work normally
    batch(() => {
      setCount(2);
    });
    assert.strictEqual(runs, 3);
  });
});

describe("untrack", () => {
  it("reads without creating dependency", () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    let runs = 0;

    createRoot(() => {
      createEffect(() => {
        runs++;
        a(); // tracked
        untrack(() => b()); // NOT tracked
      });
    });

    assert.strictEqual(runs, 1);

    setA(10); // should trigger
    assert.strictEqual(runs, 2);

    setB(20); // should NOT trigger
    assert.strictEqual(runs, 2);
  });

  it("returns fn return value", () => {
    const [count] = createSignal(42);
    const result = untrack(() => count());
    assert.strictEqual(result, 42);
  });

  it("nested untrack works", () => {
    const [a, setA] = createSignal(1);
    let runs = 0;

    createRoot(() => {
      createEffect(() => {
        runs++;
        untrack(() => {
          untrack(() => a());
        });
      });
    });

    assert.strictEqual(runs, 1);
    setA(2);
    assert.strictEqual(runs, 1); // still no dependency
  });

  it("untrack inside signal setter works", () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(10);
    let runs = 0;

    createRoot(() => {
      createEffect(() => {
        a(); // track a
        runs++;
      });
    });

    assert.strictEqual(runs, 1);

    // Set a to untracked read of b
    setA(untrack(() => b()));
    assert.strictEqual(runs, 2); // a changed, effect re-runs

    setB(20); // b is not tracked
    assert.strictEqual(runs, 2); // no re-run
  });

  it("restores observer on exception", () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    let runs = 0;

    createRoot(() => {
      createEffect(() => {
        runs++;
        a(); // tracked before untrack

        assert.throws(() => {
          untrack(() => {
            b(); // would be untracked
            throw new Error("test error");
          });
        }, /test error/);

        a(); // should still be tracked after exception
      });
    });

    assert.strictEqual(runs, 1);

    // a is tracked, effect should re-run
    setA(10);
    assert.strictEqual(runs, 2);

    // b was inside untrack, should NOT trigger
    setB(20);
    assert.strictEqual(runs, 2);
  });
});
