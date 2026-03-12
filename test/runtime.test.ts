import assert from "node:assert";
import { describe, it } from "node:test";
import type {
  MouseEvent as InputMouseEvent,
  KeyEvent,
  ScrollEvent,
} from "../src/core/input.ts";
import {
  DEFAULT_FLEX_STYLE,
  type LayoutNode,
  computeLayout,
} from "../src/core/layout.ts";
import type { LayoutResult } from "../src/core/layout.ts";
import {
  Box,
  DEFAULT_MOUNT_OPTIONS,
  type FocusController,
  type FocusScope,
  For,
  type Node,
  type RuntimeContext,
  type RuntimeState,
  Show,
  TabFocus,
  Text,
  buildPathToRoot,
  collectFocusableInScope,
  createRef,
  enterTuiMode,
  exitTuiMode,
  flushFrame,
  focusNext,
  focusPrev,
  getActiveContext,
  hitTest,
  initializeFocus,
  lineDisplayWidth,
  measureText,
  mount,
  setActiveContext,
  truncateLine,
  useFocus,
  withContext,
  wrapLine,
} from "../src/core/runtime.ts";
import {
  createEffect,
  createRoot,
  createSignal,
  onCleanup,
} from "../src/core/signals.ts";

describe("runtime core types", () => {
  it("createRef returns object with null current", () => {
    const ref = createRef();
    assert.strictEqual(ref.current, null);
  });

  it("createRef.current is mutable", () => {
    const ref = createRef();
    const node: Node = { style: DEFAULT_FLEX_STYLE };
    ref.current = node;
    assert.strictEqual(ref.current, node);
  });

  it("DEFAULT_MOUNT_OPTIONS has expected values", () => {
    assert.strictEqual(DEFAULT_MOUNT_OPTIONS.fps, 60);
    assert.strictEqual(DEFAULT_MOUNT_OPTIONS.mouse, false);
    assert.strictEqual(DEFAULT_MOUNT_OPTIONS.alternateScreen, true);
  });
});

describe("screen control", () => {
  it("enterTuiMode writes alternate screen sequence", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    enterTuiMode(mockStdout, { alternateScreen: true });

    assert.ok(written.includes("\x1b[?1049h"));
    assert.ok(written.includes("\x1b[?25l"));
    assert.ok(written.includes("\x1b[2J"));
    assert.ok(written.includes("\x1b[H"));
  });

  it("enterTuiMode skips alternate screen when disabled", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    enterTuiMode(mockStdout, { alternateScreen: false });

    assert.ok(!written.includes("\x1b[?1049h"));
    assert.ok(written.includes("\x1b[?25l")); // still hides cursor
  });

  it("exitTuiMode writes restore sequences", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    exitTuiMode(mockStdout, { alternateScreen: true });

    assert.ok(written.includes("\x1b[?25h"));
    assert.ok(written.includes("\x1b[?1049l"));
  });

  it("exitTuiMode skips alternate screen when disabled", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    exitTuiMode(mockStdout, { alternateScreen: false });

    assert.ok(written.includes("\x1b[?25h")); // still shows cursor
    assert.ok(!written.includes("\x1b[?1049l"));
  });

  it("flushFrame writes content directly without cursor manipulation", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    flushFrame(mockStdout, "content");

    // Cursor is managed by enterTuiMode/exitTuiMode, not per-frame
    assert.strictEqual(written, "content");
  });

  it("flushFrame does nothing for empty content", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    flushFrame(mockStdout, "");

    assert.strictEqual(written, "");
  });
});

describe("Box", () => {
  it("creates node with merged style", () => {
    const node = Box({ flexDirection: "column", gap: 2 });

    const style = typeof node.style === "function" ? node.style() : node.style;
    assert.strictEqual(style.flexDirection, "column");
    assert.strictEqual(style.gap, 2);
    assert.strictEqual(style.flexGrow, 0); // from default
  });

  it("creates node with children", () => {
    const child = Box({});
    const parent = Box({ children: [child] });

    assert.strictEqual(parent.children?.length, 1);
    assert.strictEqual(parent.children?.[0], child);
  });

  it("has no measure or render functions", () => {
    const node = Box({});

    assert.strictEqual(node.measure, undefined);
    assert.strictEqual(node.render, undefined);
  });

  it("supports reactive style props", () => {
    const [direction, setDirection] = createSignal<"row" | "column">("row");
    // Using a non-reactive prop combined with checking style getter behavior
    const node = Box({});
    // Manually test that style can be a getter
    const directionalNode = {
      ...node,
      get style() {
        return { ...DEFAULT_FLEX_STYLE, flexDirection: direction() };
      },
    };

    assert.strictEqual(directionalNode.style.flexDirection, "row");
    setDirection("column");
    assert.strictEqual(directionalNode.style.flexDirection, "column");
  });

  it("passes through event handlers", () => {
    const keyHandler = () => true;
    const mouseHandler = () => {};
    const node = Box({ onKeyPress: keyHandler, onMousePress: mouseHandler });

    assert.strictEqual(node.onKeyPress, keyHandler);
    assert.strictEqual(node.onMousePress, mouseHandler);
  });

  it("passes through focus props", () => {
    const node = Box({ focusable: true, autoFocus: true });

    assert.strictEqual(node.focusable, true);
    assert.strictEqual(node.autoFocus, true);
  });

  it("binds ref", () => {
    const ref = createRef();
    const node = Box({ ref });

    assert.strictEqual(ref.current, node);
  });

  it("sets _parent on children", () => {
    const child1 = Box({});
    const child2 = Box({});
    const parent = Box({ children: [child1, child2] });

    assert.strictEqual(child1._parent, parent);
    assert.strictEqual(child2._parent, parent);
  });
});

