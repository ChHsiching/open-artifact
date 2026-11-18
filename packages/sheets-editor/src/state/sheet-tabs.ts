import type { PlacedViewsOfADuplicate, SheetId } from '@open-artifact/sheets-core';
import type { PlacementOnGrid, SheetSummary, WorkbookReads } from '../model/workbook.ts';
import type { LastDone, PageState, SavingState, UndoOffer } from './initial-state.ts';
import type { ChartNodesCopiedFor, SheetDuplicateChosen } from './event-reducer.ts';
import type { PageTransition } from './transitions.ts';
import type { FormulasReadingSheet, Place } from './places.ts';
import type { ChartNodeCopies } from './copy-paste.ts';
import { selectedArea } from '../selection/model.ts';
import { firstPlaceInSheet, formulasReadingSheet } from './places.ts';
import { findSheetById, clampScrollOfView } from '../grid/layout.ts';
import { clearPassingNotice, withNoEffects } from './transitions.ts';
import { queueEdit, IF_QUEUED_PLACE_CHANGED, IF_QUEUED_DEFAULTS } from '../model/edit-effects.ts';
import { copyChartNodesThen } from './copy-paste.ts';
import { isFormulaUnfinishedInEntry } from '../editor/formula-closing.ts';
import { commitEntryInPlaceIfEditing } from '../editor/commit-entry.ts';
import { embedRefsOfView } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from './controller.ts';
export function showSheet(state: PageState, workbook: ReadsWithTextMeasurer, sheetId: SheetId): PageState {
  if (sheetId === state.sheetId) return state;
  let placeLeft = state.placesLeft.find((placeKept: Place) => placeKept.sheetId === sheetId);
  let place = placeLeft !== undefined && selectedArea(placeLeft, workbook) !== null ? placeLeft : firstPlaceInSheet(workbook, sheetId);
  let sheetName = findSheetById(workbook, sheetId)?.name;
  if (place === null || sheetName === undefined) return state;
  let { activeCell: activeCell, selectionCorner: selectionCorner, scrollLeft: scrollLeft, scrollTop: scrollTop } = state;
  let placeLeaving: Place = {
    sheetId: state.sheetId,
    activeCell: activeCell,
    selectionCorner: selectionCorner,
    scrollLeft: scrollLeft,
    scrollTop: scrollTop,
  };
  let shownState = {
    ...clearPassingNotice(state),
    ...place,
    placesLeft: [...state.placesLeft.filter((placeKept: Place) => placeKept !== placeLeft && placeKept.sheetId !== state.sheetId), placeLeaving],
    dragging: null,
    lastDone: {
      what: 'sheetShown',
      name: sheetName,
    },
  };
  return clampScrollOfView(shownState, workbook);
}
export function showSheetAtOffset(state: PageState, workbook: ReadsWithTextMeasurer, offset: number): PageState {
  let sheets = workbook.listSheets();
  let sheet: SheetSummary | undefined = sheets[sheets.findIndex((listed: SheetSummary) => listed.sheetId === state.sheetId) + offset];
  return sheet === undefined ? state : showSheet(state, workbook, sheet.sheetId);
}
export function finishDuplicateSheet(state: PageState, { sheetId: sheetId, name: name }: DuplicateOfSheet, copiedNodes: ChartNodeCopies): PageTransition {
  if (copiedNodes === 'notNow')
    return {
      state: {
        ...state,
        lastDone: null,
        notice: {
          kind: 'editRefused',
          why: 'chartsNotCopied',
          asked: 'duplicateOfSheet',
        },
      },
      effects: [
        {
          kind: 'dropWhatIsHeld',
        },
      ],
    };
  let placedViews: PlacedViewsOfADuplicate =
    copiedNodes === 'never'
      ? {
          kind: 'leftBehind',
        }
      : {
          kind: 'copied',
          copiedWidgetNodes: [...copiedNodes],
        };
  let queued = queueEdit(
    state,
    {
      kind: 'duplicateSheet',
      sheetId: sheetId,
      name: name,
      placedViews: placedViews,
    },
    {
      ...IF_QUEUED_PLACE_CHANGED,
      dropsWhatIsHeld: 'ifRefused',
    },
  );
  return copiedNodes === 'never'
    ? {
        ...queued,
        effects: [
          {
            kind: 'dropWhatIsHeld',
          },
          ...queued.effects,
        ],
      }
    : queued;
}
export function duplicateSheet(
  state: PageState,
  workbook: WorkbookReads,
  sheetId: SheetId,
  { beforeName: beforeName, afterName: afterName }: SheetDuplicateChosen['wordsAroundName'],
): PageTransition {
  let sheetName = findSheetById(workbook, sheetId)?.name;
  if (sheetName === undefined) return withNoEffects(state);
  let mostCharacters =
    workbook.longestSheetNameInCharacters() - Array.from<string>(`${beforeName}${afterName}`).length - DUPLICATE_NAME_SLACK;
  let keptName: string = '';
  for (let { segment: segment } of new Intl.Segmenter().segment(sheetName)) {
    if (Array.from<string>(`${keptName}${segment}`).length > mostCharacters) break;
    keptName += segment;
  }
  let duplicate: DuplicateOfSheet = {
    kind: 'duplicateOfSheet',
    sheetId: sheetId,
    name: `${beforeName}${keptName.trimEnd()}${afterName}`,
  };
  return copyChartNodesThen(
    state,
    chartNodesOfSheet(workbook, sheetId),
    duplicate,
    (copiedNodes: ChartNodeCopies) => finishDuplicateSheet(state, duplicate, copiedNodes),
  );
}
export function deleteSheet(state: PageState, workbook: WorkbookReads, sheetId: SheetId): PageTransition {
  let sheetName = findSheetById(workbook, sheetId)?.name;
  if (sheetName === undefined || !hasOtherSheetWithCells(workbook, sheetId)) return withNoEffects(state);
  let readBy = formulasReadingSheet(workbook, sheetId);
  let undoOffer: SheetDeletedUndoOffer = {
    kind: 'sheetDeleted',
    name: sheetName,
    isSaved: false,
    ...(readBy !== null && {
      readBy: readBy,
    }),
  };
  return queueEdit(
    state,
    {
      kind: 'deleteSheet',
      sheetId: sheetId,
    },
    {
      ...IF_QUEUED_DEFAULTS,
      select: null,
      done: null,
      undoOffer: undoOffer,
    },
  );
}
export function startRenamingSheet(state: PageState, workbook: WorkbookReads, sheetId: SheetId): PageState {
  let name = findSheetById(workbook, sheetId)?.name;
  if (name === undefined) return state;
  return {
    ...state,
    sheetBeingRenamed: {
      sheetId: sheetId,
      nameWhenOpened: name,
      typed: name,
      refused: null,
    },
    notice: null,
    lastDone: null,
  };
}
export function finishRenamingSheet(state: PageState, workbook: WorkbookReads, isLeaving: boolean): PageTransition {
  if (state.sheetBeingRenamed === null) return withNoEffects(state);
  let { sheetId: sheetId, nameWhenOpened: nameWhenOpened, typed: typed, refused: refused } = state.sheetBeingRenamed;
  let stateClosed: PageState = {
    ...state,
    sheetBeingRenamed: null,
  };
  let cleanName = cleanSheetName(typed);
  let currentName = findSheetById(workbook, sheetId)?.name;
  if (
    currentName === undefined ||
    cleanName === currentName ||
    cleanName === nameWhenOpened ||
    typed === nameWhenOpened ||
    (isLeaving && (cleanName === '' || refused !== null))
  )
    return withNoEffects(stateClosed);
  return queueEdit(
    isLeaving ? stateClosed : state,
    {
      kind: 'renameSheet',
      sheetId: sheetId,
      name: cleanName,
    },
    {
      ...IF_QUEUED_DEFAULTS,
      select: null,
      done: null,
    },
  );
}
export function leaveRenamingOrEntry(state: PageState, workbook: ReadsWithTextMeasurer): PageTransition | null {
  if (state.sheetBeingRenamed !== null) return finishRenamingSheet(state, workbook, true);
  return isFormulaUnfinishedInEntry(state) ? withNoEffects(state) : commitEntryInPlaceIfEditing(state, workbook);
}
export const addSheetAfter = (state: PageState, nameStem: string): PageTransition =>
  queueEdit(
    state,
    {
      kind: 'addSheet',
      afterSheet: state.sheetId,
      nameStem: nameStem,
    },
    IF_QUEUED_PLACE_CHANGED,
  );
