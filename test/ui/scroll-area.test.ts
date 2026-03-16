import assert from "node:assert";
import { describe, it } from "node:test";
import { Buffer as RenderBuffer } from "../../src/core/buffer.ts";
import {
  Box,
  DEFAULT_INHERITED_STYLE,
  Text,
  createRef,
  mount,
} from "../../src/core/runtime.ts";
import { createSignal } from "../../src/core/signals.ts";
import { ScrollArea } from "../../src/ui/scroll-area.ts";

// Helper to create mock stdin for mount tests
function createMockStdin() {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    isTTY: true,
    setRawMode: function () {
      return this;
    },
    on: function (event: string, handler: (...args: unknown[]) => void) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return this;
    },
    off: function (event: string, handler: (...args: unknown[]) => void) {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
      return this;
    },
    emit: (event: string, ...args: unknown[]) => {
      const list = handlers.get(event);
      if (list) {
        for (const h of list) h(...args);
      }
      return true;
    },
    resume: () => {},
    pause: () => {},
    listenerCount: (event: string) => handlers.get(event)?.length ?? 0,
    _handlers: handlers,
  };
}

function createMockStdout(cols = 80, rows = 24) {
  const handlers = new Map<string, Array<() => void>>();
  return {
    isTTY: true,
    columns: cols,
    rows: rows,
    written: "",
    write: function (s: string) {
      this.written += s;
      return true;
    },
    on: function (event: string, handler: () => void) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return this;
    },
    off: function (event: string, handler: () => void) {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
      return this;
    },
    emit: (event: string) => {
      const list = handlers.get(event);
      if (list) {
        for (const h of list) h();
      }
      return true;
    },
    _handlers: handlers,
  };
}

// Helper to create a key event
function keyEvent(
  name: string,
  opts: Partial<{
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
  }> = {},
) {
  return {
    type: "key" as const,
    name,
    char: name.length === 1 ? name : "",
    ctrl: opts.ctrl ?? false,
    alt: opts.alt ?? false,
    shift: opts.shift ?? false,
    sequence: name,
  };
}

// Helper to create a scroll event
function scrollEvent(direction: "up" | "down", x = 0, y = 0) {
  return {
    type: "scroll" as const,
    direction,
    x,
    y,
    ctrl: false,
    alt: false,
    shift: false,
  };
}