describe("Text", () => {
  it("creates node with measure and render", () => {
    const node = Text({ content: "hello" });

    assert.ok(typeof node.measure === "function");
    assert.ok(typeof node.render === "function");
  });

  it("accepts static string content", () => {
    const node = Text({ content: "hello" });
    assert.ok(node.measure);
    const size = node.measure(100, 100);

    assert.strictEqual(size.width, 5);
    assert.strictEqual(size.height, 1);
  });

  it("accepts reactive content", () => {
    let value = "short";
    const node = Text({ content: () => value });
    assert.ok(node.measure);

    assert.strictEqual(node.measure(100, 100).width, 5);

    value = "longer text";
    assert.strictEqual(node.measure(100, 100).width, 11);
  });

  it("passes through focusable prop", () => {
    const node = Text({ content: "hello", focusable: true });
    assert.strictEqual(node.focusable, true);
  });

  it("binds ref", () => {
    const ref = createRef();
    const node = Text({ content: "hello", ref });
    assert.strictEqual(ref.current, node);
  });
});

describe("measureText", () => {
  it("measures single line", () => {
    const size = measureText("hello", 100, "wrap");
    assert.strictEqual(size.width, 5);
    assert.strictEqual(size.height, 1);
  });

  it("measures multi-line", () => {
    const size = measureText("line1\nline2\nline3", 100, "wrap");
    assert.strictEqual(size.height, 3);
  });

  it("wraps long lines", () => {
    const size = measureText("hello world", 5, "wrap");
    assert.strictEqual(size.width, 5);
    assert.strictEqual(size.height, 3); // "hello", " worl", "d"
  });

  it("truncate mode keeps single line", () => {
    const size = measureText("hello world", 5, "truncate");
    assert.strictEqual(size.height, 1);
  });

  it("handles empty string", () => {
    const size = measureText("", 100, "wrap");
    assert.strictEqual(size.width, 0);
    assert.strictEqual(size.height, 0);
  });

  it("handles CJK characters", () => {
    const size = measureText("中文", 100, "wrap");
    assert.strictEqual(size.width, 4); // 2 chars * 2 width each
    assert.strictEqual(size.height, 1);
  });
});

describe("truncateLine", () => {
  it("returns line unchanged if fits", () => {
    assert.strictEqual(truncateLine("hello", 10, "truncate-end"), "hello");
  });

  it("truncates end with ellipsis", () => {
    const result = truncateLine("hello world", 6, "truncate-end");
    assert.ok(result.endsWith("…"));
    assert.ok(lineDisplayWidth(result) <= 6);
  });

  it("truncates start with ellipsis", () => {
    const result = truncateLine("hello world", 6, "truncate-start");
    assert.ok(result.startsWith("…"));
    assert.ok(lineDisplayWidth(result) <= 6);
  });

  it("handles truncate mode same as truncate-end", () => {
    const result = truncateLine("hello world", 6, "truncate");
    assert.ok(result.endsWith("…"));
    assert.ok(lineDisplayWidth(result) <= 6);
  });
});

describe("wrapLine", () => {
  it("returns single element for short line", () => {
    const lines = wrapLine("hello", 10);
    assert.deepStrictEqual(lines, ["hello"]);
  });

  it("wraps at width boundary", () => {
    const lines = wrapLine("hello world", 5);
    assert.strictEqual(lines.length, 3);
  });

  it("handles empty line", () => {
    const lines = wrapLine("", 10);
    assert.deepStrictEqual(lines, [""]);
  });

  it("handles maxWidth of 0 or less", () => {
    const lines = wrapLine("hello", 0);
    assert.deepStrictEqual(lines, ["hello"]);
  });
});

