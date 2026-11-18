import type { Dynamic } from '../dynamic.ts';
import { findFormulaReferences, resolveFormulaReference, sheetPrefixForFormula, isWholeLineReference } from './references.ts';
import { hasSpaceBetweenOperands } from './word-tokens.ts';
import { areasToA1AsStored } from './from-words/where.ts';
import { isFormulaText } from '../chips/dropdown-pane-edits.ts';
import { isInsideArrayLiteral } from './function-help.ts';
import {
  selectionAreaAndKind,
  mergedAreaOrCellOf,
  areaGrownOverMerges,
  isSameArea,
  isSameCell,
  anchorCellOf,
  scrollToShowPosition,
  selectionAtCell,
  moveActiveCellTo,
  selectionOfArea,
  BOTH_AXES,
} from '../selection/model.ts';
import { wholeAreaToA1AsStored, rowLabelEnds, columnLabelEnds } from '../model/a1-references.ts';
import { findSheetById, layoutOfView } from '../grid/layout.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import { withEntryText } from '../editor/text-looks.ts';
import { hitTestGrid, scrollPositionInLines } from '../grid/geometry.ts';
import { formulaArgumentSeparator } from '../format/number-signs.ts';
import { dragPositionClearOfStuckHeaders, columnSpanAt } from '../grid/sticky-headers.ts';
import { jumpOrExtendSelection } from '../selection/jumps.ts';
import { extendSelectionByKey, cellAfterKeyMove } from '../selection/keyboard.ts';
import { cellShownText } from '../clipboard/text-escaping.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function referencesInFormula(formula?: Dynamic, reads?: Dynamic) {
  let parsed = findFormulaReferences(formula, reads);
  return hasSpaceBetweenOperands(formula)
    ? {
        ...parsed,
        references: parsed.references.filter(hasLetteredEnd),
      }
    : parsed;
}
export function highlightedReferences(formula: Dynamic, sheetId: Dynamic, reads: WorkbookReads) {
  let sheets = reads.listSheets();
  let huesByArea = new (Map as Dynamic)();
  let { references: references } = referencesInFormula(formula, reads.decimalSign);
  return references.flatMap((reference?: Dynamic) => {
    let found = resolveFormulaReference(reference, sheetId, sheets);
    if (found === null) return [];
    let { sheet: sheet, area: area, pieces: pieces } = found;
    let { sheetId: refSheetId } = sheet;
    let areaKey = `${refSheetId} ${areasToA1AsStored(pieces, sheet.ownRowOrder)}`;
    let hue = huesByArea.get(areaKey) ?? referenceHue(huesByArea.size);
    huesByArea.set(areaKey, hue);
    let writtenAt = {
      start: reference.start,
      end: reference.end,
    };
    return [
      {
        sheetId: refSheetId,
        area: area,
        ...(pieces.length > 1 && {
          pieces: pieces,
        }),
        hue: hue,
        writtenAt: writtenAt,
      },
    ];
  });
}
export function syncReferencesInEntry(previousState: Dynamic, state: PageState, reads: WorkbookReads) {
  let { mode: mode, activeCell: activeCell, workbookChangeCount: workbookChangeCount } = state;
  if (mode === previousState.mode && workbookChangeCount === previousState.workbookChangeCount) return state;
  let references =
    mode.kind === 'editing' && isFormulaText(mode.text) ? highlightedReferences(mode.text, activeCell.sheetId, reads) : NO_REFERENCES;
  return references.length === 0 && state.referencesInEntry.length === 0
    ? state
    : {
        ...state,
        referencesInEntry: references,
      };
}
export function referenceSlotAt(text?: Dynamic, caret?: Dynamic) {
  if (!isFormulaText(text) || isInsideArrayLiteral(text.slice(0, caret.start))) return null;
  let { references: references, quoted: quoted } = referencesInFormula(text, 'point');
  let enclosing = references.find(({ start: start, end: end }: Dynamic) => start <= caret.start && caret.end <= end);
  if (enclosing !== undefined)
    return {
      start: enclosing.start,
      end: enclosing.end,
      written: enclosing,
    };
  return !quoted.some(
    ({ start: start, end: end, isClosed: isClosed }: Dynamic) => start < caret.start && (caret.start < end || !isClosed),
  ) &&
    REFERENCE_MAY_FOLLOW_PATTERN.test(text.slice(0, caret.start)) &&
    REFERENCE_MAY_PRECEDE_PATTERN.test(text.slice(caret.end))
    ? {
        ...caret,
        written: null,
      }
    : null;
}
export function isPointingPossible(mode?: Dynamic, caretInEntry?: Dynamic) {
  if (mode.kind !== 'editing' || caretInEntry?.isComposing === true) return false;
  if (mode.isBegunToListFunctions === true) return false;
  let caret = caretOrEnd(mode.text, caretInEntry);
  return !isEntryUntouchedAt(mode, caret) && referenceSlotAt(mode.text, caret) !== null;
}
export function pointedArea(reads: WorkbookReads, { anchor: anchor, at: at2, whole: whole }: Dynamic) {
  let pointed = selectionAreaAndKind(
    {
      activeCell: anchor,
      selectionCorner: at2,
    },
    reads,
  );
  if (pointed === null || whole !== null) return pointed?.area ?? null;
  let merge = mergedAreaOrCellOf(reads, anchor);
  if (merge === null) return null;
  let grown = areaGrownOverMerges(reads, anchor.sheetId, pointed.area);
  return isSameArea(grown, merge)
    ? {
        ...grown,
        rowCount: 1,
        columnCount: 1,
      }
    : grown;
}
export function writtenAddress(area?: Dynamic, whole?: Dynamic, ownRowOrder?: Dynamic) {
  let address = wholeAreaToA1AsStored(area, ownRowOrder);
  if (whole === null || address === null) return address;
  let { first: first, last: last } = whole === 'rows' ? rowLabelEnds(area, ownRowOrder) : columnLabelEnds(area);
  return `${first}:${last}`;
}
export function writeReferenceIntoEntry(state: PageState, reads: WorkbookReads, slot?: Dynamic, lead?: Dynamic, pointing?: Dynamic) {
  let { anchor: anchor, whole: whole } = pointing;
  let area = pointedArea(reads, pointing);
  let sheetName = findSheetById(reads, anchor.sheetId)?.name;
  if (state.mode.kind !== 'editing' || area === null || sheetName === undefined) return state;
  let isSameSheet = anchor.sheetId === state.activeCell.sheetId;
  let ownRowOrder = ownRowOrderOfSheet(reads, anchor.sheetId);
  let written = writtenAddress(area, whole, ownRowOrder);
  let live = lead === '' ? livePointedReference(state) : null;
  let tookPlaceOf =
    (live?.start === slot.start && live.end === slot.end ? live.tookPlaceOf : null) ?? state.mode.text.slice(slot.start, slot.end);
  let address = written === null ? tookPlaceOf : `${isSameSheet ? '' : sheetPrefixForFormula(sheetName)}${written}`;
  let otherNotice = state.notice?.kind === 'ownSortInTheWay' ? null : state.notice;
  let writtenStart = slot.start + lead.length;
  let text = `${state.mode.text.slice(0, slot.start)}${lead}${address}${state.mode.text.slice(slot.end)}`;
  return {
    ...state,
    mode: {
      ...withEntryText(state.mode, text),
      ...(!isSameSheet && {
        mayHoldTextOfOthers: true,
      }),
    },
    notice:
      written === null
        ? {
            kind: 'ownSortInTheWay',
            act: 'referTo',
          }
        : otherNotice,
    pointedReference: {
      start: writtenStart,
      end: writtenStart + address.length,
      text: text,
      tookPlaceOf: tookPlaceOf,
      ...pointing,
    },
  };
}
export function areaOfWrittenReference(reference: Dynamic, { sheetId: sheetId, activeCell: activeCell }: Dynamic, reads: WorkbookReads) {
  let found = reference === null ? null : resolveFormulaReference(reference, activeCell.sheetId, reads.listSheets());
  return found?.sheet.sheetId === sheetId && found.pieces.length === 1 ? found.area : null;
}
export function cellOfWrittenReference(reference: Dynamic, state: PageState, reads: WorkbookReads) {
  let area = areaOfWrittenReference(reference, state, reads);
  return area === null ? null : reads.cellIdAt(state.sheetId, area.topRowIndex, area.leftColumnIndex);
}
export function wholeOfReference(reference?: Dynamic) {
  if (reference === null) return null;
  return reference.rows.count === null ? 'columns' : reference.columns.count === null ? 'rows' : null;
}
export function pointAtCell(state: PageState, pointer: Dynamic, reads: ReadsWithTextMeasurer) {
  let { mode: mode, sheetId: sheetId, activeCell: activeCell } = state;
  if (mode.kind !== 'editing' || pointer.isByFinger) return null;
  if (pointer.caretInEntry?.isComposing === true) return null;
  let hit = hitTestGrid(pointer, state, layoutOfView(state, reads));
  if (hit === null || hit.kind === 'corner') return null;
  let whole = WHOLE_OF_HEADER_KIND[hit.kind];
  let { rowIndex: rowIndex, columnIndex: columnIndex } = {
    rowIndex: 0,
    columnIndex: 0,
    ...hit,
  };
  let cellId = reads.cellIdAt(sheetId, rowIndex, columnIndex);
  if (cellId === null) return null;
  if (whole === null && isSameCell(anchorCellOf(reads, cellId), activeCell)) return null;
  let caret = caretOrEnd(mode.text, pointer.caretInEntry);
  let live = livePointedReference(state);
  if (live === null && isEntryUntouchedAt(mode, caret)) return null;
  let isInLive = live !== null && !isPointedReferenceEmpty(live) && live.start <= caret.start && caret.end <= live.end;
  let slot = isInLive
    ? {
        ...live,
        written: null,
      }
    : referenceSlotAt(mode.text, caret);
  if (slot === null) return null;
  let draggingState = {
    ...state,
    dragging: {
      kind: 'pointing',
    },
  };
  let addsReference =
    pointer.isModifierHeld === true && !pointer.isShiftHeld && slot.start < slot.end && (isInLive || slot.written !== null);
  let isRangeEnd = (!addsReference && /:\s*$/.test(mode.text.slice(0, slot.start))) || /^\s*:/.test(mode.text.slice(slot.end));
  if (whole !== null && isRangeEnd) return null;
  if (addsReference)
    return writeReferenceIntoEntry(
      draggingState,
      reads,
      {
        start: slot.end,
        end: slot.end,
      },
      formulaArgumentSeparator(reads.decimalSign),
      {
        anchor: cellId,
        at: cellId,
        whole: whole,
      },
    );
  let liveAnchor = isInLive ? live.anchor : cellOfWrittenReference(slot.written, state, reads);
  let liveWhole = isInLive ? live.whole : wholeOfReference(slot.written);
  let extendsFromAnchor =
    pointer.isShiftHeld &&
    (whole === null || liveWhole === null || whole === liveWhole) &&
    liveAnchor?.sheetId === sheetId &&
    reads.positionOfCell(liveAnchor) !== null;
  return writeReferenceIntoEntry(draggingState, reads, slot, '', {
    anchor: extendsFromAnchor ? liveAnchor : cellId,
    at: cellId,
    whole: whole,
  });
}
export function dragPointedReference(state: PageState, pointer: Dynamic, reads: ReadsWithTextMeasurer) {
  let live = livePointedReference(state);
  if (live === null) return state;
  let layout = layoutOfView(state, reads);
  let { rows: rowsFrozen, columns: columnsFrozen } = scrollPositionInLines(state, layout);
  let grownSoFar = rowsFrozen.under + columnsFrozen.under > 0 ? pointedArea(reads, live) : null;
  let { anchor: anchor, whole: whole } = live;
  let hit = dragPositionClearOfStuckHeaders(pointer, state, reads, layout, {
    of: whole ?? columnSpanAt,
    fromRow: reads.positionOfCell(anchor)?.rowIndex ?? 0,
    grownSoFar: grownSoFar,
  });
  let growsAlong = {
    rows: whole !== 'columns',
    columns: whole !== 'rows',
  };
  let cellId = reads.cellIdAt(state.sheetId, growsAlong.rows ? hit.rowIndex : 0, growsAlong.columns ? hit.columnIndex : 0);
  if (cellId === null) return state;
  if (isSameCell(cellId, live.at)) {
    if (hit.isToComeClearOf === undefined) return state;
    let scrolled = scrollToShowPosition(state, reads, hit, growsAlong, 'pointer');
    return scrolled.scrollTop !== state.scrollTop || scrolled.scrollLeft !== state.scrollLeft ? scrolled : state;
  }
  let pointedState = writeReferenceIntoEntry(state, reads, live, '', {
    anchor: anchor,
    at: cellId,
    whole: whole,
  });
  return scrollToShowPosition(pointedState, reads, hit, growsAlong, 'pointer');
}
export function shouldArrowsMoveText(mode?: Dynamic, caret?: Dynamic, pointedReference?: Dynamic) {
  let { text: text, arrowsActOn: arrowsActOn } = mode;
  if (arrowsActOn === 'text' || caret.isPlacedByHand === true || caret.start !== caret.end) return false;
  let atCaret = pointedReferenceAtCaret(pointedReference, text, caret);
  if (atCaret !== null && atCaret.whole === null) return true;
  return !isEntryUntouchedAt(mode, caret) && referenceSlotAt(text, caret)?.written === null;
}
export function movePointedReference(
  state: PageState,
  reads: ReadsWithTextMeasurer,
  caret: Dynamic,
  { rowDelta: rowDelta, columnDelta: columnDelta, isToEdgeOfData: isToEdgeOfData, isStretching: isStretching }: Dynamic,
) {
  let delta = {
    rowDelta: rowDelta,
    columnDelta: columnDelta,
  };
  if (state.mode.kind !== 'editing') return state;
  let atCaret = pointedReferenceAtCaret(state.pointedReference, state.mode.text, caret);
  let slot = atCaret ?? referenceSlotAt(state.mode.text, caret);
  let homeCell =
    state.sheetId === state.activeCell.sheetId
      ? state.activeCell
      : state.placesLeft.find(({ sheetId: placeLeft }: Dynamic) => placeLeft === state.sheetId)?.activeCell;
  if (slot === null || homeCell === undefined) return state;
  let livePointed = [atCaret?.anchor, atCaret?.at].some(
    (input?: Dynamic) => input?.sheetId !== state.sheetId || reads.positionOfCell(input) === null,
  )
    ? null
    : atCaret;
  let stretchesIt = livePointed !== null && !isPointedReferenceEmpty(livePointed) && isStretching;
  let startSelection = stretchesIt
    ? {
        activeCell: livePointed.anchor,
        selectionCorner: livePointed.at,
      }
    : selectionAtCell(livePointed?.at ?? homeCell);
  let mergeCameTo = (livePointed === null && homeCell === state.activeCell ? state : livePointed)?.cameToMergedCellsAt ?? null;
  let isStillInMerge = mergeCameTo !== null && isSameCell(anchorCellOf(reads, mergeCameTo), startSelection.activeCell);
  let stateAtStart = {
    ...state,
    ...startSelection,
    cameToMergedCellsAt: isStillInMerge && !stretchesIt ? mergeCameTo : null,
  };
  let moved = isToEdgeOfData
    ? jumpOrExtendSelection(
        stateAtStart,
        reads,
        {
          kind: 'edgeOfData',
          ...delta,
        },
        stretchesIt,
      )
    : stretchesIt
      ? extendSelectionByKey(stateAtStart, reads, delta)
      : moveActiveCellTo(stateAtStart, reads, cellAfterKeyMove(stateAtStart, reads, delta));
  let { activeCell: anchor, selectionCorner: at2, scrollLeft: scrollLeft, scrollTop: scrollTop } = moved;
  let isAnchorSame = livePointed === null || isSameCell(anchor, livePointed.anchor);
  if (isSameCell(at2, startSelection.selectionCorner) && isAnchorSame) return state;
  let { cameToMergedCellsAt: cameToMergedCellsAt } = moved;
  let pointing = {
    anchor: anchor,
    at: at2,
    whole: null,
    cameToMergedCellsAt: cameToMergedCellsAt,
  };
  return writeReferenceIntoEntry(
    {
      ...state,
      scrollLeft: scrollLeft,
      scrollTop: scrollTop,
    },
    reads,
    slot,
    '',
    pointing,
  );
}
export function pickUpReferenceAtCaret(state: PageState, reads: ReadsWithTextMeasurer, caret?: Dynamic) {
  if (state.mode.kind !== 'editing') return null;
  let { text: text } = state.mode;
  let slot = referenceSlotAt(text, caret);
  if (slot === null) return null;
  let { written: written } = slot;
  if (written === null) {
    let { start: start, end: end } = caret;
    let { activeCell: anchor, activeCell: at, cameToMergedCellsAt: cameToMergedCellsAt } = state;
    return start === end
      ? {
          ...state,
          pointedReference: {
            start: start,
            end: end,
            text: text,
            anchor: anchor,
            at: at,
            whole: null,
            cameToMergedCellsAt: cameToMergedCellsAt,
          },
        }
      : null;
  }
  let area = isWholeLineReference(written) ? null : areaOfWrittenReference(written, state, reads);
  if (area === null) return null;
  let corners = selectionOfArea(state, reads, area);
  let cornerPosition = corners === null ? null : reads.positionOfCell(corners.selectionCorner);
  if (corners === null || cornerPosition === null) return null;
  let { activeCell: activeCell, selectionCorner: selectionCorner } = corners;
  let { start: writtenStart, end: writtenEnd } = written;
  return scrollToShowPosition(
    {
      ...state,
      pointedReference: {
        start: writtenStart,
        end: writtenEnd,
        text: text,
        anchor: activeCell,
        at: selectionCorner,
        whole: null,
      },
    },
    reads,
    cornerPosition,
    BOTH_AXES,
    'key',
  );
}
export function toggleArrowsTarget(state: PageState, reads: ReadsWithTextMeasurer, caret?: Dynamic) {
  let { mode: mode, pointedReference: pointedReference } = state;
  if (mode.kind !== 'editing') return state;
  if (shouldArrowsMoveText(mode, caret, pointedReference))
    return {
      ...state,
      mode: {
        ...mode,
        arrowsActOn: 'text',
      },
      lastDone: {
        what: 'arrowsGivenTo',
        to: 'text',
      },
    };
  let stateWithCells = {
    ...state,
    mode: {
      ...mode,
      arrowsActOn: 'cells',
    },
  };
  if (shouldArrowsMoveText(stateWithCells.mode, caret, pointedReference))
    return {
      ...stateWithCells,
      lastDone: {
        what: 'arrowsGivenTo',
        to: 'cells',
      },
    };
  let pickedUp = pickUpReferenceAtCaret(stateWithCells, reads, caret);
  if (pickedUp !== null)
    return {
      ...pickedUp,
      lastDone: {
        what: 'arrowsGivenTo',
        to: 'cells',
      },
    };
  return {
    ...stateWithCells,
    lastDone: {
      what: 'arrowsGivenTo',
      to: 'cellsElsewhere',
    },
  };
}
export function cycleReferenceDollars(text?: Dynamic, caret?: Dynamic) {
  let written = referenceSlotAt(text, caret)?.written ?? null;
  if (written === null) return null;
  let { dollarOfColumn: dollarOfColumn, dollarOfRow: dollarOfRow } =
    written.ends.find(({ letters: letters, digits: digits }: Dynamic) => letters !== '' && digits !== '') ?? written.ends[0];
  let columnDollar = dollarOfColumn === '$' ? '' : '$';
  let rowDollar = dollarOfColumn === dollarOfRow ? '$' : '';
  let rewritten: Dynamic = '';
  let copiedTo: Dynamic = written.start;
  for (let { start: endStart, end: endEnd, letters: letters, digits: digits } of written.ends as Dynamic) {
    let columnPart = letters === '' ? '' : `${columnDollar}${letters}`;
    let rowPart = digits === '' ? '' : `${rowDollar}${digits}`;
    rewritten += `${text.slice(copiedTo, endStart)}${columnPart}${rowPart}`;
    copiedTo = endEnd;
  }
  return {
    text: `${text.slice(0, written.start)}${rewritten}${text.slice(written.end)}`,
    caretAt: written.start + rewritten.length,
  };
}
export function pointedCellsTip(
  { pointedReference: pointedReference, dragging: dragging, formulaHelp: formulaHelp, mode: mode }: Dynamic,
  reads: WorkbookReads,
) {
  if (pointedReference === null || pointedReference.start === pointedReference.end || dragging?.kind === 'pointing') return null;
  if (pointedReferenceAtCaret(pointedReference, pointedReference.text, caretOrEnd(pointedReference.text, formulaHelp.caret ?? undefined)) === null)
    return null;
  let anchorCell = anchorCellOf(reads, pointedReference.anchor);
  let isOneCell = pointedReference.whole === null && isSameCell(anchorCell, anchorCellOf(reads, pointedReference.at));
  return {
    cells: pointedReference.text.slice(pointedReference.start, pointedReference.end),
    text: isOneCell ? cellShownText(reads.cellOnShowIn(anchorCell), reads.decimalSign) : null,
    doArrowsMoveIt: mode.kind === 'editing' && mode.arrowsActOn !== 'text' && pointedReference.whole === null,
  };
}
export function dropPointedReference(state: PageState) {
  let { pointedReference: pointedReference, dragging: dragging } = state;
  if (pointedReference === null && dragging?.kind !== 'pointing') return state;
  if (livePointedReference(state) !== null) return state;
  return {
    ...state,
    pointedReference: null,
    dragging: dragging?.kind === 'pointing' ? null : dragging,
  };
}
export const REFERENCE_HUES = ['violet', 'green', 'magenta', 'aqua', 'orange'];
export const referenceHue = (index?: Dynamic) => REFERENCE_HUES[index % REFERENCE_HUES.length] ?? REFERENCE_HUES[0];
export const NO_REFERENCES: Dynamic = [];
export const hasLetteredEnd = ({ ends: ends }: Dynamic) => ends.some(({ letters: letters }: Dynamic) => letters !== '');
export const REFERENCE_MAY_FOLLOW_PATTERN = /[=+\-*/(,;:^<>&]\s*$/;
export const REFERENCE_MAY_PRECEDE_PATTERN = /^\s*(?:$|[=+\-*/),;:^<>&%])/;
export const caretOrEnd = (text?: Dynamic, caret?: Dynamic) =>
  caret?.text === text
    ? caret
    : {
        start: text.length,
        end: text.length,
      };
