# External leverage points

## Node.js APIs

### `node:readline`, keyboard input parsing
`readline.emitKeypressEvents(stdin)` parses raw byte sequences into structured
key objects `{ name, ctrl, shift, meta, sequence }`. Handles arrows, F-keys,
Ctrl+, Alt+, UTF-8 multi-byte, and the ESC disambiguation timeout.
Eliminates ~200 lines of input parsing code.

Also provides cursor and screen utilities for the renderer:
`cursorTo`, `moveCursor`, `clearLine`, `clearScreenDown`.

### `node:tty`, terminal capabilities
`process.stdout.columns` / `.rows`, current terminal dimensions.
`process.stdout.on('resize', ...)`, resize events (no SIGWINCH needed).
`process.stdout.getColorDepth()`, returns 1 | 4 | 8 | 24 bits, inspecting
`COLORTERM`, `TERM`, and `TERM_PROGRAM` automatically.
`process.stdout.hasColors(n)`, boolean capability check.

## Web / ECMA APIs (available in Node 16+)

### `Intl.Segmenter`, grapheme cluster segmentation
Splits strings into user-perceived characters correctly, handling emoji,
combining marks, and other multi-codepoint clusters. Implements Unicode TR #29
without a lookup table.

## Specifications to follow

| Area | Spec |
|---|---|
| Flexbox layout algorithm | W3C CSS Flexible Box Layout Level 1, §9 |
| Terminal styles and colors | ECMA-48 (SGR sequences) |
| Mouse input | xterm SGR mouse protocol (`\x1b[?1006h`) |
| Character display width | Unicode UAX #11 (East Asian Width) |
| Grapheme segmentation | Unicode TR #29 (via `Intl.Segmenter`) |
| Alternate screen | xterm `\x1b[?1049h` / `\x1b[?1049l` |
| Keyboard (progressive enhancement) | Kitty Keyboard Protocol |

## What we own entirely

- Signals reactivity core
- Flexbox layout engine (guided by W3C §9)
- Cell buffer and differential renderer
- Mouse event routing and hit-testing
- Focus tree and event bubbling
- SGR mouse protocol parsing (not covered by `readline`)

## Further reading

Resources on terminal Unicode handling and the challenges of text measurement:

- [Grapheme Clusters and Terminal Emulators](https://mitchellh.com/writing/grapheme-clusters-in-terminals), Mitchell Hashimoto's explanation of why terminals disagree on emoji widths and the Mode 2027 proposal
- [Terminal Emulators Battle Royale](https://ucs-detect.readthedocs.io/results.html), Jeff Quast's systematic testing of 35+ terminals for Unicode compliance (wide chars, ZWJ, VS-16)
- [Mode 2027 proposal](https://github.com/contour-terminal/terminal-unicode-core), opt-in grapheme cluster support for terminals

**Current approach:** Muntins uses wcwidth-style width calculation (UAX #11 ranges) which matches the behavior of most terminals including GNOME Terminal and other VTE-based emulators. This ensures consistent layout even if emoji sequences render as multiple glyphs.

**Future enhancement:** Mode 2027 support could allow better emoji rendering on modern terminals (Ghostty, kitty, foot, WezTerm, iTerm2) that support grapheme clustering.