describe("Show", () => {
  it("renders children branch when truthy", () => {
    createRoot((dispose) => {
      const [cond, _setCond] = createSignal(true);
      const node = Show({
        when: cond,
        children: () => Text({ content: "yes" }),
        fallback: () => Text({ content: "no" }),
      });

      assert.strictEqual(node.children?.length, 1);
      dispose();
      return dispose;
    });
  });

  it("renders fallback branch when falsy", () => {
    createRoot((dispose) => {
      const [cond, _setCond] = createSignal(false);
      const node = Show({
        when: cond,
        children: () => Text({ content: "yes" }),
        fallback: () => Text({ content: "no" }),
      });

      assert.strictEqual(node.children?.length, 1);
      dispose();
      return dispose;
    });
  });

  it("renders nothing when falsy and no fallback", () => {
    createRoot((dispose) => {
      const [cond, _setCond] = createSignal(false);
      const node = Show({
        when: cond,
        children: () => Text({ content: "yes" }),
      });

      assert.strictEqual(node.children?.length, 0);
      dispose();
      return dispose;
    });
  });

  it("narrows type for nullable condition", () => {
    createRoot((dispose) => {
      const [value, setValue] = createSignal<string | null>("hello");
      let receivedType: string | null = null;

      Show({
        when: value,
        children: (v) => {
          // TypeScript should narrow v to string (not string | null)
          receivedType = v;
          // Use a Box instead of Text to avoid type issues with nullable content
          return Box({});
        },
      });

      assert.strictEqual(receivedType, "hello");

      setValue(null);
      // Now the fallback branch runs (if provided)
      dispose();
      return dispose;
    });
  });

  it("switches branch on condition change", () => {
    createRoot((dispose) => {
      const [cond, setCond] = createSignal(true);
      const node = Show({
        when: cond,
        children: () => Text({ content: "yes" }),
        fallback: () => Text({ content: "no" }),
      });

      const firstChild = node.children?.[0];
      setCond(false);
      const secondChild = node.children?.[0];

      assert.notStrictEqual(firstChild, secondChild);
      dispose();
      return dispose;
    });
  });

  it("passes value to children branch", () => {
    createRoot((dispose) => {
      const [cond, _setCond] = createSignal<string | null>("hello");
      let receivedValue: string | null = null;

      Show({
        when: cond,
        children: (value) => {
          receivedValue = value;
          // Use a Box instead of Text to avoid type issues with nullable content
          return Box({});
        },
      });

      assert.strictEqual(receivedValue, "hello");
      dispose();
      return dispose;
    });
  });

  it("disposes previous branch on change", () => {
    createRoot((dispose) => {
      let cleanupCalled = false;
      const [cond, setCond] = createSignal(true);

      Show({
        when: cond,
        children: () => {
          onCleanup(() => {
            cleanupCalled = true;
          });
          return Text({ content: "yes" });
        },
      });

      assert.strictEqual(cleanupCalled, false);
      setCond(false);
      assert.strictEqual(cleanupCalled, true);
      dispose();
      return dispose;
    });
  });

  it("sets _parent on children", () => {
    createRoot((dispose) => {
      const [cond, _setCond] = createSignal(true);
      const node = Show({
        when: cond,
        children: () => Text({ content: "yes" }),
      });

      const child = node.children?.[0];
      assert.strictEqual(child?._parent, node);
      dispose();
      return dispose;
    });
  });

  it("does not affect parent flex distribution", () => {
    createRoot((dispose) => {
      const [cond] = createSignal(true);

      // Three children with flexGrow: 1 should split space equally
      const parent = Box({
        flexDirection: "row",
        width: 90,
        height: 1,
        children: [
          Box({ flexGrow: 1, children: [Text({ content: "A" })] }),
          Show({
            when: cond,
            children: () =>
              Box({ flexGrow: 1, children: [Text({ content: "B" })] }),
          }),
          Box({ flexGrow: 1, children: [Text({ content: "C" })] }),
        ],
      });

      // Helper to recursively resolve styles for layout
      const toLayoutNode = (node: Node): LayoutNode => ({
        style: typeof node.style === "function" ? node.style() : node.style,
        children: node.children?.map(toLayoutNode),
        measure: node.measure,
      });

      const layout = computeLayout(toLayoutNode(parent), 90, 1);

      // With display: "contents", Show is transparent — its child (Box B) is
      // hoisted to be a direct child of the parent for layout purposes.
      // All three boxes should have equal width (90 / 3 = 30)
      assert.strictEqual(
        layout.children.length,
        3,
        "Should have 3 layout children",
      );

      const boxALayout = layout.children[0];
      const boxBLayout = layout.children[1]; // Hoisted from Show
      const boxCLayout = layout.children[2];

      assert.strictEqual(boxALayout.width, 30, "Box A should be 30 wide");
      assert.strictEqual(boxBLayout.width, 30, "Box B should be 30 wide");
      assert.strictEqual(boxCLayout.width, 30, "Box C should be 30 wide");

      dispose();
      return dispose;
    });
  });
});