describe("ScrollArea", () => {
  describe("rendering", () => {
    it("creates node with correct structure", () => {
      const node = ScrollArea({
        height: 5,
        children: [Text({ content: "Line 1" })],
      });

      // Should be a row Box with content container and scrollbar
      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.flexDirection, "row");
      assert.strictEqual(node.children?.length, 2);
    });

    it("applies height from props", () => {
      const node = ScrollArea({
        height: 10,
        children: [Text({ content: "Content" })],
      });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.height, 10);
      assert.strictEqual(style.maxHeight, 10);
    });

    it("applies width from props when provided", () => {
      const node = ScrollArea({
        height: 5,
        width: 40,
        children: [Text({ content: "Content" })],
      });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.width, 40);
    });

    it("renders scrollbar with track and thumb characters", () => {
      const node = ScrollArea({
        height: 3,
        children: [
          Text({ content: "Line 1" }),
          Text({ content: "Line 2" }),
          Text({ content: "Line 3" }),
        ],
      });

      // Get the scrollbar node (second child)
      const scrollbar = node.children?.[1];
      assert.ok(scrollbar, "Scrollbar should exist");
      assert.ok(scrollbar.render, "Scrollbar should have render function");

      // Render to a buffer
      const buffer = new RenderBuffer(1, 3);
      scrollbar.render(0, 0, 1, 3, buffer, DEFAULT_INHERITED_STYLE);

      // Should render thumb characters when content fits
      const content =
        buffer.getSymbol(0, 0) +
        buffer.getSymbol(0, 1) +
        buffer.getSymbol(0, 2);
      // When content fits viewport, full thumb is shown
      assert.ok(
        content.includes("\u2503") || content.includes("\u2502"),
        "Should render scrollbar characters",
      );
    });
  });

  describe("keyboard handling", () => {
    it("up arrow scrolls up by 1", () => {
      let scrollValue = 5;
      const node = ScrollArea({
        height: 5,
        scrollTop: () => scrollValue,
        onScroll: (v) => {
          scrollValue = v;
        },
        children: [
          Text({
            content:
              "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10",
          }),
        ],
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(keyEvent("up"));
      assert.strictEqual(result, true, "Should consume the event");
      assert.strictEqual(scrollValue, 4, "Should scroll up by 1");
    });

    it("down arrow scrolls down by 1", () => {
      let scrollValue = 0;
      const node = ScrollArea({
        height: 5,
        scrollTop: () => scrollValue,
        onScroll: (v) => {
          scrollValue = v;
        },
        children: [
          Text({
            content:
              "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10",
          }),
        ],
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(keyEvent("down"));
      assert.strictEqual(result, true, "Should consume the event");
      assert.strictEqual(scrollValue, 1, "Should scroll down by 1");
    });

    it("page up scrolls up by viewport height", () => {
      let scrollValue = 10;
      const node = ScrollArea({
        height: 5,
        scrollTop: () => scrollValue,
        onScroll: (v) => {
          scrollValue = v;
        },
        children: [
          Text({
            content:
              "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n17\n18\n19\n20",
          }),
        ],
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(keyEvent("pageup"));
      assert.strictEqual(result, true, "Should consume the event");
      assert.strictEqual(scrollValue, 5, "Should scroll up by viewport height");
    });

    it("page down scrolls down by viewport height", () => {
      let scrollValue = 0;
      const node = ScrollArea({
        height: 5,
        scrollTop: () => scrollValue,
        onScroll: (v) => {
          scrollValue = v;
        },
        children: [
          Text({
            content:
              "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n17\n18\n19\n20",
          }),
        ],
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(keyEvent("pagedown"));
      assert.strictEqual(result, true, "Should consume the event");
      assert.strictEqual(
        scrollValue,
        5,
        "Should scroll down by viewport height",
      );
    });

    it("home scrolls to top", () => {
      let scrollValue = 10;
      const node = ScrollArea({
        height: 5,
        scrollTop: () => scrollValue,
        onScroll: (v) => {
          scrollValue = v;
        },
        children: [
          Text({
            content: "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15",
          }),
        ],
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(keyEvent("home"));
      assert.strictEqual(result, true, "Should consume the event");
      assert.strictEqual(scrollValue, 0, "Should scroll to top");
    });

    it("end scrolls to bottom", () => {
      let scrollValue = 0;
      const node = ScrollArea({
        height: 5,
        scrollTop: () => scrollValue,
        onScroll: (v) => {
          scrollValue = v;
        },
        children: [Text({ content: "1\n2\n3\n4\n5\n6\n7\n8\n9\n10" })],
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(keyEvent("end"));
      assert.strictEqual(result, true, "Should consume the event");
      assert.strictEqual(
        scrollValue,
        5,
        "Should scroll to bottom (content 10 - viewport 5)",
      );
    });

    it("other keys do not trigger scrolling", () => {
      let scrollValue = 5;
      const node = ScrollArea({
        height: 5,
        scrollTop: () => scrollValue,
        onScroll: (v) => {
          scrollValue = v;
        },
        children: [Text({ content: "Content" })],
      });

      assert.ok(node.onKeyPress);
      const result = node.onKeyPress(keyEvent("a"));
      assert.strictEqual(result, false, "Should not consume the event");
      assert.strictEqual(scrollValue, 5, "Should not change scroll position");
    });
  });

  describe("scroll bounds", () => {
    it("scroll does not go below 0", () => {
      let scrollValue = 0;
      const node = ScrollArea({
        height: 5,
        scrollTop: () => scrollValue,
        onScroll: (v) => {
          scrollValue = v;
        },
        children: [Text({ content: "1\n2\n3\n4\n5\n6\n7\n8\n9\n10" })],
      });

      assert.ok(node.onKeyPress);
      node.onKeyPress(keyEvent("up"));
      assert.strictEqual(scrollValue, 0, "Should stay at 0");
    });

    it("scroll does not exceed max scroll", () => {
      // Content is 10 lines, viewport is 5, max scroll is 5
      let scrollValue = 5;
      const node = ScrollArea({
        height: 5,
        scrollTop: () => scrollValue,
        onScroll: (v) => {
          scrollValue = v;
        },
        children: [Text({ content: "1\n2\n3\n4\n5\n6\n7\n8\n9\n10" })],
      });

      assert.ok(node.onKeyPress);
      node.onKeyPress(keyEvent("down"));
      // Should stay at max scroll (5) since we're already at the bottom
      assert.strictEqual(scrollValue, 5, "Should stay at max scroll");
    });
  });

  describe("mouse scroll", () => {
    it("scroll wheel down scrolls content down", () => {
      let scrollValue = 0;
      const node = ScrollArea({
        height: 5,
        scrollTop: () => scrollValue,
        onScroll: (v) => {
          scrollValue = v;
        },
        children: [Text({ content: "1\n2\n3\n4\n5\n6\n7\n8\n9\n10" })],
      });

      assert.ok(node.onScroll);
      node.onScroll(scrollEvent("down"));
      assert.strictEqual(scrollValue, 1, "Should scroll down by 1");
    });

    it("scroll wheel up scrolls content up", () => {
      let scrollValue = 5;
      const node = ScrollArea({
        height: 5,
        scrollTop: () => scrollValue,
        onScroll: (v) => {
          scrollValue = v;
        },
        children: [Text({ content: "1\n2\n3\n4\n5\n6\n7\n8\n9\n10" })],
      });

      assert.ok(node.onScroll);
      node.onScroll(scrollEvent("up"));
      assert.strictEqual(scrollValue, 4, "Should scroll up by 1");
    });
  });

  describe("controlled scrolling", () => {
    it("controlled scrollTop prop is respected", () => {
      const [scrollPos, setScrollPos] = createSignal(3);

      const node = ScrollArea({
        height: 5,
        scrollTop: scrollPos,
        children: [Text({ content: "Content" })],
      });

      // The component should use the provided scrollTop
      // We verify by checking the content box's marginTop
      const contentContainer = node.children?.[0];
      const contentBox = contentContainer?.children?.[0];
      assert.ok(contentBox, "Content box should exist");

      const style =
        typeof contentBox.style === "function"
          ? contentBox.style()
          : contentBox.style;
      assert.strictEqual(style.marginTop, -3, "marginTop should be -scrollTop");

      // Update scroll position
      setScrollPos(7);
      const style2 =
        typeof contentBox.style === "function"
          ? contentBox.style()
          : contentBox.style;
      assert.strictEqual(
        style2.marginTop,
        -7,
        "marginTop should update reactively",
      );
    });

    it("onScroll callback fires on scroll position change", () => {
      const scrollPositions: number[] = [];
      const node = ScrollArea({
        height: 5,
        onScroll: (pos) => scrollPositions.push(pos),
        children: [Text({ content: "1\n2\n3\n4\n5\n6\n7\n8\n9\n10" })],
      });

      assert.ok(node.onKeyPress);
      node.onKeyPress(keyEvent("down"));
      node.onKeyPress(keyEvent("down"));
      node.onKeyPress(keyEvent("down"));

      assert.deepStrictEqual(
        scrollPositions,
        [1, 2, 3],
        "Should fire callback for each scroll",
      );
    });
  });

  describe("focus", () => {
    it("is focusable by default", () => {
      const node = ScrollArea({
        height: 5,
        children: [Text({ content: "Content" })],
      });

      assert.strictEqual(node.focusable, true);
    });

    it("focusable: false makes it not focusable", () => {
      const node = ScrollArea({
        height: 5,
        focusable: false,
        children: [Text({ content: "Content" })],
      });

      assert.strictEqual(node.focusable, false);
    });

    it("autoFocus prop is passed through", () => {
      const node = ScrollArea({
        height: 5,
        autoFocus: true,
        children: [Text({ content: "Content" })],
      });

      assert.strictEqual(node.autoFocus, true);
    });

    it("ref is bound to the node", () => {
      const ref = createRef();
      const node = ScrollArea({
        height: 5,
        ref,
        children: [Text({ content: "Content" })],
      });

      assert.strictEqual(ref.current, node);
    });
  });

  describe("style overrides", () => {
    it("applies style overrides", () => {
      const node = ScrollArea({
        height: 5,
        children: [Text({ content: "Content" })],
        style: { marginTop: 2, paddingStart: 1 },
      });

      const style =
        typeof node.style === "function" ? node.style() : node.style;
      assert.strictEqual(style.marginTop, 2);
      assert.strictEqual(style.paddingStart, 1);
    });
  });

  describe("scrollbar appearance", () => {
    it("scrollbar uses track character for empty space", () => {
      // When content is larger than viewport and scrolled partially
      const node = ScrollArea({
        height: 5,
        children: [Text({ content: "1\n2\n3\n4\n5\n6\n7\n8\n9\n10" })],
      });

      const scrollbar = node.children?.[1];
      assert.ok(scrollbar?.render);

      const buffer = new RenderBuffer(1, 5);
      scrollbar.render(0, 0, 1, 5, buffer, DEFAULT_INHERITED_STYLE);

      // Should have a mix of track and thumb characters
      let hasThumb = false;
      let hasTrack = false;
      for (let row = 0; row < 5; row++) {
        const char = buffer.getSymbol(0, row);
        if (char === "\u2503") hasThumb = true;
        if (char === "\u2502") hasTrack = true;
      }
      // With 10 lines content and 5 lines viewport, we should have both
      assert.ok(hasThumb, "Should have thumb character");
      assert.ok(hasTrack, "Should have track character");
    });

    it("scrollbar thumb position changes with scroll offset", () => {
      const [scrollPos, setScrollPos] = createSignal(0);

      const node = ScrollArea({
        height: 5,
        scrollTop: scrollPos,
        children: [Text({ content: "1\n2\n3\n4\n5\n6\n7\n8\n9\n10" })],
      });

      const scrollbar = node.children?.[1];
      assert.ok(scrollbar?.render);

      // Render at top
      const bufferTop = new RenderBuffer(1, 5);
      scrollbar.render(0, 0, 1, 5, bufferTop, DEFAULT_INHERITED_STYLE);
      const topThumbPos = findThumbPosition(bufferTop, 5);

      // Scroll to bottom
      setScrollPos(5);
      const bufferBottom = new RenderBuffer(1, 5);
      scrollbar.render(0, 0, 1, 5, bufferBottom, DEFAULT_INHERITED_STYLE);
      const bottomThumbPos = findThumbPosition(bufferBottom, 5);

      assert.ok(
        bottomThumbPos > topThumbPos,
        "Thumb should move down when scrolled",
      );
    });
  });

  describe("integration", () => {
    it("works within mounted app", () => {
      const mockStdin = createMockStdin();
      const mockStdout = createMockStdout();

      const app = mount(
        () =>
          Box({
            children: [
              ScrollArea({
                height: 5,
                children: [
                  Text({ content: "Line 1" }),
                  Text({ content: "Line 2" }),
                  Text({ content: "Line 3" }),
                ],
              }),
            ],
          }),
        {
          stdin: mockStdin as unknown as NodeJS.ReadStream,
          stdout: mockStdout as unknown as NodeJS.WriteStream,
        },
      );

      // Verify component structure is correct
      assert.ok(app.unmount);
      app.unmount();
    });
  });
});

// Helper to find thumb position in buffer
function findThumbPosition(buffer: RenderBuffer, height: number): number {
  for (let row = 0; row < height; row++) {
    if (buffer.getSymbol(0, row) === "\u2503") {
      return row;
    }
  }
  return -1;
}
