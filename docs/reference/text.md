# Text Utilities

Text utilities for grapheme-aware string manipulation. These functions operate on user-perceived characters (grapheme clusters) rather than JavaScript string indices, ensuring correct handling of emoji, combining marks, and other multi-codepoint characters.

Use these when building text editing features like inputs, text areas, or any component that needs to manipulate user-entered text.

## textLength

Returns the number of graphemes in a string.

```typescript
import { textLength } from 'muntins';

textLength("hello");     // 5
textLength("cafe\u0301"); // 4 (e + combining acute = 1 grapheme)
textLength("👨‍👩‍👧");       // 1 (family emoji is 1 grapheme)
textLength("hi👋🏽!");     // 4
```

Unlike `string.length`, which counts UTF-16 code units, `textLength` counts what users perceive as characters. This matters for cursor positioning and text selection.

## textSlice

Extracts a section of a string by grapheme positions. Works like `string.slice()` but operates on graphemes.

```typescript
import { textSlice } from 'muntins';

textSlice("hello", 1, 3);   // "el"
textSlice("hello", 2);      // "llo" (to end)
textSlice("👨‍👩‍👧🎉", 0, 1);    // "👨‍👩‍👧"
textSlice("👨‍👩‍👧🎉", 1);       // "🎉"
textSlice("a👋🏽b", 1, 2);   // "👋🏽"
```

Use this to extract text before/after a cursor position:

```typescript
const beforeCursor = textSlice(value, 0, cursorPos);
const afterCursor = textSlice(value, cursorPos);
```

## textInsert

Inserts a string at a grapheme position.

```typescript
import { textInsert } from 'muntins';

textInsert("hello", 0, "!");     // "!hello"
textInsert("hello", 5, "!");     // "hello!"
textInsert("hello", 2, "XY");    // "heXYllo"
textInsert("ab", 1, "👨‍👩‍👧");      // "a👨‍👩‍👧b"
```

Use this to insert typed characters at the cursor:

```typescript
if (isPrintable(key.char)) {
  const newValue = textInsert(value, cursorPos, key.char);
  setValue(newValue);
  setCursorPos(cursorPos + 1);
}
```

## textDelete

Deletes a range of graphemes from a string.

```typescript
import { textDelete } from 'muntins';

textDelete("hello", 0, 2);    // "llo"
textDelete("hello", 1, 3);    // "hlo"
textDelete("hello", 3, 5);    // "hel"
textDelete("a👨‍👩‍👧b", 1, 2);     // "ab"
```

Use this to implement backspace and delete:

```typescript
// Backspace: delete one grapheme before cursor
if (key.name === 'backspace' && cursorPos > 0) {
  const newValue = textDelete(value, cursorPos - 1, cursorPos);
  setValue(newValue);
  setCursorPos(cursorPos - 1);
}

// Delete: delete one grapheme at cursor
if (key.name === 'delete' && cursorPos < textLength(value)) {
  const newValue = textDelete(value, cursorPos, cursorPos + 1);
  setValue(newValue);
}
```

## Why graphemes matter

JavaScript strings are indexed by UTF-16 code units. Many characters span multiple code units:

| Character | `string.length` | `textLength` |
| ----------- | ----------------- | -------------- |
| `"a"` | 1 | 1 |
| `"é"` (precomposed) | 1 | 1 |
| `"e\u0301"` (e + combining acute) | 2 | 1 |
| `"👋"` | 2 | 1 |
| `"👋🏽"` (with skin tone) | 4 | 1 |
| `"👨‍👩‍👧"` (family) | 8 | 1 |

Using string indices for cursor movement would let users land in the middle of a character. The text utilities ensure you always work with complete graphemes.

## Wrap modes

`WrapMode` controls how `Text` (and other text-bearing components) fit content into the available width:

| Mode | Behavior |
| ------ | ---------- |
| `"wrap"` | Greedy wrapping at grapheme boundaries (default for `Text`) |
| `"word"` | Greedy wrapping at word boundaries; long words fall back to grapheme breaks; breaks are allowed between wide graphemes (CJK/emoji) |
| `"none"` | No wrapping, no truncation; measurement returns the full intrinsic width — callers clip via `overflow: hidden` |
| `"truncate"` / `"truncate-end"` | Single line, truncated at the end with an ellipsis |
| `"truncate-start"` | Single line, truncated at the start with an ellipsis |

```typescript
import { Text } from 'muntins';

Text({ content: "hello bold world", wrap: "word" });
```

At a `"word"` break point the trailing space is not rendered, and spaces are skipped at the start of the continuation line.

## Styled spans and RichText

A `StyledSpan` is a run of text with optional style properties. Any omitted property is inherited (span value → node prop → inherited style). `"\\n"` inside span text is a hard line break.

```typescript
import { RichText, type StyledSpan } from 'muntins';

const spans: StyledSpan[] = [
  { text: "normal " },
  { text: "bold", bold: true },
  { text: " and " },
  { text: "struck", strikethrough: true },
];

RichText({ spans }); // word-wraps by default
```

`RichText` is a leaf text primitive like `Text`, but with per-span styling. `Text` keeps its fast single-style path — prefer it when a whole run shares one style. Layout helpers `layoutStyledSpans` / `measureStyledSpans` and the low-level `renderStyledText` are exported for custom leaf nodes that need styled runs.
