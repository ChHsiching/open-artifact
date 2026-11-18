import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Node as PMNode } from 'prosemirror-model';
import { EditorState, NodeSelection, type Selection, TextSelection } from 'prosemirror-state';
import { bodyToTitle, lineBelowPlaceholder, titleToBody } from '../src/editor/commands.ts';
import { schema } from '../src/editor/schema.ts';

const { nodes } = schema;
const para = (text = '', heading: number | null = null) => nodes.paragraph!.create({ heading }, text ? schema.text(text) : null);
const doc = (...blocks: PMNode[]) => nodes.doc!.create(null, blocks);

function run(command: typeof titleToBody, state: EditorState): EditorState | null {
  let next: EditorState | null = null;
  command(state, tr => (next = state.apply(tr)));
  return next;
}

const at = (d: PMNode, select: (d: PMNode) => Selection) => EditorState.create({ doc: d, selection: select(d) });

describe('moving between the title and the body', () => {
  it('Tab at the title goes to the start of the next block', () => {
    const state = at(doc(para('Plan', 1), para('Body')), d => TextSelection.create(d, 3));
    const next = run(titleToBody, state)!;
    assert.equal(next.selection.$from.parent.textContent, 'Body');
    assert.equal(next.selection.$from.parentOffset, 0);
  });

  it('Tab in a title-only doc makes the first line', () => {
    const next = run(titleToBody, at(doc(para('Plan', 1)), d => TextSelection.create(d, 5)))!;
    assert.equal(next.doc.childCount, 2);
    assert.equal(next.selection.$from.index(0), 1);
  });

  it('Tab elsewhere, or with a range selected, is left to the other keys', () => {
    assert.equal(run(titleToBody, at(doc(para('Plan'), para('Body')), d => TextSelection.create(d, 2))), null);
    assert.equal(run(titleToBody, at(doc(para('Plan', 1), para('Body')), d => TextSelection.create(d, 1, 3))), null);
  });

  it('Shift-Tab at the start of the first body line goes back to the title’s end', () => {
    const state = at(doc(para('Plan', 1), para('Body')), d => TextSelection.create(d, 7));
    const next = run(bodyToTitle, state)!;
    assert.equal(next.selection.from, 5);
    assert.equal(run(bodyToTitle, at(state.doc, d => TextSelection.create(d, 8))), null);
  });
});

describe('a selected placeholder', () => {
  it('Enter makes an empty line below it with the caret there', () => {
    const d = doc(para('Intro'), nodes.pending!.create({ intent: 'Goals' }), para('End'));
    const next = run(lineBelowPlaceholder, at(d, d => NodeSelection.create(d, 7)))!;
    assert.deepEqual(
      next.doc.children.map(node => node.type.name),
      ['paragraph', 'pending', 'paragraph', 'paragraph'],
    );
    assert.equal(next.selection.$from.index(0), 2);
    assert.equal(next.selection.$from.parent.textContent, '');
  });

  it('Enter with anything else selected does nothing here', () => {
    assert.equal(run(lineBelowPlaceholder, at(doc(para('Intro')), d => TextSelection.create(d, 2))), null);
  });
});