export const DUPLICATE_NAME_SLACK = 4;
export const chartNodesOfSheet = (workbook: WorkbookReads, sheetId: SheetId): string[] =>
  workbook.placementsIn(sheetId).flatMap(({ viewId: viewId }: PlacementOnGrid) => embedRefsOfView(workbook.viewAsItStands(viewId)));
export const hasOtherSheetWithCells = (workbook: WorkbookReads, sheetId: SheetId): boolean =>
  workbook.listSheets().some((sheet: SheetSummary) => sheet.sheetId !== sheetId && sheet.rowCount > 0 && sheet.columnCount > 0);
export const markUndoOfferSaved = (undoOffer: UndoOffer | null, saving: SavingState): UndoOffer | null =>
  undoOffer !== null && 'isSaved' in undoOffer && !undoOffer.isSaved && saving === 'allSaved'
    ? {
        ...undoOffer,
        isSaved: true,
      }
    : undoOffer;
export const markLastDoneSaved = (lastDone: LastDone | null, saving: SavingState): LastDone | null =>
  lastDone !== null && 'isSaved' in lastDone && !lastDone.isSaved && saving === 'allSaved'
    ? {
        ...lastDone,
        isSaved: true,
      }
    : lastDone;
export const INVISIBLE_EDGE_CHARACTERS =
  /^[\s\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u206F]+|[\s\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u206F]+$/gu;
export const cleanSheetName = (name: string): string => name.replaceAll(/\p{Cc}/gu, ' ').replaceAll(INVISIBLE_EDGE_CHARACTERS, '');
/** A sheet being duplicated, waiting on the widget nodes of its charts being copied. */
export type DuplicateOfSheet = Extract<ChartNodesCopiedFor, { kind: 'duplicateOfSheet' }>;
/** What the page last did when it showed another sheet, and the sheet's name. */
export interface SheetShownDone {
  what: 'sheetShown';
  name: string;
}
/** The notice that a sheet is not duplicated, for its charts could not be copied now. */
export interface DuplicateRefusedNotice {
  kind: 'editRefused';
  why: 'chartsNotCopied';
  asked: 'duplicateOfSheet';
}
/** The offer to undo the deletion of a sheet, and the formulas that read it. */
export interface SheetDeletedUndoOffer {
  kind: 'sheetDeleted';
  name: string;
  isSaved: boolean;
  readBy?: FormulasReadingSheet;
}
