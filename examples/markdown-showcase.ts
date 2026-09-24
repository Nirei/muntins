/**
 * One-off showcase of the Markdown component.
 *
 * Run with:
 *   node --experimental-strip-types examples/markdown-showcase.ts
 *
 * j/k scroll, q or Escape quits.
 */

import {
  App,
  Box,
  Markdown,
  ScrollArea,
  Text,
  createSignal,
} from "../src/index.ts";

const SOURCE = `# Markdown support in Muntins

A paragraph with **bold**, *emphasis*, \`inline code\`, ~~strikethrough~~, a
[link](https://example.com), and an ![image](logo.png). Soft line breaks
become spaces, word wrapping happens at word boundaries, and emoji 🎉 and
CJK 你好世界 render with correct double-width handling.

## Blocks

> A blockquote with **bold** inside.
> It spans two lines and word-wraps cleanly.
>
> > Nested quotes compose — each level adds its own bar.

### Lists

- bullet one
- bullet two with \`inline code\`
  - nested bullet
    - deeply nested
- [x] done task
- [ ] open task

1. ordered alpha
2. ordered beta
5. ordered starting at five

### Tables

| Feature    | Status | Notes            |
|------------|:------:|-----------------:|
| tables     | yes    | GFM aligned      |
| tasks      | yes    | ☑ / ☐ markers    |
| word wrap  | yes    | grapheme-aware   |
| quotes     | yes    | nests by composition |

### Code

\`\`\`ts
const greeting = "héllo 🎉";
console.log(greeting, "你好世界");
\`\`\`

Indented code:

    four-space indented block
      keeps its whitespace

### Breaks and HTML

---

<aside>html blocks render as dimmed literal source</aside>

---

**Scroll with j/k. Press q to quit.**
`;

const [scrollTop, setScrollTop] = createSignal(0);

function Showcase() {
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
      Text({ content: "markdown-showcase — j/k scroll, q quit", dim: true }),
      ScrollArea({
        height: () => process.stdout.rows - 2,
        width: () => process.stdout.columns,
        scrollTop,
        children: [Markdown({ content: SOURCE })],
      }),
    ],
  });
}

const app = App.mount(Showcase, { mouse: true });
