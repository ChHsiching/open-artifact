/**
 * Tests of how a one-finger touch press on the board decides what it is:
 * a pan, a drag of what is selected, picking an item up on a long press,
 * or a tap.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TOUCH_MOVE_SLOP_PX, movedPastTouchSlop, reduceTouchPress, type TouchPress } from '../src/tools/touch.ts';

const at = (x: number, y: number) => ({ x, y });
const press = (overrides: Partial<TouchPress> = {}): TouchPress => ({ start: at(100, 100), selected: false, popped: false, ...overrides });

describe('touch press', () => {
  it('counts movement across plus down against the slop', () => {
    assert.equal(movedPastTouchSlop(at(0, 0), at(4, 4)), false);
    assert.equal(movedPastTouchSlop(at(0, 0), at(5, 4)), true);
    assert.equal(movedPastTouchSlop(at(0, 0), at(TOUCH_MOVE_SLOP_PX, 0)), true);
  });

  it('waits inside the slop, then pans on an unselected item or empty board', () => {
    assert.deepEqual(reduceTouchPress(press(), { kind: 'move', at: at(103, 103) }), { press: press(), outcome: 'none' });
    assert.deepEqual(reduceTouchPress(press(), { kind: 'move', at: at(120, 100) }), { press: null, outcome: 'pan' });
  });

  it('drags an item that was already selected', () => {
    assert.equal(reduceTouchPress(press({ selected: true }), { kind: 'move', at: at(120, 100) }).outcome, 'drag');
  });

  it('picks the item up on a hold, then drags it', () => {
    const held = reduceTouchPress(press(), { kind: 'hold' });
    assert.equal(held.outcome, 'pop');
    assert.equal(held.press?.popped, true);
    assert.equal(reduceTouchPress(held.press!, { kind: 'hold' }).outcome, 'none');
    assert.equal(reduceTouchPress(held.press!, { kind: 'move', at: at(101, 101) }).outcome, 'none');
    assert.equal(reduceTouchPress(held.press!, { kind: 'move', at: at(130, 100) }).outcome, 'drag');
  });

  it('taps on a quick release, and leaves a held release to the context menu', () => {
    assert.equal(reduceTouchPress(press(), { kind: 'up' }).outcome, 'tap');
    assert.equal(reduceTouchPress(press({ popped: true }), { kind: 'up' }).outcome, 'none');
    assert.equal(reduceTouchPress(press(), { kind: 'cancel' }).outcome, 'cancel');
  });
});