export const isEntryUntouched = (mode?: Dynamic) =>
  mode.kind === 'editing' && mode.isTypedOverCell !== true && mode.text === mode.textAtStart;
export const isEntryUntouchedAt = (mode?: Dynamic, caret?: Dynamic) => isEntryUntouched(mode) && caret.isPlacedByHand !== true;
export const isPointedReferenceEmpty = ({ start: start, end: end, anchor: anchor, at: at }: Dynamic) =>
  start === end && isSameCell(anchor, at);
export const livePointedReference = ({ mode: mode, pointedReference: pointedReference }: Dynamic) =>
  mode.kind === 'editing' && mode.text === pointedReference?.text ? pointedReference : null;
export const WHOLE_OF_HEADER_KIND = {
  cell: null,
  rowHeader: 'rows',
  columnHeader: 'columns',
};
export const pointedReferenceAtCaret = (pointedReference?: Dynamic, text?: Dynamic, caret?: Dynamic) =>
  pointedReference?.text === text && caret.start === pointedReference.end && caret.end === pointedReference.end ? pointedReference : null;
export const isEditingSameText = ({ mode: mode }: Dynamic, { text: text, typingIn: typingIn }: Dynamic) =>
  mode.kind === 'editing' && mode.typingIn === typingIn && mode.text === text;
