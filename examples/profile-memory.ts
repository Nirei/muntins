/**
 * Memory profiling harness for the Muntins render pipeline.
 *
 * Drives Renderer directly (no App, no input, no TTY) to isolate
 * per-redraw allocations in the layout → paint → flush pipeline.
 *
 * Run with: node --expose-gc --experimental-strip-types examples/profile-memory.ts
 *
 * Passes:
 *   A (steady-state)   — flush N times with no signal changes
 *   B (with mutations)  — flush N times, mutating signals between each
 *   C (phase attr)      — measures layout-only, paint-only, flush-only separately
 */

import type { Buffer } from "../src/core/buffer.ts";
import type { LayoutResult } from "../src/core/layout.ts";
import { computeLayout } from "../src/core/layout.ts";
import type { Node } from "../src/core/runtime/Node.ts";
import { Renderer } from "../src/core/runtime/Renderer.ts";
import { Box, type Color, Text, batch, createSignal } from "../src/index.ts";

// ---------------------------------------------------------------------------
// Mock stdout
// ---------------------------------------------------------------------------

const COLUMNS = 120;
const ROWS = 40;

function createMockStdout() {
  return {
    columns: COLUMNS,
    rows: ROWS,
    write(_data: string) {},
    isTTY: true,
  } as unknown as NodeJS.WriteStream;
}

// ---------------------------------------------------------------------------
// Tree construction (mirrors stress.ts structure without App/context)
// ---------------------------------------------------------------------------

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

function pickTarget() {
  return Math.floor(Math.random() * 100);
}

interface MutationHandles {
  mutateBars: () => void;
  mutateWords: () => void;
  mutateGrid: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private Renderer internals for profiling
type RendererInternals = {
  buffer: Buffer;
  paintTree: (
    root: Node,
    layoutResult: LayoutResult,
    clip: { x: number; y: number; width: number; height: number },
  ) => void;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private Buffer internals for profiling
type BufferInternals = { render: () => string; syncBuffers: () => void };

function rendererInternals(r: Renderer): RendererInternals {
  return r as unknown as RendererInternals;
}

function bufferInternals(b: Buffer): BufferInternals {
  return b as unknown as BufferInternals;
}

function buildTree(): { root: Node; handles: MutationHandles } {
  const handles = {} as MutationHandles;

  const [fps] = createSignal(60);
  const [frameCount] = createSignal(0);

  const barDefs = [
    {
      label: "CPU",
      color: PALETTE.green,
      value: 30,
      target: pickTarget(),
      speed: 0.5,
    },
    {
      label: "Memory",
      color: PALETTE.blue,
      value: 60,
      target: pickTarget(),
      speed: 0.4,
    },
    {
      label: "Disk I/O",
      color: PALETTE.yellow,
      value: 10,
      target: pickTarget(),
      speed: 0.6,
    },
    {
      label: "Network",
      color: PALETTE.magenta,
      value: 80,
      target: pickTarget(),
      speed: 0.3,
    },
    {
      label: "GPU",
      color: PALETTE.cyan,
      value: 45,
      target: pickTarget(),
      speed: 0.7,
    },
  ];

  const barSignals = barDefs.map((bar) => {
    const [value, setValue] = createSignal(bar.value);
    const [target, setTarget] = createSignal(bar.target);
    return { ...bar, value, setValue, target, setTarget };
  });

  const [words, setWords] = createSignal<string[]>([]);
  let wordIndex = 0;

  handles.mutateBars = () => {
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
    });
  };

  handles.mutateWords = () => {
    wordIndex = (wordIndex + 1) % WORDS.length;
    const word = WORDS[wordIndex];
    setWords((prev) => {
      const next = [...prev, word];
      return next.length > 2000 ? next.slice(-2000) : next;
    });
  };

  handles.mutateGrid = () => {};

