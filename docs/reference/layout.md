# Layout

Muntins uses CSS flexbox semantics for layout. If you know flexbox, you already know how to lay out components in Muntins.

All values are in terminal cells (characters), not pixels. The layout engine handles integer arithmetic automatically, no sub-pixel concerns.

## flexDirection

Controls the main axis along which children are arranged.

```typescript
Box({
  flexDirection: 'row',  // children flow left to right (default)
  children: [A(), B(), C()],
});
// Result: [A] [B] [C]

Box({
  flexDirection: 'column',  // children flow top to bottom
  children: [A(), B(), C()],
});
// Result:
// [A]
// [B]
// [C]
```

The main axis determines how `justifyContent` and flex sizing (`flexGrow`, `flexShrink`) work. The cross axis is perpendicular, horizontal for column, vertical for row.

## justifyContent

Distributes children along the main axis.

```typescript
Box({
  width: 40,
  justifyContent: 'flex-start',  // pack at start (default)
  children: [A(), B()],
});
// [A][B]                        (gap at end)

Box({
  width: 40,
  justifyContent: 'flex-end',
  children: [A(), B()],
});
//                        [A][B] (gap at start)

Box({
  width: 40,
  justifyContent: 'center',
  children: [A(), B()],
});
//           [A][B]              (equal gaps on both sides)

Box({
  width: 40,
  justifyContent: 'space-between',
  children: [A(), B(), C()],
});
// [A]         [B]         [C]   (first and last at edges)

Box({
  width: 40,
  justifyContent: 'space-around',
  children: [A(), B()],
});
//    [A]          [B]           (equal space around each item)

Box({
  width: 40,
  justifyContent: 'space-evenly',
  children: [A(), B()],
});
//      [A]      [B]             (equal space between all gaps)
```

When using `space-between`, `space-around`, or `space-evenly`, the `gap` property is ignored, spacing is computed dynamically.

## alignItems

Aligns children along the cross axis.

```typescript
Box({
  height: 10,
  alignItems: 'flex-start',
  children: [A(), B()],  // A and B have height 3
});
// Children at top, empty space below

Box({
  height: 10,
  alignItems: 'flex-end',
  children: [A(), B()],
});
// Empty space above, children at bottom

Box({
  height: 10,
  alignItems: 'center',
  children: [A(), B()],
});
// Children vertically centered

Box({
  height: 10,
  alignItems: 'stretch',  // default
  children: [A(), B()],   // A and B have no explicit height
});
// Children stretch to fill the full 10 cells
```

`stretch` only affects children without an explicit size on the cross axis. If a child has `height: 5` in a row container with `alignItems: 'stretch'`, the child keeps its height of 5.

## alignSelf

Overrides the parent's `alignItems` for a single child.

```typescript
Box({
  height: 20,
  alignItems: 'flex-start',
  children: [
    Box({ height: 5 }),                         // at top
    Box({ height: 5, alignSelf: 'center' }),    // centered
    Box({ height: 5, alignSelf: 'flex-end' }),  // at bottom
  ],
});
```

Use `alignSelf: 'auto'` (the default) to inherit from the parent's `alignItems`.

## alignContent

Controls how multiple lines are distributed on the cross axis when `flexWrap: 'wrap'` creates multiple lines.

```typescript
Box({
  width: 30,
  height: 20,
  flexWrap: 'wrap',
  alignContent: 'flex-start',  // lines packed at top
  children: [/* items that wrap */],
});

Box({
  width: 30,
  height: 20,
  flexWrap: 'wrap',
  alignContent: 'center',  // lines centered vertically
  children: [/* items that wrap */],
});

Box({
  width: 30,
  height: 20,
  flexWrap: 'wrap',
  alignContent: 'space-between',  // first line at top, last at bottom
  children: [/* items that wrap */],
});
```

Other values: `flex-end`, `stretch`, `space-around`.

`alignContent` has no effect when there's only one line (either because `flexWrap: 'nowrap'` or all items fit on one line).

## flexGrow

Distributes extra space among children proportionally.

```typescript
Box({
  width: 60,
  children: [
    Box({ flexGrow: 1 }),  // gets 20 cells
    Box({ flexGrow: 2 }),  // gets 40 cells
  ],
});
```

Children with `flexGrow: 0` (the default) keep their intrinsic size. Only the remaining space is distributed among growing children.

```typescript
Box({
  width: 80,
  children: [
    Box({ width: 20 }),               // fixed 20
    Box({ flexGrow: 1 }),             // gets remaining 60
  ],
});
```

Growth adds to the base size, it doesn't replace it:

```typescript
Box({
  width: 100,
  children: [
    Box({ width: 20, flexGrow: 1 }),  // 20 + 25 = 45
    Box({ width: 30, flexGrow: 1 }),  // 30 + 25 = 55
  ],
});
// 50 extra cells distributed equally: 25 each
```

## flexShrink

Absorbs overflow when children exceed the container's size.

```typescript
Box({
  width: 20,
  children: [
    Box({ width: 15, flexShrink: 1 }),  // shrinks to 10
    Box({ width: 15, flexShrink: 1 }),  // shrinks to 10
  ],
});
// 30 cells of content must fit in 20, each shrinks by 5
```

Shrink is weighted by both `flexShrink` and the item's base size. Larger items absorb more shrinkage, preventing small items from collapsing:

```typescript
Box({
  width: 20,
  children: [
    Box({ width: 10, flexShrink: 1 }),  // shrinks less (smaller base)
    Box({ width: 20, flexShrink: 1 }),  // shrinks more (larger base)
  ],
});
```

