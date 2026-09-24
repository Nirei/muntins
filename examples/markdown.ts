/**
 * Example featuring the Markdown component
 *
 * It showcases the following features:
 * Markdown (headings, tables, task lists, code, quotes)
 * ScrollArea with j/k scrolling
 * RichText styled spans
 */

import { readFileSync } from "node:fs";
import {
  App,
  Box,
  Markdown,
  ScrollArea,
  Text,
  createSignal,
} from "../src/index.ts";

function readReadme(): string {
  try {
    return readFileSync("README.md", "utf8");
  } catch {
    return "";
  }
}

const readme = readReadme();

const SAMPLE = `# Markdown renderer

A paragraph with **bold**, *emphasis*, \`code\`, ~~strikethrough~~, and a
[link](https://example.com).

## Blocks

> A quote with **bold** inside.

- bullet one
- bullet two with \`inline code\`
- [x] done task
- [ ] open task

1. ordered alpha
2. ordered beta

| Feature | Status | Notes |
|---------|:------:|------:|
| tables | yes | GFM |
| tasks | yes | v1 |
| quotes | yes | nests |

\`\`\`ts
const greeting = "héllo 🎉";
console.log(greeting);
\`\`\`

---

Scroll with j/k. Press escape or q to quit.
`;

const content = readme || SAMPLE;

const [scrollTop, setScrollTop] = createSignal(0);

function MarkdownViewer() {
  return Box({
    flexDirection: "column",
    onKeyPress: (key) => {
      if (
        key.name === "escape" ||
        key.name === "q" ||
        (key.ctrl && key.name === "c")
      ) {
        app.unmount();
        return true;
      }
      if (key.name === "j") {
        setScrollTop(scrollTop() + 1);
        return true;
      }
      if (key.name === "k") {
        setScrollTop(Math.max(0, scrollTop() - 1));
        return true;
      }
      return false;
    },
    children: [
      Text({
        content: "markdown.md — j/k to scroll, q to quit",
        dim: true,
      }),
      ScrollArea({
        height: () => process.stdout.rows - 2,
        width: () => process.stdout.columns,
        scrollTop,
        children: [Markdown({ content })],
      }),
    ],
  });
}

const app = App.mount(MarkdownViewer, { mouse: true });
