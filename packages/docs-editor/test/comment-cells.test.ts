import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type DocState, applyOps } from '@open-artifact/docs-core';
import type { Node as PMNode } from 'prosemirror-model';
import { CellSelection, TableMap } from 'prosemirror-tables';
import { rangeOfBlock } from '../src/comments/anchor-map.ts';
import { CELLS_MAX, anchorLocation, cellsDetail, cellsLabel, cellsPlace, parseAnchor, serializeAnchor } from '../src/comments/anchor.ts';
import { pmDocOf } from '../src/editor/binding.ts';
import { commentCells, mixesCellsAndText } from '../src/tables/comment-cells.ts';

const session = { sess: 's1', next: 1 };

function docOf(markdown: string): DocState {
  const doc: DocState = { rev: 0, blocks: [{ id: 's0.0', type: 'paragraph', inline: [] }] };
  return applyOps(doc, [{ op: 'replace', target: { kind: 'blocks', ids: ['s0.0'] }, with: { as: 'markdown', from: { kind: 'inline', content: markdown } } }], session).doc;
}

const TABLE = ['Before the table', '', '| Region | Q1 | Q2 |', '|---|---|---|', '| North | 10 | 12 |', '| South | 7 | 9 |', '', 'After the table'].join('\n');

/** The first table of a doc: where it starts, and the position of the cell at (row, col). */
function tableOf(doc: PMNode, index = 0): { pos: number; node: PMNode; cell(row: number, col: number): number } {
  const found: Array<{ pos: number; node: PMNode }> = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'table') found.push({ pos, node });
    return node.type.name !== 'table';
  });
  const { pos, node } = found[index]!;
  const map = TableMap.get(node);
  return { pos, node, cell: (row, col) => pos + 1 + map.map[row * map.width + col]! };
}

function select(doc: PMNode, from: [number, number], to: [number, number]): CellSelection {
  const table = tableOf(doc);
  return CellSelection.create(doc, table.cell(...from), table.cell(...to));
}

function textPos(doc: PMNode, words: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return found < 0;
    const at = node.text!.indexOf(words);
    if (at >= 0) found = pos + at;
    return false;
  });
  assert.ok(found >= 0, `no "${words}"`);
  return found;
}

