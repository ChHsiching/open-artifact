import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { isObject, type Json, type JsonObject, type SheetFrame } from '@open-artifact/sheets-core';
import { runSheetsCommand } from '../src/sheets/cli.ts';
import { EDITS_FILE, readEdits, SHEET_DIR, SheetStore, type Viewer } from '../src/sheets/store.ts';

const folders: string[] = [];
const stores: SheetStore[] = [];
after(() => {
  for (const store of stores) store.close();
  for (const folder of folders) fs.rmSync(folder, { recursive: true, force: true });
});

function folder(): string {
  const made = fs.mkdtempSync(path.join(os.tmpdir(), 'sheets-store-'));
  folders.push(made);
  return made;
}

function storeIn(root: string, title?: string): SheetStore {
  const store = new SheetStore({ root, log: () => {}, ...(title !== undefined ? { title } : {}) });
  stores.push(store);
  return store;
}

const owner: Viewer = { id: 'owner', name: 'Owner', canEdit: true, isOwner: true };
const reader: Viewer = { id: 'reader', name: 'Reader', canEdit: false, isOwner: false };

const BUDGET = [
  ['Item', 'Cost'],
  ['Rent', 1200],
  ['Food', 300],
  ['Total', '=SUM(B2:B3)'],
];

/** A Sheet with a header, two rows and a total. */
function budget(): { root: string; store: SheetStore } {
  const root = folder();
  const store = storeIn(root, 'Budget');
  const answer = store.agentUpdate({ kind: 'applyEdits', base: 0, edits: [{ kind: 'writeCells', sheet: 'Sheet1', topLeft: 'A1', rows: BUDGET }] });
  assert.deepEqual(answer, { revision: 2 });
  return { root, store };
}

function cells(store: SheetStore, range: string, atRevision?: number): Json[][] {
  const read = store.agentRead({ kind: 'readCells', sheet: 'Sheet1', range }, atRevision);
  assert.ok(isObject(read.rows), JSON.stringify(read));
  return Object.values(read.rows as Record<string, Json[]>);
}

/** The ids of Sheet1 and of its cell at (row, column), from the setCells the log holds. */
function idsOf(root: string): { sheetId: string; r: (row: number) => string; c: (column: number) => string; v: number } {
  const { edits } = readEdits(path.join(root, SHEET_DIR));
  const insert = edits[0]!.ops.find((op) => isObject(op) && op.kind === 'insertSheet') as JsonObject;
  const rows = edits[0]!.ops.find((op) => isObject(op) && op.kind === 'insertRows') as JsonObject;
  const columns = edits[0]!.ops.find((op) => isObject(op) && op.kind === 'insertColumns') as JsonObject;
  const rowBase = (rows.rows as JsonObject).base as string;
  const columnBase = (columns.columns as JsonObject).base as string;
  return { sheetId: insert.sheetId as string, r: (row) => `${rowBase}.${row}`, c: (column) => `${columnBase}.${column}`, v: edits.at(-1)!.v };
}

function setCell(root: string, row: number, column: number, value: Json): Json[] {
  const ids = idsOf(root);
  const input = typeof value === 'number' ? { kind: 'number', value } : { kind: 'text', value };
  return [{ kind: 'setCells', sheetId: ids.sheetId, cells: [{ r: ids.r(row), c: ids.c(column), input }] }];
}