describe("For", () => {
  it("renders items in order", () => {
    createRoot((dispose) => {
      const [items, _setItems] = createSignal(["a", "b", "c"]);
      const node = For({
        each: items,
        render: (item) => Text({ content: item }),
      });

      assert.strictEqual(node.children?.length, 3);
      dispose();
      return dispose;
    });
  });

  it("adds new items", () => {
    createRoot((dispose) => {
      const [items, setItems] = createSignal(["a", "b"]);
      const node = For({
        each: items,
        render: (item) => Text({ content: item }),
      });

      assert.strictEqual(node.children?.length, 2);

      setItems(["a", "b", "c"]);
      assert.strictEqual(node.children?.length, 3);
      dispose();
      return dispose;
    });
  });

  it("removes items", () => {
    createRoot((dispose) => {
      const [items, setItems] = createSignal(["a", "b", "c"]);
      const node = For({
        each: items,
        render: (item) => Text({ content: item }),
      });

      setItems(["a", "c"]);
      assert.strictEqual(node.children?.length, 2);
      dispose();
      return dispose;
    });
  });

  it("disposes removed item roots", () => {
    createRoot((dispose) => {
      let cleanupCalled = false;
      const [items, setItems] = createSignal(["a", "b"]);

      For({
        each: items,
        render: (item) => {
          if (item() === "b") {
            onCleanup(() => {
              cleanupCalled = true;
            });
          }
          return Text({ content: item });
        },
      });

      setItems(["a"]);
      assert.strictEqual(cleanupCalled, true);
      dispose();
      return dispose;
    });
  });

  it("reuses nodes for same items", () => {
    createRoot((dispose) => {
      const [items, setItems] = createSignal(["a", "b", "c"]);
      const node = For({
        each: items,
        render: (item) => Text({ content: item }),
      });

      const originalNodes = [...(node.children ?? [])];

      setItems(["c", "b", "a"]); // Reorder

      // Same nodes, different order
      assert.strictEqual(node.children?.length, 3);
      for (const orig of originalNodes) {
        assert.ok(node.children?.includes(orig));
      }
      dispose();
      return dispose;
    });
  });

  it("provides reactive index", () => {
    createRoot((dispose) => {
      const indices: number[] = [];
      const [items, setItems] = createSignal(["a", "b"]);

      For({
        each: items,
        render: (item, index) => {
          createEffect(() => {
            if (item() === "b") {
              indices.push(index());
            }
          });
          return Text({ content: item });
        },
      });

      assert.deepStrictEqual(indices, [1]);

      setItems(["b", "a"]); // Move "b" to index 0
      assert.deepStrictEqual(indices, [1, 0]);
      dispose();
      return dispose;
    });
  });

  it("handles empty array", () => {
    createRoot((dispose) => {
      const [items, _setItems] = createSignal<string[]>([]);
      const node = For({
        each: items,
        render: (item) => Text({ content: item }),
      });

      assert.strictEqual(node.children?.length, 0);
      dispose();
      return dispose;
    });
  });

  it("supports custom key function", () => {
    createRoot((dispose) => {
      interface Item {
        id: number;
        name: string;
      }
      const [items, setItems] = createSignal<Item[]>([
        { id: 1, name: "a" },
        { id: 2, name: "b" },
      ]);

      const node = For({
        each: items,
        key: (item) => item.id,
        render: (item) => Text({ content: () => item().name }),
      });

      const originalNodes = [...(node.children ?? [])];

      // Replace with new objects but same IDs
      setItems([
        { id: 2, name: "b-updated" },
        { id: 1, name: "a-updated" },
      ]);

      // Same nodes (by key), different order
      assert.strictEqual(node.children?.length, 2);
      for (const orig of originalNodes) {
        assert.ok(node.children?.includes(orig));
      }
      dispose();
      return dispose;
    });
  });

  it("sets _parent on children", () => {
    createRoot((dispose) => {
      const [items, _setItems] = createSignal(["a", "b"]);
      const node = For({
        each: items,
        render: (item) => Text({ content: item }),
      });

      for (const child of node.children ?? []) {
        assert.strictEqual(child._parent, node);
      }
      dispose();
      return dispose;
    });
  });

  it("duplicate items get separate nodes", () => {
    createRoot((dispose) => {
      const obj = { id: 1 };
      const [items, _setItems] = createSignal([obj, obj]);
      const node = For({
        each: items,
        render: (item) => Text({ content: () => String(item().id) }),
      });

      // Each occurrence gets its own node
      assert.strictEqual(node.children?.length, 2);
      assert.notStrictEqual(node.children?.[0], node.children?.[1]);
      dispose();
      return dispose;
    });
  });

  it("updates item signal when same key maps to new object", () => {
    createRoot((dispose) => {
      interface Item {
        id: number;
        name: string;
      }
      const observedNames: string[] = [];
      const [items, setItems] = createSignal<Item[]>([
        { id: 1, name: "a" },
        { id: 2, name: "b" },
      ]);

      For({
        each: items,
        key: (item) => item.id,
        render: (item) => {
          createEffect(() => {
            observedNames.push(item().name);
          });
          return Text({ content: () => item().name });
        },
      });

      // Initial render
      assert.deepStrictEqual(observedNames, ["a", "b"]);

      // Replace with new objects but same IDs
      setItems([
        { id: 1, name: "a-updated" },
        { id: 2, name: "b-updated" },
      ]);

      // Item signals should have updated
      assert.deepStrictEqual(observedNames, [
        "a",
        "b",
        "a-updated",
        "b-updated",
      ]);
      dispose();
      return dispose;
    });
  });

  it("disposes excess duplicate entries when count decreases", () => {
    createRoot((dispose) => {
      const cleanupCalls: number[] = [];
      const obj = { id: 1 };
      const [items, setItems] = createSignal([obj, obj, obj]);

      For({
        each: items,
        render: (item, index) => {
          onCleanup(() => {
            cleanupCalls.push(index());
          });
          return Text({ content: () => String(item().id) });
        },
      });

      assert.deepStrictEqual(cleanupCalls, []);

      // Reduce to one occurrence
      setItems([obj]);

      // Indices 1 and 2 should have been disposed
      assert.deepStrictEqual(cleanupCalls, [1, 2]);
      dispose();
      return dispose;
    });
  });
});

// Test helpers for mock streams
interface MockStdin {
  isTTY: boolean;
  setRawMode: (mode: boolean) => MockStdin;
  on: (event: string, handler: (...args: unknown[]) => void) => MockStdin;
  off: (event: string, handler: (...args: unknown[]) => void) => MockStdin;
  emit: (event: string, ...args: unknown[]) => boolean;
  resume: () => void;
  pause: () => void;
  listenerCount: (event: string) => number;
  _handlers: Map<string, Array<(...args: unknown[]) => void>>;
}

interface MockStdout {
  isTTY: boolean;
  columns: number;
  rows: number;
  written: string;
  write: (s: string) => boolean;
  on: (event: string, handler: () => void) => MockStdout;
  off: (event: string, handler: () => void) => MockStdout;
  emit: (event: string) => boolean;
  _handlers: Map<string, Array<() => void>>;
}

function createMockStdin(): MockStdin {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  const stdin: MockStdin = {
    isTTY: true,
    setRawMode: () => stdin,
    on: (event, handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return stdin;
    },
    off: (event, handler) => {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
      return stdin;
    },
    emit: (event, ...args) => {
      const list = handlers.get(event);
      if (list) {
        for (const h of list) h(...args);
      }
      return true;
    },
    resume: () => {},
    pause: () => {},
    listenerCount: (event) => handlers.get(event)?.length ?? 0,
    _handlers: handlers,
  };

  return stdin;
}

