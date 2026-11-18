import type { Edit } from '@open-artifact/sheets-core';
import type { CopiedCells, PageState } from './initial-state.ts';
import type { PageEvent } from './event-reducer.ts';
import type { PageEffect } from './transitions.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import { editsOfQueued } from '../engine/cause-of-error-cache.ts';
import { selectedArea, selectionKeepsItsCells } from '../selection/model.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
export function doesEffectDropCopiedCells(effect: PageEffect, { cutToken: cutToken }: Pick<CopiedCells, 'cutToken'>): boolean {
  if (effect.kind === 'copyLinkToSheet') return true;
  if (effect.kind === 'undoOrRedo' || effect.kind === 'queueEditsThatTakeBack') return cutToken !== null;
  if (effect.kind !== 'queueEdit' || effect.ifQueued.askOfChart !== undefined) return false;
  let keepsCut =
    editsOfQueued(effect).every(({ kind: kind }) => EDITS_THAT_KEEP_CUT.has(kind)) || effect.ifQueued.leavesLineRoundCopy === true;
  return cutToken === null ? !keepsCut : effect.ifQueued.movesCut === undefined;
}
export function letGoOfCopiedCells(state: PageState, reads: WorkbookReads, keepCut: boolean): PageState {
  let { copiedCells: copiedCells } = state;
  let area = copiedCells === null ? null : selectedArea(copiedCells, reads);
  let nextState = {
    ...state,
    copiedCells: null,
    lastDone: null,
  };
  if (copiedCells === null || area === null) return nextState;
  let value: CopiedCellsLeft = keepCut ? 'cutCanceledAndPasteCopies' : 'cutCanceled';
  let value2: CopiedCellsLeft = copiedCells.cutToken === null ? 'stillCopied' : value;
  return {
    ...nextState,
    lastDone: {
      what: 'copiedCellsLetGo',
      leaves: value2,
      cells: areaToA1AsStored(area, ownRowOrderOfSheet(reads, state.activeCell.sheetId)),
    },
  };
}
export function updateCopiedCells(state: PageState, effects: readonly PageEffect[], event: PageEvent, reads: WorkbookReads): PageState {
  let pasteEffect = effects.find((effect): effect is PutOnClipboardEffect => effect.kind === 'putOnClipboard');
  if (pasteEffect !== undefined) {
    let { activeCell: activeCell, selectionCorner: selectionCorner, rangeWalked: rangeWalked } = state;
    let { cutToken: cutToken } = pasteEffect;
    return {
      ...state,
      copiedCells: {
        activeCell: activeCell,
        selectionCorner: selectionCorner,
        rangeWalked: rangeWalked,
        cutToken: cutToken,
      },
      cutJustMoved: null,
    };
  }
  if (effects.some((effect) => effect.kind === 'putNothingOnClipboard'))
    return {
      ...state,
      copiedCells: null,
      cutJustMoved: null,
    };
  let value = event.kind === 'editAnswered' && event.outcome.kind === 'editQueued' ? (event.ifQueued.movesCut ?? null) : null;
  let value2 = effects.some(
    (effect) => effect.kind === 'queueEdit' || effect.kind === 'undoOrRedo' || effect.kind === 'queueEditsThatTakeBack',
  );
  let value3 = value ?? (value2 ? null : state.cutJustMoved);
  let { copiedCells: copiedCells } = state;
  let value4 =
    copiedCells !== null &&
    (effects.some((effect) => doesEffectDropCopiedCells(effect, copiedCells)) ||
      (value !== null && value.token === copiedCells.cutToken) ||
      event.kind === 'linkAddressCopied' ||
      event.kind === 'otherThanCellsCopied' ||
      (event.kind === 'workbookChanged' && !selectionKeepsItsCells(copiedCells, event.readsBefore, reads)));
  if (!value4 && value3 === state.cutJustMoved) return state;
  return {
    ...state,
    copiedCells: value4 ? null : copiedCells,
    cutJustMoved: value3,
  };
}
export const EDITS_THAT_KEEP_CUT = new Set<Edit['kind']>(['pasteCopiedCells', 'pasteValuesOfCopiedCells', 'clearCells']);
type PutOnClipboardEffect = Extract<PageEffect, { kind: 'putOnClipboard' }>;
/** What letting go of copied cells leaves: still copied, or a cut called off (its paste then copying). */
export type CopiedCellsLeft = 'stillCopied' | 'cutCanceled' | 'cutCanceledAndPasteCopies';
/** What was done last when the page let go of copied cells: told to screen readers. */
export interface CopiedCellsLetGo {
  what: 'copiedCellsLetGo';
  leaves: CopiedCellsLeft;
  cells: string;
}
