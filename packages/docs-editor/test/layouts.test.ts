import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EditorState } from 'prosemirror-state';
import { calloutKind } from '../src/callout/callout.ts';
import { schema } from '../src/editor/schema.ts';
import { LAYOUTS, applyLayout, bodyIsEmpty, layoutById, layoutDate, layoutHintDecorations } from '../src/layouts/layouts.ts';
import { looksLikeMarkdown, markdownSlice } from '../src/paste/paste.ts';

const { nodes } = schema;
const p = (text?: string, heading?: number) => nodes.paragraph!.create(heading ? { heading } : null, text ? schema.text(text) : null);
const stateOf = (...blocks: ReturnType<typeof p>[]) => EditorState.create({ schema, doc: nodes.doc!.create(null, blocks) });

describe('layouts', () => {
  it('has the twelve layouts in order', () => {
    assert.deepEqual(
      LAYOUTS.map(layout => layout.title),
      ['Meeting notes', 'Project plan', 'Report', 'Proposal', 'Status update', 'Spec', 'How-to guide', 'Process doc', 'Project brief', 'Study guide', 'Résumé', 'Project recap'],
    );
  });

  it('offers them only while nothing is under the title', () => {
    assert.equal(bodyIsEmpty(stateOf(p()).doc), true);
    assert.equal(bodyIsEmpty(stateOf(p('Title', 1), p()).doc), true);
    assert.equal(bodyIsEmpty(stateOf(p('Title', 1), p('words')).doc), false);
    assert.equal(bodyIsEmpty(stateOf(p('Title', 1), p(), p()).doc), false);
  });

  it('lays one out under the title, naming an empty title, with the caret on the first empty line', () => {
    const state = stateOf(p(), p());
    const tr = applyLayout(state, layoutById('meeting_notes')!, new Date(2026, 10, 18))!;
    const doc = tr.doc;
    assert.equal(doc.firstChild!.attrs.heading, 1);
    assert.equal(doc.firstChild!.textContent, 'Meeting notes');
    assert.equal(doc.child(1).textContent, 'November 18, 2026');
    assert.equal(doc.child(2).attrs.heading, 2);
    assert.equal(doc.child(2).textContent, 'Attendees');
    assert.equal(doc.lastChild!.type, nodes.list);
    assert.equal(doc.lastChild!.attrs.kind, 'check');
    assert.equal(tr.selection.$from.parent.content.size, 0);
    assert.equal(tr.selection.$from.index(0), 3);
  });

  it('keeps a title that has words, and builds a table with a header row', () => {
    const tr = applyLayout(stateOf(p('Launch', 1), p()), layoutById('project_plan')!)!;
    assert.equal(tr.doc.firstChild!.textContent, 'Launch');
    let table = null as null | ReturnType<typeof p>;
    tr.doc.forEach(node => {
      if (node.type === nodes.table) table = node;
    });
    assert.ok(table);
    assert.equal(table!.childCount, 4);
    assert.equal(table!.firstChild!.firstChild!.attrs.header, true);
    assert.equal(table!.firstChild!.textContent, 'MilestoneOwnerDate');
  });

  it('shows the hints under its headings while their lines are empty', () => {
    const tr = applyLayout(stateOf(p(), p()), layoutById('report')!)!;
    const hints = layoutHintDecorations(tr.doc).map(deco => (deco as unknown as { type: { attrs: Record<string, string> } }).type.attrs['data-layout-hint']);
    assert.deepEqual(hints, ['The main finding, in two or three sentences', 'What prompted this and what you looked at', 'First finding', 'What to do next']);
  });

  it('writes the date the way the layout row does', () => {
    assert.equal(layoutDate(new Date(2026, 0, 5)), 'January 5, 2026');
  });
});

describe('callouts', () => {
  const quote = (text: string) => nodes.blockquote!.create(null, p(text));
  it('reads the kind from the emoji the quote starts with', () => {
    assert.deepEqual(calloutKind(quote('ℹ️ Note')), { kind: 'info', emoji: 'ℹ️', leadLen: 3 });
    assert.equal(calloutKind(quote('✅ Done'))!.kind, 'success');
    assert.equal(calloutKind(quote('⚠️Careful'))!.kind, 'warning');
    assert.equal(calloutKind(quote('Plain quote')), null);
    assert.equal(calloutKind(p('ℹ️ not a quote')), null);
  });
});

describe('pasting markdown', () => {
  it('knows Markdown from plain lines', () => {
    assert.equal(looksLikeMarkdown('# Title\n\nText'), true);
    assert.equal(looksLikeMarkdown('- one\n- two'), true);
    assert.equal(looksLikeMarkdown('see **this**'), true);
    assert.equal(looksLikeMarkdown('just a sentence'), false);
    assert.equal(looksLikeMarkdown('- one line'), false);
  });

  it('turns it into blocks', () => {
    const slice = markdownSlice('## Plan\n\n- one\n- two\n\n> ℹ️ Heads up')!;
    const types: string[] = [];
    slice.content.forEach(node => types.push(`${node.type.name}${node.attrs.heading ? node.attrs.heading : ''}`));
    assert.deepEqual(types, ['paragraph2', 'list', 'blockquote']);
  });
});