  const root = Box({
    flexDirection: "column",
    flexGrow: 1,
    backgroundColor: PALETTE.bg,
    children: [
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
                color: PALETTE.green,
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

      Box({
        flexDirection: "row",
        flexGrow: 1,
        gap: 1,
        paddingTop: 1,
        paddingStart: 1,
        paddingEnd: 1,
        children: [
          Box({
            flexDirection: "column",
            flexGrow: 1,
            gap: 1,
            children: [
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
                        Box({
                          height: 1,
                          backgroundColor: PALETTE.surface,
                          children: [
                            Text({
                              content: () => {
                                const v = Math.round(bar.value());
                                const filled = Math.round(v / 5);
                                return (
                                  "█".repeat(filled) + "░".repeat(20 - filled)
                                );
                              },
                              color: bar.color,
                            }),
                          ],
                        }),
                      ],
                    }),
                  ),
                ],
              }),

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
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

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
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 1,
                flexGrow: 1,
                children: Array.from({ length: 8 }, (_, i) =>
                  Box({
                    flexDirection: i % 2 === 0 ? "row" : "column",
                    flexGrow: 1,
                    backgroundColor: [
                      PALETTE.red,
                      PALETTE.green,
                      PALETTE.yellow,
                      PALETTE.blue,
                      PALETTE.magenta,
                      PALETTE.cyan,
                      PALETTE.orange,
                      PALETTE.title,
                    ][i],
                    justifyContent: "center",
                    alignItems: "center",
                    paddingStart: 1,
                    paddingEnd: 1,
                    minWidth: 4,
                    minHeight: 1,
                    children: [Text({ content: "g1 auto", bold: true })],
                  }),
                ),
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

      Box({
        flexDirection: "row",
        justifyContent: "center",
        children: [Text({ content: "q / Ctrl+C  quit", dim: true })],
      }),
    ],
  });

  return { root, handles };
}

// ---------------------------------------------------------------------------
// Measurement utilities
// ---------------------------------------------------------------------------

function forceGc() {
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
}

function heapUsed(): number {
  return process.memoryUsage().heapUsed;
}

interface Stats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  total: number;
}

