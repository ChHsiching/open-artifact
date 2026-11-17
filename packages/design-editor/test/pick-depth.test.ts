import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickDepth } from '../src/lib/pick-depth.ts';

describe('pickDepth', () => {
  it('takes the top level when nothing related is selected', () => {
    assert.equal(pickDepth(4, false, -1, -1, 'plain'), 0);
    // Under a single root, the level below it.
    assert.equal(pickDepth(4, true, -1, -1, 'plain'), 1);
    assert.equal(pickDepth(1, true, -1, -1, 'plain'), 0);
    assert.equal(pickDepth(0, false, -1, -1, 'plain'), -1);
  });

  it('keeps a selected element on the chain', () => {
    assert.equal(pickDepth(5, true, 2, 1, 'plain'), 2);
  });

  it('picks beside the selection at its level', () => {
    // Index 1 holds the selection, so its child on the chain is picked.
    assert.equal(pickDepth(5, true, -1, 1, 'plain'), 2);
    assert.equal(pickDepth(2, false, -1, 1, 'plain'), 1);
  });

  it('goes one level deeper on a double-click', () => {
    assert.equal(pickDepth(5, true, 2, 1, 'deeper'), 3);
    assert.equal(pickDepth(3, true, 2, 1, 'deeper'), 2);
    // Nothing selected on the chain: as a plain click.
    assert.equal(pickDepth(5, true, -1, -1, 'deeper'), 1);
  });

  it('takes the innermost element on a deep click', () => {
    assert.equal(pickDepth(5, true, -1, -1, 'deep'), 4);
  });

  it('goes on to the text under the pointer on a click', () => {
    const text = (...indexes: number[]) => (index: number) => indexes.includes(index);
    // root > section > card > paragraph: the paragraph, not the section.
    assert.equal(pickDepth(4, true, -1, -1, 'click', text(3)), 3);
    // The first text element on the way down wins.
    assert.equal(pickDepth(5, true, -1, -1, 'click', text(2, 4)), 2);
    // The level itself is text: kept.
    assert.equal(pickDepth(4, true, -1, -1, 'click', text(1, 3)), 1);
    // No text below: as a plain click.
    assert.equal(pickDepth(4, true, -1, -1, 'click', text()), 1);
    assert.equal(pickDepth(4, true, -1, -1, 'click'), 1);
    // Beside a selection: from the selection's level down.
    assert.equal(pickDepth(5, true, -1, 1, 'click', text(1, 4)), 4);
    assert.equal(pickDepth(0, false, -1, -1, 'click', text(0)), -1);
  });
});