describe('SheetStore', () => {
  it('starts a new Sheet: its meta, an empty log, a snapshot and the clock', () => {
    const root = folder();
    const store = storeIn(root, 'Plans');
    const meta = JSON.parse(fs.readFileSync(path.join(root, SHEET_DIR, 'sheet.json'), 'utf8'));
    assert.match(meta.id, /^[0-9a-f-]{36}$/);
    assert.equal(meta.title, 'Plans');
    assert.equal(store.revision, 0);
    assert.equal(store.info().title, 'Plans');
    store.setTitle('Plans for May');
    assert.equal(storeIn(root).info().title, 'Plans for May');

    const frames: SheetFrame[] = [];
    const close = store.open(owner, (frame) => frames.push(frame));
    close();
    assert.deepEqual(frames.map((f) => f.phase), ['snapshot', 'clock']);
    assert.deepEqual(store.read({ kind: 'snapshot' }, owner), frames[0]);
    const page = store.read({ kind: 'load', from: 0 }, owner);
    assert.deepEqual(page, { kind: 'loadPage', from: 0, revision: 0, v: (frames[0] as { newestFormatVersion: number }).newestFormatVersion, ops: [], next: null });
  });

  it('makes the agent\'s update one revision on a new Sheet\'s first sheet, and reads the formulas worked out', () => {
    const { root, store } = budget();
    assert.deepEqual(cells(store, 'A1:B4'), [['Item', 'Cost'], ['Rent', 1200], ['Food', 300], ['Total', { formula: '=SUM(B2:B3)', value: 1500 }]]);
    const { edits } = readEdits(path.join(root, SHEET_DIR));
    assert.deepEqual(edits.map((e) => [e.revision, e.base, e.by]), [[1, 0, 'agent'], [2, 1, 'agent']]);
    // A read at revision 1 is the blank first sheet.
    assert.deepEqual(cells(store, 'A1:B1', 1), []);
    // An update on an old base is refused, as the agent's refusals are worded.
    assert.throws(
      () => store.agentUpdate({ kind: 'applyEdits', base: 1, edits: [{ kind: 'writeCells', sheet: 'Sheet1', topLeft: 'C1', rows: [['x']] }] }),
      (error: { body?: { data?: { refusal?: string } } }) => error.body?.data?.refusal === 'baseIsNotTheRevision',
    );
  });

  it('saves a page\'s edit built on an earlier revision, and refuses one that no longer applies', () => {
    const { root, store } = budget();
    const { v } = idsOf(root);
    const frames: SheetFrame[] = [];
    const close = store.open(owner, (frame) => frames.push(frame));
    // Built on revision 1: the edits since do not stop it.
    assert.deepEqual(store.send({ opId: 'op-1', v, base: 1, ops: setCell(root, 2, 1, 900) }, owner), { kind: 'saved', revision: 3 });
    assert.deepEqual(store.send({ opId: 'op-1', v, base: 1, ops: setCell(root, 2, 1, 900) }, owner), { kind: 'saved', revision: 3 });
    assert.equal(cells(store, 'B3')[0]?.[0], 900);
    const edit = frames.find((f) => f.phase === 'edit');
    assert.ok(edit && edit.phase === 'edit');
    assert.equal(edit.revision, 3);
    assert.equal(edit.actor.isAgent, false);
    close();

    const nowhere: Json[] = [{ kind: 'setCells', sheetId: 'sht_nowhere.0', cells: [{ r: 'row_nowhere.0', c: 'col_nowhere.0', input: { kind: 'text', value: 'x' } }] }];
    assert.deepEqual(store.send({ opId: 'op-2', v, base: 1, ops: nowhere }, owner), { kind: 'refused', refusal: 'changedSince' });
    assert.deepEqual(store.send({ opId: 'op-3', v, base: 3, ops: setCell(root, 0, 2, 'x') }, reader), { kind: 'refused', refusal: 'notWriter' });
    assert.deepEqual(store.send({ opId: 'op-4', v, base: 9, ops: setCell(root, 0, 2, 'x') }, owner), { kind: 'refused', refusal: 'pageIsBehind' });
    assert.equal(store.revision, 3);
  });

  it('picks up a line another process appended, and sends it to the pages', () => {
    const { root, store } = budget();
    const frames: SheetFrame[] = [];
    const close = store.open(owner, (frame) => frames.push(frame));
    const line = { revision: 3, v: idsOf(root).v, base: 2, ops: setCell(root, 2, 1, 50), by: 'agent', at: new Date().toISOString() };
    fs.appendFileSync(path.join(root, SHEET_DIR, EDITS_FILE), `${JSON.stringify(line)}\n`);
    // A torn line (still being written) waits until it is whole.
    fs.appendFileSync(path.join(root, SHEET_DIR, EDITS_FILE), '{"revision": 4, "v"');
    store.rescan();
    close();
    assert.equal(store.revision, 3);
    assert.deepEqual(frames.filter((f) => f.phase === 'edit').map((f) => f.phase === 'edit' && [f.revision, f.actor.isAgent]), [[3, true]]);
    assert.deepEqual(cells(store, 'B3:B4'), [[50], [{ formula: '=SUM(B2:B3)', value: 1250 }]]);
  });

  it('groups edits into versions by their pauses', () => {
    const { root, store } = budget();
    const { v } = idsOf(root);
    store.send({ opId: 'later', v, base: 2, ops: setCell(root, 1, 1, 1300) }, owner);
    const versions = store.read({ kind: 'versions' }, owner);
    assert.ok(versions.kind === 'versions');
    assert.deepEqual(versions.rows.map((r) => [r.firstRevision, r.revision]), [[1, 3]]);

    // The same log with an hour between the agent's edits and the page's.
    const file = path.join(root, SHEET_DIR, EDITS_FILE);
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as JsonObject);
    fs.writeFileSync(file, lines.map((l, i) => `${JSON.stringify(i < 2 ? { ...l, at: hourAgo } : l)}\n`).join(''));
    const again = storeIn(root).read({ kind: 'versions' }, owner);
    assert.ok(again.kind === 'versions');
    assert.deepEqual(again.rows.map((r) => [r.firstRevision, r.revision, r.authors.map((a) => a.isAgent)]), [[3, 3, [false]], [1, 2, [true]]]);
  });

  it('gives the edits that restore a version, and a cell\'s history', () => {
    const { root, store } = budget();
    const { v, sheetId, r, c } = idsOf(root);
    store.send({ opId: 'change', v, base: 2, ops: setCell(root, 1, 1, 1500) }, owner);
    assert.equal(cells(store, 'B2')[0]?.[0], 1500);

    const restore = store.read({ kind: 'editsThatRestore', revision: 2 }, owner);
    assert.ok(restore.kind === 'editsToTakeBack', JSON.stringify(restore));
    assert.equal(restore.edits.length, 1);
    const back = restore.edits[0]!;
    assert.equal(back.base, 3);
    const saved = store.send({ opId: 'restore', v: typeof back.v === 'number' ? back.v : v, base: 3, ops: back.ops as Json[] }, owner);
    assert.deepEqual(saved, { kind: 'saved', revision: 4 });
    assert.equal(cells(store, 'B2')[0]?.[0], 1200);
    assert.deepEqual(store.read({ kind: 'editsThatRestore', revision: 4 }, owner), { kind: 'editsToTakeBack', revision: 4, edits: [] });

    const history = store.read({ kind: 'cellHistory', sheetId, r: r(1), c: c(1) }, owner);
    assert.ok(history.kind === 'cellHistory', JSON.stringify(history));
    assert.ok(history.rows.length >= 3, JSON.stringify(history.rows));
    assert.deepEqual(history.rows.map((row) => row.revision), [4, 3, 2]);
    assert.equal(history.rows[1]!.actor.isAgent, false);
    assert.equal(history.rows[2]!.actor.isAgent, true);
  });

  it('makes a chart: a widget, then a batch whose addChart names a widget made under a $lid', () => {
    const { store } = budget();
    const code = "export default () => <sheet.Visualize data-component='bars' sources={{rows: {kind: 'ref', ref: 'input/rows', adapter: {kind: 'cells'}}}}>{({rows}) => <svg width='480' height='280' role='img' aria-label='Costs'>{rows.slice(1).map((row, j) => <rect key={j} x={16 + j * 40} y={40} width={20} height={20} />)}</svg>}</sheet.Visualize>;\n";
    const made = store.widget({ verb: 'create', opId: 'w-1', code }, owner);
    assert.ok(made.kind === 'widget', JSON.stringify(made));
    assert.equal(made.widget.pub, 1);
    assert.deepEqual(store.widget({ verb: 'create', opId: 'w-1', code }, owner), made);
    const projection = store.widget({ verb: 'projection', id: made.widget.id }, owner);
    assert.ok(projection.kind === 'projection');
    assert.match(projection.module, /export function init\(sheet, React, hooks, ds\)/);

    const chart = { name: 'Costs', caption: '', widget: '$lid:w', inputs: [{ name: 'rows', cells: { sheet: 'Sheet1', range: 'A1:B3' } }], sheet: 'Sheet1', topLeft: 'D1', widthInPixels: 480, heightInPixels: 280 };
    const answer = store.agentBatch([
      { $lid: 'w', verb: 'create', payload: { code } },
      { verb: 'update', payload: { kind: 'applyEdits', base: 2, edits: [{ kind: 'addChart', chart }] } },
    ]);
    const lids = answer.lids as Record<string, string>;
    assert.ok(typeof lids.w === 'string');
    assert.deepEqual((answer.acks as JsonObject[]).map((ack) => ack.outcome), ['published', 'applied']);
    const charts = store.agentRead({ kind: 'readCharts', sheet: 'Sheet1' });
    assert.equal((charts.charts as JsonObject[]).length, 1);
    assert.deepEqual((charts.charts as JsonObject[])[0]!.chart, { ...chart, widget: lids.w });

    // A widget a chart draws with stays; one no chart uses is deleted.
    assert.equal(store.widget({ verb: 'delete', id: lids.w }, owner).kind, 'refused');
    assert.deepEqual(store.widget({ verb: 'delete', id: made.widget.id }, owner), { kind: 'deleted' });

    // A refused applyEdits takes back the widgets the batch made.
    const before = store.widgets.list().length;
    assert.throws(() => store.agentBatch([
      { $lid: 'x', verb: 'create', payload: { code } },
      { verb: 'update', payload: { kind: 'applyEdits', base: 1, edits: [{ kind: 'addChart', chart: { ...chart, widget: '$lid:x' } }] } },
    ]), (error: { body?: { data?: { refusal?: string; committed?: boolean } } }) => error.body?.data?.refusal === 'baseIsNotTheRevision' && error.body.data.committed === false);
    assert.equal(store.widgets.list().length, before);
  });

  it('answers a new Sheet\'s reads, widgets and imports before any edit', async () => {
    const store = storeIn(folder());
    assert.deepEqual(store.agentWidget({ action: 'list' }), { widgets: [] });
    assert.deepEqual(store.read({ kind: 'xlsxCharts', charts: [] }, owner), { kind: 'xlsxCharts', descriptions: [] });
    assert.deepEqual(store.read({ kind: 'versions' }, owner), { kind: 'versions', rows: [] });
    assert.equal(new TextDecoder().decode(store.exportFile('csv').bytes), '');
    assert.throws(() => store.exportFile('xlsx'), (error: { body?: { data?: { refusal?: string } } }) => error.body?.data?.refusal === 'noSheetToWrite');
    await assert.rejects(store.importFile('notes.xlsx', new Uint8Array([1, 2, 3])), (error: { body?: { data?: { refusal?: string } } }) => error.body?.data?.refusal === 'notAnXlsxFile');
    assert.equal(store.revision, 0);
  });

  it('exports the workbook as an .xlsx file and a sheet as CSV', async () => {
    const { root, store } = budget();
    const xlsx = store.exportFile('xlsx');
    assert.equal(xlsx.filename, 'Budget.xlsx');
    assert.deepEqual([...xlsx.bytes.slice(0, 2)], [0x50, 0x4b]);
    const csv = store.exportFile('csv');
    assert.equal(new TextDecoder().decode(csv.bytes), 'Item,Cost\r\nRent,1200\r\nFood,300\r\nTotal,1500\r\n');

    // The same through the commands, into the folder's exports/.
    const exported = (await runSheetsCommand(root, 'export', [])) as JsonObject;
    assert.equal(exported.file, path.join(root, 'exports', 'Budget.xlsx'));
    assert.equal(fs.readFileSync(exported.file as string).subarray(0, 2).toString(), 'PK');
    const info = (await runSheetsCommand(root, 'info', [])) as JsonObject;
    assert.equal(info.revision, 2);

    // An .xlsx file chosen with Import from Excel is kept for the agent, which gets a request naming it.
    const asked: string[] = [];
    const importing = new SheetStore({ root, log: () => {}, sendToAgent: (request) => asked.push(request.text) > 0 });
    stores.push(importing);
    assert.deepEqual(await importing.importFile('Costs.xlsx', xlsx.bytes), { path: 'sheet/imports/Costs.xlsx', sentToAgent: true });
    assert.deepEqual((await importing.importFile('Costs.xlsx', xlsx.bytes)).path, 'sheet/imports/Costs-2.xlsx');
    const refused = new SheetStore({ root, log: () => {}, sendToAgent: async () => false });
    stores.push(refused);
    const reply = await refused.importFile('Costs.xlsx', xlsx.bytes);
    assert.equal(reply.sentToAgent, false);
    assert.equal(fs.existsSync(path.join(root, reply.path)), false);
    assert.equal(fs.existsSync(path.join(root, 'sheet/imports/Costs-2.xlsx')), true);
    assert.match(asked[0]!, /Import this Excel file into the Sheet, as new sheets: sheet\/imports\/Costs.xlsx/);
  });
});