function computeStats(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: total / sorted.length,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    total,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function printStats(label: string, stats: Stats, sampleCount: number) {
  console.log(`  ${label}`);
  console.log(`    min  = ${formatBytes(stats.min)}`);
  console.log(`    p50  = ${formatBytes(stats.p50)}`);
  console.log(`    p95  = ${formatBytes(stats.p95)}`);
  console.log(`    p99  = ${formatBytes(stats.p99)}`);
  console.log(`    max  = ${formatBytes(stats.max)}`);
  console.log(`    avg  = ${formatBytes(stats.avg)}`);
  console.log(
    `    total (${sampleCount} flushes) = ${formatBytes(stats.total)}`,
  );
}

// ---------------------------------------------------------------------------
// Phase-isolated measurement helpers
// ---------------------------------------------------------------------------

const ROOT_CLIP = { x: 0, y: 0, width: COLUMNS, height: ROWS };

function measureLayoutOnly(root: Node): number {
  forceGc();
  const before = heapUsed();
  const layoutNode = root.toLayoutNode();
  computeLayout(layoutNode, COLUMNS, ROWS);
  return heapUsed() - before;
}

function measurePaintOnly(
  ri: RendererInternals,
  root: Node,
  layoutResult: LayoutResult,
): number {
  forceGc();
  const before = heapUsed();
  ri.buffer.clear();
  ri.paintTree(root, layoutResult, ROOT_CLIP);
  return heapUsed() - before;
}

function measureFlushOnly(bi: BufferInternals): number {
  forceGc();
  const before = heapUsed();
  bi.render();
  bi.syncBuffers();
  return heapUsed() - before;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const WARMUP = 20;
const SAMPLES = 500;

function main() {
  if (typeof globalThis.gc !== "function") {
    console.error(
      "Run with: node --expose-gc --experimental-strip-types examples/profile-memory.ts",
    );
    process.exit(1);
  }

  console.log("=== Muntins Render Pipeline Memory Profile ===");
  console.log(`  Terminal: ${COLUMNS}x${ROWS}`);
  console.log(`  Samples per pass: ${SAMPLES}`);
  console.log(`  Warmup iterations: ${WARMUP}`);
  console.log();

  const { root, handles } = buildTree();
  const stdout = createMockStdout();
  const renderer = new Renderer(stdout, 0, () => root);
  const ri = rendererInternals(renderer);

  renderer.bind(root);

  const allNodes: Node[] = [];
  root.flatten(allNodes);
  console.log(`  Node count: ${allNodes.length}`);
  console.log();

  // Warmup
  console.log("Warming up...");
  for (let i = 0; i < WARMUP; i++) {
    handles.mutateBars();
    renderer.flush();
  }
  forceGc();
  console.log();

  // --- Pass A: Steady-state using cached layout (renderFrame) ---
  console.log("--- Pass A: Steady-state with layout cache (renderFrame) ---");
  const samplesA: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    forceGc();
    const before = heapUsed();
    renderer.renderFrame();
    const after = heapUsed();
    samplesA.push(after - before);
  }
  printStats("Heap delta per renderFrame", computeStats(samplesA), SAMPLES);
  console.log();

  // --- Pass B: Full flush with signal mutations (bypasses cache) ---
  console.log("--- Pass B: Full flush with signal mutations ---");
  const samplesB: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    handles.mutateBars();
    if (i % 6 === 0) handles.mutateWords();

    forceGc();
    const before = heapUsed();
    renderer.flush();
    const after = heapUsed();
    samplesB.push(after - before);
  }
  printStats("Heap delta per flush", computeStats(samplesB), SAMPLES);
  console.log();

  // --- Pass A2: Steady-state with forced layout (flush) for comparison ---
  console.log(
    "--- Pass A2: Steady-state without cache (flush, forces layout) ---",
  );
  const samplesA2: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    forceGc();
    const before = heapUsed();
    renderer.flush();
    const after = heapUsed();
    samplesA2.push(after - before);
  }
  printStats("Heap delta per flush", computeStats(samplesA2), SAMPLES);
  console.log();

  // --- Pass C: Phase attribution ---
  console.log("--- Pass C: Phase attribution ---");

  const samplesC1: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    handles.mutateBars();
    if (i % 6 === 0) handles.mutateWords();
    samplesC1.push(measureLayoutOnly(root));
  }
  printStats(
    "Layout only (toLayoutNode + computeLayout)",
    computeStats(samplesC1),
    SAMPLES,
  );

  const layoutNode = root.toLayoutNode();
  const layoutResult = computeLayout(layoutNode, COLUMNS, ROWS);

  const samplesC2: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    samplesC2.push(measurePaintOnly(ri, root, layoutResult));
  }
  printStats(
    "Paint only (clear + paintTree)",
    computeStats(samplesC2),
    SAMPLES,
  );

  ri.buffer.clear();
  ri.paintTree(root, layoutResult, ROOT_CLIP);

  const bi = bufferInternals(ri.buffer);
  const samplesC3: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    samplesC3.push(measureFlushOnly(bi));
    ri.buffer.clear();
    ri.paintTree(root, layoutResult, ROOT_CLIP);
  }
  printStats(
    "Buffer flush only (render + sync)",
    computeStats(samplesC3),
    SAMPLES,
  );
  console.log();

  // --- Summary ---
  const statsA = computeStats(samplesA);
  const statsB = computeStats(samplesB);
  const statsA2 = computeStats(samplesA2);
  const statsC1 = computeStats(samplesC1);
  const statsC2 = computeStats(samplesC2);
  const statsC3 = computeStats(samplesC3);

  console.log("=== Summary ===");
  console.log(
    `  Cached layout (renderFrame) avg:  ${formatBytes(statsA.avg)}/flush  [layout SKIPPED]`,
  );
  console.log(
    `  Forced layout (flush) avg:        ${formatBytes(statsA2.avg)}/flush  [layout recomputed]`,
  );
  console.log(
    `  With mutations (flush) avg:       ${formatBytes(statsB.avg)}/flush`,
  );
  console.log();
  console.log(
    `  Cache saving:                     ${formatBytes(statsA2.avg - statsA.avg)}/flush  (${Math.round(((statsA2.avg - statsA.avg) / statsA2.avg) * 100)}% reduction)`,
  );
  console.log();
  console.log(
    `  Layout phase avg:                 ${formatBytes(statsC1.avg)}/flush`,
  );
  console.log(
    `  Paint phase avg:                  ${formatBytes(statsC2.avg)}/flush`,
  );
  console.log(
    `  Flush phase avg:                  ${formatBytes(statsC3.avg)}/flush`,
  );
  console.log();

  const negA = samplesA.filter((s) => s <= 0).length;
  const negB = samplesB.filter((s) => s <= 0).length;
  if (negA > 0 || negB > 0) {
    console.log(
      `  Note: ${negA}/${SAMPLES} cached and ${negB}/${SAMPLES} mutation samples had non-positive heap delta (GC reclaimed memory during measurement). These are included in stats but may understate true allocation.`,
    );
    console.log();
  }
}

main();
