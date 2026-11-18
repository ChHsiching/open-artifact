import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Block, DocState, Inline } from '@open-artifact/docs-core';
import { CHANGE_ID, compareVersions, diffSequences, hasChanges } from '../src/history/compare.ts';
import { previewDocOf } from '../src/history/preview-doc.ts';
import { copyMembers, copyName, safeTabName } from '../src/history/copy.ts';

let next = 0;
const chars = (text: string, sess = 'a'): Inline[] => Array.from(text).map(ch => ({ id: `${sess}.${++next}`, ch }));
const para = (id: string, text: string | Inline[]): Block => ({ id, type: 'paragraph', inline: typeof text === 'string' ? chars(text) : text });
const doc = (...blocks: Block[]): DocState => ({ rev: 1, blocks });

/** The compared doc as text: added words in [+…], dropped ones in [-…], whole blocks prefixed. */
function shown(state: DocState): string[] {
  const line = (block: Block): string => {
    const prefix = block.suggest?.id === CHANGE_ID ? (block.suggest.op === 'ins' ? '+ ' : '- ') : '';
    if (block.children) return prefix + block.children.map(line).join(' | ');
    let out = '';
    let open: string | null = null;
    for (const item of block.inline ?? []) {
      const op = item.suggest?.id === CHANGE_ID && !block.suggest ? item.suggest.op : null;
      if (op !== open) {
        if (open) out += ']';
        if (op) out += op === 'ins' ? '[+' : '[-';
        open = op;
      }
      out += 'ch' in item ? item.ch : '*';
    }
    if (open) out += ']';
    return prefix + out;
  };
  return state.blocks.map(line);
}

describe('comparing versions', () => {
  it('marks the words added and dropped inside a kept block', () => {
    const before = doc(para('p1', 'The quick fox'));
    const after = doc(para('p1', 'The slow brown fox'));
    assert.deepEqual(shown(compareVersions(before, after)), ['The [-quick][+slow brown] fox']);
  });

  it('marks blocks added and dropped, in place', () => {
    const before = doc(para('p1', 'one'), { id: 'hr', type: 'horizontalRule' }, para('p3', 'three'));
    const after = doc(para('p1', 'one'), para('p3', 'three'), para('p4', 'four'));
    assert.deepEqual(shown(compareVersions(before, after)), ['one', '- ', 'three', '+ four']);
  });

  it('reads a paragraph written over whole (new ids) as its changed words', () => {
    const before = doc(para('p1', 'keep'), para('p2', 'Ship on Friday'));
    const after = doc(para('p1', 'keep'), para('n9', 'Ship on Monday'));
    assert.deepEqual(shown(compareVersions(before, after)), ['keep', 'Ship on [-Fri][+Mon]day']);
  });

  it('shows an unrelated paragraph put in place of another as one dropped and one added', () => {
    const before = doc(para('p1', 'keep'), para('p2', 'Budget review'));
    const after = doc(para('p1', 'keep'), para('n9', 'Lunch at noon'));
    assert.deepEqual(shown(compareVersions(before, after)), ['keep', '- Budget review', '+ Lunch at noon']);
  });

  it('compares inside kept containers', () => {
    const item = (id: string, text: string): Block => ({ id, type: 'listItem', children: [para(`${id}p`, text)] });
    const before = doc({ id: 'l', type: 'list', attrs: { kind: 'bullet' }, children: [item('i1', 'a'), item('i2', 'b')] });
    const after = doc({ id: 'l', type: 'list', attrs: { kind: 'bullet' }, children: [item('i1', 'a'), item('i3', 'c'), item('i2', 'b!')] });
    assert.deepEqual(shown(compareVersions(before, after)), ['a | + + c | b[+!]']);
  });

  it('says when nothing changed', () => {
    const blocks = [para('p1', 'same')];
    assert.equal(hasChanges(compareVersions(doc(...blocks), doc(...blocks))), false);
    assert.equal(hasChanges(compareVersions(doc(...blocks), doc(para('p1', 'same!')))), true);
  });

  it('finds the longest common run', () => {
    const ops = diffSequences([...'abcdef'], [...'abxdeyf']).map(step => step.op[0]).join('');
    assert.equal(ops, 'ssdissis');
  });
});

describe('drawing a compared version', () => {
  it('turns the change marks into ranges and leaves no suggestion behind', () => {
    const compared = compareVersions(doc(para('p1', 'The quick fox'), para('p2', 'gone')), doc(para('p1', 'The slow fox')));
    const { doc: drawn, changes } = previewDocOf(compared);
    assert.equal(drawn.textContent, 'The quickslow foxgone');
    assert.deepEqual(
      changes.map(change => [change.op, change.block, drawn.textBetween(change.from, change.to)]),
      [
        ['del', false, 'quick'],
        ['ins', false, 'slow'],
        ['del', true, 'gone'],
        ['del', false, 'gone'],
      ],
    );
    let leftovers = 0;
    drawn.descendants(node => {
      if (node.attrs.suggestId || node.marks.some(mark => mark.type.name.startsWith('suggest'))) leftovers++;
    });
    assert.equal(leftovers, 0);
  });
});

describe('copying a version', () => {
  it('names the copy for its tab and time, as a tab name the doc takes', () => {
    assert.match(copyName('Plan', new Date(2026, 10, 18, 15, 4).toISOString(), 'en-US'), /^Plan \(version of Nov 18, 2026, 3:04\sPM\)$/);
    assert.equal(safeTabName(' a/b\tc '), 'a-b c');
    assert.equal(safeTabName('   '), 'Copy');
  });

  it('sends the blocks without their ids', () => {
    const members = copyMembers('Plan (copy)', doc(para('p1', 'Hello')));
    assert.equal(members.length, 2);
    assert.equal(JSON.stringify(members).includes('"bid"'), false);
    assert.equal(JSON.stringify(members).includes('p1'), false);
  });
});
