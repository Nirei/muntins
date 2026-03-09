# Building a reactive terminal UI from scratch

**A signals-driven, flexbox-powered TUI library in TypeScript needs exactly five subsystems: a fine-grained reactivity core, a flexbox layout engine, a double-buffered cell grid with differential rendering, a state-machine input parser, and a three-phase render pipeline that ties them together.** This architecture avoids the heavyweight dependencies of Ink (React + Yoga WASM) while achieving better update granularity than Ratatui's full-redraw model. The key insight is that SolidJS-style signals can surgically invalidate only the dirty portions of the component tree, layout, and cell buffer — giving you the declarative ergonomics of React with the performance profile of immediate-mode rendering.

What follows is a complete architectural blueprint, covering every subsystem's internals, data structures, algorithms, and how they interconnect.

---

## The three-phase render pipeline

The entire system flows through three phases on every update cycle: **build → layout → paint**. Signals make this pipeline incremental rather than wholesale.

**Phase 1 — Build virtual tree.** Application code declares a tree of UI nodes using reactive primitives. Each node carries a `FlexStyle` (flexbox properties) and either child nodes or a text-measurement function. Signals wrap dynamic values — when a signal changes, only the nodes reading that signal are marked dirty. The tree is *not* rebuilt from scratch on every update; instead, structural changes (conditional rendering, list items) use `createRoot` scopes that can be individually disposed and recreated.

**Phase 2 — Layout.** The flexbox algorithm walks the tree top-down, resolving flex-basis/grow/shrink per line, then positions children along main and cross axes. In a fully naive system (like Ratatui), layout runs over the *entire* tree every frame. With signals, you can skip subtrees whose inputs haven't changed — a node's layout only needs recomputation if its own style, its parent's allocated size, or its children's intrinsic sizes changed. Cache each node's last `(inputWidth, inputHeight) → LayoutResult` and invalidate via signals.

**Phase 3 — Paint.** Each leaf node writes its content (characters + styles) into a 2D cell buffer at the coordinates computed by layout. A separate `createEffect` per visible node handles painting — when a node's content signal or layout position changes, only that node's cells are rewritten in the buffer. After all effects flush, the buffer is diffed against the previous frame and minimal ANSI sequences are emitted.

The critical architectural difference from Ink is that **there is no virtual DOM reconciler**. Components are plain functions that run once (like SolidJS), creating signals and effects that persist. There is no diffing of component trees — signals handle targeted updates directly. The critical difference from Ratatui is that **you don't repaint the entire buffer every frame** — effects only repaint the specific regions that changed.

---

## Signals reactivity: the 150-line engine

The reactive core needs six primitives: `createSignal`, `createEffect`, `createMemo`, `batch`, `untrack`, and `createRoot`. The entire mechanism rests on **automatic dependency tracking via a global observer stack**.

When an effect or memo executes, it pushes itself onto a global `currentObserver` variable. Any signal getter called during that execution checks `currentObserver` and registers a bidirectional subscription: the signal adds the observer to its subscriber set, and the observer adds the signal's subscriber set to its dependency list. This bidirectional link enables cleanup — when an effect re-runs, it first removes itself from every signal's subscriber set before re-executing and collecting fresh dependencies.

```typescript
interface Computation {
  execute: () => void;
  dependencies: Set<Set<Computation>>;  // signal subscriber-sets this comp belongs to
  cleanups: (() => void)[];
  children: Computation[];
  owner: Computation | null;
}
```

**The state flags solve the diamond problem.** A naive push-based approach causes glitches: if signal A feeds both memo B and memo C, and effect D reads both B and C, a change to A would trigger D twice — once with stale C. The solution is a push-pull algorithm with three flags per node: `Clean`, `Check`, and `Dirty`. On signal write, mark direct dependents as `Dirty` and their transitive dependents as `Check`. When an effect is about to run, it walks its sources — any `Check` node recursively verifies whether *its* sources actually changed. If a memo recomputes and produces the same value, it marks itself `Clean` and propagation stops. **Effect D runs exactly once, only after both B and C have settled.**

