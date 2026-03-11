import assert from "node:assert";
import { describe, it } from "node:test";
import {
  type FocusEvent,
  type InputEvent,
  type KeyEvent,
  MOUSE_LEFT,
  type Modifiers,
  type MouseEvent,
  NO_MODIFIERS,
  type PasteEvent,
  type ResizeEvent,
  type ScrollEvent,
} from "../src/core/input.ts";

describe("input event types", () => {
  it("KeyEvent has required fields", () => {
    const event: KeyEvent = {
      type: "key",
      name: "a",
      char: "a",
      ctrl: false,
      alt: false,
      shift: false,
      sequence: "a",
    };
    assert.strictEqual(event.type, "key");
    assert.strictEqual(event.name, "a");
  });

  it("MouseEvent has required fields", () => {
    const event: MouseEvent = {
      type: "mouse",
      action: "press",
      button: MOUSE_LEFT,
      x: 10,
      y: 5,
      ctrl: false,
      alt: false,
      shift: false,
    };
    assert.strictEqual(event.type, "mouse");
    assert.strictEqual(event.action, "press");
  });

  it("ScrollEvent has required fields", () => {
    const event: ScrollEvent = {
      type: "scroll",
      direction: "up",
      x: 10,
      y: 5,
      ctrl: false,
      alt: false,
      shift: false,
    };
    assert.strictEqual(event.type, "scroll");
    assert.strictEqual(event.direction, "up");
  });

  it("ResizeEvent has required fields", () => {
    const event: ResizeEvent = {
      type: "resize",
      width: 120,
      height: 40,
    };
    assert.strictEqual(event.type, "resize");
  });

  it("PasteEvent has required fields", () => {
    const event: PasteEvent = {
      type: "paste",
      text: "hello\nworld",
    };
    assert.strictEqual(event.type, "paste");
    assert.ok(event.text.includes("\n"));
  });

  it("FocusEvent has required fields", () => {
    const event: FocusEvent = {
      type: "focus",
      focused: true,
    };
    assert.strictEqual(event.type, "focus");
  });

  it("InputEvent union discriminates on type", () => {
    const event: InputEvent = {
      type: "key",
      name: "enter",
      char: "",
      ctrl: false,
      alt: false,
      shift: false,
      sequence: "\r",
    };

    if (event.type === "key") {
      assert.strictEqual(event.name, "enter");
    }
  });

  it("NO_MODIFIERS has all false", () => {
    assert.strictEqual(NO_MODIFIERS.ctrl, false);
    assert.strictEqual(NO_MODIFIERS.alt, false);
    assert.strictEqual(NO_MODIFIERS.shift, false);
  });
});

describe("mouse button constants", () => {
  it("MOUSE_LEFT is 0", () => {
    assert.strictEqual(MOUSE_LEFT, 0);
  });
});
