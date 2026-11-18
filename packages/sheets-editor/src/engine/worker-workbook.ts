import type {
  CellTable,
  ColumnId,
  ConditionalFormatAsIf,
  DropdownToPointAt,
  Edit,
  EditOfAnother,
  EngineRecordedEdit,
  Filter,
  IdRun,
  ReadXlsxFileRequest,
  Refused,
  RuleInIds,
  SheetId,
  StreamedEdit,
  TableInIds,
  TableIntoSheet,
  TableOfASheet,
  TableWithColumns,
  XlsxFileAnswer,
} from '@open-artifact/sheets-core';
import { rememberLatestCausesOfError } from './cause-of-error-cache.ts';
import { createLocaleReaders, applyCoreReadout } from './core-reads.ts';
import { createWorkbookAccessor, type CellId, type RowsToSort, type SheetRead, type WorkbookRead, type WorkbookReads, type WorkbookServices } from '../model/workbook.ts';
import {
  callSyncListeners,
  syncListenerAdder,
  type Availability,
  type CaughtUpByLoad,
  type EditOutcome,
  type EditsDropped,
  type RefusalOfEveryEdit,
  type RestOfAct,
  type SyncedWorkbook,
  type SyncFault,
  type TakeBackOutcome,
  type UndoOrRedoOutcome,
} from '../store/workbook-sync.ts';
import { runEditOrRefuse, type WorkerLine } from './worker-line.ts';
import type { SheetsUtilities } from './wasm-bindings.ts';
import type { Happening, MessageToPage, QuestionAnswered, StoreQuestion } from './workbook-host.ts';
import type { ErrorKind } from '../model/refusals.ts';
import type { SavingState } from '../state/initial-state.ts';
import type { WorkbookStore } from '../store/workbook-node.ts';
import type { ClockReading } from '../store/frames.ts';
import type { LoadOutcome, SaveOutcome } from '../store/requests.ts';

/** What changed the workbook: formulas worked out alone, an edit of the page's own, or something unasked. */
export type CauseOfWorkbookChange = 'formulasAlone' | 'ownEdit' | 'unasked';

/** The tables read of each sheet, and whether they are of the sheet as it stands. */
export type TablesRead = Map<SheetId, { tables: TableOfASheet[]; isLatest: boolean }>;

/** Where saving stands, as the page is told it. */
export interface WorkbookSavingState {
  saving: SavingState;
  hasUnsavedEdits: boolean;
  unsavedEditCount: number;
  refusalOfEveryEdit: RefusalOfEveryEdit | null;
}

/** The file asked for, as the workbook writes it. */
export type XlsxFileAsked = Omit<ReadXlsxFileRequest, 'kind'>;

/** What a question of each kind carries, beside its kind; each kind is a service of the workbook's reads. */
export interface WorkbookQuestionFields {
  cellsToCopy: { oneCorner: CellId; otherCorner: CellId; rowsOutOfView: readonly IdRun[] };
  dropdownOptionsToOffer: { oneCorner: CellId; otherCorner: CellId };
  cellsThatADropdownWouldClear: { oneCorner: CellId; otherCorner: CellId; dropdown: DropdownToPointAt };
  cellsOfTheDropdownAt: { cellId: CellId };
  whatATableChanges: { rowsId: number; table: Omit<TableIntoSheet, 'rows'> };
  formatsGivenAsIf: { sheetId: SheetId; asIf: Iterable<ConditionalFormatAsIf> };
  conditionalFormatSuggestions: { oneCorner: CellId; otherCorner: CellId };
  tableAtCell: { cellId: CellId };
  cellTableAt: { cellId: CellId };
  cellTables: { sheetId: SheetId };
  cellTableDeclaredAs: { sheetId: SheetId; cellTable: CellTable };
  conditionalFormatsAsAgentIsTold: { oneCorner: CellId; otherCorner: CellId };
  conditionalFormatsInIds: { sheetId: SheetId; written: unknown };
  conditionalFormatsByAddress: { sheetId: SheetId; rules: Iterable<RuleInIds> };
  proposedFormulaValue: { cellId: CellId; text: string };
  filteredRows: { table: TableInIds; filter: Filter };
  valuesOfFilteredColumn: { table: TableInIds; filter: Filter | null; c: ColumnId };
  rowsInSortedOrder: { toSort: RowsToSort };
  causeOfError: { cellId: CellId; cellNow: string };
}
export type QuestionKind = keyof WorkbookQuestionFields;
export type QuestionOf<K extends QuestionKind> = { kind: K } & WorkbookQuestionFields[K];
/** A question the page asks the workbook on the worker. */
export type WorkbookQuestion = { [K in QuestionKind]: QuestionOf<K> }[QuestionKind];
export type AnswerOfQuestion<K extends QuestionKind> = ReturnType<WorkbookServices[K]>;

