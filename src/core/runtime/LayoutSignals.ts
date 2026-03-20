import type { LayoutResult } from "../layout.ts";
import { batch, createSignal, type Accessor } from "../signals.ts";

/**
 * Layout signals for reactive layout coordinates.
 * Created during node binding and updated on resize/relayout.
 */
export interface LayoutSignals {
  x: Accessor<number>;
  y: Accessor<number>;
  width: Accessor<number>;
  height: Accessor<number>;
  screenX: Accessor<number>;
  screenY: Accessor<number>;
  setLayout: (result: LayoutResult) => void;
}

/**
 * Creates layout signals for a node.
 * These signals are updated when layout changes and can be tracked by effects.
 */
export function createLayoutSignals(): LayoutSignals {
  const [x, setX] = createSignal(0);
  const [y, setY] = createSignal(0);
  const [width, setWidth] = createSignal(0);
  const [height, setHeight] = createSignal(0);
  const [screenX, setScreenX] = createSignal(0);
  const [screenY, setScreenY] = createSignal(0);

  return {
    x,
    y,
    width,
    height,
    screenX,
    screenY,
    setLayout(result: LayoutResult) {
      batch(() => {
        setX(result.x);
        setY(result.y);
        setWidth(result.width);
        setHeight(result.height);
        setScreenX(result.screenX);
        setScreenY(result.screenY);
      });
    },
  };
}