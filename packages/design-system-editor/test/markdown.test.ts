import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inlineText, parseInline, parseMarkdown } from '../src/lib/markdown.ts';

describe('markdown', () => {
  it('parses blocks', () => {
    const blocks = parseMarkdown(`# Acme

Use **ink** on \`surface\`.
Second line.

- one
  continued
- two
  - nested

| Token | Use |
|---|:-:|
| ink | text \\| body |

> Quote

\`\`\`css
a { color: red }
\`\`\`
<!-- hidden -->
---`);
    assert.deepEqual(blocks.map((b) => b.kind), ['heading', 'paragraph', 'list', 'table', 'quote', 'code', 'rule']);
    const list = blocks[2] as Extract<(typeof blocks)[number], { kind: 'list' }>;
    assert.equal(list.items.length, 2);
    assert.equal(inlineText(list.items[0]!.children), 'one continued');
    assert.equal(list.items[1]!.sub?.kind, 'list');
    const table = blocks[3] as Extract<(typeof blocks)[number], { kind: 'table' }>;
    assert.equal(inlineText(table.rows[0]![1]!), 'text | body');
    assert.equal(table.align[1], 'center');
  });

  it('parses inline marks without HTML', () => {
    const runs = parseInline('a *b* __c__ [d](https://x.test) ![e](logo.svg) <b>f</b> snake_case_name');
    assert.deepEqual(runs.map((r) => r.kind), ['text', 'em', 'text', 'strong', 'text', 'link', 'text', 'image', 'text']);
    assert.equal(inlineText(runs.slice(-1)), ' <b>f</b> snake_case_name');
  });
});