function createMockStdout(cols = 80, rows = 24): MockStdout {
  const handlers = new Map<string, Array<() => void>>();

  const stdout: MockStdout = {
    isTTY: true,
    columns: cols,
    rows: rows,
    written: "",
    write: function (s: string) {
      this.written += s;
      return true;
    },
    on: (event, handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return stdout;
    },
    off: (event, handler) => {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
      return stdout;
    },
    emit: (event) => {
      const list = handlers.get(event);
      if (list) {
        for (const h of list) h();
      }
      return true;
    },
    _handlers: handlers,
  };

  return stdout;
}

describe("mount", () => {
  it("returns app with unmount function", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = mount(() => Text({ content: "hello" }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
    });

    assert.ok(typeof app.unmount === "function");
    app.unmount();
  });

  it("enters TUI mode on mount", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = mount(() => Text({ content: "hello" }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
    });

    assert.ok(mockStdout.written.includes("\x1b[?1049h")); // alternate screen
    app.unmount();
  });

  it("exits TUI mode on unmount", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = mount(() => Text({ content: "hello" }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
    });

    mockStdout.written = "";
    app.unmount();

    assert.ok(mockStdout.written.includes("\x1b[?1049l")); // exit alternate screen
  });

  it("renders initial content", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = mount(() => Text({ content: "hello" }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
    });

    assert.ok(mockStdout.written.includes("hello"));
    app.unmount();
  });

  it("disposes root on unmount", () => {
    let cleanupCalled = false;
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = mount(
      () => {
        onCleanup(() => {
          cleanupCalled = true;
        });
        return Text({ content: "hello" });
      },
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    assert.strictEqual(cleanupCalled, false);
    app.unmount();
    assert.strictEqual(cleanupCalled, true);
  });

  it("handles nested components", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = mount(
      () =>
        Box({
          children: [Text({ content: "line1" }), Text({ content: "line2" })],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    assert.ok(mockStdout.written.includes("line1"));
    assert.ok(mockStdout.written.includes("line2"));
    app.unmount();
  });

  it("supports reactive content updates", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const [count, _setCount] = createSignal(0);

    const app = mount(() => Text({ content: () => `Count: ${count()}` }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
      fps: 0, // Immediate mode
    });

    // The output contains both "Count:" and "0" - they may be separated by
    // ANSI cursor positioning sequences (e.g., \x1b[1;8H) due to cell-by-cell rendering
    assert.ok(mockStdout.written.includes("Count:"));
    assert.ok(mockStdout.written.includes("0"));

    // Update signal - in fps: 0 mode, updates are queued but need an event to trigger render
    // The signal change itself doesn't trigger re-render automatically
    // (that's expected - the component tree is built once, signals drive updates through effects)
    app.unmount();
  });

  it("skips alternate screen when disabled", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = mount(() => Text({ content: "hello" }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
      alternateScreen: false,
    });

    assert.ok(!mockStdout.written.includes("\x1b[?1049h"));
    app.unmount();
  });
});

