import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rectOf } from '../src/edit/geometry.ts';
import { choosePieceToolbarSide, pieceToolbarFits, pieceToolbarInset, placePieceToolbar, type PieceToolbarLayout } from '../src/edit/toolbar-place.ts';

const room = { left: 0, top: 0, width: 800, height: 600 };
const layout = (top: number, left = 100): PieceToolbarLayout => ({ box: rectOf({ left, top, width: 200, height: 40 }), room, width: 160, height: 36, line: 20, inset: 0 });

describe('piece toolbar placement', () => {
  it('sits above the piece when there is room', () => {
    assert.deepEqual(placePieceToolbar('above', layout(200)), { left: 100, top: 156 });
    assert.equal(choosePieceToolbarSide(layout(200), null, true, null, () => []), 'above');
  });

  it('goes under words near the top of the room', () => {
    assert.equal(pieceToolbarFits('above', layout(10)), false);
    assert.equal(choosePieceToolbarSide(layout(10), null, true, null, () => []), 'under');
  });

  it('keeps a side while it still fits', () => {
    assert.equal(choosePieceToolbarSide(layout(200), 'under', true, null, () => []), 'under');
  });

  it('stays inside the room and avoids the pointer', () => {
    assert.equal(placePieceToolbar('above', layout(200, 760)).left, 800 - 6 - 160);
    const side = choosePieceToolbarSide(layout(200), null, false, { x: 120, y: 170 }, () => []);
    assert.notEqual(side, 'above');
  });

  it('starts under the click, inside the box', () => {
    const box = rectOf({ left: 100, top: 0, width: 300, height: 20 });
    assert.equal(pieceToolbarInset(null, box, 160), 0);
    assert.equal(pieceToolbarInset(200, box, 160), 76);
    assert.equal(pieceToolbarInset(390, box, 160), 140);
  });
});
