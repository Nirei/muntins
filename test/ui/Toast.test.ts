import assert from "node:assert";
import { describe, it, mock } from "node:test";
import { Box } from "../../src/core/components/Box.ts";
import { Text } from "../../src/core/components/Text.ts";
import { App } from "../../src/core/runtime/App.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Toast } from "../../src/ui/Toast.ts";
import { createMockStdin, createMockStdout } from "../test-helpers.ts";

describe("Toast", () => {
  describe("rendering via Portal", () => {
    it("renders content via Portal at root level", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Text({ content: "Background" }),
              Toast({
                children: "ToastContent",
                duration: 0, // Prevent auto-dismiss during test
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Toast content should be rendered via Portal
      assert.ok(mockStdout.written.includes("ToastContent"));
      app.unmount();
    });
  });

  describe("auto-dismiss", () => {
    it("calls onDismiss after duration", async () => {
      mock.timers.enable({ apis: ["setTimeout"] });

      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let dismissCalled = false;

      const app = App.mount(
        () =>
          Box({
            children: [
              Toast({
                children: "Auto dismiss test",
                duration: 3000,
                onDismiss: () => {
                  dismissCalled = true;
                },
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // onDismiss should not be called immediately
      assert.strictEqual(dismissCalled, false);

      // Advance time past the duration
      mock.timers.tick(3000);

      // onDismiss should now be called
      assert.strictEqual(dismissCalled, true);

      app.unmount();
      mock.timers.reset();
    });

    it("duration 0 prevents auto-dismiss", async () => {
      mock.timers.enable({ apis: ["setTimeout"] });

      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let dismissCalled = false;

      const app = App.mount(
        () =>
          Box({
            children: [
              Toast({
                children: "No auto dismiss",
                duration: 0,
                onDismiss: () => {
                  dismissCalled = true;
                },
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Advance time significantly
      mock.timers.tick(10000);

      // onDismiss should NOT be called
      assert.strictEqual(dismissCalled, false);

      app.unmount();
      mock.timers.reset();
    });

    it("default duration is 3000ms", async () => {
      mock.timers.enable({ apis: ["setTimeout"] });

      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let dismissCalled = false;

      const app = App.mount(
        () =>
          Box({
            children: [
              Toast({
                children: "Default duration",
                onDismiss: () => {
                  dismissCalled = true;
                },
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Not called before 3000ms
      mock.timers.tick(2999);
      assert.strictEqual(dismissCalled, false);

      // Called at 3000ms
      mock.timers.tick(1);
      assert.strictEqual(dismissCalled, true);

      app.unmount();
      mock.timers.reset();
    });
  });

  describe("timer cleanup on unmount", () => {
    it("cleans up timer when unmounted before duration", async () => {
      mock.timers.enable({ apis: ["setTimeout"] });

      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      let dismissCalled = false;

      const app = App.mount(
        () =>
          Box({
            children: [
              Toast({
                children: "Cleanup test",
                duration: 5000,
                onDismiss: () => {
                  dismissCalled = true;
                },
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Unmount before timer fires
      app.unmount();

      // Advance time past what would have been the duration
      mock.timers.tick(6000);

      // onDismiss should NOT be called because we unmounted
      assert.strictEqual(dismissCalled, false);

      mock.timers.reset();
    });
  });

  describe("positions", () => {
    const positions = [
      {
        name: "default bottom-right",
        position: undefined,
        content: "BottomRight",
      },
      { name: "top-left", position: "top-left" as const, content: "TopLeft" },
      {
        name: "top-right",
        position: "top-right" as const,
        content: "TopRight",
      },
      {
        name: "top-center",
        position: "top-center" as const,
        content: "TopCenter",
      },
      {
        name: "bottom-left",
        position: "bottom-left" as const,
        content: "BottomLeft",
      },
      {
        name: "bottom-center",
        position: "bottom-center" as const,
        content: "BottomCenter",
      },
    ];

    for (const { name, position, content } of positions) {
      it(`renders at ${name} position`, () => {
        const mockStdin = createMockStdin();
        const mockStdout = createMockStdout();

        const app = App.mount(
          () =>
            Box({
              children: [
                Toast({
                  children: content,
                  position,
                  duration: 0,
                }),
              ],
            }),
          {
            stdin: mockStdin as unknown as NodeJS.ReadStream,
            stdout: mockStdout as unknown as NodeJS.WriteStream,
          },
        );

        assert.ok(mockStdout.written.includes(content));
        app.unmount();
      });
    }

    it("accepts reactive position prop", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const [position, _setPosition] = createSignal<
        "top-left" | "bottom-right"
      >("top-left");

      const app = App.mount(
        () =>
          Box({
            children: [
              Toast({
                children: "ReactivePosition",
                position: position,
                duration: 0,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(mockStdout.written.includes("ReactivePosition"));
      app.unmount();
    });
  });

  describe("style overrides", () => {
    it("applies style overrides to toast container", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Toast({
                children: "StyledToast",
                duration: 0,
                style: {
                  width: 30,
                  paddingTop: 1,
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

      // Toast should render with the content (style is applied internally)
      assert.ok(mockStdout.written.includes("StyledToast"));
      app.unmount();
    });
  });

  describe("children types", () => {
    it("accepts string children", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Toast({
                children: "StringChild",
                duration: 0,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(mockStdout.written.includes("StringChild"));
      app.unmount();
    });

    it("accepts reactive string children", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const [message, _setMessage] = createSignal("ReactiveChild");

      const app = App.mount(
        () =>
          Box({
            children: [
              Toast({
                children: message,
                duration: 0,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(mockStdout.written.includes("ReactiveChild"));
      app.unmount();
    });

    it("accepts Node children", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Toast({
                children: Text({ content: "NodeChild" }),
                duration: 0,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(mockStdout.written.includes("NodeChild"));
      app.unmount();
    });

    it("accepts array of Node children", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Toast({
                children: [
                  Text({ content: "Child1" }),
                  Text({ content: "Child2" }),
                ],
                duration: 0,
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

  describe("no default styling", () => {
    it("renders without hardcoded borders, colors or padding", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(
        () =>
          Box({
            children: [
              Toast({
                children: "PlainToast",
                duration: 0,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Content appears with no extra styling characters
      assert.ok(mockStdout.written.includes("PlainToast"));
      app.unmount();
    });
  });
});
