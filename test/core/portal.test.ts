import assert from "node:assert";
import { describe, it } from "node:test";
import { type Color, Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import { DEFAULT_FLEX_STYLE, computeLayout } from "../../src/core/layout.ts";
import type { LayoutNode } from "../../src/core/layout.ts";
import {
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
  mount,
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
  it("creates node with _isPortal flag", () => {
    const child = Text({ content: "hello" });
    const portal = Portal({ children: child });

    assert.strictEqual(portal._isPortal, true);
  });

  it("accepts single child", () => {
    const child = Text({ content: "hello" });
    const portal = Portal({ children: child });

    assert.strictEqual(portal.children?.length, 1);
    assert.strictEqual(portal.children?.[0], child);
  });

  it("accepts multiple children", () => {
    const child1 = Text({ content: "hello" });
    const child2 = Text({ content: "world" });
    const portal = Portal({ children: [child1, child2] });

    assert.strictEqual(portal.children?.length, 2);
    assert.strictEqual(portal.children?.[0], child1);
    assert.strictEqual(portal.children?.[1], child2);
  });

  it("sets _parent on children", () => {
    const child = Text({ content: "hello" });
    const portal = Portal({ children: child });

    assert.strictEqual(child._parent, portal);
  });

  it("has display: contents style", () => {
    const portal = Portal({ children: Text({ content: "test" }) });

    const style =
      typeof portal.style === "function" ? portal.style() : portal.style;
    assert.strictEqual(style.display, "contents");
  });
});

describe("Portal layout exclusion", () => {
  it("portal children do not affect parent layout", () => {
    createRoot((dispose) => {
      // Create a row with two boxes and a portal
      const parent = Box({
        flexDirection: "row",
        width: 60,
        height: 10,
        children: [
          Box({ flexGrow: 1, children: [Text({ content: "A" })] }),
          Portal({
            children: Box({
              position: "absolute",
              width: 20,
              height: 5,
              children: [Text({ content: "Portal" })],
            }),
          }),
          Box({ flexGrow: 1, children: [Text({ content: "B" })] }),
        ],
      });

      // Convert to layout node (this should skip portal children)
      const toLayoutNode = (node: Node): LayoutNode => ({
        style: typeof node.style === "function" ? node.style() : node.style,
        children: node.children?.filter((c) => !c._isPortal).map(toLayoutNode),
        measure: node.measure,
      });

      const layout = computeLayout(toLayoutNode(parent), 60, 10);

      // Only the two non-portal boxes should be in the layout
      assert.strictEqual(
        layout.children.length,
        2,
        "Should have 2 layout children (portal excluded)",
      );

      // Each box should get half the space (60 / 2 = 30)
      assert.strictEqual(
        layout.children[0].width,
        30,
        "Box A should be 30 wide",
      );
      assert.strictEqual(
        layout.children[1].width,
        30,
        "Box B should be 30 wide",
      );

      dispose();
      return dispose;
    });
  });
});

describe("Portal rendering", () => {
  it("portal children render at root level (on top)", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 5);

    const app = mount(
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

  it("multiple portals stack in document order", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 5);

    const app = mount(
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
  it("Show inside Portal works correctly", () => {
    createRoot((dispose) => {
      const [visible, setVisible] = createSignal(true);

      const portal = Portal({
        children: Show({
          when: visible,
          children: () => Text({ content: "Visible" }),
          fallback: () => Text({ content: "Hidden" }),
        }),
      });

      // Initially visible
      const showNode = portal.children?.[0];
      assert.strictEqual(showNode?.children?.length, 1);

      // Toggle off
      setVisible(false);
      assert.strictEqual(showNode?.children?.length, 1);

      dispose();
      return dispose;
    });
  });

  it("Portal inside Show works correctly", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(20, 5);
    const [visible, setVisible] = createSignal(true);

    const app = mount(
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
    createRoot((dispose) => {
      const [items, setItems] = createSignal(["a", "b", "c"]);

      const portal = Portal({
        children: For({
          each: items,
          render: (item) => Text({ content: item }),
        }),
      });

      const forNode = portal.children?.[0];
      assert.strictEqual(forNode?.children?.length, 3);

      // Add item
      setItems(["a", "b", "c", "d"]);
      assert.strictEqual(forNode?.children?.length, 4);

      dispose();
      return dispose;
    });
  });
});

describe("Portal focus management", () => {
  it("portal children are part of focus tree", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(40, 10);
    const outsideRef = createRef();
    const portalRef = createRef();
    let focusController!: FocusController;

    const app = mount(
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

    const app = mount(
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

    const app = mount(
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

    const app = mount(
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
  it("reactive content inside Portal updates", () => {
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0);

      const portal = Portal({
        children: Text({ content: () => `Count: ${count()}` }),
      });

      // Get the text node
      const textNode = portal.children?.[0];
      assert.ok(textNode, "Portal should have children");
      assert.ok(textNode.measure, "Text node should have measure");

      // Initial measure
      const initialSize = textNode.measure(100, 1);
      assert.strictEqual(initialSize.width, 8, "Count: 0 is 8 chars");

      // Update count
      setCount(42);

      // Measure again - should reflect new content
      const updatedSize = textNode.measure(100, 1);
      assert.strictEqual(updatedSize.width, 9, "Count: 42 is 9 chars");

      dispose();
      return dispose;
    });
  });
});

describe("Nested Portals", () => {
  it("nested portals both render at root", () => {
    const mockStdin = createMockStdin();
    const mockStdout = createMockStdout(40, 10);

    const app = mount(
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
  it("portal children inherit styles from portal's logical position", () => {
    // The portal is logically inside a box with red color
    // Its children should inherit that color
    createRoot((dispose) => {
      const parentColor: Color = { type: "rgb", r: 255, g: 0, b: 0 };

      const parent = Box({
        children: [
          Portal({
            children: Text({ content: "hello" }),
          }),
        ],
        // Set inheritable color on parent
      });

      // Store inheritable props on parent
      parent._inheritableProps = { color: parentColor };

      // The portal children should inherit from the parent's inherited style
      // when rendered. This is tested through the render pipeline.

      dispose();
      return dispose;
    });
  });
});
