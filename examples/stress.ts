/**
 * Stress Test Example
 *
 * A profiling-oriented stress test exercising all subsystems:
 * - Smooth animated progress bars (reactivity + rendering)
 * - Live scrolling word log (frequent text updates)
 * - Dynamic layout grid (flexbox recomputation)
 * - FPS counter (render pipeline throughput)
 *
 * Run with: node --experimental-strip-types examples/stress.ts
 */

import {
  App,
  Box,
  type Color,
  For,
  Progress,
  Text,
  batch,
  createEffect,
  createSignal,
  onCleanup,
} from "../src/index.ts";

const PALETTE = {
  bg: { type: "palette", index: 235 } as Color,
  surface: { type: "palette", index: 236 } as Color,
  border: { type: "palette", index: 240 } as Color,
  title: { type: "palette", index: 75 } as Color,
  muted: { type: "palette", index: 245 } as Color,
  red: { type: "palette", index: 203 } as Color,
  green: { type: "palette", index: 114 } as Color,
  yellow: { type: "palette", index: 221 } as Color,
  blue: { type: "palette", index: 75 } as Color,
  magenta: { type: "palette", index: 176 } as Color,
  cyan: { type: "palette", index: 80 } as Color,
  orange: { type: "palette", index: 215 } as Color,
};

const WORDS = [
  "signals",
  "flexbox",
  "buffer",
  "layout",
  "render",
  "terminal",
  "reactive",
  "component",
  "pipeline",
  "keyboard",
  "mouse",
  "focus",
  "scroll",
  "border",
  "padding",
  "margin",
  "gap",
  "overflow",
  "measure",
  "diffing",
  "batch",
  "effect",
  "memo",
  "cleanup",
  "untrack",
  "subscribe",
  "dispose",
  "tree",
  "node",
  "paint",
  "flush",
  "schedule",
  "update",
  "compute",
  "resolve",
  "iterate",
  "column",
  "stretch",
  "shrink",
  "grow",
  "wrap",
  "align",
  "justify",
  "content",
  "display",
  "position",
  "absolute",
  "perf",
  "profile",
  "throughput",
  "latency",
  "smooth",
  "animation",
  "frame",
  "tick",
  "interval",
  "timer",
  "event",
];

function pickTarget(): number {
  return Math.floor(Math.random() * 100);
}

