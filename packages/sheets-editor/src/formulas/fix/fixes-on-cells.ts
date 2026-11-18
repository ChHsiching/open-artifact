import type { Dynamic } from '../../dynamic.ts';
import { checkAgentForFormulas } from '../from-words/offer.ts';
import { findCellsHangingOn, areaTouchesHangingCells } from '../dependents.ts';
import { withNoEffects, NAVIGATING_MODE } from '../../state/transitions.ts';
import { fixAskFor, askAgentToFixFormula, fewestCellsToReadAt, formulaBeforeSortOrMove, cameToBeforeASortAt, formulaLostToLastAct } from './ask.ts';
import { shiftFormulaRows, withFixesOnCells, STOP_FIX_ASKS_EFFECTS, NO_FIXES_ON_CELLS } from './cells-to-fix.ts';
import { newAwaitedHold, asLandedHold, holdOneMoreAct, isHoldReleased, answerHoldOf } from '../../format/answer-holds.ts';
import { readsAsStored } from '../../model/workbook.ts';
import { mightFormulaSpill } from '../agent-answer-checks.ts';
import { findFormulaReferences, resolveFormulaReference } from '../references.ts';
import { isNonNullObject } from '../../utils/objects.ts';
import { checkFixAnswer } from './answer-checks.ts';
import { whyCallFailed } from '../from-words/ask-agent.ts';
import { withoutStaleOffer, errorsOfferShown, resetBaselineOfOffer } from './errors-offer.ts';
import { queueEdit, IF_QUEUED_DEFAULTS } from '../../model/edit-effects.ts';
import { isSameCell, mergedAreaOrCellOf, scrollToShowSelection, activeAnchorCell } from '../../selection/model.ts';
import { areaToA1AsStored } from '../from-words/where.ts';
import { ownRowOrderOfSheet } from '../../model/line-ids.ts';
import { cellUnderPoint, isCellInSight, cellKeyText, isExplainingBlocked } from '../../state/explained-under-cell.ts';
import { escapeInCellsDoes } from '../../state/escape.ts';
import { layoutOfView } from '../../grid/layout.ts';
import { isLineShown } from '../../model/line-sizes.ts';
import { isEffectAnEdit } from '../../state/edit-refusals.ts';
import { isSameJson } from '../../import/column-readings.ts';
import { cellKeyOf } from '../error-tells.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
import type { PageState } from '../../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../../state/controller.ts';
export function checkAgentWhenOfferGone(state: PageState, transition?: Dynamic) {
  let [stageBefore, stage] = [transition.state.fixesOnCells, state.fixesOnCells];
  return (stageBefore.toOffer !== null && stageBefore.toOffer !== stage.toOffer) ||
    (stageBefore.toOfferInSelection !== null && stageBefore.toOfferInSelection !== stage.toOfferInSelection)
    ? checkAgentForFormulas(transition)
    : transition;
}
export function hangingCellsOf(reads: WorkbookReads, sheetId?: Dynamic) {
  let entry = hangingCellsCache.get(sheetId);
  let hangingCells = entry?.reads === reads ? entry.hanging : findCellsHangingOn(reads, sheetId);
  hangingCellsCache.set(sheetId, {
    reads: reads,
    hanging: hangingCells,
  });
  return hangingCells;
}
export function askAgentForFixes(state: PageState, reads: ReadsWithTextMeasurer, which: Dynamic = 'toOffer') {
  let { [which]: fixes, stage: stage } = state.fixesOnCells;
  if (state.mode.kind === 'editing' || stage !== null) return withNoEffects(state);
  if (fixes === null || fixes === 'yetToBeKnown') return withNoEffects(state);
  let [firstFix, ...otherFixes] = fixes;
  if (firstFix === undefined) return withNoEffects(state);
  let value = fixes.flatMap((fix?: Dynamic) => {
    let fixAskFor2 = fixAskFor(state, reads, fix, fix.copies.at(-1));
    return fixAskFor2 === null || typeof fixAskFor2 === 'string'
      ? []
      : [
          {
            ...fixAskFor2,
            cellId: fix.origin,
            cellsOfCopies: fix.copies,
          },
        ];
  });
  if (value.length < fixes.length) return withNoEffects(fixesCameToNothing(state));
  if (otherFixes.length === 0 && firstFix.copies.length === 0) return askAgentToFixFormula(state, reads, firstFix.origin);
  let value2 = fixes.flatMap(({ origin: origin, copies: copies }: Dynamic) => [origin].concat(copies));
  if (hangingCellsOf(reads, value2) === null) return withNoEffects(fixesCameToNothing(state));
  let value3 = state.fixesOnCells.askCount + 1;
  let entries = new (Map as Dynamic)(
    value.map((input?: Dynamic, index?: Dynamic) => {
      let {
        cellId: cellId,
        broken: broken,
        linesAsTold: linesAsTold,
        fewestCellsToRead: fewestCellsToRead,
        formulaBeforeASortOrMove: formulaBeforeASortOrMove,
      } = input;
      let { callsForNoNewCell: callsForNoNewCell, isLabelOrHeadingTold: isLabelOrHeadingTold } = input;
      let value4 = input.cellsOfCopies.flatMap((cell?: Dynamic) => {
        let formulaText = reads.cellOf(cell)?.formulaText;
        if (formulaText === undefined) return [];
        let fewestCellsToReadAt2 = fewestCellsToReadAt(state, cell, reads.decimalSign);
        let formulaBeforeSortOrMove2 = formulaBeforeSortOrMove(state, cell);
        return [
          {
            cellId: cell,
            broken: formulaText,
            fewestCellsToRead: fewestCellsToReadAt2,
            formulaBeforeASortOrMove: formulaBeforeSortOrMove2,
            cameToBeforeASort: cameToBeforeASortAt(state, cell),
            callsForNoNewCell: callsForNoNewCell,
            isLabelOrHeadingTold: isLabelOrHeadingTold,
          },
        ];
      });
      let value5 = formulaLostToLastAct(state, cellId)?.text ?? broken;
      let value6 = shiftFormulaRows(value5, 1, reads.decimalSign) !== value5;
      return [
        value3 + index,
        {
          cellId: cellId,
          broken: broken,
          linesAsTold: linesAsTold,
          fewestCellsToRead: fewestCellsToRead,
          formulaBeforeASortOrMove: formulaBeforeASortOrMove,
          cameToBeforeASort: input.cameToBeforeASort,
          callsForNoNewCell: callsForNoNewCell,
          isLabelOrHeadingTold: isLabelOrHeadingTold,
          copies: value4,
          movesWithItsRow: value6,
        },
      ];
    }),
  );
  let { sheetId: sheetId, workbookChangeCount: workbookChangeCount } = state;
  return {
    state: withFixesOnCells(state, {
      stage: {
        sheetId: sheetId,
        atChangeCount: workbookChangeCount,
        tableBeingDeclared: null,
        awaited: entries,
        fixes: [],
        whyACallFailed: null,
        asked: value2,
        isOfSelection: which === 'toOfferInSelection',
        isKept: false,
        pointedAt: null,
        hasPersonLeft: state.isWindowLeft,
        stoodAt: state.activeCell,
        hold: newAwaitedHold(value3),
      },
      askCount: value3 + value.length - 1,
      offerDueBackOn: state.fixesOnCells.offerDueBackOn.filter((input?: Dynamic) => input !== sheetId),
    }),
    effects: value.map(
      ({ asked: asked }: Dynamic, index?: Dynamic) => ({
        kind: 'askAgentForAFix',
        askId: value3 + index,
        asked: asked,
      }),
    ),
  };
}
export function doesFixReachHangingCells(workbook: WorkbookReads, { asked: asked }: Dynamic, cell?: Dynamic, formula?: Dynamic) {
  let reads = readsAsStored(workbook);
  let hangingCells = hangingCellsOf(reads, asked);
  if (hangingCells === null) return true;
  if (mightFormulaSpill(formula, reads.decimalSign)) return true;
  return findFormulaReferences(formula, reads.decimalSign).references.some((reference?: Dynamic) => {
    let value = resolveFormulaReference(reference, cell.sheetId, reads.listSheets());
    return value === null || areaTouchesHangingCells(hangingCells, value.sheet.sheetId, value.area);
  });
}
export function fixesOfCopies(
  workbook: WorkbookReads,
  sheetId: Dynamic,
  { cellId: cellId, copies: copies, linesAsTold: linesAsTold, movesWithItsRow: movesWithItsRow }: Dynamic,
  answer?: Dynamic,
  askId?: Dynamic,
) {
  let reads = readsAsStored(workbook);
  let value = isNonNullObject(answer) ? answer.formula : null;
  if (typeof value !== 'string') return [];
  let position = reads.positionOfCell(cellId);
  return copies.flatMap((copy?: Dynamic) => {
    let value2 = reads.positionOfCell(copy.cellId);
    let value3 = position === null || value2 === null ? null : shiftFormulaRows(value, value2.rowIndex - position.rowIndex, 'point');
    let value4 = checkFixAnswer(
      reads,
      {
        ...copy,
        linesAsTold: linesAsTold,
      },
      {
        formula: value3,
      },
    );
    return value4 !== null && (value3 !== value) === movesWithItsRow && !doesFixReachHangingCells(reads, sheetId, copy.cellId, value4.formula)
      ? [
          {
            cellId: copy.cellId,
            ...value4,
            askId: askId,
          },
        ]
      : [];
  });
}
export function receiveFixAnswer(state: PageState, reads: WorkbookReads, askId?: Dynamic, reply?: Dynamic) {
  let { stage: stage } = state.fixesOnCells;
  let asked = stage?.awaited.get(askId);
  if (stage === null || asked === undefined) return withNoEffects(state);
  if (reply.kind === 'notToBeHad') {
    let stopped = stopAwaitingFixes(state);
    let value7 = stopped.state.fixesOnCells.stage === null ? fixesCameToNothing(stopped.state) : stopped.state;
    let formulaFromWords = {
      ...state.formulaFromWords,
      agent: 'notToBeHad',
    };
    return {
      ...stopped,
      state: {
        ...value7,
        formulaFromWords: formulaFromWords,
      },
    };
  }
  let value = reply.kind === 'answered' ? reply.answer : null;
  let value2 = value === null ? null : checkFixAnswer(reads, asked, value);
  let value3 = value2 !== null && doesFixReachHangingCells(reads, stage, asked.cellId, value2.formula) ? null : value2;
  let value4 = reply.kind === 'failed' ? whyCallFailed(reply) : null;
  let value5 = stage.whyACallFailed === 'rateLimited' ? 'rateLimited' : (value4 ?? stage.whyACallFailed);
  let entries = new (Map as Dynamic)(stage.awaited);
  entries.delete(askId);
  let value6 =
    value3 === null
      ? stage.fixes
      : [
          ...stage.fixes,
          {
            cellId: asked.cellId,
            ...value3,
            askId: askId,
          },
          ...fixesOfCopies(reads, stage, asked, value, askId),
        ];
  return withNoEffects(
    entries.size === 0 && value6.length === 0
      ? fixesCameToNothing(state, value5)
      : withFixesOnCells(state, {
          stage: {
            ...stage,
            awaited: entries,
            fixes: value6,
            whyACallFailed: value5,
            hold: entries.size === 0 ? asLandedHold(stage.hold) : stage.hold,
          },
        }),
  );
}
export function endFixes(state: PageState) {
  let { stage: stage } = state.fixesOnCells;
  if (stage === null) return withNoEffects(state);
  return {
    state: {
      ...withFixesOnCells(state, {
        stage: null,
      }),
      errorsOffered: withoutStaleOffer(state.errorsOffered),
    },
    effects: stage.awaited.size > 0 ? STOP_FIX_ASKS_EFFECTS : [],
  };
}
export function stopAwaitingFixes(state: PageState) {
  let { stage: stage } = state.fixesOnCells;
  if (stage === null || stage.fixes.length === 0) return endFixes(state);
  let nextState = {
    ...stage,
    awaited: new (Map as Dynamic)(),
    hold: asLandedHold(stage.hold),
  };
  return {
    state: withFixesOnCells(state, {
      stage: nextState,
    }),
    effects: STOP_FIX_ASKS_EFFECTS,
  };
}
export function discardFixes(state: PageState, reads?: Dynamic) {
  let { stage: stage } = state.fixesOnCells;
  if (stage === null || stage.isKept) return withNoEffects(state);
  let held = holdOneMoreAct(state, 'fixes', reads);
  if (stage.awaited.size > 0) return stopAwaitingFixes(held);
  if (!isHoldReleased(stage.hold, reads)) return withNoEffects(held);
  let { state: heldState, effects: heldEffects } = endFixes(state);
  let fixCount = fixesNotKept(stage).length;
  if (fixCount === 0)
    return {
      state: heldState,
      effects: heldEffects,
    };
  return {
    state: {
      ...heldState,
      lastDone: {
        what: 'fixesDiscarded',
        count: fixCount,
      },
    },
    effects: heldEffects,
  };
}
export function keepFixes(state: PageState, reads: WorkbookReads, how?: Dynamic) {
  let { stage: stage } = state.fixesOnCells;
  if (stage === null || stage.isKept) return withNoEffects(state);
  if (!isHoldReleased(stage.hold, how)) return withNoEffects(holdOneMoreAct(state, 'fixes', how));
  if (!hasFixesNotKept(stage)) return withNoEffects(state);
  let fixesLeft = fixesNotKept(stage);
  return queueEdit(
    withFixesOnCells(withErrorsOfferReset(state), {
      stage: {
        ...stage,
        isKept: true,
      },
    }),
    pasteFixesEdit(stage, reads, fixesLeft),
    {
      ...IF_QUEUED_DEFAULTS,
      select: null,
      done: {
        what: 'fixesKept',
        count: fixesLeft.length,
      },
      thenEvent: {
        kind: 'fixesKeptAnswered',
      },
    },
  );
}
export function fixAtCell({ fixesOnCells: { stage: stage } }: Dynamic, cellId?: Dynamic) {
  if (stage === null || stage.awaited.size > 0 || stage.isKept) return null;
  return fixesNotKept(stage).find((input?: Dynamic) => isSameCell(input.cellId, cellId)) ?? null;
}
export function keepFix(state: PageState, reads: WorkbookReads, cellId?: Dynamic) {
  let { stage: stage } = state.fixesOnCells;
  let fix = fixAtCell(state, cellId);
  let area = mergedAreaOrCellOf(reads, cellId);
  if (stage === null || fix === null || area === null) return withNoEffects(state);
  let fixes = stage.fixes.map(
    (input?: Dynamic) =>
      input === fix
        ? {
            ...input,
            isKept: true,
          }
        : input,
  );
  return queueEdit(
    withFixesOnCells(withErrorsOfferReset(state), {
      stage: {
        ...stage,
        fixes: fixes,
      },
    }),
    pasteFixesEdit(stage, reads, [fix]),
    {
      ...IF_QUEUED_DEFAULTS,
      select: null,
      done: {
        what: 'fixKept',
        cells: areaToA1AsStored(area, ownRowOrderOfSheet(reads, cellId.sheetId)),
      },
      thenEvent: {
        kind: 'fixKeptAnswered',
        cellId: cellId,
      },
    },
  );
}
export function takeBackKeptFix(state: PageState, cellId?: Dynamic) {
  let { stage: stage } = state.fixesOnCells;
  let isKept = stage?.fixes.some((fix?: Dynamic) => fix.isKept === true && isSameCell(fix.cellId, cellId));
  return stage === null || isKept !== true ? withNoEffects(state) : dropFixAtCell(state, stage, cellId);
}
export function discardFix(state: PageState, cellId?: Dynamic) {
  let { stage: stage } = state.fixesOnCells;
  if (stage === null || fixAtCell(state, cellId) === null) return withNoEffects(state);
  let { state: nextState, effects: effects } = dropFixAtCell(state, stage, cellId);
  return {
    state: {
      ...nextState,
      lastDone: {
        what: 'fixDiscarded',
      },
    },
    effects: effects,
  };
}
export function pointAtFix(state: PageState, reads: ReadsWithTextMeasurer, point?: Dynamic) {
  let { stage: stage } = state.fixesOnCells;
  if (stage === null) return state;
  let pointedAt = point === null ? null : cellUnderPoint(state, reads, point);
  let cellId = pointedAt !== null && fixAtCell(state, pointedAt) !== null ? pointedAt : null;
  return cellId === stage.pointedAt || (cellId !== null && stage.pointedAt !== null && isSameCell(cellId, stage.pointedAt))
    ? state
    : withFixesOnCells(state, {
        stage: {
          ...stage,
          pointedAt: cellId,
        },
      });
}
export function fixPointedAt(state: PageState, reads: ReadsWithTextMeasurer) {
  let pointedAt = state.fixesOnCells.stage?.pointedAt ?? null;
  return pointedAt !== null && isCellInSight(state, reads, pointedAt) ? fixAtCell(state, pointedAt) : null;
}
export function fixPillShown(state: PageState, reads: ReadsWithTextMeasurer) {
  if (isFixPillBlocked(state)) return null;
  let pointedAt = fixPointedAt(state, reads);
  if (pointedAt !== null || !isFixAtSelectionShown(state)) return pointedAt;
  let atActiveCell = fixAtActiveCell(state, reads);
  return atActiveCell !== null && isCellInSight(state, reads, atActiveCell.cellId) ? atActiveCell : null;
}
export function fixPillOfActiveCell(state: PageState, reads: ReadsWithTextMeasurer) {
  let fix = fixAtActiveCell(state, reads);
  let isInSight = state.fixesOnCells.stage?.hasPersonLeft === true;
  return fix !== null && !isInSight && fixPillShown(state, reads) === fix ? fix : null;
}
export function fixKeyAction(
  state: PageState,
  reads: ReadsWithTextMeasurer,
  { key: key, pillOfFixSeen: pillOfFixSeen, isReadLate: isReadLate, ...event }: Dynamic,
) {
  let fix = key === 'Enter' || key === 'Escape' || key === 'F2' ? fixAtActiveCell(state, reads) : null;
  if (fix === null || (key === 'Escape' && escapeInCellsDoes(state) !== 'stepsOut')) return null;
  let hasPill = fixPillOfActiveCell(state, reads) !== null;
  let action = pillOfFixSeen === cellKeyText(fix.cellId) && isHoldReleased(answerHoldOf(state, 'fixes'), event);
  if (hasPill && key !== 'F2' && action)
    return {
      does: key === 'Enter' ? 'keeps' : 'discards',
      fix: fix,
      how: event,
    };
  if (key === 'Escape')
    return hasPill
      ? {
          does: 'nothing',
          fix: fix,
          how: event,
        }
      : null;
  return {
    does: isReadLate === true && state.fixesOnCells.stage?.hasPersonLeft === true ? 'nothing' : 'bringsPill',
    fix: fix,
    how: event,
  };
}
export function actOnFixKey(state: Dynamic, reads: ReadsWithTextMeasurer, { does: does, fix: fix, how: how }: Dynamic) {
  let held = holdOneMoreAct(state, 'fixes', how);
  let { stage: stage } = held.fixesOnCells;
  if (does === 'keeps') return keepFix(held, reads, fix.cellId);
  if (does === 'discards') return discardFix(held, fix.cellId);
  if (does === 'nothing' || stage === null) return withNoEffects(held);
  return withNoEffects({
    ...scrollToShowSelection(
      withFixesOnCells(held, {
        stage: {
          ...stage,
          pointedAt: null,
          stoodAt: null,
        },
      }),
      reads,
    ),
    explainedUnderCell: {
      ...held.explainedUnderCell,
      isSelectionByMouse: false,
    },
    lastDone: {
      what: 'fixOffered',
      formula: fix.formula,
      shown: fix.shown,
    },
  });
}
export function dropFixesTakenBack(state: PageState, reads: WorkbookReads, takenBack?: Dynamic) {
  let { stage: stage } = state.fixesOnCells;
  if (stage?.isKept !== true) return withNoEffects(state);
  let fixesLeft = stage.fixes.filter(
    ({ cellId: cellId, formula: formula }: Dynamic) =>
      !takenBack.some(({ r: r2, c: c, written: written }: Dynamic) => written === formula || (r2 === cellId.rowId && c === cellId.columnId)),
  );
  return fixesLeft.length === 0 || fixesLeft.length === stage.fixes.length
    ? withNoEffects(fixesCameToNothing(endFixes(state).state))
    : keepFixes(
        withFixesOnCells(state, {
          stage: {
            ...stage,
            fixes: fixesLeft,
            isKept: false,
          },
        }),
        reads,
        {},
      );
}
export function areCellsInSight(state: PageState, reads: ReadsWithTextMeasurer, cellIds?: Dynamic) {
  let { rowEdges: rowEdges, columnEdges: columnEdges } = layoutOfView(state, reads);
  return cellIds.every((input?: Dynamic) => {
    let value = reads.positionOfCell(input);
    return value !== null && isLineShown(rowEdges, value.rowIndex) && isLineShown(columnEdges, value.columnIndex);
  });
}
export function endFixesToldDuringAct({ state: state, effects: effects }: Dynamic, event?: Dynamic) {
  let isEndingAct = event.kind === 'editAnswered' || event.kind === 'undoOrRedoAnswered' || event.kind === 'takeBackAnswered';
  if (!state.fixesOnCells.isEndToldDuringAct || isEndingAct || !effects.some(isEffectAnEdit)) return state;
  return {
    ...withFixesOnCells(state, {
      isEndToldDuringAct: false,
    }),
    notice: state.notice?.kind === 'fixesGoneWithChange' ? null : state.notice,
  };
}
export function updateFixPresence(state: PageState, event?: Dynamic) {
  let { stage: stage } = state.fixesOnCells;
  if (stage === null) return state;
  let isPressByTouch = event.kind === 'pointerPressed' && event.isByMouse !== true;
  let isPressOnFix =
    stage.stoodAt !== null && (isPressByTouch || !isSameCell(state.activeCell, stage.stoodAt))
      ? {
          ...stage,
          stoodAt: null,
        }
      : stage;
  if (event.kind === 'windowCaretChanged' && !event.hasCaret)
    return withFixesOnCells(state, {
      stage: {
        ...isPressOnFix,
        hasPersonLeft: true,
        pointedAt: null,
      },
    });
  let pointedAt = (event.kind === 'keyPressed' && event.isReadLate !== true) || event.kind === 'pointerPressed';
  if (isPressOnFix.hasPersonLeft && pointedAt)
    return withFixesOnCells(state, {
      stage: {
        ...isPressOnFix,
        hasPersonLeft: false,
      },
    });
  return isPressOnFix === stage
    ? state
    : withFixesOnCells(state, {
        stage: isPressOnFix,
      });
}
export function followTableBeingDeclared(state: PageState, reads: WorkbookReads, tables?: Dynamic, event?: Dynamic) {
  let { stage: stage } = state.fixesOnCells;
  if (stage === null) return state;
  let table = tables.find((table2?: Dynamic) => table2.kind === 'declareCellTable');
  if (table !== undefined && table.sheetId === stage.sheetId)
    return withFixesOnCells(state, {
      stage: {
        ...stage,
        tableBeingDeclared: table.cellTable,
      },
    });
  let { tableBeingDeclared: tableBeingDeclared, atChangeCount: atChangeCount } = stage;
  if (tableBeingDeclared === null || event.kind !== 'workbookChanged' || event.isUnasked) return state;
  let tablesNow = reads.cellTables(stage.sheetId);
  let value =
    Array.isArray(tablesNow) && tablesNow.some(({ cellTable: cellTable }: Dynamic) => isSameJson(cellTable, tableBeingDeclared));
  return withFixesOnCells(state, {
    stage: {
      ...stage,
      tableBeingDeclared: null,
      atChangeCount: value ? state.workbookChangeCount : atChangeCount,
    },
  });
}
export function updateFixesOnCellsAfterEvent(transition: Dynamic, reads: ReadsWithTextMeasurer, isInAct?: Dynamic, event?: Dynamic) {
  let { effects: effects } = transition;
  let presence = updateFixPresence(endFixesToldDuringAct(transition, event), event);
  let hasStopEffect = effects.some((state?: Dynamic) => state.kind === 'queueEdit' && state.ifQueued.isKeepOfAgentsFix === true);
  let following = followTableBeingDeclared(hasStopEffect ? withErrorsOfferReset(presence) : presence, reads, effects, event);
  let { stage: stage } = following.fixesOnCells;
  if (stage === null)
    return {
      state: following,
      effects: effects,
    };
  let value =
    following.mode.kind === 'editing'
      ? {
          ...following,
          mode: NAVIGATING_MODE,
        }
      : following;
  let value2 =
    errorsOfferShown(value, reads) !== null &&
    !isInAct &&
    areCellsInSight(
      following,
      reads,
      cellsOfFixes(following).map(({ cellId: cellId }: Dynamic) => cellId),
    );
  if (following.workbookChangeCount === stage.atChangeCount && value2)
    return {
      state: following,
      effects: effects,
    };
  let value3 = event.kind === 'workbookChanged' && !event.isUnasked;
  let value4 = stage.fixes.some(({ isKept: isKept }: Dynamic) => isKept === true);
  if (value3 && value4 && hasFixesNotKept(stage) && value2)
    return {
      state: withFixesOnCells(following, {
        stage: {
          ...stage,
          atChangeCount: following.workbookChangeCount,
        },
      }),
      effects: effects,
    };
  let value5 = endFixes(following);
  let value6 =
    following.sheetId === stage.sheetId
      ? value5
      : {
          ...value5,
          state: withFixesOnCells(value5.state, {
            offerDueBackOn: [...value5.state.fixesOnCells.offerDueBackOn, stage.sheetId],
          }),
        };
  return {
    state:
      following.workbookChangeCount !== stage.atChangeCount && !stage.isKept && !isInAct && (stage.fixes.length === 0 || hasFixesNotKept(stage))
        ? {
            ...withFixesOnCells(value6.state, {
              isEndToldDuringAct: following.notice === null && (value3 || value4),
            }),
            notice: following.notice ?? {
              kind: 'fixesGoneWithChange',
            },
          }
        : value6.state,
    effects: [...value6.effects, ...effects],
  };
}
export function fixesBarStage({ fixesOnCells: fixesOnCells, formulaFromWords: formulaFromWords }: Dynamic) {
  let { toOffer: toOffer, stage: stage } = fixesOnCells;
  if (stage !== null)
    return stage.awaited.size > 0
      ? {
          stage: 'asked',
          count: stage.asked.length,
        }
      : {
          stage: 'waiting',
          count: (hasFixesNotKept(stage) ? fixesNotKept(stage) : stage.fixes).length,
        };
  let { agent: agentOnWords } = formulaFromWords;
  if (toOffer === null) return null;
  if (toOffer === 'yetToBeKnown' || agentOnWords === 'checking')
    return {
      stage: 'undecided',
      count: 0,
    };
  let fixCount = toOffer.reduce((input: Dynamic, { copies: copies }: Dynamic) => input + 1 + copies.length, 0);
  return agentOnWords === 'available'
    ? {
        stage: 'offered',
        count: fixCount,
      }
    : null;
}
export function fixesInSelectionStage({
  fixesOnCells: { toOfferInSelection: toOfferInSelection, stage: stage },
  formulaFromWords: { agent: agentOnWords, hasAgentBeenMissed: hasAgentBeenMissed },
}: Dynamic) {
  if (stage !== null || toOfferInSelection === null) return null;
  if ((agentOnWords === 'checking' || agentOnWords === 'unchecked') && !hasAgentBeenMissed) return 'undecided';
  if (agentOnWords !== 'available') return null;
  return toOfferInSelection === 'yetToBeKnown' ? 'undecided' : 'offered';
}
export function cellsOfFixes({ fixesOnCells: { stage: stage } }: Dynamic) {
  if (stage === null) return [];
  if (stage.awaited.size === 0)
    return stage.fixes.map(
      ({ cellId: cellId, formula: formula, askId: askId, shown: shown, isKept: isKept }: Dynamic) => ({
        cellId: cellId,
        formula: formula,
        askId: askId,
        shownWhileItWaits: stage.isKept || isKept === true ? null : shown,
      }),
    );
  let awaitedCells = [...stage.awaited].flatMap(
    ([input, { cellId: input2, copies: input3 }]: Dynamic) =>
      [input2, ...input3.map((input4?: Dynamic) => input4.cellId)].map(
        (input4?: Dynamic) => ({
          cellId: input4,
          askId: input,
        }),
      ),
  );
  return [...stage.fixes, ...awaitedCells].map(
    ({ cellId: cellId, askId: askId }: Dynamic) => ({
      cellId: cellId,
      askId: askId,
      formula: null,
      shownWhileItWaits: null,
    }),
  );
}
export function fixAreasToDraw(state: Dynamic, reads: WorkbookReads) {
  let areas: Dynamic = [];
  for (let { cellId: cellId, askId: askId } of cellsOfFixes(state) as Dynamic) {
    let area = mergedAreaOrCellOf(reads, cellId);
    let value = areas.at(-1);
    if (area === null) continue;
    if (value?.askId === askId && value.leftColumnIndex === area.leftColumnIndex && value.topRowIndex + value.rowCount === area.topRowIndex)
      areas[areas.length - 1] = {
        ...value,
        rowCount: value.rowCount + area.rowCount,
      };
    else
      areas.push({
        ...area,
        key: cellKeyOf(cellId),
        askId: askId,
      });
  }
  return areas;
}
export const fixesCameToNothing = (state: PageState, reason: Dynamic = null) =>
  reason === null
    ? {
        ...withFixesOnCells(state, {
          stage: null,
          cameToNothingAt: state.workbookChangeCount,
        }),
        notice: state.notice ?? {
          kind: 'fixesCameToNothing',
        },
      }
    : {
        ...withFixesOnCells(state, {
          stage: null,
        }),
        notice: state.notice ?? {
          kind: 'callsForFixesFailed',
          why: reason,
        },
      };
