import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { autoMerge, mergeIndexText, mergeJsonValues, mergeTokensText } from '../src/lib/merge.ts';

const tokens = (colors: { name: string; value: unknown; usage?: string }[], extra: Record<string, unknown> = {}): string =>
  `${JSON.stringify({ color: { themes: [{ id: 'light', name: 'Light' }], tokens: colors }, ...extra }, null, 2)}\n`;

describe('mergeTokensText', () => {
  it('merges different tokens changed on each side', () => {
    const base = tokens([
      { name: 'ink', value: '#111111' },
      { name: 'paper', value: '#ffffff' },
    ]);
    const ours = tokens([
      { name: 'ink', value: '#111111', usage: 'Body text' },
      { name: 'paper', value: '#ffffff' },
    ]);
    const theirs = tokens([
      { name: 'ink', value: '#111111' },
      { name: 'paper', value: '#fafafa' },
      { name: 'accent', value: 'oklch(0.6 0.2 30)' },
    ]);
    const result = mergeTokensText(base, ours, theirs)!;
    assert.deepEqual(result.conflicts, []);
    const merged = JSON.parse(result.text) as { color: { tokens: { name: string; value: string; usage?: string }[] } };
    assert.deepEqual(merged.color.tokens, [
      { name: 'ink', value: '#111111', usage: 'Body text' },
      { name: 'paper', value: '#fafafa' },
      { name: 'accent', value: 'oklch(0.6 0.2 30)' },
    ]);
  });

  it('merges different fields of one token', () => {
    const base = tokens([{ name: 'ink', value: '#111111', usage: 'Text' }]);
    const ours = tokens([{ name: 'ink', value: '#111111', usage: 'Body text' }]);
    const theirs = tokens([{ name: 'ink', value: '#222222', usage: 'Text' }]);
    const merged = JSON.parse(mergeTokensText(base, ours, theirs)!.text) as { color: { tokens: unknown[] } };
    assert.deepEqual(merged.color.tokens, [{ name: 'ink', value: '#222222', usage: 'Body text' }]);
  });

  it('reports the same field changed differently', () => {
    const base = tokens([{ name: 'ink', value: '#111111' }]);
    const result = mergeTokensText(base, tokens([{ name: 'ink', value: '#000000' }]), tokens([{ name: 'ink', value: '#333333' }]))!;
    assert.deepEqual(result.conflicts, ['color.tokens[name=ink].value']);
  });

  it('keeps an entry one side added next to where it was added', () => {
    const base = tokens([
      { name: 'a', value: '#000000' },
      { name: 'c', value: '#000000' },
    ]);
    const ours = tokens([
      { name: 'a', value: '#000000' },
      { name: 'b', value: '#000000' },
      { name: 'c', value: '#000000' },
    ]);
    const theirs = tokens([
      { name: 'a', value: '#000000' },
      { name: 'c', value: '#111111' },
      { name: 'd', value: '#000000' },
    ]);
    const merged = JSON.parse(mergeTokensText(base, ours, theirs)!.text) as { color: { tokens: { name: string }[] } };
    assert.deepEqual(
      merged.color.tokens.map((t) => t.name),
      ['a', 'b', 'c', 'd'],
    );
  });

  it('deletes what one side deleted and the other left alone', () => {
    const base = tokens([
      { name: 'a', value: '#000000' },
      { name: 'b', value: '#000000' },
    ]);
    const ours = tokens([{ name: 'a', value: '#000000' }]);
    const theirs = tokens([
      { name: 'a', value: '#111111' },
      { name: 'b', value: '#000000' },
    ]);
    const merged = JSON.parse(mergeTokensText(base, ours, theirs)!.text) as { color: { tokens: unknown[] } };
    assert.deepEqual(merged.color.tokens, [{ name: 'a', value: '#111111' }]);
  });

  it('conflicts when one side deletes what the other changed', () => {
    const base = tokens([{ name: 'a', value: '#000000' }]);
    const result = mergeTokensText(base, tokens([]), tokens([{ name: 'a', value: '#111111' }]))!;
    assert.equal(result.conflicts.length, 1);
  });

  it('merges type styles and other families', () => {
    const type = (styles: Record<string, unknown>[]) => ({ type: { fonts: [], families: { sans: 'Inter, sans-serif' }, groups: [{ name: 'Body', styles }] } });
    const base = tokens([], type([{ name: 'body', fontSize: 16 }]));
    const ours = tokens([], type([{ name: 'body', fontSize: 16, usage: 'Paragraphs' }]));
    const theirs = tokens([], { ...type([{ name: 'body', fontSize: 17 }]), spacing: { tokens: [{ name: 'space-1', value: '4px' }] } });
    const result = mergeTokensText(base, ours, theirs)!;
    assert.deepEqual(result.conflicts, []);
    const merged = JSON.parse(result.text) as { type: { groups: { styles: unknown[] }[] }; spacing: unknown };
    assert.deepEqual(merged.type.groups[0]!.styles, [{ name: 'body', fontSize: 17, usage: 'Paragraphs' }]);
    assert.ok(merged.spacing);
  });

  it('returns null for invalid JSON', () => {
    assert.equal(mergeTokensText('{}', '{', '{}'), null);
  });
});

describe('mergeJsonValues', () => {
  it('conflicts on plain arrays changed differently', () => {
    assert.deepEqual(mergeJsonValues({ a: [1] }, { a: [1, 2] }, { a: [3] }).conflicts, ['a']);
  });

  it('keeps theirs where ours did not change', () => {
    assert.deepEqual(mergeJsonValues({ a: 1, b: 1 }, { a: 2, b: 1 }, { a: 1, b: 3 }).value, { a: 2, b: 3 });
  });
});

describe('mergeIndexText', () => {
  it('lets ours win a key both changed and merges asset groups by entry', () => {
    const base = JSON.stringify({ title: 'A', assetGroups: { Logos: { order: [] } } });
    const ours = JSON.stringify({ title: 'B', assetGroups: { Logos: { order: ['x.svg'] } } });
    const theirs = JSON.stringify({ title: 'C', assetGroups: { Logos: { order: [] }, Icons: { order: [] } } });
    const merged = JSON.parse(mergeIndexText(base, ours, theirs)!) as { title: string; assetGroups: Record<string, unknown> };
    assert.equal(merged.title, 'B');
    assert.deepEqual(Object.keys(merged.assetGroups), ['Logos', 'Icons']);
  });
});

describe('autoMerge', () => {
  it('routes by path', () => {
    assert.equal(autoMerge('README.md', 'a\nb\n', 'A\nb\n', 'a\nB\n'), 'A\nB\n');
    assert.equal(autoMerge('tokens.json', tokens([{ name: 'a', value: '#000000' }]), tokens([{ name: 'a', value: '#111111' }]), tokens([{ name: 'a', value: '#222222' }])), null);
    assert.equal(autoMerge('components/Button/README.md', 'x\n', 'y\n', 'z\n'), null);
  });
});
