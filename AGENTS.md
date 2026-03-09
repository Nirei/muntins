# AGENTS.md - Muntins

Muntins is a signals-driven, flexbox-powered terminal UI (TUI) library in
TypeScript. SolidJS-style reactivity with CSS flexbox layout.

## Core Principles

1. **Readability and simplicity above all.** Clear code beats clever code.
2. **Correct by design.** Structure data and types so invalid states are unrepresentable.
3. **Everything is tested.** No exceptions. Tests verify behaviour, not implementation.
4. **Fix issues immediately.** When you see a problem, fix it now. Issues being pre-existing is not an excuse not to fix.
5. **Bugfixes start with a test.** Write a failing test first, then fix the code.
6. **NEVER discard unstaged changes.** Before running any git operation that could discard, overwrite, or reset user changes (e.g., `git checkout`, `git reset`, `git stash`, `git clean`), you MUST check for unstaged changes with `git status` and ask the user for explicit confirmation. Losing user work is unacceptable.

### Running Single Tests

```bash
node --experimental-strip-types --test test/signals.test.ts   # Single file
node --experimental-strip-types --test --test-name-pattern="createSignal" test/signals.test.ts
```

### Naming Conventions

| Type | Convention | Examples |
|------|------------|----------|
| Functions | camelCase | `createSignal`, `createEffect`, `computeLayout` |
| Types/Interfaces | PascalCase | `FlexStyle`, `LayoutResult`, `InputEvent` |
| Constants (bitmasks) | UPPER_CASE | `BOLD = 1`, `DIM = 2`, `ITALIC = 4` |
| Files | lowercase/kebab | `signals.ts`, `layout.ts`, `runtime.ts` |
| Components | PascalCase | `Box()`, `Text()`, `Show()`, `For()` |

### Comment Style

- Single line `//` for brief notes and TODOs
- Internals should be self-documenting through clear naming and types, **avoid**
  JSDoc on private or implementation code.
- Public API exports **must have** JSDoc covering intent, edge cases, and any
  non-obvious behaviour. It should add information beyond what the types already
  express.

### Commits

Use [Conventional Commits](https://www.conventionalcommits.org/). Format:

```
<type>(optional scope): <description>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `style`

Examples:
- `feat: add createMemo primitive`
- `fix: prevent effect re-entry during batch`
- `refactor(core): move core modules to src/core/`
- `docs: update architecture module paths`

## Architecture

Five modules with clean interfaces (no module depends on more than one other):

| Module | Purpose |
|--------|---------|
| `core/signals.ts` | Reactive core: createSignal, createEffect, etc. |
| `core/layout.ts` | Flexbox layout: computeLayout() |
| `core/buffer.ts` | Cell buffer, diff, ANSI serialization |
| `core/input.ts` | Keyboard/mouse parsing, terminal setup |
| `core/runtime.ts` | Render pipeline, components (Box, Text) |
| `index.ts` | Public API re-exports |

### Key Design Principles

1. **Components run once** - No re-renders. Signals handle updates.
2. **Two primitives** - `Box` and `Text` are the only layout primitives.
3. **Flexbox layout** - CSS flexbox semantics in terminal cells.
4. **Fine-grained reactivity** - Surgical updates, no virtual DOM diffing.
5. **Zero runtime dependencies** - Only dev dependencies (Biome, TypeScript, Knip).
6. **No barrel files** - Never create `index.ts` files that only re-export from other modules. Import directly from the source module. Barrel files break tree-shaking and obscure dependencies.

| Document | Description |
|---|---|
| `docs/ARCHITECTURE.md` | System architecture: the five core modules, their responsibilities, data structures, and how they connect through the build → layout → paint pipeline. |
| `docs/API.md` | Public API reference and usage examples covering primitives, layout, reactivity, focus, events, and composable component patterns. |
| `docs/WHEEL.md` | Node.js APIs, ECMA globals, and external specifications to leverage, what the library should use rather than reimplement from scratch. |

## Testing Guidelines

```typescript
import { describe, it } from "node:test";
import assert from "node:assert";

describe("signals", () => {
  it("createSignal returns getter and setter", () => {
    const [count, setCount] = createSignal(0);
    assert.strictEqual(count(), 0);
    setCount(1);
    assert.strictEqual(count(), 1);
  });

  it.todo("createEffect");  // Placeholder for pending tests
});
```

Tests must be black-box: verify behaviour through interface, never implementation details.

## Notes

- Biome LSP will automatically convert any `let` variables that are never written into `const`. Don't lose time attempting to turn them back. When later changes write to them, that's the time to change to `let`.
- tasks and devlog directory are part of our local workflow and are not persisted to git.
 