describe("renderFrame", () => {
  it("paints nodes at layout positions", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 10);

    const app = mount(
      () =>
        Box({
          flexDirection: "column",
          children: [Text({ content: "A" }), Text({ content: "B" })],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Both should be rendered
    assert.ok(mockStdout.written.includes("A"));
    assert.ok(mockStdout.written.includes("B"));
    app.unmount();
  });

  it("handles Show components", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const [visible, _setVisible] = createSignal(true);

    const app = mount(
      () =>
        Show({
          when: visible,
          children: () => Text({ content: "visible" }),
          fallback: () => Text({ content: "hidden" }),
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    assert.ok(mockStdout.written.includes("visible"));
    app.unmount();
  });

  it("handles For components", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const [items, _setItems] = createSignal(["a", "b", "c"]);

    const app = mount(
      () =>
        For({
          each: items,
          render: (item) => Text({ content: item }),
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    assert.ok(mockStdout.written.includes("a"));
    assert.ok(mockStdout.written.includes("b"));
    assert.ok(mockStdout.written.includes("c"));
    app.unmount();
  });
});

describe("resize handling", () => {
  it("buffer is resized on resize event", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(80, 24);

    const app = mount(() => Text({ content: "hello" }), {
      stdin: mockStdin as unknown as NodeJS.ReadStream,
      stdout: mockStdout as unknown as NodeJS.WriteStream,
    });

    // Simulate resize
    mockStdout.columns = 120;
    mockStdout.rows = 40;
    mockStdout.emit("resize");

    // Buffer should be resized (we can't directly check buffer, but the app should not crash)
    app.unmount();
  });
});

describe("buildPathToRoot", () => {
  it("returns path from target to root via parent pointers", () => {
    const grandchild = Text({ content: "grandchild" });
    const child = Box({ children: [grandchild] });
    const root = Box({ children: [child] });

    // Box sets _parent on children, so:
    // grandchild._parent === child
    // child._parent === root
    // root._parent === undefined

    const path = buildPathToRoot(grandchild);

    assert.strictEqual(path.length, 3);
    assert.strictEqual(path[0], grandchild);
    assert.strictEqual(path[1], child);
    assert.strictEqual(path[2], root);
  });

  it("returns single-element path for root node", () => {
    const root = Text({ content: "root" });
    // No parent set

    const path = buildPathToRoot(root);

    assert.strictEqual(path.length, 1);
    assert.strictEqual(path[0], root);
  });
});

describe("keyboard routing", () => {
  it("dispatches to focused node", () => {
    let receivedName: string | null = null;
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = mount(
      () =>
        Box({
          focusable: true,
          autoFocus: true,
          onKeyPress: (e) => {
            receivedName = e.name;
            return true;
          },
          children: [Text({ content: "hello" })],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        fps: 0,
      },
    );

    // Simulate keypress
    mockStdin.emit("keypress", "a", { name: "a", sequence: "a" });

    assert.strictEqual(receivedName, "a");
    app.unmount();
  });

  it("bubbles when not consumed", () => {
    const calls: string[] = [];
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = mount(
      () =>
        Box({
          onKeyPress: () => {
            calls.push("parent");
            return false;
          },
          children: [
            Text({
              content: "child",
              focusable: true,
              autoFocus: true,
              onKeyPress: () => {
                calls.push("child");
                return false;
              },
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        fps: 0,
      },
    );

    // Simulate keypress
    mockStdin.emit("keypress", "a", { name: "a", sequence: "a" });

    assert.deepStrictEqual(calls, ["child", "parent"]);
    app.unmount();
  });

  it("stops bubbling when consumed", () => {
    const calls: string[] = [];
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();

    const app = mount(
      () =>
        Box({
          onKeyPress: () => {
            calls.push("parent");
            return false;
          },
          children: [
            Text({
              content: "child",
              focusable: true,
              autoFocus: true,
              onKeyPress: () => {
                calls.push("child");
                return true; // Consume
              },
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        fps: 0,
      },
    );

    // Simulate keypress
    mockStdin.emit("keypress", "a", { name: "a", sequence: "a" });

    assert.deepStrictEqual(calls, ["child"]);
    app.unmount();
  });
});

describe("hit testing", () => {
  it("returns node containing point", () => {
    const node = Text({ content: "hello" });
    const layout: LayoutResult = {
      x: 0,
      y: 0,
      screenX: 0,
      screenY: 0,
      width: 10,
      height: 1,
      children: [],
    };

    assert.strictEqual(hitTest(node, layout, 5, 0), node);
  });

  it("returns null for point outside", () => {
    const node = Text({ content: "hello" });
    const layout: LayoutResult = {
      x: 0,
      y: 0,
      screenX: 0,
      screenY: 0,
      width: 10,
      height: 1,
      children: [],
    };

    assert.strictEqual(hitTest(node, layout, 15, 0), null);
  });

  it("returns deepest child", () => {
    const child = Text({ content: "child" });
    const parent = Box({ children: [child] });

    // Child at relative x=5,y=5 within parent, screen position is absolute
    const layout: LayoutResult = {
      x: 0,
      y: 0,
      screenX: 0,
      screenY: 0,
      width: 20,
      height: 10,
      children: [
        {
          x: 5,
          y: 5,
          screenX: 5,
          screenY: 5,
          width: 5,
          height: 1,
          children: [],
        },
      ],
    };

    assert.strictEqual(hitTest(parent, layout, 7, 5), child);
  });

  it("prefers later children (z-order)", () => {
    const child1 = Text({ content: "first" });
    const child2 = Text({ content: "second" });
    const parent = Box({ children: [child1, child2] });

    // Overlapping children
    const layout: LayoutResult = {
      x: 0,
      y: 0,
      screenX: 0,
      screenY: 0,
      width: 20,
      height: 10,
      children: [
        {
          x: 0,
          y: 0,
          screenX: 0,
          screenY: 0,
          width: 10,
          height: 5,
          children: [],
        },
        {
          x: 5,
          y: 2,
          screenX: 5,
          screenY: 2,
          width: 10,
          height: 5,
          children: [],
        }, // overlaps
      ],
    };

    // Point in overlap region should hit child2
    assert.strictEqual(hitTest(parent, layout, 7, 3), child2);
  });
});

describe("hover tracking", () => {
  it("calls onHover(true) when entering", () => {
    let hovering = false;
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 10);

    const app = mount(
      () =>
        Text({
          content: "hello",
          onHover: (h) => {
            hovering = h;
          },
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        mouse: true,
        fps: 0,
      },
    );

    // Simulate mouse move into the text area
    // SGR mouse format: \x1b[<button;col;row[M|m]
    // Button 35 = 32 (motion) + 3 (no button), move at (1,1)
    mockStdin.emit("data", Buffer.from("\x1b[<35;1;1M"));

    assert.strictEqual(hovering, true);
    app.unmount();
  });

  it("calls onHover(false) when leaving", () => {
    let hovering = true;
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 10);

    const app = mount(
      () =>
        Box({
          width: 5,
          height: 1,
          children: [
            Text({
              content: "hello",
              onHover: (h) => {
                hovering = h;
              },
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        mouse: true,
        fps: 0,
      },
    );

    // First move into the element
    mockStdin.emit("data", Buffer.from("\x1b[<35;1;1M"));
    assert.strictEqual(hovering, true);

    // Then move outside the element (way off to the right)
    mockStdin.emit("data", Buffer.from("\x1b[<35;50;50M"));
    assert.strictEqual(hovering, false);

    app.unmount();
  });
});

describe("mouse events", () => {
  it("dispatches press to node under cursor", () => {
    let pressed = false;
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 10);

    const app = mount(
      () =>
        Text({
          content: "hello",
          onMousePress: () => {
            pressed = true;
          },
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        mouse: true,
        fps: 0,
      },
    );

    // SGR mouse press: button 0 (left), at (1,1)
    mockStdin.emit("data", Buffer.from("\x1b[<0;1;1M"));

    assert.strictEqual(pressed, true);
    app.unmount();
  });
});

describe("scroll events", () => {
  it("dispatches to node under cursor", () => {
    let scrollDir: "up" | "down" | "left" | "right" | null = null;
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 10);

    const app = mount(
      () =>
        Text({
          content: "hello",
          onScroll: (e) => {
            scrollDir = e.direction;
          },
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        mouse: true,
        fps: 0,
      },
    );

    // SGR scroll up: button 64 (scroll bit) + 0 (up direction) at (1,1)
    mockStdin.emit("data", Buffer.from("\x1b[<64;1;1M"));

    assert.strictEqual(scrollDir, "up");
    app.unmount();
  });
});

// Test helpers for focus management
function createTestState(root: Node): RuntimeState {
  const rootScope: FocusScope = {
    parent: null,
    focusableNodes: [],
    focusedIndex: -1,
    trap: false,
  };

  return {
    root,
    rootDispose: () => {},
    buffer: null as unknown as import("../src/core/buffer.ts").Buffer,
    layoutResult: {
      x: 0,
      y: 0,
      screenX: 0,
      screenY: 0,
      width: 80,
      height: 24,
      children: [],
    },
    inputParser: { destroy: () => {} },
    stdin: null as unknown as NodeJS.ReadStream,
    frameInterval: null,
    options: {
      fps: 60,
      mouse: false,
      alternateScreen: true,
      stdout: process.stdout,
      stdin: process.stdin,
    },
    pendingEvents: [],
    focusedNode: null,
    rootScope,
    hoverState: { currentNode: null },
    terminalFocused: true,
  };
}

function createTestScope(nodes: Node[], trap = false): FocusScope {
  return {
    parent: null,
    focusableNodes: nodes,
    focusedIndex: -1,
    trap,
  };
}

describe("collectFocusableInScope", () => {
  it("collects focusable nodes into scope", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true });
    const root = Box({
      children: [a, Text({ content: "not focusable" }), b],
    });
    const scope = createTestScope([]);

    collectFocusableInScope(root, scope);

    assert.deepStrictEqual(scope.focusableNodes, [a, b]);
  });

  it("traverses nested children", () => {
    const inner = Text({ content: "inner", focusable: true });
    const outer = Box({ children: [Box({ children: [inner] })] });
    const scope = createTestScope([]);

    collectFocusableInScope(outer, scope);

    assert.deepStrictEqual(scope.focusableNodes, [inner]);
  });

  it("stops at nested FocusScope boundaries", () => {
    const outer = Text({ content: "outer", focusable: true });
    const inner = Text({ content: "inner", focusable: true });

    // Simulate a nested scope by setting _focusScope
    const nestedBox = Box({ children: [inner] });
    (nestedBox as { _focusScope?: FocusScope })._focusScope = createTestScope(
      [],
    );

    const root = Box({ children: [outer, nestedBox] });
    const scope = createTestScope([]);

    collectFocusableInScope(root, scope);

    // Should only collect outer, not inner
    assert.deepStrictEqual(scope.focusableNodes, [outer]);
  });
});

describe("focusNext", () => {
  it("focuses first when nothing focused", () => {
    const a = Text({ content: "a", focusable: true });
    const state = createTestState(Box({ children: [a] }));
    const scope = createTestScope([a]);

    focusNext(state, scope);

    assert.strictEqual(state.focusedNode, a);
    assert.strictEqual(scope.focusedIndex, 0);
  });

  it("moves to next node", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true });
    const state = createTestState(Box({ children: [a, b] }));
    const scope = createTestScope([a, b]);
    scope.focusedIndex = 0;
    state.focusedNode = a;

    focusNext(state, scope);

    assert.strictEqual(state.focusedNode, b);
    assert.strictEqual(scope.focusedIndex, 1);
  });

  it("wraps to first in trapped scope", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true });
    const state = createTestState(Box({ children: [a, b] }));
    const scope = createTestScope([a, b], true); // trap = true
    scope.focusedIndex = 1;
    state.focusedNode = b;

    focusNext(state, scope);

    assert.strictEqual(state.focusedNode, a);
    assert.strictEqual(scope.focusedIndex, 0);
  });
});

describe("focusPrev", () => {
  it("focuses last when nothing focused", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true });
    const state = createTestState(Box({ children: [a, b] }));
    const scope = createTestScope([a, b]);

    focusPrev(state, scope);

    assert.strictEqual(state.focusedNode, b);
    assert.strictEqual(scope.focusedIndex, 1);
  });

  it("moves to previous node", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true });
    const state = createTestState(Box({ children: [a, b] }));
    const scope = createTestScope([a, b]);
    scope.focusedIndex = 1;
    state.focusedNode = b;

    focusPrev(state, scope);

    assert.strictEqual(state.focusedNode, a);
    assert.strictEqual(scope.focusedIndex, 0);
  });

  it("wraps to last in trapped scope", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true });
    const state = createTestState(Box({ children: [a, b] }));
    const scope = createTestScope([a, b], true); // trap = true
    scope.focusedIndex = 0;
    state.focusedNode = a;

    focusPrev(state, scope);

    assert.strictEqual(state.focusedNode, b);
    assert.strictEqual(scope.focusedIndex, 1);
  });
});

