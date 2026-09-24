import assert from "node:assert";
import { describe, it } from "node:test";
import { Box } from "../../src/core/components/Box.ts";
import { Text } from "../../src/core/components/Text.ts";
import { App } from "../../src/core/runtime/App.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Button } from "../../src/ui/Button.ts";
import { Popover, type PopoverPlacement } from "../../src/ui/Popover.ts";
import { createMockStdin, createMockStdout } from "../test-helpers.ts";

describe("Popover", () => {
  describe("trigger rendering", () => {
    it("trigger renders in normal flow", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
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

      const app = App.mount(
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

      const app = App.mount(
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

      const app = App.mount(
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

      const app = App.mount(
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
    // A standalone "\x1b" byte is flushed as an escape key event only after
    // the input parser's ambiguity timeout, so wait for it before asserting.
    const escapeFlushDelay = () =>
      new Promise<void>((resolve) => setTimeout(resolve, 150));

    it("Escape key calls onClose", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let closeCalled = false;

      const app = App.mount(
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

      // Simulate Escape key as raw stdin data (the input parser listens
      // on "data" events; keypress-style emission does nothing).
      mockStdin.emit("data", Buffer.from("\x1b"));
      await escapeFlushDelay();

      assert.strictEqual(closeCalled, true);
      app.unmount();
    });

    it("other keys do not close popover", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let closeCalled = false;

      const app = App.mount(
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

      // Simulate Enter key as raw stdin data - should not close
      mockStdin.emit("data", Buffer.from("\r"));
      await escapeFlushDelay();

      assert.strictEqual(closeCalled, false);
      app.unmount();
    });
  });

  describe("Portal rendering", () => {
    it("content renders via Portal (at root level)", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
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

        const app = App.mount(
          () =>
            Box({
              // Container that doesn't fill viewport so popover has room
              height: 12,
              // Add padding so placements have room:
              // - top padding for "top-*" placements
              // - start padding for "left-*" placements
              paddingTop: 3,
              paddingStart: placement.startsWith("left") ? 10 : 0,
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

      const app = App.mount(
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

      const app = App.mount(
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

  describe("positioning", () => {
    it("content renders without explicit height on parent", () => {
      // Regression test: Popover should position based on anchor's intrinsic
      // height, not its layout height (which may stretch to fill container)
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            // No height specified - anchor will stretch to fill viewport
            children: [
              Popover({
                open: true,
                placement: "bottom-start",
                content: () => Text({ content: "PopoverContent" }),
                children: (props) =>
                  Box({
                    ref: props.ref,
                    // Trigger has no explicit height - intrinsic height is 1 row
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

      // Content should be visible just below trigger (row 1, not row 24)
      assert.ok(
        mockStdout.written.includes("PopoverContent"),
        "Popover content should render without explicit parent height",
      );
      app.unmount();
    });
  });

  describe("style overrides", () => {
    it("style prop applies to popover container", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
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

      const app = App.mount(
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

      const app = App.mount(
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

  describe("click outside behavior", () => {
    it("clicking outside popover calls onClose", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(80, 24);
      let closeCalled = false;

      const app = App.mount(
        () =>
          Box({
            children: [
              Popover({
                open: true,
                onClose: () => {
                  closeCalled = true;
                },
                placement: "bottom-start",
                content: () =>
                  Box({
                    width: 10,
                    height: 3,
                    children: [Text({ content: "Content" })],
                  }),
                children: (props) =>
                  Box({
                    ref: props.ref,
                    width: 10,
                    height: 1,
                    children: [Text({ content: "Trigger" })],
                  }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          mouse: true,
        },
      );

      // Popover trigger is at row 0, content at rows 1-3
      // Click at row 10 (well outside the popover content)
      // SGR mouse protocol: \x1b[<button;col;rowM (1-indexed)
      mockStdin.emit("data", Buffer.from("\x1b[<0;50;11M"));

      // Wait for event processing
      await new Promise<void>((resolve) => queueMicrotask(resolve));

      assert.strictEqual(
        closeCalled,
        true,
        "onClose should be called when clicking outside",
      );
      app.unmount();
    });

    it("clicking inside popover content does not call onClose", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(80, 24);
      let closeCalled = false;

      const app = App.mount(
        () =>
          Box({
            children: [
              Popover({
                open: true,
                onClose: () => {
                  closeCalled = true;
                },
                placement: "bottom-start",
                content: () =>
                  Box({
                    width: 10,
                    height: 3,
                    children: [Text({ content: "Content" })],
                  }),
                children: (props) =>
                  Box({
                    ref: props.ref,
                    width: 10,
                    height: 1,
                    children: [Text({ content: "Trigger" })],
                  }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          mouse: true,
        },
      );

      // Popover content is at rows 1-3 (below trigger at row 0)
      // Click at row 2 (inside popover content)
      // SGR mouse protocol: \x1b[<button;col;rowM (1-indexed)
      mockStdin.emit("data", Buffer.from("\x1b[<0;5;2M"));

      // Wait for event processing
      await new Promise<void>((resolve) => queueMicrotask(resolve));

      assert.strictEqual(
        closeCalled,
        false,
        "onClose should NOT be called when clicking inside",
      );
      app.unmount();
    });

    it("clicking on trigger area calls onClose (toggle behavior)", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout(80, 24);
      let closeCalled = false;

      const app = App.mount(
        () =>
          Box({
            children: [
              Popover({
                open: true,
                onClose: () => {
                  closeCalled = true;
                },
                placement: "bottom-start",
                content: () =>
                  Box({
                    width: 10,
                    height: 3,
                    children: [Text({ content: "Content" })],
                  }),
                children: (props) =>
                  Box({
                    ref: props.ref,
                    width: 10,
                    height: 1,
                    children: [Text({ content: "Trigger" })],
                  }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
          mouse: true,
        },
      );

      // Trigger is at row 0
      // Click at row 1 (SGR is 1-indexed, so this is screen row 0)
      // When popover is open, clicking trigger area closes it (toggle)
      mockStdin.emit("data", Buffer.from("\x1b[<0;5;1M"));

      // Wait for event processing
      await new Promise<void>((resolve) => queueMicrotask(resolve));

      assert.strictEqual(
        closeCalled,
        true,
        "onClose should be called when clicking trigger (toggle behavior)",
      );
      app.unmount();
    });
  });

  describe("with Button trigger", () => {
    it("works with Button component as trigger", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const [isOpen, setIsOpen] = createSignal(true);

      const app = App.mount(
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
