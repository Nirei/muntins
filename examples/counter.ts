/**
 * Counter Example
 *
 * An interactive counter demonstrating:
 * - Reactive state with createSignal
 * - Keyboard event handling with onKeyPress
 * - Flexbox layout (direction, alignment, gap)
 * - Borders with rounded style
 * - Background colors
 * - Text styling (bold, dim, color)
 * - Reactive styling based on state
 *
 * Run with: node --experimental-strip-types examples/counter.ts
 */

import {
  App,
  Box,
  type Color,
  TabFocus,
  Text,
  createSignal,
} from "../src/index.ts";

const subtle: Color = { type: "palette", index: 240 };
const accent: Color = { type: "palette", index: 75 };
const negative: Color = { type: "palette", index: 203 };
const muted: Color = { type: "palette", index: 245 };

function Counter() {
  const [count, setCount] = createSignal(0);

  return Box({
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
    children: [
      // Main card
      Box({
        flexDirection: "column",
        alignItems: "center",
        width: 32,
        border: true,
        borderStyle: "round",
        borderColor: subtle,
        paddingTop: 1,
        paddingBottom: 1,
        paddingStart: 3,
        paddingEnd: 3,
        gap: 1,
        focusable: true,
        autoFocus: true,
        onKeyPress(key) {
          if (key.name === "up" || key.name === "k") {
            setCount((c) => c + 1);
            return true;
          }
          if (key.name === "down" || key.name === "j") {
            setCount((c) => c - 1);
            return true;
          }
          if (key.name === "r") {
            setCount(0);
            return true;
          }
          if (key.name === "q" || (key.ctrl && key.name === "c")) {
            app.unmount();
            return true;
          }
          return false;
        },
        children: [
          Text({ content: "Counter", bold: true }),

          // Count display
          Box({
            width: 24,
            justifyContent: "center",
            paddingTop: 1,
            paddingBottom: 1,
            backgroundColor: { type: "palette", index: 236 },
            children: [
              Box({
                width: 5,
                justifyContent: "flex-end",
                children: [
                  Text({
                    content: () => `${count()}`,
                    bold: true,
                    color: () => {
                      const n = count();
                      if (n < 0) return negative;
                      if (n === 0) return muted;
                      return accent;
                    },
                  }),
                ],
              }),
            ],
          }),

          // Controls
          Box({
            flexDirection: "column",
            alignItems: "flex-start",
            children: [
              Text({ content: "j/k  increment", dim: true }),
              Text({ content: "r    reset", dim: true }),
              Text({ content: "q    quit", dim: true }),
            ],
          }),
        ],
      }),
    ],
  });
}

const app = App.mount(() => TabFocus({ children: [Counter()] }));
