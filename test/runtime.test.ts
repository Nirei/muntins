import assert from "node:assert";
import { describe, it } from "node:test";
import { DEFAULT_FLEX_STYLE } from "../src/core/layout.ts";
import {
  DEFAULT_MOUNT_OPTIONS,
  type Node,
  createRef,
  enterTuiMode,
  exitTuiMode,
  flushFrame,
} from "../src/core/runtime.ts";

describe("runtime core types", () => {
  it("createRef returns object with null current", () => {
    const ref = createRef();
    assert.strictEqual(ref.current, null);
  });

  it("createRef.current is mutable", () => {
    const ref = createRef();
    const node: Node = { style: DEFAULT_FLEX_STYLE };
    ref.current = node;
    assert.strictEqual(ref.current, node);
  });

  it("DEFAULT_MOUNT_OPTIONS has expected values", () => {
    assert.strictEqual(DEFAULT_MOUNT_OPTIONS.fps, 60);
    assert.strictEqual(DEFAULT_MOUNT_OPTIONS.mouse, false);
    assert.strictEqual(DEFAULT_MOUNT_OPTIONS.alternateScreen, true);
  });
});

describe("screen control", () => {
  it("enterTuiMode writes alternate screen sequence", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    enterTuiMode(mockStdout, { alternateScreen: true });

    assert.ok(written.includes("\x1b[?1049h"));
    assert.ok(written.includes("\x1b[?25l"));
    assert.ok(written.includes("\x1b[2J"));
    assert.ok(written.includes("\x1b[H"));
  });

  it("enterTuiMode skips alternate screen when disabled", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    enterTuiMode(mockStdout, { alternateScreen: false });

    assert.ok(!written.includes("\x1b[?1049h"));
    assert.ok(written.includes("\x1b[?25l")); // still hides cursor
  });

  it("exitTuiMode writes restore sequences", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    exitTuiMode(mockStdout, { alternateScreen: true });

    assert.ok(written.includes("\x1b[?25h"));
    assert.ok(written.includes("\x1b[?1049l"));
  });

  it("exitTuiMode skips alternate screen when disabled", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    exitTuiMode(mockStdout, { alternateScreen: false });

    assert.ok(written.includes("\x1b[?25h")); // still shows cursor
    assert.ok(!written.includes("\x1b[?1049l"));
  });

  it("flushFrame brackets content with cursor hide/show", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    flushFrame(mockStdout, "content");

    assert.ok(written.startsWith("\x1b[?25l"));
    assert.ok(written.includes("content"));
    assert.ok(written.endsWith("\x1b[?25h"));
  });

  it("flushFrame does nothing for empty content", () => {
    let written = "";
    const mockStdout = {
      write: (s: string) => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    flushFrame(mockStdout, "");

    assert.strictEqual(written, "");
  });
});