function StressTest() {
  const [fps, setFps] = createSignal(0);
  const [frameCount, setFrameCount] = createSignal(0);
  let framesInSecond = 0;
  let lastFpsTime = Date.now();

  const bars = [
    {
      label: "CPU",
      color: PALETTE.green,
      value: 30,
      target: pickTarget(),
      speed: 0.4 + Math.random() * 0.6,
    },
    {
      label: "Memory",
      color: PALETTE.blue,
      value: 60,
      target: pickTarget(),
      speed: 0.3 + Math.random() * 0.5,
    },
    {
      label: "Disk I/O",
      color: PALETTE.yellow,
      value: 10,
      target: pickTarget(),
      speed: 0.5 + Math.random() * 0.8,
    },
    {
      label: "Network",
      color: PALETTE.magenta,
      value: 80,
      target: pickTarget(),
      speed: 0.2 + Math.random() * 0.4,
    },
    {
      label: "GPU",
      color: PALETTE.cyan,
      value: 45,
      target: pickTarget(),
      speed: 0.6 + Math.random() * 0.7,
    },
  ];

  const barSignals = bars.map((bar) => {
    const [value, setValue] = createSignal(bar.value);
    const [target, setTarget] = createSignal(bar.target);
    return { ...bar, value, setValue, target, setTarget };
  });

  const [words, setWords] = createSignal<string[]>([]);
  let wordIndex = 0;

  const GRID_COUNT = 8;
  const gridColors: Color[] = [
    PALETTE.red,
    PALETTE.green,
    PALETTE.yellow,
    PALETTE.blue,
    PALETTE.magenta,
    PALETTE.cyan,
    PALETTE.orange,
    PALETTE.title,
  ];

  interface GridCell {
    flexGrow: [() => number, (v: number) => void];
    width: [() => number | "auto", (v: number | "auto") => void];
    height: [() => number | "auto", (v: number | "auto") => void];
    direction: [() => "row" | "column", (v: "row" | "column") => void];
  }

  const gridCells: GridCell[] = Array.from({ length: GRID_COUNT }, (_, i) => ({
    flexGrow: createSignal(1) as GridCell["flexGrow"],
    width: createSignal<number | "auto">("auto") as GridCell["width"],
    height: createSignal<number | "auto">("auto") as GridCell["height"],
    direction: createSignal<"row" | "column">(
      i % 2 === 0 ? "row" : "column",
    ) as GridCell["direction"],
  }));

  const [gridItems, setGridItems] = createSignal(
    Array.from({ length: GRID_COUNT }, (_, i) => ({
      id: i,
      flexGrow: gridCells[i].flexGrow[0](),
      width: gridCells[i].width[0](),
      height: gridCells[i].height[0](),
      direction: gridCells[i].direction[0](),
    })),
  );

  // -- Timers (use createEffect, not onMount — onMount doesn't fire inside createRoot) --
  createEffect(() => {
    const animInterval = setInterval(() => {
      batch(() => {
        for (const bar of barSignals) {
          const current = bar.value();
          const tgt = bar.target();
          const diff = tgt - current;

          if (Math.abs(diff) < bar.speed) {
            bar.setValue(tgt);
            bar.setTarget(pickTarget());
          } else {
            bar.setValue(current + Math.sign(diff) * bar.speed);
          }
        }

        framesInSecond++;
        setFrameCount((c) => c + 1);
        const now = Date.now();
        if (now - lastFpsTime >= 1000) {
          setFps(framesInSecond);
          framesInSecond = 0;
          lastFpsTime = now;
        }
      });
    }, 16);

    const wordInterval = setInterval(() => {
      wordIndex = (wordIndex + 1) % WORDS.length;
      const word = WORDS[wordIndex];
      setWords((prev) => {
        const next = [...prev, word];
        return next.length > 2000 ? next.slice(-2000) : next;
      });
    }, 100);

    const layoutInterval = setInterval(() => {
      batch(() => {
        const items = Array.from({ length: GRID_COUNT }, (_, i) => {
          const newGrow = Math.floor(Math.random() * 4);
          const newWidth: number | "auto" =
            Math.random() > 0.5 ? 4 + Math.floor(Math.random() * 8) : "auto";
          const newHeight: number | "auto" =
            Math.random() > 0.6 ? 1 + Math.floor(Math.random() * 3) : "auto";
          const newDir: "row" | "column" =
            Math.random() > 0.5 ? "row" : "column";

          gridCells[i].flexGrow[1](newGrow);
          gridCells[i].width[1](newWidth);
          gridCells[i].height[1](newHeight);
          gridCells[i].direction[1](newDir);

          return {
            id: i,
            flexGrow: newGrow,
            width: newWidth,
            height: newHeight,
            direction: newDir,
          };
        });
        setGridItems(items);
      });
    }, 500);

    onCleanup(() => {
      clearInterval(animInterval);
      clearInterval(wordInterval);
      clearInterval(layoutInterval);
    });
  });

  return Box({
    flexDirection: "column",
    flexGrow: 1,
    backgroundColor: PALETTE.bg,
    focusable: true,
    autoFocus: true,
    onKeyPress(key) {
      if (key.name === "q" || (key.ctrl && key.name === "c")) {
        app.unmount();
        return true;
      }
      return false;
    },
    children: [
      // Header
      Box({
        flexDirection: "row",
        justifyContent: "space-between",
        paddingStart: 2,
        paddingEnd: 2,
        border: true,
        borderColor: PALETTE.border,
        borderStyle: "single",
        children: [
          Text({
            content: "Muntins Stress Test",
            bold: true,
            color: PALETTE.title,
          }),
          Box({
            flexDirection: "row",
            gap: 2,
            children: [
              Text({
                content: () => `${fps()} fps`,
                color: () =>
                  fps() > 30
                    ? PALETTE.green
                    : fps() > 15
                      ? PALETTE.yellow
                      : PALETTE.red,
                bold: true,
              }),
              Text({
                content: () => `frame ${frameCount()}`,
                color: PALETTE.muted,
              }),
            ],
          }),
        ],
      }),

      // Main content: two columns
      Box({
        flexDirection: "row",
        flexGrow: 1,
        gap: 1,
        paddingTop: 1,
        paddingStart: 1,
        paddingEnd: 1,
        children: [
          // Left column
          Box({
            flexDirection: "column",
            flexGrow: 1,
            gap: 1,
            children: [
              // Progress bars
              Box({
                flexDirection: "column",
                gap: 1,
                border: true,
                borderColor: PALETTE.border,
                borderStyle: "single",
                paddingStart: 1,
                paddingEnd: 1,
                paddingTop: 0,
                paddingBottom: 1,
                children: [
                  Text({
                    content: "Progress Bars",
                    bold: true,
                    color: PALETTE.title,
                  }),
                  ...barSignals.map((bar) =>
                    Box({
                      flexDirection: "column",
                      gap: 0,
                      children: [
                        Box({
                          flexDirection: "row",
                          justifyContent: "space-between",
                          children: [
                            Text({
                              content: bar.label,
                              bold: true,
                              color: bar.color,
                            }),
                            Text({
                              content: () => {
                                const v = bar.value();
                                const t = bar.target();
                                return `${Math.round(v)}% → ${Math.round(t)}%`;
                              },
                              color: PALETTE.muted,
                            }),
                          ],
                        }),
                        Progress({
                          value: () => Math.round(bar.value()),
                          color: bar.color,
                          backgroundColor: PALETTE.surface,
                        }),
                      ],
                    }),
                  ),
                ],
              }),

              // Word log
              Box({
                flexDirection: "column",
                flexGrow: 1,
                border: true,
                borderColor: PALETTE.border,
                borderStyle: "single",
                paddingStart: 1,
                paddingEnd: 1,
                paddingTop: 0,
                paddingBottom: 0,
                overflow: "hidden",
                children: [
                  Text({
                    content: "Live Word Stream",
                    bold: true,
                    color: PALETTE.title,
                  }),
                  Box({
                    flexGrow: 1,
                    overflow: "hidden",
                    children: [
                      Text({
                        content: () => words().join(" "),
                        color: PALETTE.muted,
                        wrap: "wrap" as const,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          // Right column: layout stress grid
          Box({
            flexDirection: "column",
            width: 48,
            flexShrink: 0,
            border: true,
            borderColor: PALETTE.border,
            borderStyle: "single",
            paddingStart: 1,
            paddingEnd: 1,
            paddingTop: 0,
            paddingBottom: 1,
            gap: 1,
            children: [
              Text({
                content: "Layout Stress Grid",
                bold: true,
                color: PALETTE.title,
              }),
              Text({ content: "Flex props randomized every 500ms", dim: true }),

              Box({
                flexDirection: "column",
                flexWrap: "wrap",
                gap: 1,
                flexGrow: 1,
                children: [
                  For({
                    each: gridItems,
                    key: (item) => item.id,
                    render: (item, index) =>
                      Box({
                        flexDirection: () =>
                          item().direction as "row" | "column",
                        flexGrow: () => item().flexGrow as number,
                        width: () => item().width as number | "auto",
                        height: () => item().height as number | "auto",
                        backgroundColor:
                          gridColors[index() % gridColors.length],
                        justifyContent: "center",
                        alignItems: "center",
                        paddingStart: 1,
                        paddingEnd: 1,
                        minWidth: 4,
                        minHeight: 1,
                        children: [
                          Text({
                            content: () => {
                              const i = item();
                              const w =
                                i.width === "auto" ? "auto" : `${i.width}`;
                              const h =
                                i.height === "auto" ? "auto" : `${i.height}`;
                              return `g${i.flexGrow} ${w}x${h}`;
                            },
                            bold: true,
                          }),
                        ],
                      }),
                  }),
                ],
              }),

              Box({
                flexDirection: "row",
                gap: 1,
                justifyContent: "center",
                children: [
                  Text({ content: "Each box shows:", dim: true }),
                  Text({
                    content: "grow width x height",
                    dim: true,
                    color: PALETTE.muted,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),

      // Footer
      Box({
        flexDirection: "row",
        justifyContent: "center",
        children: [Text({ content: "q / Ctrl+C  quit", dim: true })],
      }),
    ],
  });
}

const app = App.mount(StressTest);
