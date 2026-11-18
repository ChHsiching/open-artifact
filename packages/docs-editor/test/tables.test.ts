import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type DocState, applyOps } from '@open-artifact/docs-core';
import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { schema } from '../src/editor/schema.ts';
import { diffPage } from '../src/sync/diff.ts';
import { type PageNode, docToPage } from '../src/sync/page.ts';
import {
  canSort,
  cellText,
  columnWidth,
  hasHeaderColumn,
  headerRowCount,
  headersForInsert,
  numericValue,
  planDrop,
  planMove,
  replaceRows,
  rowsSortedBy,
  rowsWithColumnMoved,
  rowsWithRowMoved,
  setColumnWidths,
  sortedBodyOrder,
  toggleHeaderColumn,
  toggleHeaderRow,
} from '../src/tables/table-ops.ts';
import { cellMenu, deleteLabel } from '../src/tables/table-menu.ts';

const TABLE = ['| Name | Price |', '|---|---|', '| pear | $1,200 |', '| Apple | 30 |', '|  | 4.5 |', '| banana |  |'].join('\n');

function docOf(markdown: string): DocState {
  const empty: DocState = { rev: 0, blocks: [{ id: 's0.0', type: 'paragraph', inline: [] }] };
  return applyOps(empty, [{ op: 'replace', target: { kind: 'blocks', ids: ['s0.0'] }, with: { as: 'markdown', from: { kind: 'inline', content: markdown } } }], { sess: 's0', next: 1 }).doc;
}

function setup(markdown = TABLE) {
  const shadow = docOf(markdown);
  const doc = schema.nodeFromJSON(docToPage(shadow));
  let tablePos = -1;
  doc.forEach((node, offset) => {
    if (tablePos < 0 && node.type.name === 'table') tablePos = offset;
  });
  const state = EditorState.create({ doc });
  return { shadow, state, tablePos, table: doc.nodeAt(tablePos)! };
}

const column = (table: PMNode, col: number) => {
  const out: string[] = [];
  table.forEach(row => out.push(cellText(row.child(col))));
  return out;
};

const ids = (node: PMNode) => {
  const out: string[] = [];
  node.descendants(child => {
    if (child.isBlock && child.attrs.bid) out.push(child.attrs.bid as string);
  });
  return out.sort();
};

