/**
 * Tests of what the build show replays of an element the agent wrote.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BoardElement } from '@open-artifact/whiteboard-core';
import { elementReplay } from '../src/lib/build-changes.ts';

const note = { id: 'n1', type: 'note', x: 0, y: 0, w: 200, h: 200, color: 'yellow', text: 'Hello', tilt: 0 } as BoardElement;

describe('elementReplay', () => {
  it('replays a new element whole', () => {
    assert.equal(elementReplay(undefined, note), 'whole');
  });

  it('replays nothing for a move', () => {
    assert.equal(elementReplay(note, { ...note, x: 40, y: 80 } as BoardElement), null);
    assert.equal(elementReplay(note, note), null);
  });

  it('replays only the words when they changed, with the size they take', () => {
    assert.equal(elementReplay(note, { ...note, text: 'Hello there' } as BoardElement), 'text');
    assert.equal(elementReplay(note, { ...note, text: 'Hello there', h: 240, x: 10 } as BoardElement), 'text');
  });

  it('replays the whole element for any other change', () => {
    assert.equal(elementReplay(note, { ...note, color: 'pink' } as BoardElement), 'whole');
    assert.equal(elementReplay(note, { ...note, text: 'Hi', color: 'pink' } as BoardElement), 'whole');
    assert.equal(elementReplay(note, { ...note, w: 300 } as BoardElement), 'whole');
  });
});
