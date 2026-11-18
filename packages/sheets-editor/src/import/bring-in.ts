import type { Dynamic } from '../dynamic.ts';
import { isSameSelection } from '../selection/model.ts';
import { withNoEffects } from '../state/transitions.ts';
import { dropdownOptionsForImport, importPlanAsShown, destinationWithColumnsLeftOut, importDestinationOf, importPlacesLeft } from './import-flow.ts';
import { tableImportRequest } from './places.ts';
import { isImportPlanComing, importPlanSoFar, stopAwaitingImportPlan } from './import-review.ts';
import { MAX_PREVIEW_COLUMNS } from './preview.ts';
import { dataLineNumbers, importColumnTexts, readingFittingTexts, trueOrFalseTextOf } from './column-readings.ts';
import { importedSheetLook } from './file-awaited.ts';
import { isDefaultSheetName } from '../grid/layout.ts';
import { queueEdit, IF_QUEUED_PLACE_CHANGED } from '../model/edit-effects.ts';
import { importMarksToCome } from './marks-of-import.ts';
import { changesByHand, columnsLeftOutByHand } from './by-hand.ts';
import { blankColumnsOf } from './blank-columns.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function narrowImportedArea(edit: Dynamic, selection: Dynamic, reads: WorkbookReads) {
  if (edit.kind !== 'importTableIntoSheet' || selection === null || selection.area === null) return selection;
  let columnIndexes = edit.table.columns.flatMap(
    (column?: Dynamic) => (column === null ? [] : (reads.columnIndexOf(selection.sheetId, column.column) ?? [])),
  );
  if (columnIndexes.length === 0) return selection;
  let firstColumnIndex = (Math.min as Dynamic)(...columnIndexes);
  let lastColumnIndex = (Math.max as Dynamic)(...columnIndexes) - firstColumnIndex + 1;
  let value = (input?: Dynamic) =>
    reads
      .columnIndexesOnShowIn(selection.sheetId, input)
      .some((input2?: Dynamic) => input2 >= firstColumnIndex && input2 < firstColumnIndex + lastColumnIndex);
  let { topRowIndex: topRowIndex } = selection.area;
  let { rowCount: rowCount }: Dynamic = selection.area;
  while (rowCount > 1 && !value(topRowIndex + rowCount - 1)) rowCount -= 1;
  return {
    ...selection,
    area: {
      ...selection.area,
      leftColumnIndex: firstColumnIndex,
      columnCount: lastColumnIndex,
      rowCount: rowCount,
    },
  };
}
export function updateSelectionJustImported(state: PageState, stateBefore?: Dynamic, event?: Dynamic) {
  let isEditQueued = event.kind === 'editAnswered' && event.outcome.kind === 'editQueued' && event.edit.kind === 'importTableAsNewSheet';
  let isAnswered =
    state.isSelectionJustImported &&
    isSameSelection(state, stateBefore) &&
    state.scrollTop === stateBefore.scrollTop &&
    state.scrollLeft === stateBefore.scrollLeft;
  let isOver = isEditQueued || isAnswered;
  return isOver === stateBefore.isSelectionJustImported
    ? stateBefore
    : {
        ...stateBefore,
        isSelectionJustImported: isOver,
      };
}
export function discardImport(state: PageState) {
  let hadImport = state.importOfAFile !== null;
  return closeImportOfAFile(
    hadImport
      ? {
          ...state,
          lastDone: {
            what: 'importDiscarded',
          },
        }
      : state,
  );
}
export function escapeImport(state: PageState, isForced?: Dynamic) {
  let importOfAFile = state.importOfAFile;
  return importOfAFile !== null && (isForced || hasImportWorkToLose(importOfAFile))
    ? withNoEffects({
        ...state,
        importOfAFile: {
          ...importOfAFile,
          isDiscardAsked: true,
        },
      })
    : discardImport(state);
}
export function keepImport(state: PageState) {
  let importOfAFile = state.importOfAFile;
  return withNoEffects(
    importOfAFile === null
      ? state
      : {
          ...state,
          importOfAFile: {
            ...importOfAFile,
            isDiscardAsked: false,
          },
        },
  );
}
export function columnImportOfReading(reading: Dynamic, columnIndex: Dynamic, reads: WorkbookReads) {
  if (reading.kind === 'trueOrFalse')
    return {
      kind: 'asTyped',
    };
  if (reading.kind !== 'dropdown')
    return {
      kind: 'read',
      reading: reading,
    };
  let [firstLabel, ...otherLabels] = dropdownOptionsForImport(reading, reads.labelsOfADropdownColumn(columnIndex) ?? []);
  return firstLabel === undefined
    ? {
        kind: 'read',
        reading: {
          kind: 'text',
        },
      }
    : {
        kind: 'dropdown',
        options: [firstLabel, ...otherLabels],
      };
}
export function importEditOfPlan(importOfAFile?: Dynamic, reads?: Dynamic, afterSheet?: Dynamic) {
  let { table: table } = importOfAFile;
  let plan = importPlanAsShown(importOfAFile);
  let destination = destinationWithColumnsLeftOut(importOfAFile);
  if (destination.kind === 'sheet')
    return {
      kind: 'importTableIntoSheet',
      table: tableImportRequest(destination, table, plan),
    };
  return newSheetImportEdit(importOfAFile, plan, reads, afterSheet, null);
}
export function importPreviewOnGrid(
  importOfAFile?: Dynamic,
  afterSheet?: Dynamic,
  mostRecords?: Dynamic,
  drawnAnyway: Dynamic = NOTHING_DRAWN_ANYWAY,
  columnsOut: Dynamic = null,
) {
  if (importDestinationOf(importOfAFile).kind !== 'newSheet' && !isImportPlanComing(importOfAFile)) return null;
  let plan = withColumnsAsTextFrom(withLinesDrawnAnyway(importPlanSoFar(importOfAFile).plan, drawnAnyway), columnsOut);
  return newSheetImportEdit(importOfAFile, plan, null, afterSheet, {
    mostRecords: mostRecords,
    linesDrawnAnyway: drawnAnyway.lines,
    columnsOut: importColumnsOutOfDrawing(importOfAFile, drawnAnyway),
  });
}
export function importColumnsOverLimit(importOfAFile?: Dynamic) {
  let { plan: plan } = importPlanSoFar(importOfAFile);
  let columnIndexes = new (Set as Dynamic)(importColumnsLeftOut(importOfAFile, plan));
  return plan.columns.flatMap(
    (column?: Dynamic, index?: Dynamic) => (index >= MAX_PREVIEW_COLUMNS && !columnIndexes.has(index) ? [index] : []),
  );
}
export function importDrawnPositions(importOfAFile?: Dynamic, drawnAnyway?: Dynamic, mostRecords?: Dynamic) {
  let lines = withLinesDrawnAnyway(importPlanSoFar(importOfAFile).plan, drawnAnyway);
  let dataLines = drawnAnyway.lines.length === 0 ? [] : dataLineNumbers(importOfAFile.table, lines);
  let recordIndexes = recordIndexesToDraw(dataLines, mostRecords, drawnAnyway.lines).map((input?: Dynamic) => dataLines[input]);
  let columnsOut = importColumnsOutOfDrawing(importOfAFile, drawnAnyway);
  return {
    rowNumbers: drawnAnyway.lines.flatMap((line?: Dynamic) => {
      let value = recordIndexes.indexOf(line);
      return value < 0 ? [] : [value + 2];
    }),
    columnsDrawn: drawnAnyway.columns.map(
      (column?: Dynamic) => column - columnsOut.filter((input?: Dynamic) => input < column).length,
    ),
  };
}
export function importMergeKeyColumn(importOfAFile?: Dynamic) {
  let destination = importDestinationOf(importOfAFile);
  return destination.kind === 'sheet' && destination.how.kind === 'mergeByKey' ? destination.how.keyColumnIndex : null;
}
export function newSheetImportEdit(importOfAFile: Dynamic, plan: Dynamic, afterSheet: Dynamic, reads: WorkbookReads, drawing?: Dynamic) {
  let { table: table } = importOfAFile;
  let dataLineNumbers2 = dataLineNumbers(table, plan);
  let columns = plan.columns.map(({ reading: reading }: Dynamic, index?: Dynamic) => {
    let importColumnTexts2 = importColumnTexts(table, dataLineNumbers2, index);
    let readingFittingTexts2 = readingFittingTexts(reading, importColumnTexts2);
    return {
      toImport: columnImportOfReading(readingFittingTexts2, importColumnTexts2, reads),
      texts:
        readingFittingTexts2.kind === 'trueOrFalse'
          ? importColumnTexts2.map((importColumnText?: Dynamic) => trueOrFalseTextOf(importColumnText) ?? '')
          : importColumnTexts2,
    };
  });
  let columnsLeftOut = new (Set as Dynamic)(drawing?.columnsOut ?? importColumnsLeftOut(importOfAFile, plan));
  let value =
    drawing === null
      ? dataLineNumbers2.map((dataLineNumber?: Dynamic, index?: Dynamic) => index)
      : recordIndexesToDraw(dataLineNumbers2, drawing.mostRecords, drawing.linesDrawnAnyway);
  let value2 = (input?: Dynamic) => input.filter((input2?: Dynamic, index?: Dynamic) => !columnsLeftOut.has(index));
  let headerNames = value2(plan.columns).map(({ name: name }: Dynamic) => name);
  return {
    kind: 'importTableAsNewSheet',
    afterSheet: afterSheet,
    name: plan.sheetName,
    rows: [headerNames, ...value.map((input?: Dynamic) => value2(columns).map(({ texts: texts }: Dynamic) => texts[input] ?? ''))],
    headerRows: 1,
    columns: value2(columns).map(({ toImport: toImport }: Dynamic) => toImport),
    look: importedSheetLook(headerNames),
  };
}
export function importUndoOffer(importOfAFile?: Dynamic) {
  let destination = importDestinationOf(importOfAFile);
  let { intoSheet: intoSheet } = importOfAFile;
  if (destination.kind === 'newSheet') {
    let plan = importPlanAsShown(importOfAFile);
    return {
      kind: 'tableImportedAsNewSheet',
      sheetName: importOfAFile.newSheet?.name ?? plan.sheetName,
      rowCount: dataLineNumbers(importOfAFile.table, plan).length,
      isSaved: false,
    };
  }
  if (intoSheet?.kind !== 'changes') return null;
  let place = importPlacesLeft(importOfAFile).find(({ table: table }: Dynamic) => table.sheetId === destination.sheetId);
  let { isReplaced: isReplaced, addedCount: addedCount, changedCount: changedCount } = intoSheet;
  return {
    kind: 'tableImportedIntoSheet',
    sheetName: place?.table.name ?? '',
    isReplaced: isReplaced,
    addedCount: addedCount,
    changedCount: changedCount,
    isSaved: false,
  };
}
export function isWorkbookOneUntouchedSheet(reads: WorkbookReads, stem?: Dynamic) {
  let [firstSheet, ...otherSheets] = reads.listSheets();
  return firstSheet !== undefined && otherSheets.length === 0 && reads.isSheetAsNew(firstSheet.sheetId) && isDefaultSheetName(firstSheet.name, stem);
}
export function confirmImport(state: PageState, reads: WorkbookReads, plansHeardCount?: Dynamic) {
  let importOfAFile = state.importOfAFile;
  if (importOfAFile === null) return withNoEffects(state);
  if (isImportPlanComing(importOfAFile)) return withNoEffects(state);
  if (plansHeardCount !== importOfAFile.plansHeardCount) return withNoEffects(state);
  if (importOfAFile.agent.kind === 'isAsked') return stopAwaitingImportPlan(state);
  if (importDestinationOf(importOfAFile).kind === 'sheet' && importOfAFile.intoSheet?.kind !== 'changes') return withNoEffects(state);
  if (importOfAFile.newSheet?.hasRoom === false) return withNoEffects(state);
  if (importRecordCount(importOfAFile) === 0) return withNoEffects(state);
  let isOneUntouchedSheet = isWorkbookOneUntouchedSheet(reads, importOfAFile.words.stemOfNewSheetNames) ? null : state.sheetId;
  let edit = importEditOfPlan(importOfAFile, isOneUntouchedSheet, reads);
  return withStopImportAskEffect(
    state,
    queueEdit(
      {
        ...state,
        importOfAFile: null,
        marksOfImportToCome: importMarksToCome(edit, reads),
      },
      edit,
      {
        ...IF_QUEUED_PLACE_CHANGED,
        ...(edit.kind === 'importTableIntoSheet' && {
          isPlaceOnlyShown: true,
        }),
        undoOffer: importUndoOffer(importOfAFile),
      },
    ),
  );
}
export const withStopImportAskEffect = (state: PageState, transition?: Dynamic) =>
  state.importOfAFile?.agent.kind === 'isAsked'
    ? {
        ...transition,
        effects: [
          {
            kind: 'stopAskingAgentAboutImport',
          },
          ...transition.effects,
        ],
      }
    : transition;