Use `flexShrink: 0` to prevent an item from shrinking below its base size.

The default is `flexShrink: 1`, all items shrink equally by default.

## flexBasis

Sets the initial size of an item before `flexGrow` or `flexShrink` is applied.

```typescript
Box({
  width: 100,
  children: [
    Box({ flexBasis: 30, flexGrow: 1 }),  // starts at 30, grows from there
    Box({ flexBasis: 20, flexGrow: 1 }),  // starts at 20, grows from there
  ],
});
```

When both `flexBasis` and `width` (or `height` for column) are set, `width`/`height` takes precedence.

Use `flexBasis: 'auto'` (the default) to use the item's `width`/`height` or intrinsic content size.

## Sizing

Explicit dimensions override intrinsic sizing.

```typescript
Box({ width: 40, height: 10 });  // exactly 40x10 cells
```

Use `'auto'` (the default) for intrinsic sizing, the size is determined by content or flex distribution.

### Constraints

Minimum and maximum constraints clamp the final size:

```typescript
Box({
  flexGrow: 1,
  minWidth: 20,   // never smaller than 20
  maxWidth: 60,   // never larger than 60
});
```

`minWidth` and `minHeight` default to `0`. `maxWidth` and `maxHeight` default to no constraint.

Constraints are respected even when shrinking:

```typescript
Box({
  width: 30,
  children: [
    Box({ width: 25, flexShrink: 1, minWidth: 20 }),  // shrinks to 20, not further
    Box({ width: 25, flexShrink: 1 }),                // absorbs remaining overflow
  ],
});
```

## Padding and margin

Spacing uses logical properties (`start`/`end`) instead of physical (`left`/`right`).

```typescript
Box({
  paddingTop: 1,
  paddingEnd: 2,
  paddingBottom: 1,
  paddingStart: 2,
  children: [Content()],
});
```

Padding is inside the box (reduces space for children). Margin is outside (creates space between siblings).

```typescript
Box({
  children: [
    Box({ marginEnd: 2 }),   // 2 cells of space after this box
    Box({ marginStart: 1 }), // 1 cell of space before this box
  ],
});
```

Margins affect flex calculations, they're included when distributing space.

## gap

Adds uniform spacing between children (not at edges).

```typescript
Box({
  gap: 2,
  children: [A(), B(), C()],
});
// [A]  [B]  [C]  (2 cells between each, none at edges)
```

`gap` applies to both main and cross axes. It works with wrapping, gaps appear between wrapped lines too.

When using `space-between`, `space-around`, or `space-evenly` for `justifyContent`, the `gap` property is ignored for main-axis spacing.

## flexWrap

Controls whether children wrap to new lines when they exceed the container's main axis.

```typescript
Box({
  width: 30,
  flexWrap: 'nowrap',  // default, children overflow
  children: [
    Box({ width: 20 }),
    Box({ width: 20 }),
  ],
});
// Both on same line, total 40 cells (overflows the 30-cell container)

Box({
  width: 30,
  flexWrap: 'wrap',
  children: [
    Box({ width: 20 }),
    Box({ width: 20 }),
  ],
});
// Second box wraps to a new line
```

Each line distributes flex independently:

```typescript
Box({
  width: 30,
  flexWrap: 'wrap',
  children: [
    Box({ width: 20, flexGrow: 1 }),  // line 1: grows to 30
    Box({ width: 20, flexGrow: 1 }),  // line 2: grows to 30
  ],
});
```

Use `alignContent` to control how wrapped lines are distributed on the cross axis.

## Absolute positioning

Takes an element out of normal flow and positions it relative to its parent's content area.

```typescript
Box({
  width: 80,
  height: 24,
  children: [
    // Normal flow children
    Header(),
    Content(),

    // Absolutely positioned overlay
    Box({
      position: 'absolute',
      top: 5,
      end: 2,
      width: 20,
      height: 10,
      children: [Modal()],
    }),
  ],
});
```

Position properties: `top`, `end`, `bottom`, `start`. Use logical `start`/`end` instead of `left`/`right`.

When both `top` and `bottom` are set, `top` wins. When both `start` and `end` are set, `start` wins.

Absolute children don't affect the layout of siblings, they're laid out after normal flow children.

## display

Controls whether an element participates in layout.

```typescript
Box({
  display: 'flex',  // default, participates in layout
});

Box({
  display: 'none',  // hidden, takes no space
});
```

Hidden elements are completely removed from layout calculations, siblings behave as if the hidden element doesn't exist.

Use a reactive getter for conditional visibility:

```typescript
Box({
  display: () => isVisible() ? 'flex' : 'none',
  children: [Content()],
});
```

## Defaults

All style properties have sensible defaults matching CSS flexbox:

| Property | Default |
|----------|---------|
| `display` | `'flex'` |
| `flexDirection` | `'row'` |
| `flexWrap` | `'nowrap'` |
| `justifyContent` | `'flex-start'` |
| `alignItems` | `'stretch'` |
| `alignContent` | `'stretch'` |
| `alignSelf` | `'auto'` |
| `flexGrow` | `0` |
| `flexShrink` | `1` |
| `flexBasis` | `'auto'` |
| `width`, `height` | `'auto'` |
| `minWidth`, `minHeight` | `0` |
| `maxWidth`, `maxHeight` | no constraint |
| `padding*`, `margin*` | `0` |
| `gap` | `0` |
| `position` | `'relative'` |
| `top`, `end`, `bottom`, `start` | `'auto'` |
