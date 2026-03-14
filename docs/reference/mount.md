# Mount

The `mount` function is the entry point for a Muntins application. It sets up the terminal, starts the render loop, and handles cleanup.

## mount

```typescript
import { mount, Box, Text } from 'muntins';

const app = mount(() =>
  Box({
    padding: 1,
    children: [
      Text({ content: 'Hello, world!' }),
    ],
  })
);
```

### Signature

```typescript
function mount(
  component: () => Node,
  options?: MountOptions
): App
```

The component function runs once to build the UI tree. Signals handle all subsequent updates.

## MountOptions

```typescript
mount(App, {
  stdout: process.stdout,   // output stream
  stdin: process.stdin,     // input stream
  mouse: true,              // enable mouse tracking
  alternateScreen: true,    // use alternate screen buffer
  fpsLimit: 60,             // max renders per second
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `stdout` | `WriteStream` | `process.stdout` | Output stream |
| `stdin` | `ReadStream` | `process.stdin` | Input stream |
| `mouse` | `boolean` | `false` | Enable mouse events |
| `alternateScreen` | `boolean` | `true` | Use alternate screen buffer |
| `fpsLimit` | `number` | `240` | Max renders per second (0 = unlimited) |

### mouse

When `false` (default), mouse events are not tracked. Enable for applications that need click, drag, or scroll handling:

```typescript
mount(App, { mouse: true });
```

### alternateScreen

When `true` (default), the application runs in the terminal's alternate screen buffer. On exit, the original screen content is restored, preserving the user's scrollback history.

Set to `false` for inline output that remains visible after the app exits:

```typescript
mount(App, { alternateScreen: false });
```

### fpsLimit

Caps the render rate to avoid excessive CPU usage. The default of 240 is effectively unlimited for most terminals. Lower values reduce CPU usage for less dynamic UIs:

```typescript
mount(App, { fpsLimit: 30 });  // 30 fps max
```

Set to `0` for no limit.

## App

The object returned by `mount`.

```typescript
interface App {
  unmount(): void;
}
```

### unmount

Tears down the application: disposes all reactive subscriptions, restores the terminal to its original state, and stops the render loop.

```typescript
const app = mount(MyApp);

// Later, when done
app.unmount();
```

Typically you don't need to call `unmount` manually. The application handles cleanup automatically on process exit (`SIGINT`, `SIGTERM`, etc.).

## Lifecycle hooks

Use `onMount` and `onCleanup` inside components for setup and teardown:

```typescript
import { mount, onMount, onCleanup, Box } from 'muntins';

function App() {
  onMount(() => {
    // Terminal is ready, alternate screen is active
    console.log('App started');
  });

  onCleanup(() => {
    // Called on unmount, before terminal is restored
    console.log('App stopping');
  });

  return Box({ children: [...] });
}

mount(App);
```

See [Signals](signals.md) for more on `onMount` and `onCleanup`.
