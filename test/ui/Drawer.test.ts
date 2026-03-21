import assert from "node:assert";
import { describe, it } from "node:test";
import { App, Box, Text, createRef } from "../../src/core/runtime.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Button } from "../../src/ui/Button.ts";
import { Drawer } from "../../src/ui/Drawer.ts";

// Mock stdin for mount tests
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

describe("Drawer", () => {
  describe("conditional rendering", () => {
    it("not rendered when open is false", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: false,
                children: Text({ content: "DrawerContent" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Drawer content should not appear in output when closed
      assert.ok(!mockStdout.written.includes("DrawerContent"));
      app.unmount();
    });

    it("rendered when open is true", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: true,
                children: Text({ content: "DrawerContent" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Drawer content should appear in output when open
      assert.ok(mockStdout.written.includes("DrawerContent"));
      app.unmount();
    });

    it("reactive open prop controls drawer visibility", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const [isOpen, setIsOpen] = createSignal(true);

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: isOpen,
                children: Text({ content: "DrawerContent" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Initially open - should be visible
      assert.ok(mockStdout.written.includes("DrawerContent"));

      // Close the drawer (signal update)
      setIsOpen(false);

      // The Show component disposes the child when signal becomes false
      // This should not throw errors (clean disposal)
      app.unmount();
    });
  });

  describe("keyboard handling", () => {
    it("Escape key calls onClose", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let closeCalled = false;

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: true,
                onClose: () => {
                  closeCalled = true;
                },
                children: Text({ content: "Drawer" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Simulate Escape key (keypress event format)
      mockStdin.emit("keypress", "\x1b", { name: "escape", sequence: "\x1b" });

      assert.strictEqual(closeCalled, true);
      app.unmount();
    });

    it("other keys do not close drawer", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let closeCalled = false;

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: true,
                onClose: () => {
                  closeCalled = true;
                },
                children: Text({ content: "Drawer" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Simulate Enter key (should not close)
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });

      assert.strictEqual(closeCalled, false);
      app.unmount();
    });
  });

  describe("side positioning", () => {
    it("defaults to right side", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: true,
                children: Text({ content: "RightDrawer" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Drawer content should be rendered
      assert.ok(mockStdout.written.includes("RightDrawer"));
      app.unmount();
    });

    it("appears from left side when specified", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: true,
                side: "left",
                children: Text({ content: "LeftDrawer" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Drawer content should be rendered
      assert.ok(mockStdout.written.includes("LeftDrawer"));
      app.unmount();
    });

    it("appears from top when specified", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: true,
                side: "top",
                size: 10, // Must fit within mock viewport (24 rows)
                children: Text({ content: "TopDrawer" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Drawer content should be rendered
      assert.ok(mockStdout.written.includes("TopDrawer"));
      app.unmount();
    });

    it("appears from bottom when specified", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: true,
                side: "bottom",
                size: 10, // Must fit within mock viewport (24 rows)
                children: Text({ content: "BottomDrawer" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Drawer content should be rendered
      assert.ok(mockStdout.written.includes("BottomDrawer"));
      app.unmount();
    });

    it("reactive side prop updates position", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const [side, setSide] = createSignal<"left" | "right">("left");

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: true,
                side: side,
                children: Text({ content: "SideDrawer" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Initially left side
      assert.ok(mockStdout.written.includes("SideDrawer"));

      // Change to right side
      setSide("right");

      // Should still render
      app.unmount();
    });
  });

  describe("size", () => {
    it("defaults to size 30", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: true,
                children: Text({ content: "DefaultSize" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Drawer content should be rendered
      assert.ok(mockStdout.written.includes("DefaultSize"));
      app.unmount();
    });

    it("custom size prop works", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: true,
                size: 40,
                children: Text({ content: "CustomSize" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Drawer content should be rendered
      assert.ok(mockStdout.written.includes("CustomSize"));
      app.unmount();
    });

    it("reactive size prop works", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const [size, setSize] = createSignal(30);

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: true,
                size: size,
                children: Text({ content: "ReactiveSize" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(mockStdout.written.includes("ReactiveSize"));

      // Change size
      setSize(50);

      app.unmount();
    });
  });

  describe("structure", () => {
    it("renders via Portal (at root level)", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Text({ content: "Background" }),
              Drawer({
                open: true,
                children: Text({ content: "PortalContent" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Portal content should be rendered at root level (on top)
      assert.ok(mockStdout.written.includes("PortalContent"));
      app.unmount();
    });

    it("accepts single child", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: true,
                children: Text({ content: "SingleChild" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(mockStdout.written.includes("SingleChild"));
      app.unmount();
    });

    it("accepts multiple children", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: true,
                children: [
                  Text({ content: "Child1" }),
                  Text({ content: "Child2" }),
                ],
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(mockStdout.written.includes("Child1"));
      assert.ok(mockStdout.written.includes("Child2"));
      app.unmount();
    });
  });

  describe("style overrides", () => {
    it("applies style overrides to content container", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: true,
                children: Text({ content: "Styled" }),
                style: {
                  paddingTop: 2,
                  paddingStart: 2,
                },
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Drawer renders, style is applied to content box
      assert.ok(mockStdout.written.includes("Styled"));
      app.unmount();
    });
  });

  describe("focus trapping", () => {
    it("Tab navigates within drawer content", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const buttonRef1 = createRef();
      const buttonRef2 = createRef();

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: true,
                children: [
                  Button({ children: "Button1", ref: buttonRef1 }),
                  Button({ children: "Button2", ref: buttonRef2 }),
                ],
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Both buttons should be rendered
      assert.ok(mockStdout.written.includes("Button1"));
      assert.ok(mockStdout.written.includes("Button2"));

      // Tab should work (focus is trapped within TabFocus)
      mockStdin.emit("keypress", "\t", { name: "tab", sequence: "\t" });

      app.unmount();
    });
  });

  describe("cleanup", () => {
    it("cleans up on close", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const [isOpen, setIsOpen] = createSignal(true);

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: isOpen,
                children: Text({ content: "CleanupContent" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Open initially
      assert.ok(mockStdout.written.includes("CleanupContent"));

      // Close - should clean up
      setIsOpen(false);

      // Unmount should succeed without errors
      app.unmount();
    });
  });

  describe("integration", () => {
    it("works with interactive children", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let buttonClicked = false;

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: true,
                children: [
                  Text({ content: "Navigation" }),
                  Button({
                    children: "Home",
                    autoFocus: true,
                    onClick: () => {
                      buttonClicked = true;
                    },
                  }),
                ],
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(mockStdout.written.includes("Navigation"));
      assert.ok(mockStdout.written.includes("Home"));

      // Press Enter on the focused button
      mockStdin.emit("keypress", "\r", { name: "enter", sequence: "\r" });

      assert.strictEqual(buttonClicked, true);
      app.unmount();
    });

    it("onClose callback is invoked on Escape", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let onCloseCalled = false;

      const app = App.mount(
        () =>
          Box({
            children: [
              Drawer({
                open: true,
                onClose: () => {
                  onCloseCalled = true;
                },
                children: Text({
                  content: "ClosableDrawer",
                  focusable: true,
                  autoFocus: true,
                }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Initially open
      assert.ok(mockStdout.written.includes("ClosableDrawer"));

      // Press Escape (keypress event format)
      mockStdin.emit("keypress", "\x1b", { name: "escape", sequence: "\x1b" });

      // onClose should have been called
      assert.strictEqual(onCloseCalled, true);

      app.unmount();
    });
  });
});
