import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EDIT_UNAVAILABLE_REASONS } from '../src/drafts/words.ts';
import { rectOf } from '../src/edit/geometry.ts';
import { describeClickThrough, describePieceKeys, pieceKeyAction } from '../src/edit/keys.ts';
import { cardGripAt, clipRectToBounds, cutOutClipPath, editMarkInset, insetLineRects, isRowInRoom, mergeLineRects, pickTipSide } from '../src/edit/layer.ts';
import { pencilReason, type PencilInputs } from '../src/edit/pencil.ts';

const room = { left: 0, top: 0, width: 800, height: 600 };

describe('edit keys', () => {
  it('says how a ⌘/Ctrl-click goes through', () => {
    assert.equal(describeClickThrough(null, true), '⌘-click to use');
    assert.equal(describeClickThrough('#a', false), 'Ctrl-click to go there');
    assert.equal(describeClickThrough('https://example.com/x', true), '⌘-click to open: example.com/x');
    const long = describeClickThrough(`https://example.com/${'a'.repeat(80)}`, true);
    assert.ok(long.endsWith('…'));
    assert.equal(long.length, '⌘-click to open: '.length + 56);
  });

  it('names the keys that work on a piece', () => {
    assert.equal(describePieceKeys('Card', { block: true, typing: false, usable: false }, true), 'Card, Delete to remove, Shift+F10 for more');
    assert.equal(describePieceKeys('Heading', { block: false, typing: true, usable: false }, true), 'Heading, Enter to edit');
    assert.equal(describePieceKeys('Link', { block: false, typing: true, usable: true }, false), 'Link, Enter to edit, Ctrl+Enter to use');
    assert.equal(describePieceKeys('Button', { block: false, typing: false, usable: true }, true), 'Button, ⌘Enter to use');
  });

  it('maps keys on a picked piece', () => {
    const at = (key: string, kind: 'words' | 'drawing' | 'block', inactiveTab = false, sourced = false) => pieceKeyAction({ key, kind, inactiveTab, sourced });
    assert.equal(at('Escape', 'words'), 'unpick');
    assert.equal(at('Enter', 'words'), 'type');
    assert.equal(at('x', 'words'), 'type');
    assert.equal(at('Enter', 'drawing'), 'refuse');
    assert.equal(at('Enter', 'drawing', false, true), 'source');
    assert.equal(at('Enter', 'words', true), 'tab');
    assert.equal(at('Backspace', 'block'), 'delete');
    assert.equal(at('Delete', 'drawing'), 'delete');
    assert.equal(at('Delete', 'words'), null);
    assert.equal(at('ArrowUp', 'block'), null);
  });
});

describe('edit layer', () => {
  it('insets marks by kind', () => {
    assert.equal(editMarkInset('block', true, 'over'), 0);
    assert.equal(editMarkInset('drawing', false, 'over'), 5);
    assert.equal(editMarkInset('words', true, 'picked'), 3);
    assert.equal(editMarkInset('words', true, 'over'), 4);
  });

  it('clips, cuts out and checks rows against the room', () => {
    assert.deepEqual(clipRectToBounds(rectOf({ left: -10, top: 590, width: 50, height: 50 }), room), { left: 0, top: 590, width: 40, height: 10 });
    assert.equal(clipRectToBounds(rectOf({ left: 900, top: 0, width: 10, height: 10 }), room), null);
    assert.equal(cutOutClipPath(undefined, room), undefined);
    assert.equal(cutOutClipPath({ left: 10, top: 20, width: 30, height: 40 }, room), 'path(evenodd, "M0 0H800V600H0Z M10 20h30v40h-30Z")');
    assert.equal(isRowInRoom({ top: 595, bottom: 640 }, room), false);
    assert.equal(isRowInRoom({ top: 500, bottom: 540 }, room), true);
  });

  it('merges line rects and widens the washes', () => {
    const lines = mergeLineRects([rectOf({ left: 0, top: 0, width: 50, height: 20 }), rectOf({ left: 50, top: 2, width: 30, height: 16 }), rectOf({ left: 0, top: 22, width: 40, height: 20 })]);
    assert.equal(lines.length, 2);
    assert.equal(lines[0]?.width, 80);
    const washes = insetLineRects(lines, 4);
    assert.deepEqual(washes[0], { left: -4, top: -4, width: 88, height: 24 });
    assert.deepEqual(washes[1], { left: -4, top: 22, width: 48, height: 24 });
  });

  it('puts the tip above unless near the top, and the grip on the card edge', () => {
    assert.equal(pickTipSide(rectOf({ left: 100, top: 200, width: 100, height: 20 }), room, null), 'top');
    assert.equal(pickTipSide(rectOf({ left: 100, top: 10, width: 100, height: 20 }), room, null), 'bottom');
    assert.deepEqual(cardGripAt(rectOf({ left: 100, top: 100, width: 300, height: 200 }), room), { left: 93, top: 114 });
  });
});

describe('the pencil', () => {
  const free: PencilInputs = { editing: false, viewingVersion: false, agentWorking: false, draftShown: false, commenting: false, editableByHand: true, canAsk: true };

  it('is free on the stored page', () => {
    assert.equal(pencilReason(free), null);
    assert.equal(pencilReason({ ...free, editing: true, commenting: true }), null);
  });

  it('says what keeps it off, in order', () => {
    assert.equal(pencilReason({ ...free, viewingVersion: true, agentWorking: true }), 'older_version');
    assert.equal(pencilReason({ ...free, agentWorking: true, commenting: true }), 'agent_working');
    assert.equal(pencilReason({ ...free, draftShown: true }), 'draft_open');
    assert.equal(pencilReason({ ...free, commenting: true }), 'comments_on');
    assert.equal(EDIT_UNAVAILABLE_REASONS.comments_on, 'Turn off comments to edit');
  });

  it('needs the agent for a page that cannot be edited by hand only when no agent can be asked', () => {
    assert.equal(pencilReason({ ...free, editableByHand: false }), null);
    assert.equal(pencilReason({ ...free, editableByHand: false, canAsk: false }), 'needs_agent');
  });
});
