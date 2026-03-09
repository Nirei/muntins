# Signals

Signals are the reactivity system at the heart of Muntins. They let you create reactive state that automatically updates your UI when values change.

The core idea is simple: instead of manually tracking what needs to update when data changes, you declare relationships between data and effects. The system figures out the rest.

## createSignal

Creates a reactive value with a getter and setter.

```typescript
const [count, setCount] = createSignal(0);

count();        // 0
setCount(1);
count();        // 1
```

The getter is a function you call to read the current value. The setter updates it.

### Setter forms

The setter accepts either a new value or a function that receives the previous value:

```typescript
setCount(5);           // set directly
setCount(n => n + 1);  // update based on previous
```

### Equality check

If you set a signal to a value equal to its current value (compared with `Object.is`), nothing happens. No effects run, no updates propagate.

```typescript
const [name, setName] = createSignal("alice");
setName("alice");  // no-op, value unchanged
```

## createEffect

Runs a function immediately and re-runs it whenever any signal it reads changes.

```typescript
const [count, setCount] = createSignal(0);

createEffect(() => {
  console.log("Count is", count());
});
// logs: "Count is 0"

setCount(1);
// logs: "Count is 1"
```

Dependencies are tracked automatically. The effect re-runs when `count` changes because it called `count()` during execution.

### Dynamic dependencies

Effects track whatever signals they actually read on each run. If your effect conditionally reads different signals, only the ones read in the most recent execution are tracked.

```typescript
const [showDetails, setShowDetails] = createSignal(false);
const [name, setName] = createSignal("alice");
const [bio, setBio] = createSignal("...");

createEffect(() => {
  if (showDetails()) {
    console.log(name(), bio());
  } else {
    console.log(name());
  }
});

// Initially, effect depends on showDetails and name (not bio)
setBio("new bio");  // effect does NOT re-run

setShowDetails(true);  // effect re-runs, now depends on all three
setBio("newer bio");   // effect re-runs
```

## createMemo

Creates a cached derived value that only recomputes when its dependencies change.

```typescript
const [count, setCount] = createSignal(0);
const doubled = createMemo(() => count() * 2);

doubled();  // 0
setCount(5);
doubled();  // 10
```

Memos are lazy. They don't compute until you read them. After that, they cache the result and only recompute when a dependency changes.

### Stopping propagation

When a memo recomputes, it compares the new value to the previous one. If they're equal (via `Object.is`), downstream effects and memos don't re-run.

```typescript
const [items, setItems] = createSignal([1, 2, 3]);
const count = createMemo(() => items().length);

createEffect(() => {
  console.log("Count:", count());
});
// logs: "Count: 3"

setItems([4, 5, 6]);  // different array, same length
// effect does NOT re-run (count is still 3)
```

This makes memos useful for expensive computations and for preventing unnecessary work downstream.

## createRoot

Creates an ownership boundary for cleanup. All effects and memos created inside become children of the root.

```typescript
createRoot(dispose => {
  const [count, setCount] = createSignal(0);
  
  createEffect(() => {
    console.log(count());
  });

  // Later, clean everything up
  setTimeout(() => dispose(), 5000);
});
```

When you call `dispose`, all effects and memos created within the root are cleaned up. Their cleanup callbacks run, and they stop reacting to signal changes.

Roots can nest. Disposing a parent disposes all its children.

## onCleanup

Registers a callback that runs when the enclosing computation re-runs or is disposed.

```typescript
createEffect(() => {
  const id = setInterval(() => console.log("tick"), 1000);
  
  onCleanup(() => {
    clearInterval(id);
  });
});
```

This is how you clean up resources like timers, subscriptions, or event listeners.

Cleanup callbacks run in reverse order (last registered runs first). If the effect re-runs, cleanups run before the new execution. If the effect is disposed, cleanups run once and the effect stops.

Must be called inside a reactive context (`createRoot`, `createEffect`, or `createMemo`). Throws an error otherwise.

## onMount

Registers a callback that runs once after the enclosing computation's initial execution.

```typescript
createEffect(() => {
  onMount(() => {
    console.log("Effect ran for the first time");
  });

  console.log("Effect running");
});
// logs: "Effect running"
// logs: "Effect ran for the first time"
```

Unlike effects, mount callbacks don't re-run when dependencies change. Use this for one-time setup.

Mount callbacks can register cleanups:

```typescript
createEffect(() => {
  onMount(() => {
    const subscription = api.subscribe();
    onCleanup(() => subscription.close());
  });
});
```

Must be called inside a reactive context. Logs a warning and does nothing if called outside.

## batch

Groups multiple signal updates so effects only run once at the end.

```typescript
const [a, setA] = createSignal(0);
const [b, setB] = createSignal(0);

createEffect(() => {
  console.log("sum:", a() + b());
});
// logs: "sum: 0"

batch(() => {
  setA(1);
  setB(2);
});
// logs: "sum: 3" (once, not twice)
```

Without `batch`, the effect would run after each setter. With `batch`, it runs once after both updates complete, seeing the final values.

Batches can nest. Effects run when the outermost batch completes.

Returns whatever your function returns:

```typescript
const result = batch(() => {
  setA(1);
  return "done";
});
// result === "done"
```

## untrack

Reads signals without creating dependencies.

```typescript
const [a, setA] = createSignal(0);
const [b, setB] = createSignal(0);

createEffect(() => {
  const aVal = a();
  const bVal = untrack(() => b());
  console.log(aVal, bVal);
});
// logs: "0 0"

setA(1);  // effect re-runs
setB(1);  // effect does NOT re-run
```

The effect tracks `a` but not `b`, because `b()` was called inside `untrack`.

This is useful when you need to read a signal's value without wanting to re-run when it changes.

Returns whatever your function returns:

```typescript
const value = untrack(() => expensiveSignal());
```