/** What the store answered a question of the host. */
export type StoreAnswer =
  | { kind: 'save'; outcome: SaveOutcome }
  | { kind: 'loadOps'; loaded: LoadOutcome }
  | { kind: 'askRevision'; revision: number | 'notSent' | null };

/** The rows of a table to import, sent once and known by `rowsId` in the questions about it. */
export interface RowsOfATable {
  kind: 'rowsOfATable';
  rowsId: number;
  rows: TableIntoSheet['rows'];
}

export interface OpenMessage {
  kind: 'open';
  revision: number;
  canWrite: boolean;
  timeZoneOfTheBrowser: string | null;
  timeTold: ClockReading | null;
  goesByTimeToldInAnyTimeZone: boolean;
}

/** What the page posts to the workbook's host. */
export type MessageToHost =
  | OpenMessage
  | { kind: 'queueEdit'; edit: Edit; restOfAct: RestOfAct }
  | { kind: 'undoOrRedo'; direction: 'undo' | 'redo' }
  | { kind: 'queueEditsThatTakeBack'; builtOnRevision: number; edits: EngineRecordedEdit[] }
  | { kind: 'seeRowsInOwnOrder'; sheetId: SheetId; rows: readonly IdRun[] | null }
  | { kind: 'writeXlsxFile'; asked: XlsxFileAsked }
  | { kind: 'readTableAt'; cellId: CellId }
  | { kind: 'followTablesOf'; sheetId: SheetId }
  | RowsOfATable
  | { kind: 'ask'; question: WorkbookQuestion }
  | { kind: 'storeAnswered'; questionNumber: number; answer: StoreAnswer }
  | { kind: 'editStreamed'; revision: number; applied: StreamedEdit }
  | { kind: 'storeRevisionReported'; revision: number }
  | { kind: 'timeTold'; time: ClockReading }
  | { kind: 'availabilityStated'; availability: Availability }
  | { kind: 'workOutFormulasLeft' }
  | { kind: 'storeReconnected' }
  | { kind: 'storeClosed' }
  | { kind: 'tabVisibilityChanged'; isHidden: boolean };

/** What the workbook on the worker is given by the page. */
export interface WorkerWorkbookOptions {
  line: WorkerLine<MessageToHost, MessageToPage>;
  utilities: SheetsUtilities;
  store: WorkbookStore;
  revision: number;
  canWrite: boolean;
  timeZoneOfTheBrowser: string | null;
  timeTold: ClockReading | null;
  goesByTimeToldInAnyTimeZone?: boolean;
  reportFault(fault: SyncFault): void;
  noteCoreThrew?(what: ErrorKind): void;
  noteCalculationTookTooLong(): void;
  reportThrown(error: unknown): void;
  onWorkerEnded(onEnded: () => void): void;
}

/** The workbook the page works with, on the worker or on the page's own thread: its answers come to callbacks. */
export interface OpenedWorkbook {
  isOnAnotherThread: boolean;
  reads(): WorkbookReads;
  queueEdit(edit: Edit, answer: (outcome: EditOutcome) => void, restOfAct?: RestOfAct): void;
  undoOrRedo(direction: 'undo' | 'redo', answer: (outcome: UndoOrRedoOutcome) => void): void;
  queueEditsThatTakeBack(builtOnRevision: number, edits: EngineRecordedEdit[], answer: (outcome: TakeBackOutcome) => void): void;
  seeRowsInOwnOrder(sheetId: SheetId, rows: readonly IdRun[] | null, answer: () => void): void;
  xlsxFile(asked: XlsxFileAsked, answer: (file: XlsxFileAnswer | 'threw' | null) => void): void;
  tableAt(cellId: CellId, answer: (table: TableWithColumns | null) => void): void;
  followTablesOf(sheetId: SheetId): void;
  tablesRead(): TablesRead;
  onTablesRead(listener: () => void): () => void;
  refusalOfEveryEdit(): RefusalOfEveryEdit | 'earlierVersionShown' | null;
  questionsMissedCount(): number;
  isAnswerAwaited(): boolean;
  onAnswersCame(listener: () => void): () => void;
  onCauseOfErrorCame(listener: (cellId: CellId | null) => void): () => void;
  readCellsToCopyAhead(oneCorner: CellId, otherCorner: CellId, rowsOutOfView: readonly IdRun[]): boolean;
  onCellsToCopyRead(listener: () => void): () => void;
  onChanged(listener: (cause: CauseOfWorkbookChange) => void): () => void;
  saving(): SavingState;
  revisionHeld(): number | null;
  hasUnsavedEdits(): boolean;
  unsavedEditCount(): number;
  onSavingChanged(listener: () => void): () => void;
  areFormulasLeft(): boolean;
  onFormulasLeftChanged(listener: () => void): () => void;
  workOutFormulasLeft(): void;
  onEditsDropped(listener: (dropped: EditsDropped) => void): () => void;
  onEditsOfOthersMade(listener: (edits: EditOfAnother[], before: WorkbookReads | null, after: WorkbookReads) => void): () => void;
  onLoaded(listener: (caughtUp: CaughtUpByLoad | null) => void): () => void;
  editStreamed(revision: number, applied: StreamedEdit): void;
  storeRevisionReported(revision: number): void;
  timeTold(time: ClockReading): void;
  availabilityStated(availability: Availability): void;
  storeReconnected(): void;
  storeClosed(): void;
  tabVisibilityChanged(isHidden: boolean): void;
}

