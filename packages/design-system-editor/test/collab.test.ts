import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { anchorLabel, openCount, parseAnchor, serializeAnchor, threadsByAnchor } from '../src/lib/comment-anchors.ts';
import { AGENT_COLOR, initials, peerColor, peerViews } from '../src/lib/peers.ts';

const thread = (anchor: string, status: 'open' | 'resolved' = 'open') => ({ anchor, status }) as never;

describe('comment anchors', () => {
  it('serializes with a stable key order and reads back', () => {
    const anchor = { name: 'ink', family: 'color', kind: 'token' as const };
    const text = serializeAnchor(anchor);
    assert.equal(text, '{"kind":"token","family":"color","name":"ink"}');
    assert.deepEqual(parseAnchor(text), { kind: 'token', name: 'ink', family: 'color' });
    assert.equal(serializeAnchor(null), '{}');
  });

  it('reads anything else as the whole system', () => {
    assert.equal(parseAnchor('{}'), null);
    assert.equal(parseAnchor('not json'), null);
    assert.equal(parseAnchor('{"kind":"element","name":"x"}'), null);
  });

  it('labels anchors', () => {
    assert.equal(anchorLabel({ kind: 'token', family: 'color', name: 'ink' }), 'Color ink');
    assert.equal(anchorLabel({ kind: 'style', name: 'body' }), 'Text style body');
    assert.equal(anchorLabel({ kind: 'section', name: 'assets/Logos' }), 'Asset group Logos');
    assert.equal(anchorLabel(null), 'Whole design system');
  });

  it('groups open threads by anchor', () => {
    const threads = [thread('{"kind":"style","name":"body"}'), thread('{"name":"body","kind":"style"}'), thread('{}', 'resolved')];
    const map = threadsByAnchor(threads);
    assert.equal(map.get('{"kind":"style","name":"body"}')?.length, 2);
    assert.equal(map.has('{}'), false);
    assert.equal(threadsByAnchor(threads, true).get('{}')?.length, 1);
    assert.equal(openCount(threads), 2);
  });
});

describe('peers', () => {
  it('drops self, colors stably and puts people first', () => {
    const views = peerViews(
      [
        { id: 'me', name: 'Me', kind: 'person', state: {} },
        { id: 'a', name: 'Agent', kind: 'agent', state: {} },
        { id: 'p', name: 'Pat Lee', kind: 'person', state: { viewContext: { section: 'colors', focus: { kind: 'token', name: 'ink' } } } },
      ],
      'me',
    );
    assert.deepEqual(
      views.map((v) => [v.id, v.color]),
      [
        ['p', peerColor('p')],
        ['a', AGENT_COLOR],
      ],
    );
    assert.deepEqual(views[0]!.where, { section: 'colors', focus: 'ink' });
    assert.equal(initials('Pat Lee'), 'PL');
  });
});
