import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { changedTids } from '../src/lib/changed-template.ts';

const board = (body: string): string => `<!doctype html><html><body><x-dc>${body}</x-dc></body></html>`;

describe('changedTids', () => {
  it('finds the elements a change added or changed, by their tid in the new template', () => {
    const before = board('<div class="a"><p>One</p></div><p>Two</p>');
    const after = board('<div class="a"><p>One</p><span style="color: red">New</span></div><p>Two!</p>');
    // tids: 0 div, 1 p One, 2 span, 3 p Two!
    assert.deepEqual([...changedTids(before, after)].sort(), [2, 3]);
  });

  it('leaves out elements that only moved, and counts repeated ones', () => {
    const before = board('<p>A</p><p>B</p>');
    assert.deepEqual([...changedTids(before, board('<p>B</p><p>A</p>'))], []);
    assert.deepEqual([...changedTids(before, board('<p>A</p><p>B</p><p>B</p>'))], [2]);
  });

  it('reads attributes in any order and ignores whitespace in text', () => {
    assert.deepEqual([...changedTids(board('<p class="x" id="y">Hi  there</p>'), board('<p id="y" class="x">Hi there</p>'))], []);
  });
});