describe('table ops', () => {
  it('reads numbers the way a sort compares them', () => {
    assert.equal(numericValue('$1,200'), 1200);
    assert.equal(numericValue('12%'), 12);
    assert.equal(numericValue('-3.5'), -3.5);
    assert.equal(numericValue('1 200'), null);
    assert.equal(numericValue('pear'), null);
  });

  it('sorts body rows under the header, numbers by value and empty cells last', () => {
    const { table } = setup();
    assert.equal(headerRowCount(table), 1);
    assert.ok(canSort(table));
    assert.deepEqual(sortedBodyOrder(table, 1, 'asc'), [3, 2, 1, 4]);
    assert.deepEqual(column(table.copy(Fragment.from(rowsSortedBy(table, 0, 'asc')!)), 0), ['Name', 'Apple', 'banana', 'pear', '']);
    assert.deepEqual(column(table.copy(Fragment.from(rowsSortedBy(table, 0, 'desc')!)), 0), ['Name', 'pear', 'banana', 'Apple', '']);
  });

  it('refuses to sort a table with fewer than two body rows', () => {
    const { table } = setup(['| a |', '|---|', '| 1 |'].join('\n'));
    assert.equal(canSort(table), false);
  });

  it('keeps header rows on top and edges where they are', () => {
    const { table } = setup();
    assert.deepEqual(planMove(table, 0, 0, 'down'), { dir: 'down', kind: 'row', from: 0, ok: false, reason: 'header' });
    assert.deepEqual(planMove(table, 1, 0, 'up'), { dir: 'up', kind: 'row', from: 1, ok: false, reason: 'header' });
    assert.deepEqual(planMove(table, 4, 0, 'down'), { dir: 'down', kind: 'row', from: 4, ok: false, reason: 'edge' });
    assert.deepEqual(planMove(table, 2, 0, 'up'), { dir: 'up', kind: 'row', from: 2, ok: true, boundary: 1 });
    assert.deepEqual(planMove(table, 2, 0, 'down'), { dir: 'down', kind: 'row', from: 2, ok: true, boundary: 4 });
    assert.deepEqual(planMove(table, 1, 0, 'left'), { dir: 'left', kind: 'col', from: 0, ok: false, reason: 'edge' });
    assert.deepEqual(planMove(table, 1, 0, 'right'), { dir: 'right', kind: 'col', from: 0, ok: true, boundary: 2 });
  });

  it('lets a drag drop body rows below the header only', () => {
    const { table } = setup();
    assert.equal(planDrop(table, 'row', 3, 1).ok, true);
    assert.deepEqual(planDrop(table, 'row', 3, 0), { dir: 'up', kind: 'row', from: 3, ok: false, reason: 'header' });
    assert.deepEqual(planDrop(table, 'row', 0, 3), { dir: 'down', kind: 'row', from: 0, ok: false, reason: 'header' });
    assert.equal(planDrop(table, 'col', 0, 2).ok, true);
    assert.equal(planDrop(table, 'col', 0, 3).ok, false);
  });

  it('moves rows and columns as the nodes they are', () => {
    const { table } = setup();
    const rows = rowsWithRowMoved(table, 2, 4);
    assert.deepEqual(rows.map(row => cellText(row.child(0))), ['Name', 'pear', '', 'Apple', 'banana']);
    const swapped = table.copy(Fragment.from(rowsWithColumnMoved(table, 0, 2)));
    assert.deepEqual(column(swapped, 0), ['Price', '$1,200', '30', '4.5', '']);
    assert.deepEqual(ids(swapped), ids(table));
  });

  it('toggles the header row and column by the cells’ header flag', () => {
    const { state, tablePos } = setup();
    const tr = state.tr;
    toggleHeaderRow(tr, tablePos);
    assert.equal(headerRowCount(tr.doc.nodeAt(tablePos)!), 0);
    toggleHeaderColumn(tr, tablePos);
    assert.ok(hasHeaderColumn(tr.doc.nodeAt(tablePos)!));
    toggleHeaderRow(tr, tablePos);
    assert.equal(headerRowCount(tr.doc.nodeAt(tablePos)!), 1);
  });

  it('makes new cells in a header row header cells', () => {
    const { state, tablePos, table } = setup();
    const tr = state.tr;
    const cell = schema.nodes.cell!.createAndFill()!;
    tr.insert(tablePos + 2, cell);
    headersForInsert(tr, tablePos, { kind: 'col', index: 0 }, { rows: 1, column: false });
    const after = tr.doc.nodeAt(tablePos)!;
    assert.equal(after.child(0).child(0).attrs.header, true);
    assert.equal(table.child(0).childCount + 1, after.child(0).childCount);
  });

  it('sets and clears a column’s width on every cell in it', () => {
    const { state, tablePos } = setup();
    const tr = state.tr;
    assert.ok(setColumnWidths(tr, tablePos, [1], 224));
    assert.equal(columnWidth(tr.doc.nodeAt(tablePos)!, 1), 224);
    assert.equal(columnWidth(tr.doc.nodeAt(tablePos)!, 0), null);
    assert.deepEqual(tr.doc.nodeAt(tablePos)!.child(0).child(1).attrs.colwidth, [224]);
    setColumnWidths(tr, tablePos, [1], 10);
    assert.equal(columnWidth(tr.doc.nodeAt(tablePos)!, 1), 48);
    setColumnWidths(tr, tablePos, [1], null);
    assert.equal(tr.doc.nodeAt(tablePos)!.child(0).child(1).attrs.colwidth, null);
  });

  it('writes a sort and a move as edits that keep every block id', () => {
    const { shadow, state, tablePos, table } = setup();
    const tr = state.tr;
    assert.equal(rowsSortedBy(table, 1, 'desc'), null);
    replaceRows(tr, tablePos, rowsSortedBy(table, 1, 'asc')!);
    const moved = tr.doc.nodeAt(tablePos)!;
    replaceRows(tr, tablePos, rowsWithColumnMoved(moved, 1, 0));
    const page = structuredClone(tr.doc.toJSON()) as PageNode;
    const diff = diffPage(shadow, page, { sess: 's1', next: 1 });
    assert.equal(diff.replaced, false);
    assert.ok(diff.ops.length > 0);
    assert.deepEqual(diff.fixes, []);
    assert.deepEqual(ids(tr.doc), ids(state.doc));
  });
});

describe('the cell menu', () => {
  it('offers sort only when the table sorts, and merge only for a cell selection', () => {
    const { state, tablePos, table } = setup();
    const cellPos = tablePos + 1 + table.child(0).nodeSize + 1;
    const model = cellMenu(state, () => {}, cellPos)!;
    assert.deepEqual(model.insert.map(item => item.label), ['Insert row above', 'Insert row below', 'Insert column left', 'Insert column right']);
    assert.deepEqual(model.sort.map(item => item.label), ['Sort column ascending', 'Sort column descending']);
    assert.deepEqual(model.structure.map(item => item.label), ['Toggle header row', 'Toggle header column']);
    assert.equal(model.move.find(item => item.key === 'move-up')!.disabledReason, 'Header rows stay at the top.');
    assert.equal(model.move.find(item => item.key === 'move-down')!.disabledReason, undefined);
    assert.equal(model.color.current, null);
    assert.equal(deleteLabel('row', 2), 'Delete 2 rows');
    assert.equal(deleteLabel('col', 1), 'Delete column');
  });
});
