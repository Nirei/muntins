import assert from "node:assert";
import { describe, it } from "node:test";
import { Check, Clean, type Computation, Dirty } from "../src/core/signals.ts";

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

describe("signals", () => {
  it.todo("createSignal");
  it.todo("createEffect");
  it.todo("createMemo");
  it.todo("batch");
  it.todo("untrack");
  it.todo("createRoot");
});
