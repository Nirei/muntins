# AGENTS.md - Muntins

Muntins is a signals-driven, flexbox-powered terminal UI (TUI) library in TypeScript.
SolidJS-style reactivity with CSS flexbox layout. Early development with architecture in `/docs`.

## Core Principles

1. **Readability and simplicity above all.** Clear code beats clever code.
2. **Correct by design.** Structure data and types so invalid states are unrepresentable.
3. **Everything is tested.** No exceptions. Tests verify behaviour, not implementation.
4. **Fix issues immediately.** When you see a problem, fix it now.
5. **Bugfixes start with a test.** Write a failing test first, then fix the code.
6. **NEVER discard unstaged changes.** Before running any git operation that could discard, overwrite, or reset user changes (e.g., `git checkout`, `git reset`, `git stash`, `git clean`), you MUST check for unstaged changes with `git status` and ask the user for explicit confirmation. Losing user work is unacceptable.

## Build/Test/Lint Commands

```bash
npm run build        # Compile TypeScript (tsc)
npm run typecheck    # Type check without emitting
npm test             # Run all tests (Node.js test runner)
npm run lint         # Check with Biome
npm run lint:fix     # Auto-fix lint issues + organize imports
npm run format       # Format code
npm run knip         # Find unused exports/dependencies
```

### Running Single Tests

```bash
node --experimental-strip-types --test test/signals.test.ts   # Single file
node --experimental-strip-types --test --test-name-pattern="createSignal" test/signals.test.ts
```

## Code Style

### Formatting (Biome)

- **Indentation**: 2 spaces
- **Line width**: 80 characters
- **Quotes**: Double quotes for strings
- **Imports**: Auto-organized by Biome (run `npm run lint:fix`)
- **Semicolons**: Required
- **No barrel files**: Never create `index.ts` files that only re-export from other modules. Import directly from the source module. Barrel files break tree-shaking and obscure dependencies.

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
<type>: <description>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `style`

Examples:
- `feat: add createMemo primitive`
- `fix: prevent effect re-entry during batch`
- `refactor: move core modules to src/core/`
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

| Document | Description |
|---|---|
| `docs/ARCHITECTURE.md` | System architecture: the five core modules, their responsibilities, data structures, and how they connect through the build → layout → paint pipeline. |
| `docs/API.md` | Public API reference and usage examples covering primitives, layout, reactivity, focus, events, and composable component patterns. |
| `docs/WHEEL.md` | Node.js APIs, ECMA globals, and external specifications to leverage — what the library should use rather than reimplement from scratch. |

## External Specifications

- **Flexbox**: W3C CSS Flexible Box Layout Level 1, Section 9
- **Terminal styles**: ECMA-48 (SGR sequences)
- **Mouse input**: xterm SGR mouse protocol
- **Character width**: Unicode UAX #11 (East Asian Width)
- **Grapheme segmentation**: Unicode TR #29 (via `Intl.Segmenter`)
- **Keyboard (optional)**: Kitty Keyboard Protocol

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

## Common Tasks

### Adding a new signal primitive

1. Write tests in `test/signals.test.ts` first
2. Add implementation in `src/signals.ts`
3. Export from `src/index.ts`
4. Run `npm test && npm run typecheck && npm run lint`

### Implementing layout features

1. Reference W3C Flexbox spec Section 9
2. Use integer arithmetic (terminal cells are discrete)
3. Handle double-width characters (CJK, emoji)
4. Cache layout results keyed on `(availableWidth, availableHeight)`

### Working with the buffer

1. Cell = grapheme + fg color + bg color + style modifiers
2. Double-buffer: current (write target) and previous (screen state)
3. Diff buffers, emit minimal ANSI sequences
4. Single `process.stdout.write()` call per frame
