# Focus

Focus determines which node receives keyboard events. Only the focused node's `onKeyPress` handler fires directly; events then bubble up to ancestors.

## Declaring focusable nodes

Use the `focusable` prop on Box or Text:

```typescript
Box({ focusable: true, children: [...] })
Text({ content: 'Click me', focusable: true })
```

Tab order follows tree order automatically. The first focusable node is focused by default unless `autoFocus` specifies otherwise:

```typescript
Box({
  children: [
    Text({ content: 'First', focusable: true }),           // tab order 1
    Text({ content: 'Second', focusable: true }),          // tab order 2
    Text({ content: 'Focused', focusable: true, autoFocus: true }),  // initially focused
  ],
});
```

## TabFocus

Enables Tab and Shift+Tab navigation. Wrap your app root:

```typescript
import { mount, TabFocus } from 'muntins';

mount(() =>
  TabFocus({
    children: [App()],
  })
);
```

Now Tab moves focus forward and Shift+Tab moves backward through focusable nodes.

### trap

Use `trap: true` for modals or dialogs that should contain focus:

```typescript
function Modal({ children }) {
  return TabFocus({
    trap: true,
    children: [
      Box({
        border: true,
        children,
      }),
    ],
  });
}
```

With `trap`, Tab/Shift+Tab wrap around within the scope instead of escaping to nodes outside.

## Event bubbling

Keyboard events bubble up the tree if not consumed. Return `true` from `onKeyPress` to stop bubbling:

```typescript
Box({
  focusable: true,
  onKeyPress(event) {
    if (event.name === 'enter') {
      submit();
      return true;  // consumed, won't bubble
    }
    // returning nothing lets it bubble to parent
  },
  children: [...],
});
```

This lets parent components handle keys that children don't care about:

```typescript
Box({
  onKeyPress(event) {
    if (event.name === 'escape') {
      closeApp();
      return true;
    }
  },
  children: [
    TextInput({ focusable: true }),  // handles typing
    Button({ focusable: true }),     // handles enter
  ],
});
// Escape bubbles up from any child to close the app
```

## Programmatic focus

For cases where you need to move focus imperatively, use `useFocus` and `createRef`.

### createRef

Creates a reference to a node:

```typescript
import { createRef } from 'muntins';

const searchRef = createRef();

Text({ content: 'Search', focusable: true, ref: searchRef })
```

### useFocus

Returns a focus controller for programmatic navigation:

```typescript
import { useFocus, createRef } from 'muntins';

function App() {
  const focus = useFocus();
  const searchRef = createRef();

  return Box({
    onKeyPress(event) {
      if (event.char === '/') {
        focus.set(searchRef);  // focus the search box
        return true;
      }
    },
    children: [
      SearchBox({ ref: searchRef }),
      Content(),
    ],
  });
}
```

### FocusController

The object returned by `useFocus`:

```typescript
interface FocusController {
  next(): void;           // focus next focusable node
  prev(): void;           // focus previous focusable node
  set(ref: Ref): void;    // focus a specific node by ref
  current: () => Node | null;  // reactive getter for currently focused node
}
```

Use `current` to reactively style the focused item:

```typescript
function MenuItem({ label, ref }) {
  const focus = useFocus();

  return Text({
    content: label,
    focusable: true,
    ref,
    color: () => focus.current() === ref.current ? 'cyan' : 'white',
    bold: () => focus.current() === ref.current,
  });
}
```

## Custom navigation

`TabFocus` is just a convenience wrapper. You can build your own navigation scheme:

```typescript
function ArrowFocus({ children }) {
  const focus = useFocus();

  return Box({
    onKeyPress(event) {
      if (event.name === 'down' || event.name === 'j') {
        focus.next();
        return true;
      }
      if (event.name === 'up' || event.name === 'k') {
        focus.prev();
        return true;
      }
    },
    children,
  });
}
```