export function createTablesReadKeeper() {
  let tablesRead: TablesRead = NO_TABLES_READ;
  let readFor = new Map<SheetId, { sheet: WeakRef<object>; json: string }>();
  return {
    afterReading(sheetAsItStands: (sheetId: SheetId) => SheetRead | null): TablesRead {
      let gone = [...tablesRead].filter(
        ([sheetId, { isLatest: isLatest }]) => isLatest && readFor.get(sheetId)?.sheet.deref() !== sheetAsItStands(sheetId),
      );
      if (gone.length === 0) return tablesRead;
      let next = new Map(tablesRead);
      for (let [sheetId, { tables: tables }] of gone)
        next.set(sheetId, {
          tables: tables,
          isLatest: false,
        });
      tablesRead = next;
      return tablesRead;
    },
    afterTablesRead(sheetId: SheetId, tables: TableOfASheet[], sheetAsItStands: (sheetId: SheetId) => SheetRead | null): TablesRead {
      let [json, before] = [JSON.stringify(tables), tablesRead.get(sheetId)];
      let sameTables = readFor.get(sheetId)?.json === json ? before?.tables : undefined;
      readFor.set(sheetId, {
        sheet: new WeakRef<object>(sheetAsItStands(sheetId) ?? {}),
        json: json,
      });
      tablesRead = new Map(tablesRead).set(sheetId, {
        tables: sameTables ?? tables,
        isLatest: true,
      });
      return tablesRead;
    },
  };
}
export { runEditOrRefuse } from './worker-line.ts';
export function asSameThreadWorkbook(workbook: SyncedWorkbook): OpenedWorkbook {
  let isOwnEditRunning = false;
  let runOnThisThread = <Outcome>(run: () => Outcome, answer: (outcome: NoInfer<Outcome> | Refused<RefusalOfEveryEdit | 'savingStopped'>) => void) => {
    let thrown: unknown[] = [];
    isOwnEditRunning = true;
    let outcome = runEditOrRefuse(workbook, run, (item) => void thrown.push(item));
    isOwnEditRunning = false;
    answer(outcome);
    if (thrown.length > 0) throw thrown[0];
  };
  return {
    ...workbook,
    isOnAnotherThread: false,
    onChanged: (listener) =>
      workbook.onChanged(
        (isFormulasAlone) => listener(isFormulasAlone ? 'formulasAlone' : isOwnEditRunning ? 'ownEdit' : 'unasked'),
      ),
    queueEdit: (edit, answer, restOfAct) =>
      runOnThisThread(() => workbook.queueEdit(edit, restOfAct), answer),
    undoOrRedo: (direction, answer) => runOnThisThread(() => workbook.undoOrRedo(direction), answer),
    queueEditsThatTakeBack: (builtOnRevision, edits, answer) =>
      runOnThisThread(() => workbook.queueEditsThatTakeBack(builtOnRevision, edits), answer),
    seeRowsInOwnOrder: (sheetId, rows, answer) =>
      runOnThisThread(() => workbook.seeRowsInOwnOrder(sheetId, rows), answer),
    xlsxFile(asked, answer) {
      let file: XlsxFileAnswer | 'threw' | null = 'threw';
      try {
        file = workbook.xlsxFile(asked);
      } finally {
        answer(file);
      }
    },
    tableAt(cellId, answer) {
      let table: TableWithColumns | null = null;
      try {
        table = workbook.tableAt(cellId);
      } finally {
        answer(table);
      }
    },
    followTablesOf() {},
    tablesRead: () => NO_TABLES_READ,
    onTablesRead: () => () => {},
    questionsMissedCount: () => 0,
    isAnswerAwaited: () => false,
    onAnswersCame: () => () => {},
    onCauseOfErrorCame: () => () => {},
    readCellsToCopyAhead: () => false,
    onCellsToCopyRead: () => () => {},
  };
}
export function openWorkbookOnWorker(options: WorkerWorkbookOptions): Promise<OpenedWorkbook | null> {
  let { line: line, utilities: utilities } = options;
  let reading: WorkbookRead | null = null;
  let reads: WorkbookReads | null = null;
  let readsBefore: WorkbookReads | null = null;
  let savingState: WorkbookSavingState = {
    ...SAVING_STOPPED_STATE,
    saving: 'allSaved',
    refusalOfEveryEdit: null,
  };
  let revisionHeld: number | null = null;
  let hasEnded = false;
  let editAnswers: ((outcome: EditOutcome) => void)[] = [];
  let undoAnswers: ((outcome: UndoOrRedoOutcome) => void)[] = [];
  let takeBackAnswers: ((outcome: TakeBackOutcome) => void)[] = [];
  let hasEditsInFlight = () => editAnswers.length > 0 || undoAnswers.length > 0 || takeBackAnswers.length > 0;
  let ownRowOrderAnswers: (() => void)[] = [];
  let xlsxAnswers: ((file: XlsxFileAnswer | 'threw' | null) => void)[] = [];
  let tableAnswers: ((table: TableWithColumns | null) => void)[] = [];
  let answers = new Map<string, QuestionAnswered | undefined>();
  let keepAnswers = (isKept: (answer: QuestionAnswered) => boolean) => {
    let kept = [...answers].filter(([, answer]) => answer === undefined || isKept(answer));
    answers = new Map(kept);
  };
  let questionsAwaited = 0;
  let questionsMissed = 0;
  let cellsToCopyKey: string | null = null;
  let changeListeners = new Set<(cause: CauseOfWorkbookChange) => void>();
  let savingListeners = new Set<() => void>();
  let formulasLeftListeners = new Set<() => void>();
  let areFormulasLeft = false;
  let droppedListeners = new Set<(dropped: EditsDropped) => void>();
  let othersEditsListeners = new Set<(edits: EditOfAnother[], before: WorkbookReads | null, after: WorkbookReads) => void>();
  let loadedListeners = new Set<(caughtUp: CaughtUpByLoad | null) => void>();
  let tablesReadKeeper = createTablesReadKeeper();
  let tablesRead: TablesRead = NO_TABLES_READ;
  let sheetIdFollowed: SheetId | null = null;
  let areTablesReadChanged = false;
  let tablesReadListeners = new Set<() => void>();
  let answersListeners = new Set<() => void>();
  let cellsToCopyListeners = new Set<() => void>();
  let causeOfErrorListeners = new Set<(cellId: CellId | null) => void>();
  let send = (message: MessageToHost) => {
    if (!hasEnded) line.send(message);
  };
  let answerTo = (question: WorkbookQuestion, askIfMissing: boolean): QuestionAnswered | null => {
    let key = questionKey(question);
    let answer = answers.get(key);
    if (answer !== undefined) return answer;
    if (hasEnded || !askIfMissing) return null;
    questionsMissed += 1;
    if (!answers.has(key)) {
      answers.set(key, undefined);
      questionsAwaited += 1;
      send({
        kind: 'ask',
        question: question,
      });
    }
    return null;
  };
  let causeOfError = rememberLatestCausesOfError((cellId, cellNow) => {
    if (hasEnded) return 'neverToCome';
    let question: QuestionOf<'causeOfError'> = {
      kind: 'causeOfError',
      cellId: cellId,
      cellNow: cellNow,
    };
    let key = questionKey(question);
    if (!answers.has(key)) {
      answers.set(key, undefined);
      send({
        kind: 'ask',
        question: question,
      });
    }
    let answer = answers.get(key);
    return answer?.about === 'causeOfError' && answer.answer?.isLatest === true ? answer.answer.said : 'yetToCome';
  });
  let localeUtilities = createLocaleReaders(utilities);
  let tableRowsIds = new WeakMap<TableIntoSheet['rows'], number>();
  let tableRowsCount = 0;
  let isStoreClosed = false;
  let guardStore = <T>(run: () => T): T => {
    try {
      return run();
    } catch (error: unknown) {
      throw (
        (isStoreClosed = true),
        send({
          kind: 'storeClosed',
        }),
        error
      );
    }
  };
  let guarded =
    <A extends unknown[], R>(read: (...args: A) => R) =>
    (...args: A): R | null =>
      isStoreClosed ? null : guardStore(() => read(...args));
  let readsFrom = (workbookRead: WorkbookRead) =>
    createWorkbookAccessor(workbookRead, {
      dayTypedInLocaleAs: guarded(localeUtilities.dayTypedInLocaleAs),
      shownInLocaleWithRoomForAll: guarded(localeUtilities.shownInLocaleWithRoomForAll),
      patternReadInLocale: guarded(localeUtilities.patternReadInLocale),
      formulaInLocale: guarded(localeUtilities.formulaInLocale),
      patternsOfLocale: guarded(localeUtilities.patternsOfLocale),
      fitOfColumnReadingsInLocale: guarded(localeUtilities.fitOfColumnReadingsInLocale),
      textsUnderAColumnReadingInLocale: guarded(localeUtilities.textsUnderAColumnReadingInLocale),
      labelsOfADropdownColumn: guarded(localeUtilities.labelsOfADropdownColumn),
      listLinesAsKept: guarded(localeUtilities.listLinesAsKept),
      timeZones: guarded(localeUtilities.timeZones),
      timeZoneNamed: guarded(localeUtilities.timeZoneNamed),
      locales: guarded(localeUtilities.locales),
      cellsToCopy(oneCorner, otherCorner, rowsOutOfView) {
        let answer = answerTo(
          {
            kind: 'cellsToCopy',
            oneCorner: oneCorner,
            otherCorner: otherCorner,
            rowsOutOfView: rowsOutOfView,
          },
          false,
        );
        return answer?.about === 'cellsToCopy' ? answer.answer : null;
      },
      dropdownOptionsToOffer(oneCorner, otherCorner) {
        let answer = answerTo(
          {
            kind: 'dropdownOptionsToOffer',
            oneCorner: oneCorner,
            otherCorner: otherCorner,
          },
          true,
        );
        return answer?.about === 'dropdownOptionsToOffer' ? answer.answer : null;
      },
      cellsThatADropdownWouldClear(oneCorner, otherCorner, dropdown) {
        let answer = answerTo(
          {
            kind: 'cellsThatADropdownWouldClear',
            oneCorner: oneCorner,
            otherCorner: otherCorner,
            dropdown: dropdown,
          },
          true,
        );
        return answer?.about === 'cellsThatADropdownWouldClear' ? answer.answer : null;
      },
      cellsOfTheDropdownAt(cellId) {
        let answer = answerTo(
          {
            kind: 'cellsOfTheDropdownAt',
            cellId: cellId,
          },
          true,
        );
        return answer?.about === 'cellsOfTheDropdownAt' ? answer.answer : null;
      },
      whatATableChanges({ rows: rows, ...table }) {
        let rowsId = tableRowsIds.get(rows);
        if (rowsId === undefined) {
          rowsId = tableRowsCount += 1;
          tableRowsIds.set(rows, rowsId);
          send({
            kind: 'rowsOfATable',
            rowsId: rowsId,
            rows: rows,
          });
        }
        let answer = answerTo(
          {
            kind: 'whatATableChanges',
            rowsId: rowsId,
            table: table,
          },
          true,
        );
        return answer?.about === 'whatATableChanges' ? answer.answer : null;
      },
      formatsGivenAsIf(sheetId, asIf) {
        let answer = answerTo(
          {
            kind: 'formatsGivenAsIf',
            sheetId: sheetId,
            asIf: asIf,
          },
          true,
        );
        return answer?.about === 'formatsGivenAsIf' ? answer.answer : null;
      },
      conditionalFormatSuggestions(oneCorner, otherCorner) {
        let answer = answerTo(
          {
            kind: 'conditionalFormatSuggestions',
            oneCorner: oneCorner,
            otherCorner: otherCorner,
          },
          true,
        );
        return answer?.about === 'conditionalFormatSuggestions' ? answer.answer : null;
      },
      tableAtCell(cellId) {
        let answer = answerTo(
          {
            kind: 'tableAtCell',
            cellId: cellId,
          },
          true,
        );
        return answer?.about === 'tableAtCell' ? answer.answer : null;
      },
      cellTableAt(cellId) {
        let answer = answerTo(
          {
            kind: 'cellTableAt',
            cellId: cellId,
          },
          true,
        );
        return answer?.about === 'cellTableAt' ? answer.answer : null;
      },
      cellTables(sheetId) {
        let answer = answerTo(
          {
            kind: 'cellTables',
            sheetId: sheetId,
          },
          true,
        );
        return answer?.about === 'cellTables' ? answer.answer : null;
      },
      cellTableDeclaredAs(sheetId, cellTable) {
        let answer = answerTo(
          {
            kind: 'cellTableDeclaredAs',
            sheetId: sheetId,
            cellTable: cellTable,
          },
          true,
        );
        return answer?.about === 'cellTableDeclaredAs' ? answer.answer : null;
      },
      conditionalFormatsAsAgentIsTold(oneCorner, otherCorner) {
        let answer = answerTo(
          {
            kind: 'conditionalFormatsAsAgentIsTold',
            oneCorner: oneCorner,
            otherCorner: otherCorner,
          },
          true,
        );
        return answer?.about === 'conditionalFormatsAsAgentIsTold' ? answer.answer : null;
      },
      conditionalFormatsInIds(sheetId, written) {
        let answer = answerTo(
          {
            kind: 'conditionalFormatsInIds',
            sheetId: sheetId,
            written: written,
          },
          true,
        );
        return answer?.about === 'conditionalFormatsInIds' ? answer.answer : null;
      },
      conditionalFormatsByAddress(sheetId, rules) {
        let answer = answerTo(
          {
            kind: 'conditionalFormatsByAddress',
            sheetId: sheetId,
            rules: rules,
          },
          true,
        );
        return answer?.about === 'conditionalFormatsByAddress' ? answer.answer : null;
      },
      proposedFormulaValue(cellId, text) {
        let answer = answerTo(
          {
            kind: 'proposedFormulaValue',
            cellId: cellId,
            text: text,
          },
          true,
        );
        return answer?.about === 'proposedFormulaValue' ? answer.answer : null;
      },
      filteredRows(table, filter) {
        let answer = answerTo(
          {
            kind: 'filteredRows',
            table: table,
            filter: filter,
          },
          true,
        );
        return answer?.about === 'filteredRows' ? answer.answer : null;
      },
      valuesOfFilteredColumn(table, filter, column) {
        let answer = answerTo(
          {
            kind: 'valuesOfFilteredColumn',
            table: table,
            filter: filter,
            c: column,
          },
          true,
        );
        return answer?.about === 'valuesOfFilteredColumn' ? answer.answer : null;
      },
      rowsInSortedOrder(toSort) {
        let answer = answerTo(
          {
            kind: 'rowsInSortedOrder',
            toSort: toSort,
          },
          true,
        );
        return answer?.about === 'rowsInSortedOrder' ? answer.answer : null;
      },
      causeOfError: causeOfError,
    });
  async function answerStore(questionNumber: number, question: StoreQuestion): Promise<void> {
    let answer = await askStore(question);
    send({
      kind: 'storeAnswered',
      questionNumber: questionNumber,
      answer: answer,
    });
  }
  async function askStore(question: StoreQuestion): Promise<StoreAnswer> {
    switch (question.kind) {
      case 'save':
        return {
          kind: 'save',
          outcome: await options.store.save(question.edit),
        };
      case 'loadOps':
        return {
          kind: 'loadOps',
          loaded: await options.store.loadOps(),
        };
      case 'askRevision':
        return {
          kind: 'askRevision',
          revision: await options.store.askRevision(),
        };
    }
  }
  let resolveOpened: ((isOpen: boolean) => void) | null = null;
  let opened = new Promise<boolean>((resolve) => void (resolveOpened = resolve));
  function takeAnswer(answered: QuestionAnswered) {
    let key = questionKey(answered.question);
    let wasAwaited = answers.has(key) && answers.get(key) === undefined;
    if (answered.about === 'cellsToCopy' && key !== cellsToCopyKey) return;
    answers.set(key, answered);
    if (answered.about === 'causeOfError') return callSyncListeners(causeOfErrorListeners, answered.question.cellId);
    if (answered.about === 'cellsToCopy') return callSyncListeners(cellsToCopyListeners);
    if (!wasAwaited) return;
    questionsAwaited -= 1;
    if (questionsAwaited > 0) return;
    try {
      callSyncListeners(answersListeners);
    } finally {
      if (questionsAwaited === 0) keepAnswers((answer) => !isTableQuestion(answer));
    }
  }
  function answerEdit<Outcome>(answersAwaited: ((outcome: Outcome) => void)[], outcome: Outcome) {
    try {
      answersAwaited.shift()?.(outcome);
    } finally {
      if (!hasEnded && !hasEditsInFlight()) callSyncListeners(savingListeners);
    }
  }
  function takeHappening(happening: Happening) {
    switch (happening.kind) {
      case 'read': {
        let before = reading;
        reading = guardStore(() => applyCoreReadout(before, happening.reading, utilities));
        readsBefore = reads;
        reads = readsFrom(reading);
        tablesRead = tablesReadKeeper.afterReading(reads.sheetAsItStands);
        keepAnswers((answer) => questionsAwaited > 0 && isTableQuestion(answer));
        return;
      }
      case 'revisionHeldChanged':
        revisionHeld = happening.revision;
        return;
      case 'opened':
        savingState = happening;
        return resolveOpened?.(happening.isOpen);
      case 'changed':
        areTablesReadChanged = false;
        return callSyncListeners(changeListeners, happening.cause);
      case 'formulasLeftChanged':
        areFormulasLeft = happening.areLeft;
        keepAnswers((answer) => answer.about !== 'causeOfError');
        return callSyncListeners(formulasLeftListeners);
      case 'savingChanged':
        savingState = happening;
        return callSyncListeners(savingListeners);
      case 'editsDropped':
        return callSyncListeners(droppedListeners, happening.dropped);
      case 'editsOfOthersMade': {
        if (reads === null) return;
        let before = happening.before === null ? null : happening.before === 'asAfter' ? reads : readsBefore;
        return callSyncListeners(othersEditsListeners, happening.edits, before, reads);
      }
      case 'loaded': {
        let before = happening.caughtUp?.before === 'asAfter' ? reads : readsBefore;
        if (happening.caughtUp === null || before === null || reads === null) return callSyncListeners(loadedListeners, null);
        return callSyncListeners(loadedListeners, {
          ...happening.caughtUp,
          before: before,
          after: reads,
        });
      }
      case 'faultReported':
        return options.reportFault(happening.fault);
      case 'coreThrew':
        return options.noteCoreThrew?.(happening.what);
      case 'calculationTookTooLong':
        return options.noteCalculationTookTooLong();
      case 'editAnswered':
        return answerEdit(editAnswers, happening.outcome);
      case 'undoOrRedoAnswered':
        return answerEdit(undoAnswers, happening.outcome);
      case 'takeBackAnswered':
        return answerEdit(takeBackAnswers, happening.outcome);
      case 'ownRowOrderSeen':
        keepAnswers((answer) => !isTableQuestion(answer));
        return ownRowOrderAnswers.shift()?.();
      case 'xlsxFileWritten':
        return xlsxAnswers.shift()?.(happening.file);
      case 'tableRead':
        return tableAnswers.shift()?.(happening.table);
      case 'tablesOfSheetRead': {
        if (reads === null) return;
        tablesRead = tablesReadKeeper.afterTablesRead(happening.sheetId, happening.tables, reads.sheetAsItStands);
        areTablesReadChanged = true;
        return;
      }
      case 'answered':
        return takeAnswer(happening);
      case 'storeAsked':
        return void answerStore(happening.questionNumber, happening.question);
      case 'coreAnswered':
        return;
      case 'threw':
        return options.reportThrown(Error(`in the workbook’s worker: ${happening.inWords}`));
    }
  }
  let takeHappenings = (happenings: Happening[]) => {
    for (let happening of happenings)
      try {
        takeHappening(happening);
      } catch (error: unknown) {
        options.reportThrown(error);
      }
    readsBefore = null;
    if (!areTablesReadChanged) return;
    areTablesReadChanged = false;
    try {
      callSyncListeners(tablesReadListeners);
    } catch (error: unknown) {
      options.reportThrown(error);
    }
  };
  line.onMessage(({ happened: happened }) => takeHappenings(happened));
  options.onWorkerEnded(() => {
    if (hasEnded) return;
    hasEnded = true;
    let refused: Refused<'savingStopped'> = {
      kind: 'refused',
      refusal: 'savingStopped',
    };
    let wereAnswersAwaited = questionsAwaited > 0;
    answers = new Map<string, QuestionAnswered | undefined>();
    questionsAwaited = 0;
    let hasUnsavedEdits = savingState.hasUnsavedEdits || hasEditsInFlight();
    let stoppedState: WorkbookSavingState = options.canWrite
      ? SAVING_STOPPED_STATE
      : {
          ...SAVING_STOPPED_STATE,
          refusalOfEveryEdit: 'readOnly',
        };
    takeHappenings([
      {
        kind: 'revisionHeldChanged',
        revision: null,
      },
      {
        kind: 'opened',
        isOpen: false,
        ...stoppedState,
      },
      {
        kind: 'savingChanged',
        ...stoppedState,
        hasUnsavedEdits: hasUnsavedEdits,
      },
      {
        kind: 'formulasLeftChanged',
        areLeft: false,
      },
      ...editAnswers.map(
        (): Happening => ({
          kind: 'editAnswered',
          outcome: refused,
        }),
      ),
      ...undoAnswers.map(
        (): Happening => ({
          kind: 'undoOrRedoAnswered',
          outcome: refused,
        }),
      ),
      ...takeBackAnswers.map(
        (): Happening => ({
          kind: 'takeBackAnswered',
          outcome: refused,
        }),
      ),
      ...ownRowOrderAnswers.map(
        (): Happening => ({
          kind: 'ownRowOrderSeen',
        }),
      ),
      ...xlsxAnswers.map(
        (): Happening => ({
          kind: 'xlsxFileWritten',
          file: 'threw',
        }),
      ),
      ...tableAnswers.map(
        (): Happening => ({
          kind: 'tableRead',
          table: null,
        }),
      ),
    ]);
    if (wereAnswersAwaited) callSyncListeners(answersListeners);
    callSyncListeners(cellsToCopyListeners);
    callSyncListeners(causeOfErrorListeners, null);
  });
  send({
    kind: 'open',
    revision: options.revision,
    canWrite: options.canWrite,
    timeZoneOfTheBrowser: options.timeZoneOfTheBrowser,
    timeTold: options.timeTold,
    goesByTimeToldInAnyTimeZone: options.goesByTimeToldInAnyTimeZone === true,
  });
  let readsNow = () => {
    if (reads === null) throw Error('the workbook’s worker said that it is open and read nothing');
    return reads;
  };
  return opened.then(
    (isOpen): OpenedWorkbook | null =>
      !isOpen
        ? null
        : {
            isOnAnotherThread: true,
            reads: readsNow,
            queueEdit(edit, answer, restOfAct = {}) {
              if (hasEnded)
                return answer({
                  kind: 'refused',
                  refusal: 'savingStopped',
                });
              editAnswers.push(answer);
              return send({
                kind: 'queueEdit',
                edit: edit,
                restOfAct: restOfAct,
              });
            },
            undoOrRedo(direction, answer) {
              if (hasEnded)
                return answer({
                  kind: 'refused',
                  refusal: 'savingStopped',
                });
              undoAnswers.push(answer);
              return send({
                kind: 'undoOrRedo',
                direction: direction,
              });
            },
            queueEditsThatTakeBack(builtOnRevision, edits, answer) {
              if (hasEnded)
                return answer({
                  kind: 'refused',
                  refusal: 'savingStopped',
                });
              takeBackAnswers.push(answer);
              return send({
                kind: 'queueEditsThatTakeBack',
                builtOnRevision: builtOnRevision,
                edits: edits,
              });
            },
            seeRowsInOwnOrder(sheetId, rows, answer) {
              if (hasEnded) return answer();
              ownRowOrderAnswers.push(answer);
              return send({
                kind: 'seeRowsInOwnOrder',
                sheetId: sheetId,
                rows: rows,
              });
            },
            xlsxFile(asked, answer) {
              if (hasEnded) return answer(null);
              xlsxAnswers.push(answer);
              return send({
                kind: 'writeXlsxFile',
                asked: asked,
              });
            },
            tableAt(cellId, answer) {
              if (hasEnded) return answer(null);
              tableAnswers.push(answer);
              return send({
                kind: 'readTableAt',
                cellId: cellId,
              });
            },
            followTablesOf(sheetId) {
              if (sheetId === sheetIdFollowed) return;
              sheetIdFollowed = sheetId;
              send({
                kind: 'followTablesOf',
                sheetId: sheetId,
              });
            },
            tablesRead: () => tablesRead,
            onTablesRead: syncListenerAdder(tablesReadListeners),
            refusalOfEveryEdit: () => savingState.refusalOfEveryEdit,
            questionsMissedCount: () => questionsMissed,
            isAnswerAwaited: () => questionsAwaited > 0,
            onAnswersCame: syncListenerAdder(answersListeners),
            onCauseOfErrorCame: syncListenerAdder(causeOfErrorListeners),
            readCellsToCopyAhead(oneCorner, otherCorner, rowsOutOfView) {
              let question: QuestionOf<'cellsToCopy'> = {
                kind: 'cellsToCopy',
                oneCorner: oneCorner,
                otherCorner: otherCorner,
                rowsOutOfView: rowsOutOfView,
              };
              let key = questionKey(question);
              if (hasEnded) return false;
              if (answers.has(key)) return answers.get(key) === undefined;
              if (cellsToCopyKey !== null) answers.delete(cellsToCopyKey);
              cellsToCopyKey = key;
              answers.set(key, undefined);
              send({
                kind: 'ask',
                question: question,
              });
              return true;
            },
            onCellsToCopyRead: syncListenerAdder(cellsToCopyListeners),
            onChanged: syncListenerAdder(changeListeners),
            saving: () => savingState.saving,
            revisionHeld: () => revisionHeld,
            hasUnsavedEdits: () => savingState.hasUnsavedEdits || hasEditsInFlight(),
            unsavedEditCount: () => savingState.unsavedEditCount,
            onSavingChanged: syncListenerAdder(savingListeners),
            areFormulasLeft: () => areFormulasLeft,
            onFormulasLeftChanged: syncListenerAdder(formulasLeftListeners),
            workOutFormulasLeft: () =>
              send({
                kind: 'workOutFormulasLeft',
              }),
            onEditsDropped: syncListenerAdder(droppedListeners),
            onEditsOfOthersMade: syncListenerAdder(othersEditsListeners),
            onLoaded: syncListenerAdder(loadedListeners),
            editStreamed: (revision, applied) =>
              send({
                kind: 'editStreamed',
                revision: revision,
                applied: applied,
              }),
            storeRevisionReported: (revision) =>
              send({
                kind: 'storeRevisionReported',
                revision: revision,
              }),
            timeTold: (time) =>
              void (
                time !== options.timeTold &&
                send({
                  kind: 'timeTold',
                  time: time,
                })
              ),
            availabilityStated: (availability) =>
              send({
                kind: 'availabilityStated',
                availability: availability,
              }),
            storeReconnected: () =>
              send({
                kind: 'storeReconnected',
              }),
            storeClosed: () =>
              send({
                kind: 'storeClosed',
              }),
            tabVisibilityChanged: (isHidden) =>
              send({
                kind: 'tabVisibilityChanged',
                isHidden: isHidden,
              }),
          },
  );
}
export const NO_TABLES_READ: TablesRead = new Map<SheetId, { tables: TableOfASheet[]; isLatest: boolean }>();
export const SAVING_STOPPED_STATE: WorkbookSavingState = {
  saving: 'stopped',
  hasUnsavedEdits: false,
  unsavedEditCount: 0,
  refusalOfEveryEdit: 'savingStopped',
};
export const questionKey = (question: WorkbookQuestion) => JSON.stringify(question);
export const isTableQuestion = ({ about: about }: { about: QuestionKind }) =>
  about === 'tableAtCell' ||
  about === 'cellTableAt' ||
  about === 'cellTables' ||
  about === 'cellTableDeclaredAs' ||
  about === 'filteredRows' ||
  about === 'rowsInSortedOrder' ||
  about === 'valuesOfFilteredColumn';
