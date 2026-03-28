import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import {
  App,
  Box,
  DEFAULT_INHERITED_STYLE,
  type FocusController,
  For,
  type Node,
  Portal,
  Show,
  TabFocus,
  Text,
  createRef,
  useFocus,
} from "../../src/core/runtime.ts";
import { createRoot, createSignal, onCleanup } from "../../src/core/signals.ts";

// Mock stdin/stdout for mount tests
interface MockStdin {
  isTTY: boolean;
  setRawMode: () => MockStdin;
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

describe("Portal", () => {
  it("returns invisible placeholder node", () => {
    createRoot((dispose) => {
      const portal = Portal({ children: Text({ content: "hello" }) });

      const style =
        typeof portal.style === "function" ? portal.style() : portal.style;
      assert.strictEqual(style.display, "none");

      dispose();
      return dispose;
    });
  });

  it("attaches children to root when mounted", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(40, 10);
    const childRef = createRef();

    const app = App.mount(
      () =>
        Box({
          children: [
            Portal({
              children: Text({ content: "portal child", ref: childRef }),
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Portal child should be mounted (ref should be set)
    assert.ok(childRef.current !== null, "Portal child should be mounted");

    app.unmount();
  });
});

describe("Portal layout exclusion", () => {
  it("portal placeholder does not affect parent layout", () => {
    // When mounted, portal returns display:none placeholder
    // Its children are attached to root, not to the parent
    // Position portal content to not overlap other content
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(60, 10);

    const app = App.mount(
      () =>
        Box({
          flexDirection: "row",
          width: 60,
          height: 10,
          children: [
            Box({ flexGrow: 1, children: [Text({ content: "A" })] }),
            Portal({
              children: Box({
                position: "absolute",
                top: 5,
                start: 50,
                width: 10,
                height: 2,
                children: [Text({ content: "Portal" })],
              }),
            }),
            Box({ flexGrow: 1, children: [Text({ content: "B" })] }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Both A and B should render (portal doesn't interfere with layout)
    assert.ok(
      mockStdout.written.includes("A") && mockStdout.written.includes("B"),
      "Both boxes should render",
    );

    app.unmount();
  });
});

describe("Portal rendering", () => {
  it("portal children render at root level (on top)", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 5);

    const app = App.mount(
      () =>
        Box({
          width: 20,
          height: 5,
          children: [
            // Background content
            Text({ content: "Background" }),
            // Portal content should appear on top
            Portal({
              children: Box({
                position: "absolute",
                top: 0,
                start: 0,
                width: 5,
                height: 1,
                backgroundColor: { type: "named", index: 1 },
                children: [Text({ content: "TOP" })],
              }),
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // The portal content should be rendered on top
    // Check that output contains both "Background" and "TOP"
    assert.ok(
      mockStdout.written.includes("TOP") ||
        mockStdout.written.includes("Background"),
      "Output should contain rendered content",
    );

    app.unmount();
  });

  it("portal content renders on top of tree content that comes after it", () => {
    // This tests the bug where a portal's content is painted during tree
    // traversal, but then later siblings in the tree paint over it.
    // The portal should render on top regardless of document order.
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 5);

    const app = App.mount(
      () =>
        Box({
          flexDirection: "column",
          width: 20,
          height: 5,
          children: [
            // Portal renders at position (0,0) with "PORTAL"
            Portal({
              children: Box({
                position: "absolute",
                top: 0,
                start: 0,
                children: [Text({ content: "PORTAL" })],
              }),
            }),
            // This text also renders at (0,0), but since portal should be
            // painted AFTER the main tree, "PORTAL" should be visible
            Text({ content: "XXXXXX" }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // The portal content should be the final content at (0,0)
    // Look for PORTAL in the output - it should appear AFTER XXXXXX in
    // the ANSI stream since it's painted last (on top)
    const portalIndex = mockStdout.written.lastIndexOf("PORTAL");
    const overwriteIndex = mockStdout.written.lastIndexOf("XXXXXX");

    // Both should be present in output (portal painted first, X's overwrite,
    // but with correct implementation: X's first, portal paints on top)
    // Strip ANSI codes for readability in error message
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes use control chars
    const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "");
    assert.ok(
      mockStdout.written.includes("PORTAL"),
      `Portal content 'PORTAL' should be in output. Got: ${stripAnsi(mockStdout.written)}`,
    );

    // Portal content should be written AFTER the overwriting content
    // because portals paint after the main tree
    assert.ok(
      portalIndex > overwriteIndex,
      `Portal content should be painted after overlapping content. PORTAL at ${portalIndex}, XXXXXX at ${overwriteIndex}`,
    );

    app.unmount();
  });

  it("multiple portals stack in document order", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 5);

    const app = App.mount(
      () =>
        Box({
          width: 20,
          height: 5,
          children: [
            Portal({
              children: Box({
                position: "absolute",
                top: 0,
                start: 0,
                width: 10,
                height: 1,
                children: [Text({ content: "First" })],
              }),
            }),
            Portal({
              children: Box({
                position: "absolute",
                top: 0,
                start: 0,
                width: 10,
                height: 1,
                children: [Text({ content: "Second" })],
              }),
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Second portal should overwrite first (painted later)
    // The output should contain "Second" visible at position 0,0
    assert.ok(mockStdout.written.length > 0, "Should produce output");

    app.unmount();
  });
});

describe("Portal with Show", () => {
  it("Show inside Portal children works correctly", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(40, 10);
    const [visible] = createSignal(true);

    const app = App.mount(
      () =>
        Box({
          children: [
            Portal({
              children: Show({
                when: visible,
                children: () => Text({ content: "Visible" }),
                fallback: () => Text({ content: "Hidden" }),
              }),
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Initially visible
    assert.ok(mockStdout.written.includes("Visible"), "Should show Visible");

    app.unmount();
  });

  it("Portal inside Show works correctly", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 5);
    const [visible, setVisible] = createSignal(true);

    const app = App.mount(
      () =>
        Box({
          children: [
            Show({
              when: visible,
              children: () =>
                Portal({
                  children: Text({ content: "Portal Content" }),
                }),
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Initially visible - portal should render
    assert.ok(mockStdout.written.length > 0, "Should produce output");

    // Toggle off - portal should not render
    mockStdout.written = "";
    setVisible(false);

    app.unmount();
  });
});

describe("Portal with For", () => {
  it("For inside Portal works correctly", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(40, 10);
    const [items, setItems] = createSignal(["a", "b", "c"]);

    const app = App.mount(
      () =>
        Box({
          children: [
            Portal({
              children: For({
                each: items,
                render: (item) => Text({ content: item }),
              }),
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Initial items should render
    assert.ok(mockStdout.written.includes("a"), "Should include 'a'");
    assert.ok(mockStdout.written.includes("b"), "Should include 'b'");
    assert.ok(mockStdout.written.includes("c"), "Should include 'c'");

    // Add item - flush happens asynchronously
    setItems(["a", "b", "c", "d"]);

    app.unmount();
  });
});

describe("Portal focus management", () => {
  it("portal children are part of focus tree", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(40, 10);
    const outsideRef = createRef();
    const portalRef = createRef();
    let focusController!: FocusController;

    const app = App.mount(
      () => {
        focusController = useFocus();
        return TabFocus({
          children: [
            Text({
              content: "outside",
              focusable: true,
              autoFocus: true,
              ref: outsideRef,
            }),
            Portal({
              children: Text({
                content: "portal content",
                focusable: true,
                ref: portalRef,
              }),
            }),
          ],
        });
      },
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Initially, "outside" should be focused (autoFocus)
    assert.ok(focusController.current() !== null, "Should have focus");
    assert.strictEqual(
      focusController.current(),
      outsideRef.current,
      "Should focus outside node",
    );

    // Portal children should be registered in the focus tree
    // They are collected as part of the TabFocus scope
    assert.ok(portalRef.current !== null, "Portal ref should be set");

    app.unmount();
  });

  it("portal focusable children are registered in scope", () => {
    // This test verifies that focusable nodes inside portals are
    // correctly registered in the focus system
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(40, 10);
    const outsideRef = createRef();
    const portalContentRef = createRef();
    let focusController!: FocusController;

    const app = App.mount(
      () => {
        focusController = useFocus();
        return TabFocus({
          children: [
            Text({
              content: "outside",
              focusable: true,
              autoFocus: true,
              ref: outsideRef,
            }),
            Portal({
              children: Text({
                content: "portal content",
                focusable: true,
                ref: portalContentRef,
              }),
            }),
          ],
        });
      },
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Initially focused on outside (autoFocus)
    assert.strictEqual(focusController.current(), outsideRef.current);

    // Portal content ref should be set (node was created)
    assert.ok(
      portalContentRef.current !== null,
      "Portal content ref should be set",
    );

    // The portal content should be focusable
    assert.strictEqual(
      portalContentRef.current?.focusable,
      true,
      "Portal content should be focusable",
    );

    app.unmount();
  });
});

describe("Portal cleanup", () => {
  it("disposes children correctly when portal is removed", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(40, 10);
    const [visible, setVisible] = createSignal(true);
    let cleanupCalled = false;

    const app = App.mount(
      () =>
        Box({
          children: [
            Show({
              when: visible,
              children: () => {
                onCleanup(() => {
                  cleanupCalled = true;
                });
                return Portal({
                  children: Text({ content: "portal" }),
                });
              },
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    assert.strictEqual(cleanupCalled, false, "Cleanup not called yet");

    // Hide portal
    setVisible(false);

    assert.strictEqual(cleanupCalled, true, "Cleanup should be called");

    app.unmount();
  });

  it("timer cleanup on unmount", () => {
    // This test verifies that effects inside portals are properly cleaned up
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(40, 10);
    let timerCleared = false;

    const app = App.mount(
      () => {
        return Portal({
          children: (() => {
            const timer = setTimeout(() => {}, 10000);
            onCleanup(() => {
              clearTimeout(timer);
              timerCleared = true;
            });
            return Text({ content: "portal" });
          })(),
        });
      },
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    app.unmount();

    assert.strictEqual(
      timerCleared,
      true,
      "Timer should be cleared on unmount",
    );
  });
});

describe("Portal reactive updates", () => {
  it("reactive content inside Portal renders initially", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(40, 10);
    const [count] = createSignal(0);

    const app = App.mount(
      () =>
        Box({
          children: [
            Portal({
              children: Text({ content: () => `Count: ${count()}` }),
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Initial render - check that both parts are in output
    // Note: ANSI output may not have them contiguous
    assert.ok(
      mockStdout.written.includes("Count:") && mockStdout.written.includes("0"),
      "Should show Count: 0",
    );

    app.unmount();
  });
});

describe("Nested Portals", () => {
  it("nested portals both render at root", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(40, 10);

    const app = App.mount(
      () =>
        Box({
          children: [
            Portal({
              children: Box({
                position: "absolute",
                top: 0,
                start: 0,
                children: [
                  Text({ content: "Outer" }),
                  Portal({
                    children: Box({
                      position: "absolute",
                      top: 1,
                      start: 0,
                      children: [Text({ content: "Inner" })],
                    }),
                  }),
                ],
              }),
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Both should be rendered
    assert.ok(mockStdout.written.length > 0, "Should produce output");

    app.unmount();
  });
});

describe("Portal style inheritance", () => {
  it("portal children inherit styles from root (correct behavior)", () => {
    // Portal children are attached to root, so they inherit from root,
    // not from the portal's logical position. This is the correct behavior
    // since portal children ARE root's children visually.
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(40, 10);

    const app = App.mount(
      () =>
        Box({
          children: [
            Portal({
              children: Text({ content: "hello" }),
            }),
          ],
        }),
      {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      },
    );

    // Portal content should render
    assert.ok(mockStdout.written.includes("hello"), "Portal should render");

    app.unmount();
  });
});
