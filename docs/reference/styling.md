# Styling

Text and box styling in Muntins uses terminal color modes and text modifiers.

## Colors

The `color`, `backgroundColor`, and `borderColor` props accept a `Color` value:

```typescript
Text({
  content: 'Hello',
  color: { type: 'named', index: 1 },      // red
  backgroundColor: { type: 'rgb', r: 26, g: 26, b: 46 },
});
```

### Color types

```typescript
type Color =
  | { type: 'default' }                    // terminal default
  | { type: 'named', index: number }       // standard 8 colors (0-7)
  | { type: 'bright', index: number }      // bright variants (0-7)
  | { type: 'palette', index: number }     // 256-color palette (0-255)
  | { type: 'rgb', r: number, g: number, b: number }  // true color
```

### Named colors

Index 0-7 for standard terminal colors:

| Index | Color |
|-------|-------|
| 0 | black |
| 1 | red |
| 2 | green |
| 3 | yellow |
| 4 | blue |
| 5 | magenta |
| 6 | cyan |
| 7 | white |

```typescript
{ type: 'named', index: 1 }   // red
{ type: 'bright', index: 1 }  // bright red
```

### RGB colors

24-bit true color for modern terminals:

```typescript
{ type: 'rgb', r: 255, g: 128, b: 64 }
```

### Default color

Uses the terminal's configured foreground or background:

```typescript
{ type: 'default' }
```

### inherit

Use `'inherit'` to inherit from the parent node:

```typescript
Box({
  color: { type: 'named', index: 6 },  // cyan
  children: [
    Text({ content: 'Inherits cyan', color: 'inherit' }),
    Text({ content: 'Also cyan' }),  // undefined = inherit
    Text({ content: 'Red', color: { type: 'named', index: 1 } }),
  ],
});
```

Both `'inherit'` and `undefined` inherit from the parent. Use `'inherit'` for explicitness.

## Text modifiers

Text supports these style modifiers:

```typescript
Text({
  content: 'Styled',
  bold: true,
  dim: true,
  italic: true,
  underline: true,
  strikethrough: true,
  inverse: true,  // swap foreground and background
});
```

All modifiers default to `false`. Use `'inherit'` to inherit from parent:

```typescript
Box({
  bold: true,
  children: [
    Text({ content: 'Bold' }),
    Text({ content: 'Also bold', bold: 'inherit' }),
    Text({ content: 'Not bold', bold: false }),
  ],
});
```

### Reactive styles

All style props can be reactive getters:

```typescript
Text({
  content: () => message(),
  color: () => isError() ? { type: 'named', index: 1 } : { type: 'default' },
  bold: () => isError(),
});
```

## Borders

Box supports borders on any combination of sides.

### Enabling borders

```typescript
Box({ border: true, children: [...] })           // all sides, 'single' style
Box({ border: 'round', children: [...] })        // all sides, rounded corners
Box({ border: { top: true, bottom: true }, children: [...] })  // top and bottom only
```

### Border styles

```typescript
Box({
  border: true,
  borderStyle: 'double',
  children: [...],
});
```

| Style | Characters | Example |
|-------|------------|---------|
| `'single'` | `─ │ ┌ ┐ └ ┘` | Default |
| `'round'` | `─ │ ╭ ╮ ╰ ╯` | Rounded corners |
| `'double'` | `═ ║ ╔ ╗ ╚ ╝` | Double lines |
| `'bold'` | `━ ┃ ┏ ┓ ┗ ┛` | Thick lines |
| `'dashed'` | `┄ ┆ ┌ ┐ └ ┘` | Dashed lines |
| `'ascii'` | `- \| + + + +` | ASCII only |

Shorthand: `border: 'round'` is equivalent to `border: true, borderStyle: 'round'`.

### Border color

```typescript
Box({
  border: true,
  borderColor: { type: 'named', index: 6 },  // cyan border
  children: [...],
});
```

### Selective borders

```typescript
Box({
  border: {
    top: true,
    bottom: true,
    left: false,
    right: false,
  },
  children: [...],
});
```

### Reactive borders

```typescript
Box({
  border: true,
  borderColor: () => isFocused() ? { type: 'named', index: 6 } : { type: 'default' },
  borderStyle: () => isFocused() ? 'double' : 'single',
  children: [...],
});
```

## Background color

Box can fill its area with a background color:

```typescript
Box({
  backgroundColor: { type: 'rgb', r: 30, g: 30, b: 50 },
  padding: 1,
  children: [
    Text({ content: 'On dark background' }),
  ],
});
```

Children inherit the background by default. Override with an explicit value:

```typescript
Box({
  backgroundColor: { type: 'named', index: 4 },  // blue
  children: [
    Text({ content: 'Blue background' }),
    Text({
      content: 'Red background',
      backgroundColor: { type: 'named', index: 1 },
    }),
  ],
});
```
