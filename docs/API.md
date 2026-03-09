# Muntins — Public API (vision)

## Philosophy

- **Components are functions that run once.** No re-renders. Signals handle all updates.
- **The UI is a tree of `Box` and `Text`.** Everything else (buttons, lists, scroll) is composed on top of these two primitives.
- **Styles are flexbox.** If you know CSS flexbox, you already know Muntins.
- **Events bubble up** through the focus tree. There is no global event delegation.

---

## 1. Hello world

```typescript
import { mount, Box, Text } from 'muntins';

mount(() =>
  Box({
    padding: 1,
    children: [
      Text({ content: 'Hello, world!' })
    ],
  })
);
```

---

## 2. Basic reactivity

```typescript
import { mount, Box, Text, createSignal } from 'muntins';

function Counter() {
  const [count, setCount] = createSignal(0);

  return Box({
    flexDirection: 'column',
    gap: 1,
    padding: 1,
    children: [
      Text({ content: () => `Count: ${count()}` }),
      Text({
        content: '↑/↓ to change',
        onKeyPress(key) {
          if (key.name === 'up')   setCount(c => c + 1);
          if (key.name === 'down') setCount(c => c - 1);
          if (key.name === 'q')    process.exit(0);
        },
      }),
    ],
  });
}

mount(Counter);
```

`onKeyPress` is only called when the node is **focused** (see section 6).

---

## 3. Layout

Muntins implements a full subset of CSS Flexbox.
All values are in **terminal cells** (characters), not pixels.

```typescript
Box({
  // direction
  flexDirection: 'row',        // 'row' | 'column'  (default: 'row')
  flexWrap: 'wrap',            // 'nowrap' | 'wrap'

  // main axis distribution
  justifyContent: 'space-between',

  // cross axis alignment
  alignItems: 'center',

  // sizing
  width: 40,
  height: 10,
  flex: 1,                     // shorthand for flexGrow: 1
  flexGrow: 1,
  flexShrink: 0,
  flexBasis: 20,
  minWidth: 10,
  maxWidth: 80,

  // spacing
  padding: 1,                  // all sides
  padding: [1, 2],             // [vertical, horizontal]
  padding: [1, 2, 1, 2],       // [top, right, bottom, left]
  gap: 1,

  // positioning
  position: 'absolute',        // takes the node out of normal flow
  top: 0, right: 0,

  // visibility
  display: 'none',             // () => condition ? 'flex' : 'none'

  // children
  children: [...],
});
```

Any style prop can be a **reactive getter**:

```typescript
Box({
  width: () => showSidebar() ? 20 : 0,
  display: () => showSidebar() ? 'flex' : 'none',
  children: [...],
});
```

---

## 4. Conditional rendering and lists

### `Show`

```typescript
import { Show } from 'muntins';

Show({
  when: () => isLoggedIn(),
  then: () => Dashboard(),
  else: () => LoginScreen(),   // optional
});
```

Reactively creates and destroys the subtree.
When the condition changes from `true` to `false`, the subtree is **fully disposed**.

### `For`

```typescript
import { For } from 'muntins';

const [items, setItems] = createSignal(['one', 'two', 'three']);

For({
  each: items,
  render: (item, index) =>
    Box({
      padding: [0, 1],
      children: [
        Text({ content: () => `${index() + 1}. ${item()}` })
      ],
    }),
});
```

Each element has its own reactive scope. Adding or removing items does not recreate the others.
`item` and `index` are **getters** — they update if the list mutates rather than being replaced.

Use the `key` prop when item identity isn't based on object reference:

```typescript
For({
  each: () => users,
  key: (user) => user.id,
  render: (user) => Text({ content: () => user().name }),
});
```

---

## 5. Borders

Borders are part of `Box` and consume space in the layout (like `box-sizing: border-box`).

```typescript
Box({
  border: true,               // simple border on all sides
  border: 'round',            // rounded corners
  border: 'double',           // double line
  border: { top: true, left: true },   // selective borders
  borderColor: 'cyan',
  borderStyle: 'round',       // alias for border: 'round'
  children: [...],
});
```

Available border styles: `'single'` `'round'` `'double'` `'bold'` `'dashed'` `'ascii'`

---

## 6. Focus and keyboard events

Focus determines which node receives keyboard events.

### Declaring focusable nodes

Nodes declare themselves focusable. Tab order is derived from tree order automatically.
`autoFocus` sets the initially focused node.

```typescript
TextInput({ focusable: true, autoFocus: true })
TextInput({ focusable: true })
TextInput({ focusable: true })
```

### Imperative focus API

`useFocus()` provides programmatic control over focus. It reads the nearest focus scope in the tree.

```typescript
const focus = useFocus();

focus.next();           // move to next focusable in tree order
focus.prev();           // move to previous
focus.set(ref);         // focus a specific node
focus.current();        // signal → currently focused node
```

For targeting a specific node imperatively — e.g. focusing a search box when the user presses `/`:

```typescript
const searchRef = createRef();

TextInput({ focusable: true, ref: searchRef })

Box({
  onKeyPress(key) {
    if (key.char === '/') { focus.set(searchRef); return true; }
  },
  children: [...],
})
```

### Focus navigation as a pluggable component

There is no hardcoded key for cycling focus. Instead, Muntins ships `TabFocus` as a
convenience component — a plain `Box` that calls `focus.next()` / `focus.prev()` on Tab:

```typescript
import { TabFocus } from 'muntins';

// Wrap the app root to get tab navigation app-wide
mount(() =>
  TabFocus({ children: [App()] })
);
```

`TabFocus` is just a regular component — it has no special privileges:

```typescript
function TabFocus(props: { children: Node[] }) {
  const focus = useFocus();

  return Box({
    onKeyPress(key) {
      if (key.name === 'tab' && !key.shift) { focus.next(); return true; }
      if (key.name === 'tab' &&  key.shift) { focus.prev(); return true; }
    },
    children: props.children,
  });
}
```

You can write your own variant — arrow keys, vi-style `j`/`k`, anything — and plug it in the same way.

Use `TabFocus({ trap: true, ... })` to trap focus within a scope (useful for modals).

### Event bubbling

Keyboard events **bubble up the tree** if the focused node does not consume them.
To consume an event (stop it from bubbling), the handler returns `true`:

```typescript
onKeyPress(key) {
  if (key.name === 'enter') {
    submit();
    return true;  // consumed
  }
  // returning nothing → bubbles to parent
}
```

---

## 7. Mouse

```typescript
Box({
  onMousePress(event)   { /* event.x, event.y, event.button */ },
  onMouseRelease(event) { },
  onMouseMove(event)    { },
  onScroll(event)       { /* event.direction: 'up' | 'down' */ },
  onHover(hovering)     { /* true when the cursor is over the node */ },
  children: [...],
});
```

The mouse system automatically computes whether the cursor is inside a node's bounding box.

---

## 8. Composite components: a real example

Higher-level components are built **purely as compositions** of `Box` and `Text`.
Muntins provides none of them — but here is what they would look like:

```typescript
// Button.ts
interface ButtonProps {
  label: string;
  onPress?: () => void;
  focused?: () => boolean;
}

function Button({ label, onPress, focused = () => false }: ButtonProps) {
  return Box({
    padding: [0, 2],
    border: 'round',
    borderColor: () => focused() ? 'cyan' : 'white',
    onMousePress: onPress,
    onKeyPress(key) {
      if (key.name === 'enter' || key.name === 'space') {
        onPress?.();
        return true;
      }
    },
    children: [
      Text({ content: label })
    ],
  });
}
```

```typescript
// Scrollable.ts
interface ScrollableProps {
  height: number;
  children: Node[];
}

function Scrollable({ height, children }: ScrollableProps) {
  const [offset, setOffset] = createSignal(0);

  return Box({
    height,
    overflow: 'hidden',       // clip content
    onScroll(e) {
      setOffset(o => Math.max(0, o + (e.direction === 'down' ? 1 : -1)));
    },
    onKeyPress(key) {
      if (key.name === 'up')   { setOffset(o => Math.max(0, o - 1)); return true; }
      if (key.name === 'down') { setOffset(o => o + 1); return true; }
    },
    children: [
      Box({
        flexDirection: 'column',
        marginTop: () => -offset(),   // the scroll trick: negative margin
        children,
      })
    ],
  });
}
```

---

## 9. `mount` and lifecycle

```typescript
import { mount, onMount, onCleanup } from 'muntins';

function App() {
  onMount(() => {
    // terminal is already in raw mode, alternate buffer is active
  });

  onCleanup(() => {
    // called on exit — muntins restores the terminal automatically
  });

  return Box({ children: [/* ... */] });
}

// mount options
const app = mount(App, {
  stdout: process.stdout,   // default
  stdin: process.stdin,     // default
  fps: 60,                  // max redraws per second (default: 60)
  mouse: true,              // enable mouse tracking (default: false)
  alternateScreen: true,    // alternate screen buffer (default: true)
});

app.unmount();  // manual cleanup if needed
```

---

## 10. Text styles

```typescript
Text({
  content: 'Hello',
  color: 'red',                     // name | '#rrggbb' | [r, g, b]
  backgroundColor: '#1a1a2e',
  bold: true,
  italic: true,
  underline: true,
  strikethrough: true,
  dim: true,
  inverse: true,                    // swap fg and bg
  wrap: 'wrap',                     // 'wrap' | 'truncate' | 'truncate-end' | 'truncate-start'
});

// Content and styles can be reactive
Text({
  content: () => `Status: ${status()}`,
  color: () => status() === 'ok' ? 'green' : 'red',
  bold: () => status() === 'error',
});
```

---

## 11. Public API reference

```typescript
// Layout primitives
mount(component, options?)
Box(props)           // { children, ...flexStyle, ...eventHandlers }
Text(props)          // { content, ...textStyle, ...eventHandlers }

// Conditional rendering and lists
Show(props)          // { when, then, else? }
For(props)           // { each, render, key? }

// Reactivity (re-exported from core)
createSignal(initial)
createMemo(fn)
createEffect(fn)
batch(fn)
untrack(fn)
onMount(fn)
onCleanup(fn)
createRoot(fn)

// Focus
useFocus()         // { next, prev, set, current }
createRef()        // for targeting specific nodes imperatively
TabFocus           // pluggable component for tab/shift-tab navigation

// Event types
KeyEvent    { name, char, ctrl, alt, shift, sequence }
MouseEvent  { x, y, button, ctrl, alt, shift, action }
ScrollEvent { x, y, direction, ctrl, alt, shift }
```

---

## What Muntins does **not** include in its core

These are examples of what someone would build **on top of** Muntins:

- `TextInput` — a `Box` that maintains an editable text buffer
- `Select` / `Dropdown` — a list using `For` + focus management
- `ProgressBar` — a `Box` whose `width` is a reactive percentage
- `Spinner` — a `Text` whose content is an animation frame driven by `setInterval`
- `Table` — nested `For` with calculated column widths
- `Tabs` — `Show` + array of conditions
- Image rendering — a `Box` that paints cells with braille characters

The library is deliberately **minimal in components but maximal in composability**.
