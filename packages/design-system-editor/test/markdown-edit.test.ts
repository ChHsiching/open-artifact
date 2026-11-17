import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyBlock, applyInline, continueOnEnter, indentList } from '../src/lib/markdown-edit.ts';

const at = (text: string, start: number, end = start) => ({ text, start, end });

describe('applyInline', () => {
  it('wraps and unwraps the selection', () => {
    const bold = applyInline(at('make it bold', 8, 12), 'bold');
    assert.deepEqual(bold, at('make it **bold**', 10, 14));
    assert.deepEqual(applyInline(bold, 'bold'), at('make it bold', 8, 12));
    assert.deepEqual(applyInline(at('a **b** c', 2, 7), 'bold'), at('a b c', 2, 3));
  });

  it('inserts empty marks at a caret', () => {
    assert.deepEqual(applyInline(at('x', 1), 'code'), at('x``', 2));
  });

  it('makes a link with the URL selected', () => {
    const link = applyInline(at('see docs', 4, 8), 'link');
    assert.equal(link.text, 'see [docs](https://)');
    assert.equal(link.text.slice(link.start, link.end), 'https://');
  });
});

describe('applyBlock', () => {
  it('toggles headings and bullets on the selected lines', () => {
    assert.equal(applyBlock(at('Title\nbody', 2), 'h2').text, '## Title\nbody');
    assert.equal(applyBlock(at('## Title', 4), 'h2').text, 'Title');
    assert.equal(applyBlock(at('## Title', 4), 'h1').text, '# Title');
    assert.equal(applyBlock(at('a\nb\n\nc', 0, 6), 'bullet').text, '- a\n- b\n\n- c');
    assert.equal(applyBlock(at('- a\n- b', 0, 7), 'bullet').text, 'a\nb');
  });

  it('numbers lists and swaps list kinds', () => {
    assert.equal(applyBlock(at('a\nb', 0, 3), 'number').text, '1. a\n2. b');
    assert.equal(applyBlock(at('- a\n- b', 0, 7), 'number').text, '1. a\n2. b');
    assert.equal(applyBlock(at('- a', 0, 3), 'task').text, '- [ ] a');
  });
});

describe('continueOnEnter', () => {
  it('continues bullets, numbers, tasks and quotes', () => {
    assert.deepEqual(continueOnEnter(at('- one', 5)), at('- one\n- ', 8));
    assert.deepEqual(continueOnEnter(at('  3. three', 10)), at('  3. three\n  4. ', 16));
    assert.equal(continueOnEnter(at('- [x] done', 10))!.text, '- [x] done\n- [ ] ');
    assert.equal(continueOnEnter(at('> said', 6))!.text, '> said\n> ');
  });

  it('ends the list on an empty item, and leaves plain lines alone', () => {
    assert.deepEqual(continueOnEnter(at('- one\n- ', 8)), at('- one\n', 6));
    assert.equal(continueOnEnter(at('plain', 5)), null);
    assert.equal(continueOnEnter(at('- one two', 5)), null);
  });
});

describe('indentList', () => {
  it('indents and outdents list lines only', () => {
    assert.deepEqual(indentList(at('- a\n- b', 6), false), at('- a\n  - b', 8));
    assert.deepEqual(indentList(at('  - b', 4), true), at('- b', 2));
    assert.equal(indentList(at('text', 1), false), null);
  });
});