export const closeImportOfAFile = (state: PageState) =>
  withStopImportAskEffect(
    state,
    withNoEffects({
      ...state,
      importOfAFile: null,
      fileAwaited: null,
    }),
  );
export const hasImportWorkToLose = (importOfAFile?: Dynamic) =>
  changesByHand(importOfAFile.plan, importOfAFile.byHand).length > 0 ||
  Object.values(importOfAFile.byHand.columns).some(({ isLeftOut: isLeftOut }: Dynamic) => isLeftOut !== undefined) ||
  Object.keys(importOfAFile.answers).length > 0 ||
  importOfAFile.destinationChosen !== null ||
  importOfAFile.plansOfAgent.length > 1 ||
  ((importOfAFile.agent.kind === 'isAsked' || importOfAFile.agent.kind === 'hasFailed') && importOfAFile.agent.wish !== null);
export const withColumnsAsTextFrom = (plan?: Dynamic, columnsAsText?: Dynamic) =>
  columnsAsText === null
    ? plan
    : {
        ...plan,
        columns: plan.columns.map(
          (column?: Dynamic, index?: Dynamic) =>
            index < columnsAsText
              ? column
              : {
                  ...column,
                  reading: {
                    kind: 'text',
                  },
                },
        ),
      };
export const NOTHING_DRAWN_ANYWAY = {
  lines: [],
  columns: [],
};
export const withLinesDrawnAnyway = (plan: Dynamic, { lines: lines }: Dynamic) =>
  lines.length === 0
    ? plan
    : {
        ...plan,
        linesLeftOut: plan.linesLeftOut.filter((line?: Dynamic) => !lines.includes(line)),
      };
