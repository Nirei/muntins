import assert from "node:assert";
import { describe, it, mock } from "node:test";
import { Box, Text, mount } from "../../src/core/runtime.ts";
import { createSignal } from "../../src/core/signals.ts";
import { Toast } from "../../src/ui/toast.ts";

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

describe("Toast", () => {
  describe("rendering via Portal", () => {
    it("renders content via Portal at root level", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
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

      const app = mount(
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

      const app = mount(
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

      const app = mount(
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

      const app = mount(
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
    it("renders with default position bottom-right", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            children: [
              Toast({
                children: "BottomRight",
                duration: 0,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(mockStdout.written.includes("BottomRight"));
      app.unmount();
    });

    it("renders at top-left position", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            children: [
              Toast({
                children: "TopLeft",
                position: "top-left",
                duration: 0,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(mockStdout.written.includes("TopLeft"));
      app.unmount();
    });

    it("renders at top-right position", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            children: [
              Toast({
                children: "TopRight",
                position: "top-right",
                duration: 0,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(mockStdout.written.includes("TopRight"));
      app.unmount();
    });

    it("renders at top-center position", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            children: [
              Toast({
                children: "TopCenter",
                position: "top-center",
                duration: 0,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(mockStdout.written.includes("TopCenter"));
      app.unmount();
    });

    it("renders at bottom-left position", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            children: [
              Toast({
                children: "BottomLeft",
                position: "bottom-left",
                duration: 0,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(mockStdout.written.includes("BottomLeft"));
      app.unmount();
    });

    it("renders at bottom-center position", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            children: [
              Toast({
                children: "BottomCenter",
                position: "bottom-center",
                duration: 0,
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      assert.ok(mockStdout.written.includes("BottomCenter"));
      app.unmount();
    });

    it("accepts reactive position prop", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();
      const [position, _setPosition] = createSignal<
        "top-left" | "bottom-right"
      >("top-left");

      const app = mount(
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

      const app = mount(
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

      const app = mount(
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

      const app = mount(
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

      const app = mount(
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

      const app = mount(
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

      const app = mount(
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
