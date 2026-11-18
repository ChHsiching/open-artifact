import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type DocState, applyOps } from '@open-artifact/docs-core';
import { AGENT_COLOR, type PeerView } from '@open-artifact/editor-kit';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { pmDocOf } from '../src/editor/binding.ts';
import type { AgentPresenceState } from '../src/presence/agent-presence.ts';
import { AGENT_ENTRY, peopleHere, peopleOnTab } from '../src/presence/people.ts';
import { type DocsPresence, agentCaretOf, blockRange, parseDocsPresence, rangeOf, selectionPlaces } from '../src/presence/places.ts';

const mine = { sess: 's1', next: 1 };
const theirs = { sess: 's2', next: 1 };

function startDoc(markdown: string): DocState {
  const doc: DocState = { rev: 0, blocks: [{ id: 's0.0', type: 'paragraph', inline: [] }] };
  return applyOps(doc, [{ op: 'replace', target: { kind: 'blocks', ids: ['s0.0'] }, with: { as: 'markdown', from: { kind: 'inline', content: markdown } } }], mine).doc;
}

const textOf = (doc: DocState, block: number) => (doc.blocks[block]!.inline ?? []).map(item => ('ch' in item ? item.ch : '')).join('');

/** Position in `pm` of character `offset` of top-level text block `block`. */
function at(doc: DocState, block: number, offset: number): number {
  const pm = pmDocOf(doc);
  let pos = 0;
  for (let i = 0; i < block; i++) pos += pm.child(i).nodeSize;
  return pos + 1 + offset;
}

describe('presence places', () => {
  it('names a selection by character ids, which still point at the same words after a concurrent edit', () => {
    let doc = startDoc('Hello world\n\nSecond line');
    assert.equal(textOf(doc, 0), 'Hello world');
    const pm = pmDocOf(doc);
    const selection = TextSelection.create(pm, at(doc, 0, 6), at(doc, 0, 11));
    const places = selectionPlaces(pm, doc, selection);
    assert.ok(places.sel);
    assert.equal(places.node, null);

    // Someone types at the start of the paragraph: the same words move right.
    const first = doc.blocks[0]!.inline![0]!.id;
    doc = applyOps(doc, [{ op: 'insert', target: { kind: 'chars', range: [first, first] }, side: 'before', with: { as: 'markdown', from: { kind: 'inline', content: 'Oh,' } } }], theirs).doc;
    assert.equal(textOf(doc, 0), 'Oh,Hello world');
    const after = pmDocOf(doc);
    const range = rangeOf(after, doc, places.sel);
    assert.ok(range);
    assert.equal(after.textBetween(range.from, range.to), 'world');
    assert.equal(range.head, at(doc, 0, 14));
  });

  it('falls back to the caret drawn last, then to its block, when its character is not there', () => {
    const doc = startDoc('Hello world');
    const pm = pmDocOf(doc);
    const bid = doc.blocks[0]!.id;
    const missing = { bid, after: 'zz.9' };
    assert.deepEqual(rangeOf(pm, doc, { anchor: missing, head: missing }, 4), { from: 4, to: 4, head: 4 });
    assert.deepEqual(rangeOf(pm, doc, { anchor: missing, head: missing }), { from: 1, to: 1, head: 1 });
    assert.equal(rangeOf(pm, doc, { anchor: { bid: 'gone', after: null }, head: { bid: 'gone', after: null } }), null);
  });

  it('names a selected block by its id', () => {
    const doc = startDoc('Above\n\n---\n\nBelow');
    const pm = pmDocOf(doc);
    let rulePos = -1;
    pm.forEach((node, offset) => {
      if (node.type.name === 'horizontalRule') rulePos = offset;
    });
    assert.ok(rulePos >= 0);
    const places = selectionPlaces(pm, doc, NodeSelection.create(pm, rulePos));
    assert.equal(places.sel, null);
    assert.ok(places.node);
    assert.deepEqual(blockRange(pm, places.node), { from: rulePos, to: rulePos + 1 });
  });

  it('puts the agent’s caret at the end of the last text block it changed', () => {
    const doc = startDoc('One\n\nTwo\n\nThree');
    const pm = pmDocOf(doc);
    const ids = doc.blocks.map(block => block.id);
    assert.equal(agentCaretOf(pm, [ids[1]!, ids[0]!]), at(doc, 1, 3));
    assert.equal(agentCaretOf(pm, ['unknown']), null);
    assert.equal(agentCaretOf(pm, []), null);
  });

  it('reads a peer’s value and drops what is malformed', () => {
    const place = { bid: 'b1', after: 'c1' };
    assert.deepEqual(parseDocsPresence({ who: 'u1', tab: 't1', sel: { anchor: place, head: place }, node: null, color: { c: '#DC3C3D', t: 5 } }), {
      who: 'u1',
      tab: 't1',
      sel: { anchor: place, head: place },
      node: null,
      color: { c: '#dc3c3d', t: 5 },
    });
    const bad = parseDocsPresence({ who: 7, tab: 'x'.repeat(500), sel: { anchor: { bid: 3 }, head: { bid: 'b', after: 9 } }, node: {}, color: { c: 'red', t: 1 } });
    assert.deepEqual(bad, { who: null, tab: null, sel: null, node: null, color: null });
    const caretOnly = parseDocsPresence({ sel: { head: { bid: 'b' } } });
    assert.deepEqual(caretOnly.sel, { anchor: { bid: 'b', after: null }, head: { bid: 'b', after: null } });
  });
});

describe('the people here', () => {
  const peer = (id: string, name: string, state: Partial<DocsPresence> | null, kind: 'person' | 'agent' = 'person'): PeerView<DocsPresence> => ({
    id,
    name,
    kind,
    color: '#000000',
    cursor: null,
    state: state ? { who: null, tab: null, sel: null, node: null, color: null, ...state } : null,
  });
  const idle: AgentPresenceState = { available: false, busy: false, name: 'Agent', wrote: null };

  it('shows each person once, leaves this person’s other pages out, and wears the color they claimed', () => {
    const peers = [
      peer('p1', 'Ana', { who: 'ana', tab: 't1', color: { c: '#019c7f', t: 1 } }),
      peer('p2', 'Ana', { who: 'ana', tab: 't2' }),
      peer('p3', 'Me', { who: 'me', tab: 't1' }),
      peer('p4', 'Bo', { who: 'bo', tab: 't2' }),
    ];
    const people = peopleHere(peers, idle, 'me');
    assert.deepEqual(
      people.map(person => [person.id, person.name, person.tab]),
      [
        ['p1', 'Ana', 't1'],
        ['p4', 'Bo', 't2'],
      ],
    );
    assert.equal(people[0]!.color, '#019c7f');
    assert.deepEqual(peopleOnTab(people, 't2').map(person => person.name), ['Bo']);
  });

  it('shows the agent idle while it can be asked, and on the tab it writes in while it writes', () => {
    assert.deepEqual(peopleHere([], idle, null), []);
    const resting = peopleHere([], { ...idle, available: true }, null);
    assert.deepEqual(resting.map(person => [person.id, person.kind, person.active]), [[AGENT_ENTRY, 'agent', false]]);
    assert.deepEqual(peopleOnTab(resting, 't1'), []);
    const writing = peopleHere([], { ...idle, available: true, busy: true, wrote: { tab: 't1', blocks: ['b1'], at: 1 } }, null);
    assert.equal(writing[0]!.color, AGENT_COLOR);
    assert.deepEqual(peopleOnTab(writing, 't1').map(person => person.id), [AGENT_ENTRY]);
  });
});