export const importColumnsOutOfDrawing = (importOfAFile: Dynamic, { columns: columns }: Dynamic) =>
  [...importColumnsLeftOut(importOfAFile, importPlanSoFar(importOfAFile).plan), ...importColumnsOverLimit(importOfAFile)]
    .filter((input?: Dynamic) => !columns.includes(input))
    .toSorted((input?: Dynamic, options?: Dynamic) => input - options);
export const recordIndexesToDraw = (records?: Dynamic, mostRecords?: Dynamic, drawnAnyway?: Dynamic) =>
  records.flatMap((record?: Dynamic, index?: Dynamic) => (index < mostRecords || drawnAnyway.includes(record) ? [index] : []));
export const importColumnsLeftOut = (importOfAFile?: Dynamic, plan?: Dynamic) =>
  [...new (Set as Dynamic)([...columnsLeftOutByHand(importOfAFile.byHand), ...blankColumnsLeftOutOnGrid(importOfAFile, plan)])].filter(
    (input?: Dynamic) => input !== importMergeKeyColumn(importOfAFile),
  );
export const blankColumnsLeftOutOnGrid = (importOfAFile?: Dynamic, plan?: Dynamic) =>
  importDestinationOf(importOfAFile).kind === 'newSheet'
    ? blankColumnsOf(importOfAFile.table, plan).filter((input?: Dynamic) => importOfAFile.byHand.columns[input]?.isLeftOut !== false)
    : [];
export const importRecordCount = (importOfAFile?: Dynamic) =>
  dataLineNumbers(importOfAFile.table, importPlanSoFar(importOfAFile).plan).length;
