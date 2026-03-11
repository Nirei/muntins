# Input Events

Muntins provides typed events for all terminal input. Events are discriminated by their `type` field.

## InputEvent

The union of all event types. Use the `type` field to narrow:

```typescript
function handleEvent(event: InputEvent) {
  switch (event.type) {
    case 'key':
      console.log(`Key: ${event.name}`);
      break;
    case 'mouse':
      console.log(`Mouse ${event.action} at ${event.x},${event.y}`);
      break;
    case 'scroll':
      console.log(`Scroll ${event.direction}`);
      break;
    case 'resize':
      console.log(`Resized to ${event.width}x${event.height}`);
      break;
    case 'paste':
      console.log(`Pasted: ${event.text}`);
      break;
    case 'focus':
      console.log(event.focused ? 'Focused' : 'Blurred');
      break;
  }
}
```

## KeyEvent

Keyboard input with key name, printable character, and modifier state.

```typescript
interface KeyEvent {
  type: 'key';
  name: string;      // "a", "enter", "up", "f1", etc.
  char: string;      // printable character or ""
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  sequence: string;  // raw escape sequence
}
```

Key names are always lowercase. Common names:

| Category | Names |
|----------|-------|
| Letters | `a` through `z` |
| Numbers | `0` through `9` |
| Arrows | `up`, `down`, `left`, `right` |
| Function | `f1` through `f12` |
| Navigation | `home`, `end`, `pageup`, `pagedown`, `insert`, `delete` |
| Editing | `backspace`, `tab`, `enter`, `space` |
| Control | `escape` |

The `char` field contains the printable character for letter/number keys, or an empty string for non-printable keys like arrows and function keys.

```typescript
if (event.type === 'key') {
  if (event.ctrl && event.name === 'c') {
    // Ctrl+C pressed
  }
  if (event.char) {
    // Printable character typed
    input += event.char;
  }
}
```

## MouseEvent

Mouse button press, release, and movement.

```typescript
interface MouseEvent {
  type: 'mouse';
  action: 'press' | 'release' | 'move';
  button: number;    // 0=left, 1=middle, 2=right
  x: number;         // 0-indexed column
  y: number;         // 0-indexed row
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}
```

Button constants for readability:

```typescript
import { MOUSE_LEFT, MOUSE_MIDDLE, MOUSE_RIGHT } from 'muntins';

if (event.type === 'mouse' && event.action === 'press') {
  if (event.button === MOUSE_LEFT) {
    // Left click at (event.x, event.y)
  }
}
```

The `move` action fires when the mouse moves while a button is held down.

## ScrollEvent

Scroll wheel input with direction and position.

```typescript
interface ScrollEvent {
  type: 'scroll';
  direction: 'up' | 'down' | 'left' | 'right';
  x: number;         // 0-indexed column
  y: number;         // 0-indexed row
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}
```

Position indicates where the cursor was when scrolling occurred.

```typescript
if (event.type === 'scroll') {
  if (event.direction === 'up') {
    scrollOffset = Math.max(0, scrollOffset - 3);
  } else if (event.direction === 'down') {
    scrollOffset += 3;
  }
}
```

## ResizeEvent

Terminal window resize with new dimensions.

```typescript
interface ResizeEvent {
  type: 'resize';
  width: number;     // new column count
  height: number;    // new row count
}
```

```typescript
if (event.type === 'resize') {
  // Layout will automatically recompute
  console.log(`Terminal is now ${event.width}x${event.height}`);
}
```

## PasteEvent

Bracketed paste content. When the user pastes text into the terminal, it arrives as a single event rather than individual keystrokes.

```typescript
interface PasteEvent {
  type: 'paste';
  text: string;      // pasted content (may be multi-line)
}
```

```typescript
if (event.type === 'paste') {
  // Handle pasted text (may contain newlines)
  insertText(event.text);
}
```

## FocusEvent

Terminal window focus changes.

```typescript
interface FocusEvent {
  type: 'focus';
  focused: boolean;  // true = gained focus, false = lost focus
}
```

```typescript
if (event.type === 'focus') {
  if (event.focused) {
    // Terminal window is now active
    resumeAnimations();
  } else {
    // Terminal window lost focus
    pauseAnimations();
  }
}
```