**Batching** wraps multiple signal writes in a single flush. Increment a `batchDepth` counter on entry; signal writes during the batch queue affected subscribers rather than executing them immediately. On batch exit (depth returns to 0), flush all queued effects. SolidJS implicitly batches event handlers and render calls — your TUI should batch all input event processing and any programmatic state updates.

**The ownership tree prevents memory leaks.** Every computation created during another computation's execution becomes its child. When a parent effect re-runs, it disposes all children first (removing their subscriptions, running their cleanup callbacks, recursively disposing their children). `createRoot` creates an explicit ownership boundary with a `dispose` function — essential for conditional rendering (`<Show>`) and list rendering (`<For>`), where sub-trees must be cleanly torn down when conditions change or items are removed.

**`untrack` reads a signal without subscribing** — simply sets `currentObserver = null` during the callback. This is critical for avoiding infinite loops when an effect needs to read a signal it also writes to (though this pattern should be rare).

---

## Flexbox layout in integer character cells

The W3C flexbox algorithm (Section 9 of the spec) has six major phases. For a TUI, several simplifications make the implementation tractable in **~400–600 lines of TypeScript**.

The core data structures are minimal:

```typescript
interface FlexStyle {
  display: 'flex' | 'none';
  flexDirection: 'row' | 'column';
  flexWrap: 'nowrap' | 'wrap';
  justifyContent: 'flex-start'|'flex-end'|'center'|'space-between'|'space-around'|'space-evenly';
  alignItems: 'flex-start' | 'flex-end' | 'center' | 'stretch';
  alignSelf: 'auto' | 'flex-start' | 'flex-end' | 'center' | 'stretch';
  flexGrow: number;      // default 0
  flexShrink: number;    // default 1
  flexBasis: number | 'auto';
  width: number | 'auto';
  height: number | 'auto';
  minWidth: number;  maxWidth: number;
  minHeight: number; maxHeight: number;
  padding: [top, right, bottom, left];
  margin: [top, right, bottom, left];
  gap: number;
}

interface LayoutResult {
  x: number; y: number; width: number; height: number;
  children: LayoutResult[];
}
```

**The resolve-flexible-lengths loop is the heart of the algorithm.** For each flex line: calculate each item's flex base size (from `flex-basis` or content measurement), determine whether free space is positive (grow) or negative (shrink), then iteratively distribute space. Items whose computed size violates their min/max constraints are "frozen" at the clamped value, free space is recalculated, and the loop continues with unfrozen items. A critical detail: **shrink is weighted by `flex-shrink × flex-base-size`**, not just `flex-shrink` — larger items absorb more shrinkage, preventing small items from collapsing to zero.

**TUI-specific simplifications** that eliminate complexity:

- **Integer arithmetic throughout.** Terminal cells are discrete. Use integer division with a remainder-distribution strategy: if 10 columns split among 3 items → 4, 3, 3 (last item absorbs rounding). This avoids all floating-point rounding issues that plague browser implementations.
- **Fixed root dimensions.** The outermost container always knows its size (`process.stdout.columns × process.stdout.rows`), eliminating indefinite-size resolution complexity.
- **Simplified box model.** Borders are always exactly 1 character wide. Padding is in whole characters. No `border-box` vs `content-box` distinction needed.
- **No intrinsic sizing complexity.** Text width equals the string's display width (accounting for double-width CJK/emoji via `wcwidth`). Text height equals line count after wrapping. No font metrics, no sub-pixel text measurement.
- **Skip rarely-needed features.** `order` property, `wrap-reverse`, baseline alignment, writing modes, and `visibility: collapse` are unnecessary for most TUI applications. Reverse flex directions can be implemented by simply reversing the children array.

The algorithm runs recursively for nested flex containers. When computing a child's hypothetical size and that child is itself a flex container, recursively compute its layout to determine its intrinsic content size. Cache results keyed on `(availableWidth, availableHeight)` to avoid redundant computation during the iterative resolve loop.

Reference implementations to study: the **ColinEberhardt/css-layout-agentic** repository covers all major features (wrapping, min/max, nested containers, margins/padding) in a single clean `computeLayout()` function. The **tchayen/red-otter** engine achieves near-Yoga parity in ~600 lines of TypeScript using a 3-pass approach: top-down build queue, bottom-up resolve auto sizes, top-down resolve flex and alignment.

