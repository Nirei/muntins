/**
 * Counter Example
 *
 * A simple interactive counter demonstrating:
 * - Reactive state with createSignal
 * - Keyboard event handling
 * - Text styling (bold, dim)
 * - Box layout with flexDirection and gap
 * - TabFocus for keyboard navigation
 *
 * Run with: node --experimental-strip-types examples/counter.ts
 */

import { Box, TabFocus, Text, createSignal, mount } from "../src/index.ts";

function Counter() {
  const [count, setCount] = createSignal(0);

  return Box({
    flexDirection: "column",
    paddingTop: 1,
    paddingBottom: 1,
    paddingStart: 2,
    paddingEnd: 2,
    gap: 1,
    focusable: true,
    autoFocus: true,
    onKeyPress(key) {
      if (key.name === "up") {
        setCount((c) => c + 1);
        return true;
      }
      if (key.name === "down") {
        setCount((c) => c - 1);
        return true;
      }
      if (key.name === "q" || (key.ctrl && key.name === "c")) {
        app.unmount();
        return true;
      }
      return false;
    },
    children: [
      Text({ content: () => `Count: ${count()}`, bold: true }),
      Text({ content: "Press UP/DOWN to change, Q to quit", dim: true }),
    ],
  });
}

const app = mount(() => TabFocus({ children: [Counter()] }));
