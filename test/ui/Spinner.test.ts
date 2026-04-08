import assert from "node:assert";
import { describe, it, mock } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import {
  App,
  DEFAULT_CLIP,
  DEFAULT_INHERITED_STYLE,
} from "../../src/core/runtime.ts";
import { createRoot, createSignal } from "../../src/core/signals.ts";
import { Spinner } from "../../src/ui/Spinner.ts";
import { createMockStdin, createMockStdout } from "../test-helpers.ts";

describe("Spinner", () => {
  describe("initial rendering", () => {
    it("renders first frame initially with dots variant (default)", () => {
      let node: ReturnType<typeof Spinner> | undefined;

      createRoot((dispose) => {
        node = Spinner({});
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.ok(node.render || node.measure);

      // Measure to get dimensions
      if (node.measure) {
        const size = node.measure(100, 100);
        assert.strictEqual(size.width, 1);
        assert.strictEqual(size.height, 1);
      }

      // Render and check content
      if (node.render) {
        const buffer = new RenderBuffer(10, 1);
        node.render(
          { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
          buffer,
          DEFAULT_INHERITED_STYLE,
          DEFAULT_CLIP,
        );
        // First frame of dots variant
        assert.strictEqual(buffer.getSymbol(0, 0), "⠋");
      }
    });

    it("renders label when provided", () => {
      let node: ReturnType<typeof Spinner> | undefined;

      createRoot((dispose) => {
        node = Spinner({ label: "Loading..." });
        dispose();
        return dispose;
      });

      assert.ok(node);
      // When label is provided, returns a Box with children
      assert.ok(node.resolveChildren());
      assert.strictEqual(node.resolveChildren().length, 2);
    });
  });

  describe("variants", () => {
    it("line variant uses correct frames", () => {
      let node: ReturnType<typeof Spinner> | undefined;

      createRoot((dispose) => {
        node = Spinner({ variant: "line" });
        dispose();
        return dispose;
      });

      assert.ok(node);
      if (node.render) {
        const buffer = new RenderBuffer(10, 1);
        node.render(
          { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
          buffer,
          DEFAULT_INHERITED_STYLE,
          DEFAULT_CLIP,
        );
        // First frame of line variant is "-"
        assert.strictEqual(buffer.getSymbol(0, 0), "-");
      }
    });

    it("arc variant uses correct frames", () => {
      let node: ReturnType<typeof Spinner> | undefined;

      createRoot((dispose) => {
        node = Spinner({ variant: "arc" });
        dispose();
        return dispose;
      });

      assert.ok(node);
      if (node.render) {
        const buffer = new RenderBuffer(10, 1);
        node.render(
          { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
          buffer,
          DEFAULT_INHERITED_STYLE,
          DEFAULT_CLIP,
        );
        // First frame of arc variant is "◜"
        assert.strictEqual(buffer.getSymbol(0, 0), "◜");
      }
    });

    it("reactive variant updates frames", () => {
      const [variant, setVariant] = createSignal<"dots" | "line">("dots");
      let node: ReturnType<typeof Spinner> | undefined;

      createRoot((dispose) => {
        node = Spinner({ variant });

        // Initially renders first frame of dots
        assert.ok(node);
        if (node.render) {
          const buffer = new RenderBuffer(10, 1);
          node.render(
            { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
            buffer,
            DEFAULT_INHERITED_STYLE,
            DEFAULT_CLIP,
          );
          assert.strictEqual(buffer.getSymbol(0, 0), "⠋");
        }

        // Change variant
        setVariant("line");

        // Now should use line frames
        if (node.render) {
          const buffer = new RenderBuffer(10, 1);
          node.render(
            { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
            buffer,
            DEFAULT_INHERITED_STYLE,
            DEFAULT_CLIP,
          );
          assert.strictEqual(buffer.getSymbol(0, 0), "-");
        }

        dispose();
        return dispose;
      });
    });
  });

  describe("animation", () => {
    it("cycles through frames on interval", async () => {
      // Use fake timers
      const originalSetInterval = globalThis.setInterval;
      const originalClearInterval = globalThis.clearInterval;

      const callbacks: Array<() => void> = [];
      const intervalIds: number[] = [];
      const clearedIds: number[] = [];
      let nextId = 1;

      globalThis.setInterval = ((cb: () => void, _ms: number) => {
        callbacks.push(cb);
        const id = nextId++;
        intervalIds.push(id);
        return id as unknown as ReturnType<typeof setInterval>;
      }) as typeof setInterval;

      globalThis.clearInterval = ((id: number) => {
        clearedIds.push(id);
      }) as typeof clearInterval;

      try {
        let node: ReturnType<typeof Spinner> | undefined;

        const dispose = createRoot((dispose) => {
          node = Spinner({});
          return dispose;
        });

        assert.ok(node);
        assert.strictEqual(
          callbacks.length,
          1,
          "setInterval should have been called",
        );
        const tick = callbacks[0];

        // First frame
        if (node.render) {
          const buffer = new RenderBuffer(10, 1);
          node.render(
            { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
            buffer,
            DEFAULT_INHERITED_STYLE,
            DEFAULT_CLIP,
          );
          assert.strictEqual(buffer.getSymbol(0, 0), "⠋");
        }

        // Trigger interval callback to advance frame
        tick();

        // Second frame
        if (node.render) {
          const buffer = new RenderBuffer(10, 1);
          node.render(
            { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
            buffer,
            DEFAULT_INHERITED_STYLE,
            DEFAULT_CLIP,
          );
          assert.strictEqual(buffer.getSymbol(0, 0), "⠙");
        }

        // Advance multiple times
        for (let i = 0; i < 8; i++) {
          tick();
        }

        // Should wrap around (10 frames total in dots, started at 0, advanced 9 times = frame 9)
        if (node.render) {
          const buffer = new RenderBuffer(10, 1);
          node.render(
            { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
            buffer,
            DEFAULT_INHERITED_STYLE,
            DEFAULT_CLIP,
          );
          assert.strictEqual(buffer.getSymbol(0, 0), "⠏"); // Last frame (index 9)
        }

        // One more should wrap to first
        tick();
        if (node.render) {
          const buffer = new RenderBuffer(10, 1);
          node.render(
            { x: 0, y: 0, screenX: 0, screenY: 0, width: 10, height: 1 },
            buffer,
            DEFAULT_INHERITED_STYLE,
            DEFAULT_CLIP,
          );
          assert.strictEqual(buffer.getSymbol(0, 0), "⠋"); // Back to first frame
        }

        // Dispose should clear interval
        assert.strictEqual(clearedIds.length, 0);
        dispose();
        assert.strictEqual(clearedIds.length, 1);
        assert.strictEqual(clearedIds[0], intervalIds[0]);
      } finally {
        globalThis.setInterval = originalSetInterval;
        globalThis.clearInterval = originalClearInterval;
      }
    });

    it("cleans up interval on dispose", () => {
      const originalSetInterval = globalThis.setInterval;
      const originalClearInterval = globalThis.clearInterval;

      const intervalIds: number[] = [];
      const clearedIds: number[] = [];
      let nextId = 1;

      globalThis.setInterval = ((cb: () => void, _ms: number) => {
        const id = nextId++;
        intervalIds.push(id);
        return id as unknown as ReturnType<typeof setInterval>;
      }) as typeof setInterval;

      globalThis.clearInterval = ((id: number) => {
        clearedIds.push(id);
      }) as typeof clearInterval;

      try {
        const dispose = createRoot((dispose) => {
          Spinner({});
          return dispose;
        });

        assert.strictEqual(
          intervalIds.length,
          1,
          "setInterval should have been called",
        );
        assert.strictEqual(
          clearedIds.length,
          0,
          "clearInterval should not be called yet",
        );

        dispose();

        assert.strictEqual(
          clearedIds.length,
          1,
          "clearInterval should be called",
        );
        assert.strictEqual(
          clearedIds[0],
          intervalIds[0],
          "clearInterval should be called with correct id",
        );
      } finally {
        globalThis.setInterval = originalSetInterval;
        globalThis.clearInterval = originalClearInterval;
      }
    });
  });

  describe("label", () => {
    it("renders label text next to spinner", () => {
      let node: ReturnType<typeof Spinner> | undefined;

      createRoot((dispose) => {
        node = Spinner({ label: "Loading..." });
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.ok(node.resolveChildren());
      assert.strictEqual(node.resolveChildren().length, 2);

      // Check that the second child (label) has correct content
      const labelNode = node.resolveChildren()[1];
      assert.ok(labelNode.measure);
      const size = labelNode.measure(100, 100);
      assert.strictEqual(size.width, 10); // "Loading..." is 10 chars
    });

    it("reactive label updates work", () => {
      const [label, setLabel] = createSignal("Loading...");
      let node: ReturnType<typeof Spinner> | undefined;

      createRoot((dispose) => {
        node = Spinner({ label });

        assert.ok(node);
        assert.ok(node.resolveChildren());
        const labelNode = node.resolveChildren()[1];
        assert.ok(labelNode.measure);

        // Initial label
        let size = labelNode.measure(100, 100);
        assert.strictEqual(size.width, 10);

        // Update label
        setLabel("Done!");
        size = labelNode.measure(100, 100);
        assert.strictEqual(size.width, 5);

        dispose();
        return dispose;
      });
    });
  });

  describe("style overrides", () => {
    it("applies style overrides without label", () => {
      let node: ReturnType<typeof Spinner> | undefined;

      createRoot((dispose) => {
        node = Spinner({ style: { marginTop: 2, paddingStart: 1 } });
        dispose();
        return dispose;
      });

      assert.ok(node);
      // When style is provided without label, wraps in Box
      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.marginTop, 2);
      assert.strictEqual(style.paddingStart, 1);
    });

    it("applies style overrides with label", () => {
      let node: ReturnType<typeof Spinner> | undefined;

      createRoot((dispose) => {
        node = Spinner({ label: "Loading", style: { marginTop: 3 } });
        dispose();
        return dispose;
      });

      assert.ok(node);
      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.marginTop, 3);
      assert.strictEqual(style.flexDirection, "row");
      assert.strictEqual(style.gap, 1);
    });
  });

  describe("not focusable", () => {
    it("is not focusable by default", () => {
      let node: ReturnType<typeof Spinner> | undefined;

      createRoot((dispose) => {
        node = Spinner({});
        dispose();
        return dispose;
      });

      assert.ok(node);
      assert.strictEqual(node.focusable, undefined);
    });
  });

  describe("integration with mount", () => {
    it("works within mounted application", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = App.mount(() => Spinner({ label: "Loading..." }), {
        stdin: mockStdin as unknown as NodeJS.ReadStream,
        stdout: mockStdout as unknown as NodeJS.WriteStream,
      });

      // Should render without errors
      assert.ok(mockStdout.written.length > 0);

      app.unmount();
    });
  });
});
