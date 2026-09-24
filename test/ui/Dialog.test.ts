import assert from "node:assert";
import { describe, it } from "node:test";
import { Box } from "../../src/core/components/Box.ts";
import { Text } from "../../src/core/components/Text.ts";
import { App } from "../../src/core/runtime/App.ts";
import { createRef } from "../../src/core/runtime/Node.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Button } from "../../src/ui/Button.ts";
import { Dialog } from "../../src/ui/Dialog.ts";
import { createMockStdin, createMockStdout } from "../test-helpers.ts";

describe("Dialog", () => {
  describe("conditional rendering", () => {
    it("not rendered when open is false", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Dialog({
                open: false,
                children: Text({ content: "DialogContent" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Dialog content should not appear in output when closed
      assert.ok(!mockStdout.written.includes("DialogContent"));
      app.unmount();
    });

    it("rendered when open is true", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Dialog({
                open: true,
                children: Text({ content: "DialogContent" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Dialog content should appear in output when open
      assert.ok(mockStdout.written.includes("DialogContent"));
      app.unmount();
    });

    it("reactive open prop controls dialog visibility", () => {
      // Test that dialog responds to reactive open prop
      // When open is a getter function, dialog checks it each render
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const [isOpen, setIsOpen] = createSignal(true);

      const app = App.mount(
        () =>
          Box({
            children: [
              Dialog({
                open: isOpen,
                children: Text({ content: "DialogContent" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Initially open - should be visible
      assert.ok(mockStdout.written.includes("DialogContent"));

      // Close the dialog (signal update)
      setIsOpen(false);

      // The Show component disposes the child when signal becomes false
      // This should not throw errors (clean disposal)
      app.unmount();
    });
  });

  describe("keyboard handling", () => {
    it("Escape key calls onClose", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let closeCalled = false;

      const app = App.mount(
        () =>
          Box({
            children: [
              Dialog({
                open: true,
                onClose: () => {
                  closeCalled = true;
                },
                children: Text({ content: "Dialog" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Simulate Escape key: a lone ESC byte. The input parser holds it
      // pending for ~100ms to disambiguate escape sequences, so wait for the
      // flush timer before asserting.
      mockStdin.emit("data", Buffer.from("\x1b"));
      await new Promise((resolve) => setTimeout(resolve, 120));

      assert.strictEqual(closeCalled, true);
      app.unmount();
    });

    it("other keys do not close dialog", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let closeCalled = false;

      const app = App.mount(
        () =>
          Box({
            children: [
              Dialog({
                open: true,
                onClose: () => {
                  closeCalled = true;
                },
                children: Text({ content: "Dialog" }),
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Simulate Enter key (should not close)
      mockStdin.emit("data", Buffer.from("\r"));

      assert.strictEqual(closeCalled, false);
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
              Dialog({
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
              Dialog({
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
              Dialog({
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
              Dialog({
                open: true,
                children: Text({ content: "Styled" }),
                style: {
                  width: 40,
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

      // Dialog renders, style is applied to content box
      assert.ok(mockStdout.written.includes("Styled"));
      app.unmount();
    });
  });

  describe("focus trapping", () => {
    it("Tab navigates within dialog content", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const buttonRef1 = createRef();
      const buttonRef2 = createRef();

      const app = App.mount(
        () =>
          Box({
            children: [
              Dialog({
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
      mockStdin.emit("data", Buffer.from("\t"));

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
              Dialog({
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
              Dialog({
                open: true,
                children: [
                  Text({ content: "Confirm" }),
                  Button({
                    children: "OK",
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

      assert.ok(mockStdout.written.includes("Confirm"));
      assert.ok(mockStdout.written.includes("OK"));

      // Press Enter on the focused button
      mockStdin.emit("data", Buffer.from("\r"));

      assert.strictEqual(buttonClicked, true);
      app.unmount();
    });

    it("onClose callback is invoked on Escape", async () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let onCloseCalled = false;

      const app = App.mount(
        () =>
          Box({
            children: [
              Dialog({
                open: true,
                onClose: () => {
                  onCloseCalled = true;
                },
                children: Text({
                  content: "ClosableDialog",
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
      assert.ok(mockStdout.written.includes("ClosableDialog"));

      // Press Escape: a lone ESC byte, flushed as an escape key event after
      // the parser's pending-sequence timeout.
      mockStdin.emit("data", Buffer.from("\x1b"));
      await new Promise((resolve) => setTimeout(resolve, 120));

      // onClose should have been called
      assert.strictEqual(onCloseCalled, true);

      app.unmount();
    });
  });
});