describe("focus scope nesting", () => {
  it("escapes to parent scope when not trapped", () => {
    const parentNode = Text({ content: "parent", focusable: true });
    const childNode = Text({ content: "child", focusable: true });

    const state = createTestState(Box({}));
    const parentScope = createTestScope([parentNode]);
    const childScope = createTestScope([childNode]);
    childScope.parent = parentScope;
    childScope.focusedIndex = 0;
    state.focusedNode = childNode;

    // At end of child scope, should escape to parent
    focusNext(state, childScope);

    assert.strictEqual(state.focusedNode, parentNode);
    assert.strictEqual(childScope.focusedIndex, -1); // cleared
  });

  it("stays in scope when trapped", () => {
    const node = Text({ content: "only", focusable: true });

    const state = createTestState(Box({}));
    const scope = createTestScope([node], true); // trapped
    scope.focusedIndex = 0;
    state.focusedNode = node;

    // Should wrap, not escape
    focusNext(state, scope);

    assert.strictEqual(state.focusedNode, node);
    assert.strictEqual(scope.focusedIndex, 0);
  });
});

describe("autoFocus", () => {
  it("focuses first autoFocus node", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true, autoFocus: true });
    const root = Box({ children: [a, b] });
    const state = createTestState(root);

    initializeFocus(state);

    assert.strictEqual(state.focusedNode, b);
    assert.strictEqual(state.rootScope.focusedIndex, 1);
  });

  it("falls back to first focusable", () => {
    const a = Text({ content: "a", focusable: true });
    const b = Text({ content: "b", focusable: true });
    const root = Box({ children: [a, b] });
    const state = createTestState(root);

    initializeFocus(state);

    assert.strictEqual(state.focusedNode, a);
    assert.strictEqual(state.rootScope.focusedIndex, 0);
  });
});

