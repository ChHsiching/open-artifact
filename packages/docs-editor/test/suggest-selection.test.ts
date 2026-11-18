import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type DocState, applyOps, isAtom } from '@open-artifact/docs-core';
import type { Node as PMNode } from 'prosemirror-model';
import { pmDocOf } from '../src/editor/binding.ts';
import { firstPosOf, rangesOf, touchesSuggestion } from '../src/suggest/positions.ts';
import { refusalOf, targetsOf } from '../src/suggest/selection.ts';

const session = { sess: 's1', next: 1 };
const info = { by: 'agent', at: '2026-11-18T00:00:00Z', via: 'agent' };

function docOf(markdown: string): DocState {
  const doc: DocState = { rev: 0, blocks: [{ id: 's0.0', type: 'paragraph', inline: [] }] };
  return applyOps(doc, [{ op: 'replace', target: { kind: 'blocks', ids: ['s0.0'] }, with: { as: 'markdown', from: { kind: 'inline', content: markdown } } }], session).doc;
}

/** The editor positions of `words`, the first time they appear. */
function rangeOf(pm: PMNode, words: string): { from: number; to: number } {
  let out: { from: number; to: number } | null = null;
  pm.descendants((node, pos) => {
    if (out || !node.isText) return !out;
    const at = node.text!.indexOf(words);
    if (at >= 0) out = { from: pos + at, to: pos + at + words.length };
    return false;
  });
  if (!out) throw new Error(`no ${words}`);
  return out;
}

describe('the words Edit with Agent takes', () => {
  const doc = docOf('# Plan 😀\n\nThe quick brown fox.\n\n- one item\n\n```\ncode\n```');
  const pm = pmDocOf(doc);

  it('names the block and its first and last char', () => {
    const { from, to } = rangeOf(pm, 'quick brown');
    const [target, ...rest] = targetsOf(pm, from, to, doc);
    assert.equal(rest.length, 0);
    const block = doc.blocks[1]!;
    const chars = block.inline!.filter(item => !isAtom(item));
    assert.equal(target!.block, block.id);
    assert.equal(target!.fromChar, chars[4]!.id);
    assert.equal(target!.toChar, chars[14]!.id);
    assert.equal(target!.text, 'quick brown');
  });

  it('counts code points, not UTF-16 units', () => {
    const { from } = rangeOf(pm, 'Plan');
    const heading = doc.blocks[0]!;
    const [target] = targetsOf(pm, from, from + 'Plan 😀'.length, doc);
    assert.equal(target!.text, 'Plan 😀');
    assert.equal(target!.toChar, heading.inline!.at(-1)!.id);
  });

  it('takes one range per block across blocks', () => {
    const from = rangeOf(pm, 'brown').from;
    const to = rangeOf(pm, 'one').to;
    const targets = targetsOf(pm, from, to, doc);
    assert.deepEqual(
      targets.map(target => target.text),
      ['brown fox.', 'one'],
    );
  });

  it('takes paragraphs, headings and list items, not code', () => {
    const words = rangeOf(pm, 'quick');
    assert.equal(refusalOf(pm, words.from, words.to), null);
    const item = rangeOf(pm, 'one item');
    assert.equal(refusalOf(pm, item.from, item.to), null);
    const code = rangeOf(pm, 'code');
    assert.equal(refusalOf(pm, code.from, code.to), 'Select only paragraphs, headings, list items, or quotes to edit with Agent.');
  });
});

describe('a suggestion in the editor', () => {
  const base = docOf('The quick fox.');
  const chars = base.blocks[0]!.inline!;
  const doc = applyOps(base, [{ op: 'replace', target: { kind: 'chars', range: [chars[4]!.id, chars[8]!.id] }, with: { as: 'markdown', from: { kind: 'inline', content: 'slow' } } }], session, {
    suggest: { id: 'sg1', info },
  }).doc;
  const pm = pmDocOf(doc);

  it('is found by its words', () => {
    const quick = rangeOf(pm, 'quick');
    assert.equal(firstPosOf(pm, 'sg1'), quick.from);
    assert.deepEqual(rangesOf(pm, 'sg1'), [{ from: quick.from, to: quick.from + 'quickslow'.length, block: false }]);
  });

  it('keeps Edit with Agent off its words', () => {
    const quick = rangeOf(pm, 'quick');
    assert.equal(touchesSuggestion(pm, quick.from, quick.to), true);
    assert.equal(refusalOf(pm, quick.from, quick.to), 'Agent can’t edit this text. Select other text to edit with Agent.');
    const the = rangeOf(pm, 'The');
    assert.equal(touchesSuggestion(pm, the.from, the.to), false);
  });
});
