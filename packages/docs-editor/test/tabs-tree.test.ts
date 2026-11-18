import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DocFile } from '@open-artifact/runtime/doc-api';
import {
  copyPlacement,
  deletePlan,
  displayNames,
  dropMove,
  leavesNoTab,
  moveChoices,
  movePatch,
  newTabName,
  newTabPlacement,
  stepMove,
  tabTree,
} from '../src/tabs/tree.ts';
import { orderedTabs } from '../src/app/store.ts';

const file = (id: string, name: string, order: string, subtabOf?: string): DocFile => ({
  id,
  name,
  order,
  ...(subtabOf ? { subtabOf } : {}),
  rev: 1,
  content: { kind: 'node', id: `${id}-body`, engine: 'prose' },
});

/** a, with b and c under it; then d. */
const DOC = [file('a', 'Plan', 'V'), file('b', 'Goals', 'V', 'a'), file('c', '', 'k', 'a'), file('d', 'Notes', 'k')];

/** Applies placement patches to the files, as the server does. */
function applied(files: readonly DocFile[], patch: { path: ['tabs', string]; value: { order: string; subtabOf?: string } } | null): DocFile[] {
  assert.ok(patch);
  return files.map(item => {
    if (item.id !== patch.path[1]) return item;
    const { subtabOf: _drop, ...rest } = item;
    return { ...rest, order: patch.value.order, ...(patch.value.subtabOf ? { subtabOf: patch.value.subtabOf } : {}) };
  });
}

const shape = (files: readonly DocFile[]) => {
  const show = (nodes: ReturnType<typeof tabTree>): string => nodes.map(node => (node.children.length ? `${node.id}(${show(node.children)})` : node.id)).join(' ');
  return show(tabTree(files));
};

describe('the tab tree', () => {
  it('nests subtabs and names unnamed tabs by their place', () => {
    assert.equal(shape(DOC), 'a(b c) d');
    assert.deepEqual([...displayNames(tabTree(DOC))], [
      ['a', 'Plan'],
      ['b', 'Goals'],
      ['c', 'Tab 3'],
      ['d', 'Notes'],
    ]);
  });

  it('breaks a tie between equal keys by id, as the rest of the page does', () => {
    const tied = [file('y', 'Second', 'k'), file('x', 'First', 'k'), file('a', 'Plan', 'V')];
    assert.equal(shape(tied), 'a x y');
    assert.deepEqual(
      orderedTabs(tied).map(item => item.id),
      ['a', 'x', 'y'],
    );
  });

  it('names a new tab one past the highest "Tab n"', () => {
    assert.equal(newTabName([file('a', 'Plan', 'V')]), 'Tab 1');
    assert.equal(newTabName([file('a', 'Tab 1', 'V'), file('b', 'Tab 4', 'k')]), 'Tab 5');
    // An unnamed tab counts as one: the new name never repeats what the list shows.
    assert.equal(newTabName(DOC), 'Tab 5');
  });

  it('puts a new tab last, a new subtab last under its tab', () => {
    assert.deepEqual(newTabPlacement(DOC), { order: 'r' });
    assert.deepEqual(newTabPlacement(DOC, 'a'), { order: 'r', subtabOf: 'a' });
    assert.deepEqual(newTabPlacement(DOC, 'd'), { order: 'V', subtabOf: 'd' });
  });

  it('puts a copy right after its tab', () => {
    const copy = copyPlacement(DOC, 'b');
    assert.ok(copy);
    assert.equal(copy.subtabOf, 'a');
    assert.ok(copy.order > 'V' && copy.order < 'k', copy.order);
    assert.equal(copyPlacement(DOC, 'nope'), null);
  });

  it('offers the moves a tab can make', () => {
    const tree = tabTree(DOC);
    assert.deepEqual(moveChoices(tree, 'a'), { up: false, down: true, into: false, out: false });
    assert.deepEqual(moveChoices(tree, 'c'), { up: true, down: false, into: true, out: true, intoName: 'Goals' });
  });

  it('moves a tab up, down, into the one above and out', () => {
    assert.equal(shape(applied(DOC, movePatch(DOC, 'd', stepMove(tabTree(DOC), 'd', 'up')!))), 'd a(b c)');
    assert.equal(shape(applied(DOC, movePatch(DOC, 'b', stepMove(tabTree(DOC), 'b', 'down')!))), 'a(c b) d');
    assert.equal(shape(applied(DOC, movePatch(DOC, 'd', stepMove(tabTree(DOC), 'd', 'into')!))), 'a(b c d)');
    assert.equal(shape(applied(DOC, movePatch(DOC, 'b', stepMove(tabTree(DOC), 'b', 'out')!))), 'a(c) b d');
    assert.equal(stepMove(tabTree(DOC), 'a', 'up'), undefined);
    assert.equal(stepMove(tabTree(DOC), 'a', 'out'), undefined);
  });

  it('moves a dropped tab before, after or into its target', () => {
    const tree = tabTree(DOC);
    assert.equal(shape(applied(DOC, movePatch(DOC, 'd', dropMove(tree, 'b', 'before')!))), 'a(d b c)');
    assert.equal(shape(applied(DOC, movePatch(DOC, 'd', dropMove(tree, 'b', 'into')!))), 'a(b(d) c)');
    // After a tab with subtabs is first under it.
    assert.equal(shape(applied(DOC, movePatch(DOC, 'd', dropMove(tree, 'a', 'after')!))), 'a(d b c)');
    assert.equal(shape(applied(DOC, movePatch(DOC, 'b', dropMove(tree, 'd', 'after')!))), 'a(c) d b');
  });

  it('never moves a tab under itself, and sends nothing for a tab already in place', () => {
    assert.equal(movePatch(DOC, 'a', { parent: 'b', beforeId: undefined }), null);
    assert.equal(movePatch(DOC, 'a', { parent: 'a', beforeId: undefined }), null);
    assert.equal(movePatch(DOC, 'b', { parent: 'a', beforeId: 'c' }), null);
    assert.equal(movePatch(DOC, 'd', { parent: undefined, beforeId: undefined }), null);
  });

  it('deletes a tab with its subtabs, or hands them up a level', () => {
    assert.deepEqual(deletePlan(DOC, 'a', false), { patch: [], deleteIds: ['a', 'b', 'c'] });
    const keep = deletePlan(DOC, 'a', true);
    assert.deepEqual(keep.deleteIds, ['a']);
    assert.deepEqual(
      keep.patch.map(item => [item.path[1], item.value]),
      [
        ['b', { order: 'V' }],
        ['c', { order: 'k' }],
      ],
    );
    const nested = [...DOC, file('e', 'Deep', 'V', 'b')];
    assert.deepEqual(deletePlan(nested, 'b', true).patch[0]?.value, { order: 'V', subtabOf: 'a' });
    assert.equal(leavesNoTab([file('a', 'Only', 'V')], deletePlan([file('a', 'Only', 'V')], 'a', false)), true);
    assert.equal(leavesNoTab(DOC, deletePlan(DOC, 'a', false)), false);
  });
});