describe("useFocus", () => {
  it("throws outside of mount", () => {
    setActiveContext(null);
    assert.throws(() => useFocus(), /must be called within/);
  });

  it("returns controller within context", () => {
    const state = createTestState(Box({}));
    const scope = createTestScope([]);
    setActiveContext({ state, currentScope: scope });

    const controller = useFocus();

    assert.ok(typeof controller.next === "function");
    assert.ok(typeof controller.prev === "function");
    assert.ok(typeof controller.set === "function");
    assert.ok(typeof controller.current === "function");

    setActiveContext(null);
  });
});

describe("withContext", () => {
  it("sets context during callback", () => {
    const state = createTestState(Box({}));
    const scope = createTestScope([]);
    const ctx: RuntimeContext = { state, currentScope: scope };

    let capturedContext: RuntimeContext | null = null;

    withContext(ctx, () => {
      capturedContext = getActiveContext();
    });

    assert.strictEqual(capturedContext, ctx);
  });

  it("restores previous context after callback", () => {
    const state1 = createTestState(Box({}));
    const state2 = createTestState(Box({}));
    const ctx1: RuntimeContext = {
      state: state1,
      currentScope: createTestScope([]),
    };
    const ctx2: RuntimeContext = {
      state: state2,
      currentScope: createTestScope([]),
    };

    setActiveContext(ctx1);

    withContext(ctx2, () => {
      assert.strictEqual(getActiveContext(), ctx2);
    });

    assert.strictEqual(getActiveContext(), ctx1);
    setActiveContext(null);
  });
});

describe("Ref binding", () => {
  it("Text binds ref.current", () => {
    const ref = createRef();
    const node = Text({ content: "hello", ref });

    assert.strictEqual(ref.current, node);
  });

  it("Box binds ref.current", () => {
    const ref = createRef();
    const node = Box({ ref });

    assert.strictEqual(ref.current, node);
  });
});

describe("TabFocus component", () => {
  it("handles Tab to navigate focus", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const focusedNodes: string[] = [];

    const app = mount(
      () =>
        TabFocus({
          children: [
            Text({
              content: "first",
              focusable: true,
              autoFocus: true,
              onKeyPress: () => {
                focusedNodes.push("first");
                return false;
              },
            }),
            Text({
              content: "second",
              focusable: true,
              onKeyPress: () => {
                focusedNodes.push("second");
                return false;
              },
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        fps: 0,
      },
    );

    // First item should be focused initially
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(focusedNodes, ["first"]);

    // Press Tab to move to second
    mockStdin.emit("keypress", "\t", { name: "tab", sequence: "\t" });
    focusedNodes.length = 0;
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(focusedNodes, ["second"]);

    app.unmount();
  });

  it("handles Shift+Tab to navigate focus backwards", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout();
    const focusedNodes: string[] = [];

    const app = mount(
      () =>
        TabFocus({
          children: [
            Text({
              content: "first",
              focusable: true,
              onKeyPress: () => {
                focusedNodes.push("first");
                return false;
              },
            }),
            Text({
              content: "second",
              focusable: true,
              autoFocus: true,
              onKeyPress: () => {
                focusedNodes.push("second");
                return false;
              },
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
        fps: 0,
      },
    );

    // Second item should be focused initially (autoFocus)
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(focusedNodes, ["second"]);

    // Press Shift+Tab to move to first
    mockStdin.emit("keypress", "\t", {
      name: "tab",
      sequence: "\t",
      shift: true,
    });
    focusedNodes.length = 0;
    mockStdin.emit("keypress", "x", { name: "x", sequence: "x" });
    assert.deepStrictEqual(focusedNodes, ["first"]);

    app.unmount();
  });
});