describe('runSheetsCommand', () => {
  it('starts a Sheet with an update, reads it, and words a refusal', async () => {
    const root = folder();
    await assert.rejects(runSheetsCommand(root, 'read', []), /has no sheet\/sheet.json/);
    await assert.rejects(runSheetsCommand(root, 'widget', ['list']), /has no sheet\/sheet.json/);
    await assert.rejects(runSheetsCommand(root, 'widget', ['read']), /Give the widget's id/);
    assert.equal(fs.existsSync(path.join(root, SHEET_DIR)), false);
    assert.deepEqual(await runSheetsCommand(root, 'update', [JSON.stringify({ base: 0, edits: [{ kind: 'writeCells', sheet: 'Sheet1', topLeft: 'A1', rows: BUDGET }] })]), { revision: 2 });
    const read = (await runSheetsCommand(root, 'read', [JSON.stringify({ kind: 'readCells', sheet: 'Sheet1', range: 'B4' })])) as JsonObject;
    assert.deepEqual(Object.values(read.rows as JsonObject), [[{ formula: '=SUM(B2:B3)', value: 1500 }]]);
    await assert.rejects(
      runSheetsCommand(root, 'update', [JSON.stringify({ base: 2, edits: [{ kind: 'writeCells', sheet: 'Nowhere', topLeft: 'A1', rows: [['x']] }] })]),
      (error: { body?: { data?: { refusal?: string } } }) => error.body?.data?.refusal === 'unknownSheetName',
    );
    const listed = (await runSheetsCommand(root, 'widget', ['list'])) as JsonObject;
    assert.deepEqual(listed.widgets, []);
  });
});
