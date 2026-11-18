import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { feedColumn, newestFocus, unfeedColumn, useMarginColumn } from '../src/margin/column.ts';
import { markerRows } from '../src/margin/stack.ts';

describe('margin column', () => {
  it('the newest wish whose card is in the column wins', () => {
    const present = (id: string) => id !== 'gone';
    assert.equal(newestFocus([['a', 1], ['b', 5], [null, 9]], present), 'b');
    assert.equal(newestFocus([['a', 1], ['gone', 5]], present), 'a');
    assert.equal(newestFocus([[null, 1]], present), null);
  });

  it('a feed keeps when its focus began until the focus changes', () => {
    feedColumn('test', [], 'x');
    const first = useMarginColumn.getState().feeds.test!.focusedAt;
    feedColumn('test', [], 'x');
    assert.equal(useMarginColumn.getState().feeds.test!.focusedAt, first);
    unfeedColumn('test');
    assert.equal(useMarginColumn.getState().feeds.test, undefined);
  });
});

describe('markerRows', () => {
  it('shares one marker among the cards that start on about the same line', () => {
    const rows = markerRows([
      { id: 'c', top: 140 },
      { id: 'a', top: 20 },
      { id: 'b', top: 26 },
    ]);
    assert.deepEqual(rows, [
      { top: 20, ids: ['a', 'b'] },
      { top: 140, ids: ['c'] },
    ]);
  });
});
