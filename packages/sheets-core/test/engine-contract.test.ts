import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sheetsEngine } from '@open-artifact/wasm-sheets/node';
import {
  EngineClient,
  UtilityClient,
  type CellAt,
  type IdRun,
  type RowId,
  type ColumnId,
  type SheetId,
  type SyncState,
} from '../src/engine/index.ts';

/** Narrows an answer to one kind, failing the test (with the answer) otherwise. */
function expectKind<A extends { kind: string }, K extends A['kind']>(answer: A, kind: K): Extract<A, { kind: K }> {
  assert.equal(answer.kind, kind, `expected ${kind}, got ${JSON.stringify(answer)}`);
  return answer as Extract<A, { kind: K }>;
}

/** The ids of a run, in order. */
function idsOf(runs: IdRun[]): string[] {
  return runs.flatMap((run) => Array.from({ length: run.count }, (_, i) => `${run.base}.${run.first + i}`));
}

/** Sends what the state says to send and tells the session it was saved, until nothing is left to send. */
function sendAll(client: EngineClient, state: SyncState, revision: { now: number }): SyncState {
  while (state.nextStep?.kind === 'sendEdit') {
    const { opId, recordedEdit } = state.nextStep;
    assert.ok(recordedEdit.ops.length > 0);
    revision.now += 1;
    state = expectKind(
      client.request({ kind: 'receiveSendOutcome', opId, outcome: { kind: 'saved', revision: revision.now } }),
      'syncState',
    );
    assert.ok(state.confirmedOpIds.includes(opId));
  }
  return state;
}

test('a synced session queues, sends, confirms, calculates and reads through the typed client', () => {
  const engine = sheetsEngine();
  const client = new EngineClient(engine.session());
  const revision = { now: 0 };
  try {
    let state: SyncState = expectKind(client.request({ kind: 'answerBeforeCalculating' }), 'syncState');
    state = expectKind(client.request({ kind: 'receiveServerRevision', revision: 0 }), 'syncState');
    assert.equal(state.isLoaded, true);
    assert.equal(state.nextStep, null);

    // A direct request is refused once the session syncs.
    const refused = expectKind(client.request({ kind: 'apply', ops: [] }), 'refused');
    assert.equal(refused.refusal, 'syncInUse');

    // A sheet added, sent and saved.
    const added = expectKind(
      client.request({
        kind: 'queueEdit',
        opId: 'op-add-sheet',
        newIdCode: 'baaaaaaaaa',
        edit: { kind: 'addSheet', afterSheet: null, nameStem: 'Sheet' },
      }),
      'editQueued',
    );
    assert.ok(added.placeChanged);
    const sheetId: SheetId = added.placeChanged.sheetId;
    assert.equal(added.syncState.nextStep?.kind, 'sendEdit');
    state = sendAll(client, added.syncState, revision);
    assert.equal(state.confirmedRevision, revision.now);
    assert.equal(state.unconfirmedCount, 0);

    const layout = expectKind(client.request({ kind: 'readSheetLayout', sheetId }), 'sheetLayout');
    assert.equal(layout.sheetId, sheetId);
    const rows: RowId[] = idsOf(layout.rows);
    const columns: ColumnId[] = idsOf(layout.columns);
    assert.ok(rows.length >= 3 && columns.length >= 3);
    const at = (r: number, c: number): CellAt => ({ r: rows[r]!, c: columns[c]! });

    // A formula entered, and a text pasted.
    const entered = expectKind(
      client.request({
        kind: 'queueEdit',
        opId: 'op-enter',
        newIdCode: 'caaaaaaaaa',
        edit: { kind: 'enter', sheetId, cell: at(0, 0), entry: { kind: 'text', text: '=1+2' } },
      }),
      'editQueued',
    );
    assert.equal(entered.placeChanged?.sheetId, sheetId);
    state = sendAll(client, entered.syncState, revision);

    const pasted = expectKind(
      client.request({
        kind: 'queueEdit',
        opId: 'op-paste',
        newIdCode: 'daaaaaaaaa',
        edit: { kind: 'pasteTexts', sheetId, cells: [{ ...at(2, 2), text: '7' }], pastedTextIs: 'asTyped' },
      }),
      'editQueued',
    );
    state = sendAll(client, pasted.syncState, revision);
    assert.equal(state.unconfirmedCount, 0);
    assert.equal(state.confirmedRevision, revision.now);

    // The formulas worked out.
    state = expectKind(client.request({ kind: 'calculate' }), 'syncState');
    assert.equal(state.calculation, undefined);

    const read = expectKind(
      client.request({ kind: 'readCells', sheetId, cells: [at(0, 0), at(1, 1), at(2, 2)] }),
      'cellsContents',
    );
    assert.equal(read.cells.length, 2, 'the empty cell is left out');
    const [formula, number] = read.cells;
    assert.equal(formula?.input.kind, 'formula');
    assert.deepEqual(formula?.value, { kind: 'number', value: 3 });
    assert.equal(number?.input.kind, 'number');

    const workbook = expectKind(client.request({ kind: 'readWorkbook' }), 'workbookContents');
    assert.equal(workbook.sheets.length, 1);
    assert.equal(workbook.sheets[0]?.sheetId, sheetId);
    assert.equal(workbook.sheets[0]?.cells.length, 2);

    // The paste taken back as a step of the page's own, and sent.
    const undone = expectKind(client.request({ kind: 'queueNextUndo', opId: 'op-undo' }), 'editQueued');
    assert.equal(typeof undone.stepReversed, 'string');
    state = sendAll(client, undone.syncState, revision);
    const after = expectKind(client.request({ kind: 'readCells', sheetId, cells: [at(2, 2)] }), 'cellsContents');
    assert.deepEqual(after.cells, []);
  } finally {
    client.free();
  }
});

test('a utility request is answered by kind', () => {
  const utility = new UtilityClient(sheetsEngine());
  const shown = expectKind(
    utility.request({
      kind: 'readShownValue',
      value: { kind: 'number', value: 1234.5 },
      numberFormat: { pattern: '#,##0.00' },
      room: { kind: 'asText' },
      locale: 'de-DE',
    }),
    'shownValue',
  );
  assert.deepEqual(shown.shown, { kind: 'text', text: '1.234,50', textColor: null });

  const descriptions = utility.functionDescriptions();
  assert.ok(descriptions.functions.length > 0);
});