---

## Cell buffer and differential rendering

The terminal's rendering target is a flat array of cells in row-major order. Each cell stores a grapheme cluster (the character), foreground color, background color, and style modifier flags packed into a bitmask:

```typescript
interface Cell {
  symbol: string;           // grapheme cluster; '' for continuation of double-width char
  fg: Color;                // default | named(0-7) | bright(0-7) | palette(0-255) | rgb(r,g,b)
  bg: Color;
  modifiers: number;        // bitmask: BOLD=1, DIM=2, ITALIC=4, UNDERLINE=8, ...
}
```

**Double-buffering drives differential rendering.** Maintain two buffers: `current` (the render target for this frame) and `previous` (what's on screen). After painting, iterate both buffers cell-by-cell. For each position where `current[i] !== previous[i]`, emit the ANSI sequences to update that cell. Then swap: `previous` becomes `current`, and `current` is reset for the next frame.

**Style diffing minimizes ANSI output.** Track a "current style state" as you emit cells left-to-right. Only emit SGR (Select Graphic Rendition) codes when the style actually changes. When removing modifiers (transitioning from bold+italic to plain), a full reset (`SGR 0`) plus re-application of the new style is typically cheaper than individual removal codes. When only adding modifiers or changing colors, emit only the delta. Colors use three encoding formats: **16-color** (`\x1b[31m` for red foreground), **256-color** (`\x1b[38;5;196m`), and **24-bit true color** (`\x1b[38;2;255;0;0m`).

**Cursor positioning is the other major optimization.** When consecutive cells in a row all changed, the cursor naturally advances — no repositioning needed. Only emit `\x1b[row;colH` when there's a gap of unchanged cells. For rows where >60% of cells changed, it's often cheaper to erase the line (`\x1b[2K`) and rewrite it entirely rather than patching individual cells.

**All output goes into a single string, flushed with one `process.stdout.write()` call.** Multiple small writes cause syscall overhead and visual tearing. Bracket the entire output with cursor-hide (`\x1b[?25l`) and cursor-show (`\x1b[?25h`) to prevent flicker. On startup, enter the alternate screen buffer (`\x1b[?1049h`) to preserve the user's scrollback; on exit, restore it (`\x1b[?1049l`).

**Double-width characters require special handling.** CJK ideographs and many emoji occupy two terminal columns. When placing one at column `x`, set `cells[x].symbol` to the character and `cells[x+1].symbol` to `''` (a continuation marker). During rendering, skip continuation cells — the terminal has already advanced the cursor past them. A `wcwidth` lookup table (Unicode East Asian Width property, binary-searched over sorted intervals) determines display width. This is the primary performance bottleneck for CJK-heavy content — Ratatui's `Buffer::diff()` reportedly spends **half its frame time** on Unicode width calculations for complex screens.

---

## Input handling as a state machine

Terminal input arrives as a byte stream on `process.stdin` in raw mode. A state-machine parser transforms this into typed events.

**Setup requires four steps**: enable raw mode (`stdin.setRawMode(true)`), enable SGR mouse tracking (`\x1b[?1000h\x1b[?1002h\x1b[?1006h`), enable focus reporting (`\x1b[?1004h`), and enable bracketed paste (`\x1b[?2004h`). All must be reversed on exit — register handlers for `exit`, `SIGINT`, `SIGTERM`, and `uncaughtException` to guarantee cleanup. A terminal left in raw mode without mouse tracking disabled is unusable.

**The parser state machine has five states**: `GROUND` (normal characters), `ESCAPE` (received `0x1B`, waiting for disambiguation), `CSI` (inside a `\x1b[` sequence, collecting parameters), `SS3` (inside `\x1b O` sequence for F1-F4), and `SGR_MOUSE` (inside `\x1b[<` mouse sequence).

**The escape key timeout problem** is the fundamental ambiguity: ESC (`0x1B`) is both a standalone key and the prefix of all escape sequences. When ESC arrives, start a **50–100ms timer**. If more bytes arrive, parse them as a sequence. If the timer fires with no continuation, emit an Escape key event. The Kitty keyboard protocol eliminates this ambiguity entirely by giving ESC its own unambiguous CSI sequence, but requires terminal support.

**Keyboard events** decompose into: regular characters (single bytes or UTF-8 multi-byte), control characters (Ctrl+A through Ctrl+Z, mapped from byte values 1–26), special keys (arrows as `\x1b[A-D`, function keys as `\x1b[15~` through `\x1b[24~`, with modifiers encoded as `\x1b[1;{mod}A` where mod = 1+bitmask for shift/alt/ctrl), and Alt combinations (ESC prefix followed by the key).

**SGR mouse events** use format `\x1b[<button;col;rowM` for press and `\x1b[<button;col;rowm` for release. Button values encode: 0=left, 1=middle, 2=right, 64=scroll-up, 65=scroll-down, with modifier bits added (4=shift, 8=alt, 16=ctrl). Motion events add 32 to the button value. SGR is strongly preferred over the legacy X10 protocol because it supports coordinates beyond column 223 and distinguishes press from release.

**Window resize** arrives via `SIGWINCH` signal, not stdin. Listen on both `process.on('SIGWINCH')` and `process.stdout.on('resize')`, then read `process.stdout.columns` and `process.stdout.rows` for the new dimensions. On resize, reallocate both cell buffers and trigger a full re-layout.

The event types should be a discriminated union:

```typescript
type InputEvent =
  | { type: 'key'; key: string; char: string; ctrl: boolean; alt: boolean; shift: boolean }
  | { type: 'mouse'; action: 'press'|'release'|'move'|'scroll'; button: number;
      x: number; y: number; ctrl: boolean; alt: boolean; shift: boolean }
  | { type: 'resize'; width: number; height: number }
  | { type: 'paste'; text: string }
  | { type: 'focus'; focused: boolean };
```

---

## How signals connect to the render pipeline

This is where the architecture diverges most sharply from existing TUI libraries. Rather than Ink's React reconciler or Ratatui's full-redraw approach, signals create a **direct binding between state and cell buffer writes**.

**Components are functions that run once.** Like SolidJS, a component function executes a single time to set up its reactive bindings. It creates signals for local state, memos for derived values, and effects that paint to the buffer. It returns a node descriptor (style + children or measure function) for the layout tree.

```typescript
function Counter() {
  const [count, setCount] = createSignal(0);

  // This node participates in flexbox layout
  return Box({
    flexDirection: 'column',
    padding: [1, 1, 1, 1],
    children: [
      Text({ content: () => `Count: ${count()}` }),   // effect auto-created for text content
      Text({ content: () => `Double: ${count() * 2}` }),
    ],
  });
}
```

**Layout invalidation uses a dirty flag propagated via signals.** Each layout node stores a `needsLayout` signal. When a node's style or content size changes, `needsLayout` is set to `true`. A top-level layout effect watches this flag; when it fires, it re-runs the flexbox algorithm starting from the highest dirty node (not necessarily the root). Subtrees with clean inputs skip entirely.

**Painting is per-node effects.** Each visible leaf node has a `createEffect` that reads its layout position (x, y, width, height — stored as signals by the layout phase) and its content, then writes cells into the buffer. When only a text content signal changes (not position or size), only that node's cells are rewritten. When a layout change shifts a node's position, the effect clears the old cells and writes to the new position.

**The render cycle is batched.** Input events are processed inside a `batch()` call, so all state mutations from a single keypress or mouse event produce one coordinated update. After the batch flushes, layout effects run (if needed), then paint effects run (if needed), then the buffer is diffed and flushed to stdout. This guarantees **at most one terminal write per input event**, with only the minimum necessary cells updated.

**Conditional and list rendering use ownership scopes.** A `Show(condition, () => child)` primitive creates a `createRoot` scope for the child. When the condition becomes false, the root is disposed — cleaning up all child effects, removing the subtree from the layout tree, and clearing its cells from the buffer. `For(items, (item) => child)` maps each item to its own root, enabling efficient add/remove/reorder without rebuilding the entire list.

---

## Lessons from existing libraries and what to avoid

**Ink proves that declarative UI works for terminals** but pays a steep tax: React's reconciler + Yoga's WASM binary add ~100ms startup time, ~1.5MB binary weight, and a full-repaint-by-default strategy. The `<Static>` component — rendering completed items once above the dynamic UI — is a pattern worth borrowing. Ink's `react-reconciler` bridge, which maps React's `createInstance`/`appendChild`/`commitUpdate` to a Yoga node tree, is architecturally elegant but heavy.

**Ratatui demonstrates the power of buffer diffing** with sub-millisecond render times in Rust. Its immediate-mode model (no retained widget state) prevents stale-state bugs but forces manual state management and full-tree redraw every frame. Its Cassowary-based constraint layout is lighter than flexbox but less expressive. The `Widget` trait (`render(self, area, buf)`) is clean but consumes the widget on render, complicating reuse.

**Blessed achieved remarkable terminal optimization** with CSR (Change Scroll Region) for efficient scrolling and BCE (Back-Color Erase) for background handling. Its damage-buffer approach with smart cursor movement is the gold standard for minimizing terminal I/O. However, its 16,000-line monolithic codebase, lack of modern reactivity, and abandoned maintenance make it a cautionary tale about complexity accumulation.

**Bubble Tea (Go) validates the Elm Architecture for TUI** — its Model-Update-View cycle produces extremely clean application code. But returning raw strings from `View()` with no structured layout system is limiting for complex UIs. **Textual (Python) proves CSS-like styling works for terminals** — its TCSS engine with reactive attributes and hot-reload is excellent developer experience, though Python's performance ceiling limits it.

The synthesis: **use signals (not React) for reactivity, flexbox (not Cassowary) for layout, buffer diffing (from Ratatui/Blessed) for rendering, and SolidJS-style one-time component execution (not Elm's full-view-rebuild) for the component model.** This combination gives declarative ergonomics, fine-grained updates, familiar layout semantics, and minimal terminal I/O.

---

## Recommended module structure

The library decomposes into five independent modules with clean interfaces between them. No module depends on more than one other.

- **`core/signals.ts`** — `createSignal`, `createEffect`, `createMemo`, `batch`, `untrack`, `createRoot`, `onCleanup`. Zero dependencies. Fully self-contained push-pull reactive core.
- **`core/layout.ts`** — `computeLayout(node, availableWidth, availableHeight) → LayoutResult`. Pure function, no side effects, no dependency on signals. Takes a tree of `{style, children, measure?}` nodes, returns a tree of `{x, y, width, height}` results.
- **`core/buffer.ts`** — `Buffer` class (cell grid), `diff(current, previous)` function, `flush(updates) → string` ANSI serializer. The buffer handles double-width characters, style diffing, and cursor optimization.
- **`core/input.ts`** — State-machine parser, terminal mode setup/teardown, event type definitions. Converts raw stdin bytes into typed `InputEvent` objects.
- **`core/runtime.ts`** — The glue layer. Manages the render cycle: processes input events in a batch, runs layout if dirty, runs paint effects, diffs and flushes the buffer. Provides the component primitives (`Box`, `Text`, `Show`, `For`) that wire signals to layout nodes and buffer writes.

## Conclusion

The architecture rests on one non-obvious insight: **signals eliminate the need for both a virtual DOM reconciler and full-frame redraws.** In Ink's model, React diffs the component tree to find what changed, then Yoga re-layouts, then the full output is regenerated. In Ratatui's model, the entire UI is redrawn into a fresh buffer every frame, then diffed against the previous frame. Signals cut through both approaches — state changes propagate directly to the exact layout nodes and buffer cells affected, skipping everything else.

The priority ordering of **Simplicity > Performance > Features** maps to concrete decisions: use integer arithmetic everywhere (simpler than float), implement only the flexbox subset that TUIs actually need (row, column, grow, shrink, wrap, alignment — skip `order`, reverse, baseline), start with push-based signals and upgrade to push-pull only if diamond glitches prove problematic in practice, and implement mouse support as opt-in (most TUI apps are keyboard-first). Build the five modules independently with clear interfaces, write each one test-first against known-good reference outputs, and resist the temptation to add features until the core pipeline is rock-solid.