export const hangingCellsCache = new (WeakMap as Dynamic)();
export const pasteFixesEdit = ({ sheetId: sheetId }: Dynamic, reads: WorkbookReads, fixes?: Dynamic) => ({
  kind: 'pasteTexts',
  sheetId: sheetId,
  cells: fixes.map(
    ({ cellId: { rowId: fix, columnId: fix2 }, formula: formula }: Dynamic) => ({
      r: fix,
      c: fix2,
      text: formula,
    }),
  ),
  pastedTextIs: 'asTyped',
  localeOfTexts: reads.locale,
});
export const fixesNotKept = ({ fixes: fixes }: Dynamic) => fixes.filter(({ isKept: isKept }: Dynamic) => isKept !== true);
export const hasFixesNotKept = (stage?: Dynamic) => fixesNotKept(stage).length > 0;
export const areFixesWaiting = ({ fixesOnCells: { stage: stage } }: Dynamic) => stage !== null && hasFixesNotKept(stage);
export const withErrorsOfferReset = (state: PageState) => ({
  ...state,
  errorsOffered: resetBaselineOfOffer(state.errorsOffered),
});
export const dropFixAtCell = (state: PageState, stage?: Dynamic, cellId?: Dynamic) => {
  let fixesLeft = stage.fixes.filter((fix?: Dynamic) => !isSameCell(fix.cellId, cellId));
  return fixesLeft.length === 0
    ? endFixes(state)
    : withNoEffects(
        withFixesOnCells(state, {
          stage: {
            ...stage,
            fixes: fixesLeft,
          },
        }),
      );
};
export const isFixPillBlocked = (state?: Dynamic) =>
  isExplainingBlocked({
    ...state,
    fixesOnCells: NO_FIXES_ON_CELLS,
    isSteppedOutOfCells: false,
  });
export const fixAtActiveCell = (state: PageState, reads: WorkbookReads) =>
  isFixPillBlocked(state) ? null : fixAtCell(state, activeAnchorCell(state, reads));
export const isFixAtSelectionShown = ({ explainedUnderCell: explainedUnderCell, fixesOnCells: fixesOnCells }: Dynamic) =>
  !explainedUnderCell.isSelectionByMouse && fixesOnCells.stage?.hasPersonLeft !== true && fixesOnCells.stage?.stoodAt === null;
