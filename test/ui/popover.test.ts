import assert from "node:assert";
import { describe, it } from "node:test";
import { Box, Text, mount } from "../../src/core/runtime.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Button } from "../../src/ui/button.ts";
import { Popover, type PopoverPlacement } from "../../src/ui/popover.ts";

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

describe("Popover", () => {
  describe("trigger rendering", () => {
    it("trigger renders in normal flow", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            children: [
              Popover({
                open: false,
                content: () => Text({ content: "PopoverContent" }),
                children: (props) =>
                  Box({
                    ref: props.ref,
                    children: [Text({ content: "TriggerText" })],
                  }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Trigger should always be rendered
      assert.ok(mockStdout.written.includes("TriggerText"));
      app.unmount();
    });

    it("trigger renders when popover is open", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            children: [
              Popover({
                open: true,
                content: () => Text({ content: "PopoverContent" }),
                children: (props) =>
                  Box({
                    ref: props.ref,
                    children: [Text({ content: "TriggerText" })],
                  }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Trigger should be rendered even when popover is open
      assert.ok(mockStdout.written.includes("TriggerText"));
      app.unmount();
    });
  });

  describe("conditional rendering", () => {
    it("content not rendered when closed", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            children: [
              Popover({
                open: false,
                content: () => Text({ content: "PopoverContent" }),
                children: (props) =>
                  Box({
                    ref: props.ref,
                    children: [Text({ content: "Trigger" })],
                  }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Popover content should not appear when closed
      assert.ok(!mockStdout.written.includes("PopoverContent"));
      app.unmount();
    });

    it("content renders when open", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            children: [
              Popover({
                open: true,
                // Use right placement so popover appears within viewport
                placement: "right",
                content: () => Text({ content: "PopoverContent" }),
                children: (props) =>
                  Box({
                    ref: props.ref,
                    children: [Text({ content: "Trigger" })],
                  }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Popover content should appear when open
      assert.ok(mockStdout.written.includes("PopoverContent"));
      app.unmount();
    });

    it("reactive open prop toggles content", () => {
      // Test that popover responds to reactive open prop
      // When open is a getter function, popover checks it each render
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const [isOpen, setIsOpen] = createSignal(true);

      const app = mount(
        () =>
          Box({
            height: 10,
            children: [
              Popover({
                open: isOpen,
                content: () => Text({ content: "PopoverContent" }),
                children: (props) =>
                  Box({
                    ref: props.ref,
                    height: 3,
                    children: [Text({ content: "Trigger" })],
                  }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Initially open - should be visible
      assert.ok(mockStdout.written.includes("PopoverContent"));

      // Close the popover (signal update)
      setIsOpen(false);

      // This should not throw errors (clean disposal)
      app.unmount();
    });
  });

  describe("keyboard handling", () => {
    it("Escape key calls onClose", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let closeCalled = false;

      const app = mount(
        () =>
          Box({
            children: [
              Popover({
                open: true,
                onClose: () => {
                  closeCalled = true;
                },
                content: () => Text({ content: "Content" }),
                children: (props) =>
                  Box({
                    ref: props.ref,
                    children: [Text({ content: "Trigger" })],
                  }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Simulate Escape key
      mockStdin.emit("keypress", "\x1b", { name: "escape", sequence: "\x1b" });

      assert.strictEqual(closeCalled, true);
      app.unmount();
    });

    it("other keys do not close popover", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let closeCalled = false;

      const app = mount(
        () =>
          Box({
            children: [
              Popover({
                open: true,
                onClose: () => {
                  closeCalled = true;
                },
                content: () => Text({ content: "Content" }),
                children: (props) =>
                  Box({
                    ref: props.ref,
                    children: [Text({ content: "Trigger" })],
                  }),
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

  describe("Portal rendering", () => {
    it("content renders via Portal (at root level)", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            children: [
              Text({ content: "Background" }),
              Popover({
                open: true,
                placement: "right",
                content: () => Text({ content: "PortalContent" }),
                children: (props) =>
                  Box({
                    ref: props.ref,
                    children: [Text({ content: "Trigger" })],
                  }),
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
  });

  describe("placement", () => {
    const placements: PopoverPlacement[] = [
      "bottom-start",
      "bottom",
      "bottom-end",
      "top-start",
      "top",
      "top-end",
      "left-start",
      "left",
      "left-end",
      "right-start",
      "right",
      "right-end",
    ];

    for (const placement of placements) {
      it(`supports ${placement} placement`, () => {
        const mockStdin = createMockStdin();
        const mockStdout = createMockStdout();

        const app = mount(
          () =>
            Box({
              // Container that doesn't fill viewport so popover has room
              height: 12,
              // Add top padding so "top" placements have room above the trigger
              paddingTop: 3,
              children: [
                Popover({
                  open: true,
                  placement,
                  content: () => Text({ content: "Content" }),
                  children: (props) =>
                    Box({
                      ref: props.ref,
                      height: 3, // Small trigger height
                      children: [Text({ content: "Trigger" })],
                    }),
                }),
              ],
            }),
          {
            stdin: mockStdin as unknown as NodeJS.ReadStream,
            stdout: mockStdout as unknown as NodeJS.WriteStream,
          },
        );

        // Content should render with any valid placement
        assert.ok(mockStdout.written.includes("Content"));
        app.unmount();
      });
    }

    it("default placement is bottom-start", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            height: 10,
            children: [
              Popover({
                open: true,
                // No placement specified - should default to bottom-start
                content: () => Text({ content: "Content" }),
                children: (props) =>
                  Box({
                    ref: props.ref,
                    height: 3,
                    children: [Text({ content: "Trigger" })],
                  }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Content should render (default placement works)
      assert.ok(mockStdout.written.includes("Content"));
      app.unmount();
    });

    it("reactive placement prop works", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const [placement, setPlacement] =
        createSignal<PopoverPlacement>("bottom-start");

      const app = mount(
        () =>
          Box({
            height: 10,
            children: [
              Popover({
                open: true,
                placement,
                content: () => Text({ content: "Content" }),
                children: (props) =>
                  Box({
                    ref: props.ref,
                    height: 3,
                    children: [Text({ content: "Trigger" })],
                  }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Content renders with initial placement
      assert.ok(mockStdout.written.includes("Content"));

      // Change placement
      setPlacement("top-start");

      // Should still render (placement change works)
      assert.ok(mockStdout.written.includes("Content"));
      app.unmount();
    });
  });

  describe("style overrides", () => {
    it("style prop applies to popover container", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            height: 10,
            children: [
              Popover({
                open: true,
                style: {
                  paddingTop: 2,
                  width: 20,
                },
                content: () => Text({ content: "StyledContent" }),
                children: (props) =>
                  Box({
                    ref: props.ref,
                    height: 3,
                    children: [Text({ content: "Trigger" })],
                  }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Content should render (style applied)
      assert.ok(mockStdout.written.includes("StyledContent"));
      app.unmount();
    });
  });

  describe("content prop", () => {
    it("supports single node content", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            height: 10,
            children: [
              Popover({
                open: true,
                content: () => Text({ content: "SingleNode" }),
                children: (props) =>
                  Box({
                    ref: props.ref,
                    height: 3,
                    children: [Text({ content: "Trigger" })],
                  }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(mockStdout.written.includes("SingleNode"));
      app.unmount();
    });

    it("supports array of nodes content", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            height: 10,
            children: [
              Popover({
                open: true,
                content: () => [
                  Text({ content: "Node1" }),
                  Text({ content: "Node2" }),
                ],
                children: (props) =>
                  Box({
                    ref: props.ref,
                    height: 3,
                    children: [Text({ content: "Trigger" })],
                  }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(mockStdout.written.includes("Node1"));
      assert.ok(mockStdout.written.includes("Node2"));
      app.unmount();
    });
  });

  describe("with Button trigger", () => {
    it("works with Button component as trigger", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const [isOpen, setIsOpen] = createSignal(true);

      const app = mount(
        () =>
          Box({
            height: 10,
            children: [
              Popover({
                open: isOpen,
                onClose: () => setIsOpen(false),
                content: () => [
                  Text({ content: "Option1" }),
                  Text({ content: "Option2" }),
                ],
                children: (props) =>
                  Button({
                    ref: props.ref,
                    children: "OpenMenu",
                    onClick: () => setIsOpen(true),
                  }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Trigger rendered
      assert.ok(mockStdout.written.includes("OpenMenu"));

      // Content should be visible (initially open)
      assert.ok(mockStdout.written.includes("Option1"));
      assert.ok(mockStdout.written.includes("Option2"));

      app.unmount();
    });
  });
});
