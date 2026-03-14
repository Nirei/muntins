# Components

Muntins has two layout primitives: `Box` and `Text`. Everything else is built by composing these.

## Box

A layout container using flexbox. Children are arranged according to flex properties.

```typescript
import { Box } from 'muntins';

Box({
  flexDirection: 'column',
  padding: 1,
  gap: 1,
  children: [
    Header(),
    Content(),
    Footer(),
  ],
});
```

### Layout props

Box accepts all flexbox properties. See [Layout](layout.md) for the full reference.

### Visual props

```typescript
Box({
  backgroundColor: { type: 'rgb', r: 26, g: 26, b: 46 },
  border: true,
  borderColor: 'cyan',
  borderStyle: 'round',
  children: [...],
});
```

| Prop | Type | Description |
|------|------|-------------|
| `backgroundColor` | `Color \| "inherit"` | Fill color for the box area |
| `border` | `boolean \| BorderStyleName \| object` | Enable borders (see [Styling](styling.md)) |
| `borderColor` | `Color \| "inherit"` | Border color |
| `borderStyle` | `BorderStyleName` | Border character style |

All visual props can be reactive getters:

```typescript
Box({
  backgroundColor: () => isSelected() ? 'blue' : 'inherit',
  borderColor: () => isFocused() ? 'cyan' : 'white',
  children: [...],
});
```

### Event handlers

```typescript
Box({
  onKeyPress(event) {
    if (event.name === 'enter') {
      submit();
      return true;  // consume event, stop bubbling
    }
    // return nothing to let event bubble up
  },
  onMousePress(event) {
    console.log(`Clicked at ${event.x}, ${event.y}`);
  },
  onMouseRelease(event) { },
  onMouseMove(event) { },
  onScroll(event) {
    if (event.direction === 'up') scrollUp();
    if (event.direction === 'down') scrollDown();
  },
  onHover(hovering) {
    setHighlighted(hovering);
  },
  children: [...],
});
```

Keyboard events only fire on the focused node and bubble up. Mouse events fire on any node under the cursor. See [Input Events](input.md) for event type details.

### Focus props

```typescript
Box({
  focusable: true,
  autoFocus: true,  // focused on mount
  ref: myRef,       // for programmatic focus
  children: [...],
});
```

See [Focus](focus.md) for the full focus system.

### children

The `children` prop accepts an array of nodes:

```typescript
Box({
  children: [
    Text({ content: 'Hello' }),
    Box({ children: [...] }),
  ],
});
```

---

## Text

Displays text content. A leaf node with no children.

```typescript
import { Text } from 'muntins';

Text({ content: 'Hello, world!' });
```

### content

The text to display. Can be a string or reactive getter:

```typescript
Text({ content: 'Static text' });

Text({ content: () => `Count: ${count()}` });
```

### Text styles

```typescript
Text({
  content: 'Styled text',
  color: 'red',
  backgroundColor: 'black',
  bold: true,
  italic: true,
  underline: true,
  dim: true,
  strikethrough: true,
  inverse: true,  // swap foreground and background
});
```

All style props can be reactive:

```typescript
Text({
  content: () => status(),
  color: () => status() === 'error' ? 'red' : 'green',
  bold: () => status() === 'error',
});
```

See [Styling](styling.md) for color values and style details.

### wrap

Controls how text handles overflow:

```typescript
Text({
  content: 'This is a long line that might not fit',
  wrap: 'wrap',  // wrap to multiple lines (default)
});

Text({
  content: 'This is a long line that might not fit',
  wrap: 'truncate',  // cut off at the end
});
```

| Value | Behavior |
|-------|----------|
| `'wrap'` | Wrap text to multiple lines (default) |
| `'truncate'` | Truncate at end, same as `'truncate-end'` |
| `'truncate-end'` | Truncate at end |
| `'truncate-start'` | Truncate at start |

### Event handlers and focus

Text supports the same event handlers and focus props as Box:

```typescript
Text({
  content: 'Click me',
  focusable: true,
  onKeyPress(event) {
    if (event.name === 'enter') {
      activate();
      return true;
    }
  },
  onMousePress() {
    activate();
  },
});
```

---

## Show

Conditionally renders content based on a reactive condition.

```typescript
import { Show } from 'muntins';

Show({
  when: () => isLoggedIn(),
  children: (user) => Dashboard({ user }),
});
```

### when

A reactive getter that returns a value. When truthy, `children` renders. When falsy, `fallback` renders (if provided).

The value returned by `when` is passed to `children`:

```typescript
Show({
  when: () => selectedItem(),  // returns Item | null
  children: (item) => ItemDetails({ item }),  // item is Item, not null
  fallback: () => Text({ content: 'Nothing selected' }),
});
```

### children

A function that receives the truthy value from `when` and returns a node.

### fallback

Optional. A function that returns a node to render when `when` is falsy:

```typescript
Show({
  when: () => data(),
  children: (data) => DataView({ data }),
  fallback: () => Text({ content: 'Loading...' }),
});
```

### Lifecycle

When the condition changes:
- `true` → `false`: The children subtree is fully disposed (effects cleaned up, nodes removed)
- `false` → `true`: A fresh subtree is created

---

## For

Renders a list of items with efficient updates.

```typescript
import { For } from 'muntins';

const [items, setItems] = createSignal(['one', 'two', 'three']);

For({
  each: items,
  render: (item, index) =>
    Text({ content: () => `${index() + 1}. ${item()}` }),
});
```

### each

A reactive getter returning an array:

```typescript
For({
  each: () => todos(),
  render: (todo) => TodoItem({ todo }),
});
```

### render

A function called for each item. Receives reactive getters for the item and its index:

```typescript
For({
  each: () => users(),
  render: (user, index) =>
    Box({
      children: [
        Text({ content: () => `#${index() + 1}` }),
        Text({ content: () => user().name }),
      ],
    }),
});
```

Both `item()` and `index()` are reactive. If the array is mutated in place and an item's position changes, `index()` updates automatically.

### key

Optional. A function to extract a unique key from each item. Use when item identity isn't based on object reference:

```typescript
For({
  each: () => users(),
  key: (user) => user.id,
  render: (user) => UserRow({ user }),
});
```

Without `key`, items are tracked by reference. With `key`, items are tracked by the returned key value, allowing the list to efficiently handle reordering and replacement.

### Lifecycle

Each item gets its own reactive scope. Adding or removing items only affects those items, existing items are not recreated.