describe('a comment on several table cells', () => {
  const doc = pmDocOf(docOf(TABLE));

  it('names every selected cell, row by row, and the table', () => {
    const picked = commentCells(select(doc, [1, 1], [2, 2]))!;
    assert.equal(picked.cells.length, 4);
    assert.equal(picked.table, tableOf(doc).node.attrs.bid);
    assert.deepEqual(picked.shape, { kind: 'cells', n: 4 });
    assert.equal(picked.words, '10 | 12\n7 | 9');
    assert.deepEqual(
      picked.cells.map(id => doc.textBetween(rangeOfBlock(doc, id)!.from, rangeOfBlock(doc, id)!.to)),
      ['10', '12', '7', '9'],
    );
  });

  it('tells a whole column, a whole row and the whole table', () => {
    assert.deepEqual(commentCells(select(doc, [0, 1], [2, 1]))!.shape, { kind: 'column', header: 'Q1' });
    assert.deepEqual(commentCells(select(doc, [2, 0], [2, 2]))!.shape, { kind: 'row', header: 'South' });
    assert.deepEqual(commentCells(select(doc, [0, 0], [2, 2]))!.shape, { kind: 'table' });
    // Two whole columns are cells.
    assert.deepEqual(commentCells(select(doc, [0, 1], [2, 2]))!.shape, { kind: 'cells', n: 6 });
  });

  it('labels them', () => {
    assert.equal(cellsLabel({ kind: 'column', header: 'Q1' }), 'Table · Q1 column');
    assert.equal(cellsLabel({ kind: 'column', header: '' }), 'Table · column');
    assert.equal(cellsLabel({ kind: 'row', header: 'South' }), 'Table · South row');
    assert.equal(cellsLabel({ kind: 'row', header: '' }), 'Table · row');
    assert.equal(cellsLabel({ kind: 'cells', n: 4 }), 'Table · 4 cells');
    assert.equal(cellsLabel({ kind: 'table' }), 'Table');
    assert.equal(cellsPlace({ kind: 'column', header: 'Q1' }), 'On the table’s “Q1” column');
    assert.equal(cellsPlace({ kind: 'row', header: '' }), 'On a table row');
    assert.equal(cellsPlace({ kind: 'cells', n: 4 }), 'On 4 table cells');
    assert.equal(cellsPlace({ kind: 'table' }), 'On a table');
    assert.equal(cellsDetail({ kind: 'cells', n: 4 }, '10 | 12\n7 | 9'), 'On 4 table cells:\n10 | 12\n7 | 9');
    assert.equal(cellsDetail({ kind: 'table' }, '  '), 'On a table');
  });

  it('is stored, read back and pointed at for the agent', () => {
    const anchor = { kind: 'cells', tab: 't1', cells: ['c.1', 'c.2'], table: 'tb.1' } as const;
    const text = serializeAnchor({ ...anchor, cells: [...anchor.cells] });
    assert.deepEqual(JSON.parse(text), { tab: 't1', table: 'tb.1', cells: ['c.1', 'c.2'] });
    assert.deepEqual(parseAnchor(text), anchor);
    assert.deepEqual(anchorLocation(parseAnchor(text), null), { tab: 't1', block: 'tb.1', cells: ['c.1', 'c.2'] });
    assert.deepEqual(anchorLocation(parseAnchor('{"tab":"t1","cells":["c.1","c.2"]}'), null), { tab: 't1', block: 'c.1', cells: ['c.1', 'c.2'] });
    // Bad ids are dropped, duplicates kept once; no good id at all is the whole doc.
    assert.deepEqual(parseAnchor('{"tab":"t1","cells":["c.1",3,"c.1",""]}'), { kind: 'cells', tab: 't1', cells: ['c.1'] });
    assert.deepEqual(parseAnchor('{"tab":"t1","cells":[]}'), { kind: 'doc', tab: 't1' });
    const many = parseAnchor(JSON.stringify({ tab: 't1', cells: Array.from({ length: CELLS_MAX + 5 }, (_, i) => `c.${i}`) }));
    assert.equal(many.kind === 'cells' && many.cells.length, CELLS_MAX);
  });

  it('finds again only the cells still there', () => {
    const shadow = docOf(TABLE);
    const before = pmDocOf(shadow);
    const picked = commentCells(select(before, [1, 0], [2, 0]))!;
    const row = tableOf(before).node.child(2).attrs.bid as string;
    const after = pmDocOf(applyOps(shadow, [{ op: 'delete', target: { kind: 'blocks', ids: [row] } }], session).doc);
    assert.deepEqual(
      picked.cells.map(id => rangeOfBlock(after, id) !== null),
      [true, false],
    );
  });
});

describe('a selection that mixes cells and text', () => {
  const doc = pmDocOf(docOf(`${TABLE}\n\n| A | B |\n|---|---|\n| x | y |`));

  it('is refused across a table and the text around it, or across two tables', () => {
    assert.equal(mixesCellsAndText(doc, textPos(doc, 'Before'), textPos(doc, 'North') + 2), true);
    assert.equal(mixesCellsAndText(doc, textPos(doc, 'Before'), textPos(doc, 'After') + 3), true);
    assert.equal(mixesCellsAndText(doc, textPos(doc, 'North'), textPos(doc, 'x') + 1), true);
  });

  it('is fine within one cell or outside tables', () => {
    assert.equal(mixesCellsAndText(doc, textPos(doc, 'North'), textPos(doc, 'North') + 5), false);
    assert.equal(mixesCellsAndText(doc, textPos(doc, 'Before'), textPos(doc, 'Before') + 6), false);
  });
});
