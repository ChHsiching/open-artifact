import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CARD_DRAG_THRESHOLD, clampToViewport, collectDropMarks, findCardDrops, findNearestDrop, hoverDwell, isContextMenuKey } from '../src/edit/drops.ts';
import { rectOf } from '../src/edit/geometry.ts';

const column = [rectOf({ left: 0, top: 0, width: 100, height: 40 }), rectOf({ left: 0, top: 50, width: 100, height: 40 }), rectOf({ left: 0, top: 100, width: 100, height: 40 })];
const grid = [rectOf({ left: 0, top: 0, width: 100, height: 40 }), rectOf({ left: 110, top: 0, width: 100, height: 40 }), rectOf({ left: 0, top: 50, width: 100, height: 40 })];

describe('card drops', () => {
  it('drops between cards in a column, with the dragged card taken out', () => {
    const drops = findCardDrops(column, 1, 10);
    assert.equal(drops.kind, 'gap');
    assert.equal(drops.boxes.length, 3);
    assert.deepEqual(
      drops.boxes.map((box) => box.top),
      [-6, 69, 144],
    );
  });

  it('drops onto cells when cards sit side by side', () => {
    const drops = findCardDrops(grid, 0, 10);
    assert.equal(drops.kind, 'cell');
    assert.equal(drops.boxes.length, 3);
  });

  it('picks the nearest drop along the pointer row', () => {
    assert.equal(findNearestDrop(grid, 150, 20, 8), 1);
    assert.equal(findNearestDrop(grid, 20, 70, 8), 2);
    assert.equal(findNearestDrop([], 0, 0, 8), null);
  });

  it('shows the parent extent unless it fills the view, and lights the landing drop', () => {
    const drops = findCardDrops(grid, 0, 10);
    const marks = collectDropMarks(rectOf({ left: 0, top: 0, width: 210, height: 90 }), { top: -100, height: 400 }, drops, 0, 2);
    assert.equal(marks[0]?.kind, 'extent');
    assert.equal(marks.filter((mark) => mark.land).length, 1);
    const full = collectDropMarks(rectOf({ left: 0, top: -50, width: 210, height: 500 }), { top: 0, height: 300 }, drops, 0, null);
    assert.ok(full.every((mark) => mark.kind === 'cell'));
  });

  it('keeps things inside the view and knows the menu keys', () => {
    assert.equal(clampToViewport(-20, 50, 0, 300), 8);
    assert.equal(clampToViewport(290, 50, 0, 300), 242);
    assert.equal(isContextMenuKey({ key: 'F10', shiftKey: true }), true);
    assert.equal(isContextMenuKey({ key: 'F10', shiftKey: false }), false);
    assert.equal(isContextMenuKey({ key: 'ContextMenu', shiftKey: false }), true);
    assert.ok(hoverDwell(true) > hoverDwell(false));
    assert.equal(CARD_DRAG_THRESHOLD, 8);
  });
});
