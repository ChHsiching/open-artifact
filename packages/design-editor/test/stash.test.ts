import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildStash, readStash, STASH_KEEP_MS, stashDiff, stashPrompt } from '../src/lib/stash.ts';

const NOW = 1_700_000_000_000;

describe('unsaved-edit stash', () => {
  const input = {
    title: 'Landing',
    canvasText: '{"v":1,"a":2}',
    canvasSavedText: '{"v":1}',
    boards: { 'A.dc.html': { source: 'A2', saved: 'A1' }, 'B.dc.html': { source: 'B', saved: 'B' }, 'C.dc.html': { source: null, saved: 'C' } },
  };

  it('copies only what differs from the saved files', () => {
    assert.deepEqual(buildStash(input, NOW), { v: 1, at: NOW, title: 'Landing', canvas: '{"v":1,"a":2}', boards: { 'A.dc.html': 'A2' } });
    assert.equal(buildStash({ ...input, canvasText: input.canvasSavedText, boards: { 'B.dc.html': { source: 'B', saved: 'B' } } }, NOW), null);
  });

  it('validates what it reads back', () => {
    const stash = buildStash(input, NOW)!;
    assert.deepEqual(readStash(JSON.parse(JSON.stringify(stash))), stash);
    assert.equal(readStash({ v: 2, at: 1, boards: {} }), null);
    assert.equal(readStash({ v: 1, at: 1, boards: { a: 3 } }), null);
    assert.equal(readStash('nope'), null);
  });

  it('offers a stash only when it would change the loaded design', () => {
    const stash = buildStash(input, NOW)!;
    assert.deepEqual(stashDiff(stash, { canvasText: '{"v":1}', boards: { 'A.dc.html': 'A1' } }, NOW + 1000), { canvas: true, boards: ['A.dc.html'] });
    // Saved after all (same JSON, other spacing / key order).
    assert.equal(stashDiff(stash, { canvasText: '{ "a": 2, "v": 1 }', boards: { 'A.dc.html': 'A2' } }, NOW), null);
    // Too old.
    assert.equal(stashDiff(stash, { canvasText: '{}', boards: {} }, NOW + STASH_KEEP_MS + 1), null);
  });

  it('asks about the artboard or the design', () => {
    const title = (path: string) => path.replace('.dc.html', '');
    assert.equal(stashPrompt({ canvas: false, boards: ['A.dc.html'] }, 'Landing', title), 'Restore your unsaved changes to A?');
    assert.equal(stashPrompt({ canvas: true, boards: ['A.dc.html'] }, 'Landing', title), 'Restore your unsaved changes to Landing?');
    assert.equal(stashPrompt({ canvas: true, boards: [] }, '', title), 'Restore your unsaved changes to this design?');
  });
});

describe('stash storage', () => {
  it('round-trips through a Storage and survives a throwing one', async () => {
    const { stashStorage } = await import('../src/lib/stash.ts');
    const map = new Map<string, string>();
    const fake = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) } as unknown as Storage;
    const store = stashStorage('k', () => fake);
    const stash = { v: 1 as const, at: NOW, title: 'T', boards: { 'A.dc.html': 'x' } };
    store.write(stash);
    assert.deepEqual(store.read(), stash);
    store.write(null);
    assert.equal(store.read(), null);
    const broken = stashStorage('k', () => {
      throw new Error('blocked');
    });
    broken.write(stash);
    assert.equal(broken.read(), null);
  });
});
