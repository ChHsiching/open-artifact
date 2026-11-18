import type { Dynamic } from '../dynamic.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import {
  selectionKindOf,
  selectionOfArea,
  selectedArea,
  activeAnchorCell,
  selectionAtCell,
  moveActiveCellTo,
  mergedAreaOrCellOf,
  isAnchorOfActiveCell,
  isSameCell,
  anchorCellOf,
} from '../selection/model.ts';
import { layoutOfView } from '../grid/layout.ts';
import { sharedFormatOfSelection } from '../selection/keyboard.ts';
import { MAX_ROWS_UP_TO_HEADING } from '../format/conditional/descriptions.ts';
import { cellValueOf, cellPlainText } from '../model/cell-values.ts';
import { foldLabelCase, dropdownAtCell, isSameOptionLabel, MAX_DROPDOWN_OPTIONS, OPTION_LABEL_SHOWN_LENGTH } from './dropdown-options.ts';
import { withNoEffects } from '../state/transitions.ts';
import {
  openDropdownListOrEditor,
  openDropdownEditorAt,
  openDropdownEditor,
  withDropdownPane,
  dropdownAtActiveCell,
  closeDropdownList,
  chosenReadySetKey,
} from './dropdowns.ts';
import { cellBlockOfSelection, shownCellBlockOfCorners } from '../model/cell-blocks.ts';
import {
  isOptionSetSameAs,
  EMPTY_TYPED_OPTION,
  editorOptionsOf,
  cleanOptionLabel,
  optionsAfterTypedLabel,
  pasteOptionLabels,
  everyOptionColorOffer,
  changedCellsTyped,
  commitTypedOption,
  chosenOptionSetKey,
  optionsFromReadySet,
} from './dropdown-pane-edits.ts';
import { queueEdit, IF_QUEUED_DEFAULTS, queueEdits, withIfQueued } from '../model/edit-effects.ts';
import {
  colorOptionsAutomatically,
  colorForAddedOption,
  assignOptionColors,
  isDropdownDeliberatelyUncolored,
  withoutOptionColors,
} from './dropdown-colors.ts';
import { filteredRowRunsIn } from '../tables/filtered-rows.ts';
import { isInSpan } from '../grid/geometry.ts';
import { dropdownEditorOfPane } from '../state/queries.ts';
import { NO_COLOR, colorsEqual } from '../model/colors.ts';
import { parseA1AreaAsSeen } from '../model/a1-references.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function dropdownClearingOffer(
  reads: WorkbookReads,
  area: Dynamic,
  { activeCell: activeCell, selectionCorner: selectionCorner }: Dynamic,
  dropdownChoice?: Dynamic,
  headerRow?: Dynamic,
) {
  let cellsCleared =
    reads.filledCellsIn(activeCell.sheetId, area).length === 0
      ? {
          formulas: 0,
          others: 0,
        }
      : reads.cellsThatADropdownWouldClear(activeCell, selectionCorner, dropdownChoice);
  if (cellsCleared === null) return null;
  if (cellsCleared.formulas + cellsCleared.others === 0)
    return {
      done: headerRow ?? 'dropdownSet',
      undoOffer: null,
    };
  let undoOffer = {
    kind: 'dropdownClearedCells',
    cells: areaToA1AsStored(area, ownRowOrderOfSheet(reads, activeCell.sheetId)),
    isOneCell: area.rowCount * area.columnCount === 1,
    formulaCount: cellsCleared.formulas,
    otherCount: cellsCleared.others,
    isSaved: false,
  };
  return {
    done: {
      what: 'undoOfferMade',
      offer: undoOffer,
      ...(headerRow !== null && {
        headerRow: headerRow,
      }),
    },
    undoOffer: undoOffer,
  };
}
export function headerAboveDropdownCells(state: PageState, reads: ReadsWithTextMeasurer, area?: Dynamic) {
  let heading =
    area.columnCount === 1 && selectionKindOf(area, layoutOfView(state, reads)) === 'columns'
      ? headingsInFirstRow(reads, state.sheetId, area).get(area.leftColumnIndex)
      : undefined;
  if (heading === undefined) return null;
  let { text: headingText, rowCount: headingRows } = heading;
  let areaUnder = {
    ...area,
    topRowIndex: headingRows,
    rowCount: area.rowCount - headingRows,
  };
  let cornersUnder = selectionOfArea(state, reads, areaUnder);
  return cornersUnder === null
    ? null
    : {
        heading: headingText,
        top: headingRows,
        under: areaUnder,
        corners: cornersUnder,
      };
}
export function dropdownTargetOfSelection(state: PageState, reads: ReadsWithTextMeasurer) {
  let sharedFormat = sharedFormatOfSelection(state, reads);
  let selected = selectedArea(state, reads);
  let corners = selected === null ? null : selectionOfArea(state, reads, selected);
  if (sharedFormat === null || selected === null || corners === null) return null;
  let target = {
    selected: selected,
    corners: corners,
    shared: sharedFormat,
    entryCell: activeAnchorCell(state, reads),
    heading: null,
    thenSelected: null,
  };
  let headerAbove = headerAboveDropdownCells(state, reads, selected);
  if (headerAbove === null) return target;
  let { heading: heading, top: headingRows, under: areaUnder, corners: cornersUnder } = headerAbove;
  let { activeCell: firstCellUnder, selectionCorner: lastCellUnder } = cornersUnder;
  let sharedUnder = reads.sharedFormatBetween(firstCellUnder, lastCellUnder);
  if (sharedUnder === null || isCellUnderMerge(reads, firstCellUnder)) return target;
  let targetUnder = {
    selected: areaUnder,
    corners: cornersUnder,
    shared: sharedUnder,
    heading: heading,
  };
  if ((reads.positionOfCell(state.activeCell)?.rowIndex ?? 0) >= headingRows)
    return {
      ...targetUnder,
      entryCell: target.entryCell,
      thenSelected: null,
    };
  let rangeWalked = {
    from: corners.activeCell,
    to: corners.selectionCorner,
    at: firstCellUnder,
  };
  return {
    ...targetUnder,
    entryCell: firstCellUnder,
    thenSelected: {
      ...selectionAtCell(firstCellUnder),
      rangeWalked: rangeWalked,
    },
  };
}
export function readySetNamed(readySets?: Dynamic, label?: Dynamic) {
  let squashedLabel = squashSetLabel(label);
  return readySets.find(({ label: label2 }: Dynamic) => squashSetLabel(label2) === squashedLabel)?.set ?? null;
}
export function readySetNamedAbove(
  reads: WorkbookReads,
  sheetId: Dynamic,
  { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic,
  readySets?: Dynamic,
) {
  if (columnCount !== 1) return null;
  let topmostRowIndex = Math.max(topRowIndex - MAX_ROWS_UP_TO_HEADING, 0);
  for (let rowIndex: Dynamic = topRowIndex - 1; rowIndex >= topmostRowIndex; rowIndex -= 1) {
    let cellId = reads.cellIdAt(sheetId, rowIndex, leftColumnIndex);
    if (cellId === null) continue;
    let mergedArea = reads.mergedAreaAt(sheetId, {
      rowIndex: rowIndex,
      columnIndex: leftColumnIndex,
    });
    if (mergedArea !== null && mergedArea.leftColumnIndex !== leftColumnIndex) return null;
    let cellOnShow = reads.cellOnShowIn(cellId);
    if (cellOnShow === null) continue;
    let shownValue = cellValueOf(cellOnShow);
    if (shownValue === null) return null;
    let readySet = shownValue.kind === 'text' ? readySetNamed(readySets, shownValue.value) : null;
    if (readySet !== null) return readySet;
    if (!(shownValue.kind === 'text' && squashSetLabel(shownValue.value) === '') && reads.dropdownOf(cellId) === null) return null;
  }
  return null;
}
export function dropdownSelectionSummary(state: PageState, reads: ReadsWithTextMeasurer) {
  let target = dropdownTargetOfSelection(state, reads);
  if (target === null) return null;
  let { selected: selected, shared: sharedFormat, entryCell: entryCell } = target;
  let cellsOfDropdown = sharedFormat.cellControl?.kind === 'dropdown' ? reads.cellsOfTheDropdownAt(entryCell) : null;
  let filledCells = (
    cellsOfDropdown?.stretches.flatMap((input?: Dynamic) => stretchArea(state, reads, input) ?? []) ?? [selected]
  ).flatMap((input?: Dynamic) => reads.filledCellsIn(state.sheetId, input));
  let labelCounts = new (Map as Dynamic)();
  let [formulaCount, otherCount]: Dynamic = [0, 0];
  for (let cellId of filledCells as Dynamic) {
    let cell = reads.cellOf(cellId);
    let label = cellsOfDropdown === null ? cellLabelText(reads, cellId) : cell?.dropdownOption?.label;
    if (label !== null && label !== undefined) labelCounts.set(foldLabelCase(label), (labelCounts.get(foldLabelCase(label)) ?? 0) + 1);
    else if (cellsOfDropdown !== null) continue;
    else if (cell?.input.kind === 'formula') formulaCount += 1;
    else otherCount += 1;
  }
  return {
    isTaken: sharedFormat.cellControl?.kind !== 'dropdown' || dropdownAtCell(reads, entryCell) !== null,
    formulaCount: formulaCount,
    said: labelCounts,
    otherCount: otherCount,
  };
}
export function makeDropdownFromSelection(state: PageState, reads: ReadsWithTextMeasurer, request?: Dynamic) {
  let firstSet = request.firstSet ?? null;
  let target = dropdownTargetOfSelection(state, reads);
  if (target === null) return withNoEffects(state);
  let {
    selected: selected,
    corners: corners,
    shared: sharedFormat,
    entryCell: entryCell,
    heading: heading,
    thenSelected: thenSelected,
  } = target;
  let stateSelected =
    thenSelected === null
      ? state
      : {
          ...state,
          ...thenSelected,
        };
  let headerRowDone =
    heading === null
      ? null
      : {
          what: 'headerRowSet',
          isOn: true,
          heading: clipHeading(heading),
          cells: areaToA1AsStored(selected, ownRowOrderOfSheet(reads, state.sheetId)),
        };
  let opensList = request.thenOpens === 'list';
  let { thenGoesOnTo: thenGoesOnTo } = request;
  let clearingOfferFor = (dropdownChoice?: Dynamic) =>
    dropdownClearingOffer(reads, selected, corners, dropdownChoice, headerRowDone);
  if (sharedFormat.cellControl?.kind === 'dropdown') {
    let value = request.isReadySetPicked === true && dropdownAtCell(reads, entryCell) !== null ? firstSet : null;
    if (thenGoesOnTo !== undefined)
      return value === null
        ? withNoEffects(moveActiveCellTo(state, reads, thenGoesOnTo))
        : startDropdownFromSet(stateSelected, reads, value, thenGoesOnTo);
    let value2 = opensList ? openDropdownListOrEditor(stateSelected, reads) : openDropdownEditorAt(stateSelected, reads, entryCell);
    return value === null ? withNoEffects(value2) : startDropdownFromSet(value2, reads, value, entryCell);
  }
  let editCells = cellBlockOfSelection(state, reads, corners);
  if (editCells === null) return withNoEffects(state);
  let thenWhat =
    thenGoesOnTo !== undefined
      ? {
          thenGoesOnTo: thenGoesOnTo,
        }
      : opensList
        ? {
            thenDropdownList: 'opens',
          }
        : {};
  let pickedSet = request.isReadySetPicked === true ? firstSet : null;
  let heldDropdown = reads.dropdownOf(entryCell);
  if (heldDropdown !== null && (pickedSet === null || isOptionSetSameAs(heldDropdown.options, pickedSet))) {
    let value = clearingOfferFor({
      kind: 'held',
      dropdownId: heldDropdown.dropdownId,
    });
    if (value === null) return withNoEffects(state);
    return queueEdit(
      state,
      cellControlEdit(editCells, {
        kind: 'dropdown',
        dropdownId: heldDropdown.dropdownId,
      }),
      {
        ...IF_QUEUED_DEFAULTS,
        select: thenSelected,
        ...value,
        ...thenWhat,
      },
    );
  }
  let offeredLabels = pickedSet === null ? reads.dropdownOptionsToOffer(corners.activeCell, corners.selectionCorner) : [];
  if (offeredLabels === null) return withNoEffects(state);
  let dropdownAbove =
    heldDropdown === null && pickedSet === null ? dropdownToJoinAbove(reads, state.sheetId, selected, sharedFormat.cellControl === null) : null;
  let [firstJoinedOption, ...otherJoinedOptions] =
    dropdownAbove === null ? [] : (mergeOfferedOptions(dropdownAbove.dropdown.options, offeredLabels) ?? []);
  if (dropdownAbove !== null && firstJoinedOption !== undefined) {
    let { dropdown: value, joining: value2 } = dropdownAbove;
    let value3 = selectionOfArea(state, reads, value2);
    let value4 = value3 === null ? null : cellBlockOfSelection(state, reads, value3);
    let labels = [firstJoinedOption, ...otherJoinedOptions].map(({ label: label }: Dynamic) => label);
    let clearingOffer =
      value3 === null
        ? null
        : dropdownClearingOffer(
            reads,
            value2,
            value3,
            {
              kind: 'new',
              labels: labels,
            },
            headerRowDone,
          );
    if (value4 === null || clearingOffer === null) return withNoEffects(state);
    let { dropdownId: dropdownId } = value;
    let ifQueued = {
      ...IF_QUEUED_DEFAULTS,
      select: thenSelected,
      ...clearingOffer,
      ...(opensList
        ? thenWhat
        : {
            thenInDropdownEditor: 'opens',
          }),
    };
    let cellControlEdit2 = cellControlEdit(value4, {
      kind: 'dropdown',
      dropdownId: dropdownId,
    });
    if (labels.length === value.options.length) return queueEdit(state, cellControlEdit2, ifQueued);
    let optionsEdit = {
      kind: 'setDropdownOptions',
      sheetId: state.sheetId,
      dropdownId: dropdownId,
      options: [firstJoinedOption, ...otherJoinedOptions],
      appliesTo: {
        kind: 'everyCell',
      },
    };
    return queueEdits(state, [optionsEdit, cellControlEdit2], ifQueued, {
      isEachPointedAt: true,
    });
  }
  let isFromFirstSet = offeredLabels.length === 0 && firstSet !== null;
  let [firstOption, ...otherOptions] =
    pickedSet !== null
      ? pickedSet.options
      : isFromFirstSet
        ? (readySetNamedAbove(reads, state.sheetId, selected, request.setsByName ?? []) ?? firstSet).options
        : colorOptionsAutomatically(offeredLabels).map(newDropdownOption);
  if (firstOption !== undefined) {
    let value = clearingOfferFor({
      kind: 'new',
      labels: [firstOption, ...otherOptions].map(({ label: label }: Dynamic) => label),
    });
    if (value === null) return withNoEffects(state);
    return queueEdit(
      state,
      {
        kind: 'makeDropdown',
        cells: editCells,
        options: [firstOption, ...otherOptions],
      },
      {
        ...IF_QUEUED_DEFAULTS,
        select: thenSelected,
        ...value,
        ...(opensList
          ? thenWhat
          : {
              thenInDropdownEditor: 'opens',
            }),
      },
    );
  }
  return withNoEffects(
    openDropdownEditor(state, reads, {
      dropdownId: null,
      options: [],
      stretches: [],
      indexOfOwnStretch: 0,
      reach: 'everyCell',
      typed: EMPTY_TYPED_OPTION,
      isCustom: false,
    }),
  );
}
export function dropdownToJoinAbove(reads: WorkbookReads, sheetId?: Dynamic, area?: Dynamic, mayJoinRows?: Dynamic) {
  let { topRowIndex: topRowIndex, rowCount: rowCount, leftColumnIndex: leftColumnIndex, columnCount: columnCount } = area;
  if (columnCount !== 1) return null;
  let dropdownAtRow = (rowIndex?: Dynamic) => {
    let cellId = reads.cellIdAt(sheetId, rowIndex, leftColumnIndex);
    return cellId === null ? null : reads.dropdownOf(cellId);
  };
  let dropdownAbove: Dynamic = dropdownAtRow(topRowIndex - 1);
  if (!mayJoinRows)
    return dropdownAbove === null
      ? null
      : {
          dropdown: dropdownAbove,
          joining: area,
        };
  let rowsWithout: Dynamic = [];
  for (let value: Dynamic = topRowIndex; value < topRowIndex + rowCount; value += 1) {
    let value2 = dropdownAtRow(value);
    if (value2 === null) rowsWithout.push(value);
    else if (dropdownAbove !== null && dropdownAbove.dropdownId !== value2.dropdownId) return null;
    else dropdownAbove = value2;
  }
  let [firstRowWithout, lastRowWithout] = [rowsWithout[0], rowsWithout.at(-1)];
  if (dropdownAbove === null || firstRowWithout === undefined || lastRowWithout === undefined) return null;
  if (lastRowWithout - firstRowWithout + 1 !== rowsWithout.length) return null;
  return {
    dropdown: dropdownAbove,
    joining: {
      ...area,
      topRowIndex: firstRowWithout,
      rowCount: rowsWithout.length,
    },
  };
}
export function mergeOfferedOptions(options?: Dynamic, offered?: Dynamic) {
  let merged = [...options];
  for (let { label: value } of offered as Dynamic)
    if (merged.every((input?: Dynamic) => !isSameOptionLabel(input.label, value)))
      merged.push({
        optionId: null,
        label: value,
        color: colorForAddedOption(value, merged),
      });
  return merged.length > MAX_DROPDOWN_OPTIONS ? null : merged;
}
export function countCellsLosingOptions(
  state: PageState,
  reads: WorkbookReads,
  stretches?: Dynamic,
  newOptions?: Dynamic,
  oldOptions?: Dynamic,
  skipsHeaderRows?: Dynamic,
) {
  let newIds = new (Set as Dynamic)(newOptions.map(({ optionId: optionId }: Dynamic) => optionId));
  let droppedIds = new (Set as Dynamic)(
    oldOptions.flatMap(({ optionId: optionId }: Dynamic) => (optionId === null || newIds.has(optionId) ? [] : optionId)),
  );
  if (droppedIds.size === 0) return 0;
  return stretches
    .flatMap((input?: Dynamic) => stretchArea(state, reads, input) ?? [])
    .flatMap((input?: Dynamic) => {
      let value = skipsHeaderRows ? filteredRowRunsIn(state, reads, input) : [];
      return value.length === 0
        ? reads.filledCellsIn(state.sheetId, input)
        : reads.filledCellsIn(state.sheetId, input).filter((input2?: Dynamic) => {
            let value2 = reads.positionOfCell(input2)?.rowIndex ?? -1;
            return !value.some((input3?: Dynamic) => isInSpan(value2, input3.firstIndex, input3.count));
          });
    })
    .filter((input?: Dynamic) => {
      let value = reads.cellOf(input)?.dropdownOption?.optionId;
      return value !== undefined && droppedIds.has(value);
    }).length;
}
export function commitDropdownOptions(
  state: PageState,
  reads: WorkbookReads,
  editor?: Dynamic,
  options?: Dynamic,
  thenInEditor?: Dynamic,
  startedFromSet?: Dynamic,
  done?: Dynamic,
) {
  let [firstOption, ...otherOptions] = options;
  if (firstOption === undefined) return withNoEffects(state);
  let ifQueued = {
    ...IF_QUEUED_DEFAULTS,
    select: null,
    leavesEntryOpen: true,
    thenInDropdownEditor: thenInEditor,
  };
  if (editor.dropdownId === null) {
    let value = selectedArea(state, reads);
    let value2 = value === null ? null : selectionOfArea(state, reads, value);
    if (value === null || value2 === null) return withNoEffects(state);
    let value3 = cellBlockOfSelection(state, reads, value2);
    if (value3 === null) return withNoEffects(state);
    let labels = options.map(({ label: label }: Dynamic) => label);
    let clearingOffer = dropdownClearingOffer(
      reads,
      value,
      value2,
      {
        kind: 'new',
        labels: labels,
      },
      null,
    );
    if (clearingOffer === null) return withNoEffects(state);
    return queueEdit(
      state,
      {
        kind: 'makeDropdown',
        cells: value3,
        options: [newDropdownOption(firstOption), ...otherOptions.map(newDropdownOption)],
      },
      {
        ...ifQueued,
        ...clearingOffer,
      },
    );
  }
  let ownStretch = editor.stretches[editor.indexOfOwnStretch];
  let isEveryStretch = editor.reach === 'everyCell' || ownStretch === undefined || editor.stretches.length === 1;
  let stretchesTouched = isEveryStretch ? editor.stretches : [ownStretch];
  let rowsOfOwnStretch = isEveryStretch
    ? null
    : (({ top: top, bottom: bottom }: Dynamic) =>
        shownCellBlockOfCorners(state, reads, {
          sheetId: state.sheetId,
          oneCorner: top,
          otherCorner: bottom,
        }))(ownStretch);
  if (!isEveryStretch && rowsOfOwnStretch === null) return withNoEffects(state);
  let setOptionsEdit = {
    kind: 'setDropdownOptions',
    sheetId: state.sheetId,
    dropdownId: editor.dropdownId,
    options: [firstOption, ...otherOptions],
    appliesTo:
      rowsOfOwnStretch === null
        ? {
            kind: 'everyCell',
          }
        : {
            kind: 'cellsInRows',
            rows: rowsOfOwnStretch.rows,
            oneColumn: rowsOfOwnStretch.oneColumn,
            otherColumn: rowsOfOwnStretch.otherColumn,
          },
  };
  let rangesText = stretchesTouched.map(({ range: range }: Dynamic) => range).join(', ');
  let onlyIn = isEveryStretch ? null : rangesText;
  let [
    { top: firstTop } = {
      top: null,
    },
  ] = stretchesTouched;
  let firstDropdown =
    firstTop === null
      ? null
      : reads.dropdownOf({
          sheetId: state.sheetId,
          rowId: firstTop.r,
          columnId: firstTop.c,
        });
  let clearedCount = countCellsLosingOptions(
    state,
    reads,
    stretchesTouched,
    options,
    editor.optionsByThen ?? firstDropdown?.options ?? [],
    !isEveryStretch,
  );
  if (done?.what === 'dropdownOptionRemoved' && clearedCount > 0) {
    let { label: value, isSaved: value2 } = done;
    let state2 = {
      kind: 'dropdownOptionDeleted',
      label: value,
      cellCount: clearedCount,
      onlyIn: onlyIn,
      isSaved: value2,
    };
    return queueEdit(state, setOptionsEdit, {
      ...ifQueued,
      done: {
        what: 'undoOfferMade',
        offer: state2,
      },
      undoOffer: state2,
    });
  }
  return queueEdit(state, setOptionsEdit, {
    ...ifQueued,
    done:
      startedFromSet !== undefined
        ? {
            what: 'dropdownStartedFrom',
            set: startedFromSet,
            optionCount: options.length,
          }
        : done === undefined
          ? {
              what: 'dropdownOptionsSet',
              cells: rangesText,
            }
          : {
              ...done,
              onlyIn: onlyIn,
            },
    undoOffer:
      clearedCount === 0
        ? null
        : {
            kind: 'optionsGoneClearedCells',
            count: clearedCount,
            isSaved: false,
          },
  });
}
export function ownStretchArea(state: PageState, reads: WorkbookReads, { stretches: stretches, indexOfOwnStretch: indexOfOwnStretch }: Dynamic) {
  let ownStretch = stretches[indexOfOwnStretch];
  return ownStretch === undefined ? null : stretchArea(state, reads, ownStretch);
}
export function stretchArea(state: PageState, reads: WorkbookReads, stretch?: Dynamic) {
  let positionOf = ({ r: rowId, c: columnId }: Dynamic) =>
    reads.positionOfCell({
      sheetId: state.sheetId,
      rowId: rowId,
      columnId: columnId,
    });
  let [topPosition, bottomPosition] = [positionOf(stretch.top), positionOf(stretch.bottom)];
  return topPosition === null || bottomPosition === null
    ? null
    : {
        topRowIndex: topPosition.rowIndex,
        leftColumnIndex: topPosition.columnIndex,
        rowCount: bottomPosition.rowIndex - topPosition.rowIndex + 1,
        columnCount: 1,
      };
}
export function clipHeading(heading?: Dynamic) {
  let chars = Array.from<Dynamic>(heading);
  let isClipped = chars.length > OPTION_LABEL_SHOWN_LENGTH;
  return `${chars.slice(0, OPTION_LABEL_SHOWN_LENGTH).join('')}${isClipped ? '…' : ''}`;
}
export function cellLabelText(reads: WorkbookReads, cellId?: Dynamic) {
  let cell = cellId === null ? null : reads.cellOf(cellId);
  let shownText = cellPlainText(cell);
  if (shownText !== null) return shownText;
  return cell?.input.kind === 'dropdownOption' ? (cell.dropdownOption?.label ?? cell.input.label) : null;
}
export function areaHasLabel(reads: WorkbookReads, sheetId?: Dynamic, area?: Dynamic, label?: Dynamic) {
  return reads.filledCellsIn(sheetId, area).some((input?: Dynamic) => isSameOptionLabel(cellLabelText(reads, input) ?? '', label));
}
export function headingsInFirstRow(reads: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  let headings = new (Map as Dynamic)();
  for (let columnIndex of reads.columnIndexesOnShowIn(sheetId, 0) as Dynamic) {
    let cellId = reads.cellIdAt(sheetId, 0, columnIndex);
    let isInArea = columnIndex >= area.leftColumnIndex && columnIndex < area.leftColumnIndex + area.columnCount;
    if (cellId === null || !isInArea) continue;
    if (reads.dropdownOf(cellId) !== null || isCellUnderMerge(reads, cellId)) continue;
    let text = cellLabelText(reads, cellId) ?? '';
    let rowCount = mergedAreaOrCellOf(reads, cellId)?.rowCount ?? 1;
    if (text.trim() !== '')
      headings.set(cellId.columnId, {
        text: text,
        rowCount: rowCount,
        columnIndex: columnIndex,
        sought: foldLabelCase(text),
      });
  }
  for (let columnIndex of (headings.size === 0 ? [] : reads.filledCellsIn(sheetId, area)) as Dynamic) {
    let cellId = headings.get(columnIndex.columnId);
    let isInArea = cellId === undefined ? null : cellLabelText(reads, columnIndex);
    if (cellId === undefined || isInArea === null || foldLabelCase(isInArea) !== cellId.sought) continue;
    if ((reads.rowIndexOf(sheetId, columnIndex.rowId) ?? 0) >= cellId.rowCount) headings.delete(columnIndex.columnId);
  }
  return new (Map as Dynamic)(
    Array.from<Dynamic, Dynamic>(
      headings.values(),
      ({ columnIndex: columnIndex, text: text, rowCount: rowCount }: Dynamic) => [
        columnIndex,
        {
          text: text,
          rowCount: rowCount,
        },
      ],
    ),
  );
}
export function dropdownHeaderRowState(state: PageState, reads: WorkbookReads, editor?: Dynamic) {
  let ownArea = editor.stretches.length === 1 ? ownStretchArea(state, reads, editor) : null;
  if (ownArea === null || ownArea.topRowIndex > 1 || ownArea.topRowIndex + ownArea.rowCount < 2) return null;
  if ((cellLabelTextAt(reads, state.sheetId, 0, ownArea.leftColumnIndex) ?? '').trim() === '') return null;
  if (ownArea.topRowIndex === 0) return 'off';
  return isAreaWithoutDropdown(state, reads, {
    ...ownArea,
    topRowIndex: 0,
    rowCount: 1,
  })
    ? 'on'
    : null;
}
export function isAreaWithoutDropdown(state: PageState, reads: WorkbookReads, area?: Dynamic) {
  let corners = selectionOfArea(state, reads, area);
  if (corners === null) return false;
  let cellControl = reads.sharedFormatBetween(corners.activeCell, corners.selectionCorner)?.cellControl ?? null;
  return cellControl !== null && cellControl.kind !== 'dropdown';
}
export function subtractArea(area?: Dynamic, cut?: Dynamic) {
  let [areaBottom, areaRight] = [area.topRowIndex + area.rowCount, area.leftColumnIndex + area.columnCount];
  let cutTop = Math.min(Math.max(cut.topRowIndex, area.topRowIndex), areaBottom);
  let cutBottom = Math.max(Math.min(cut.topRowIndex + cut.rowCount, areaBottom), cutTop);
  let cutLeft = Math.min(Math.max(cut.leftColumnIndex, area.leftColumnIndex), areaRight);
  let cutRight = Math.max(Math.min(cut.leftColumnIndex + cut.columnCount, areaRight), cutLeft);
  if (cutBottom === cutTop || cutRight === cutLeft) return [area];
  let cutRows = {
    topRowIndex: cutTop,
    rowCount: cutBottom - cutTop,
  };
  return [
    {
      ...area,
      rowCount: cutTop - area.topRowIndex,
    },
    {
      ...area,
      topRowIndex: cutBottom,
      rowCount: areaBottom - cutBottom,
    },
    {
      ...area,
      ...cutRows,
      columnCount: cutLeft - area.leftColumnIndex,
    },
    {
      ...area,
      ...cutRows,
      leftColumnIndex: cutRight,
      columnCount: areaRight - cutRight,
    },
  ].filter(({ rowCount: rowCount, columnCount: columnCount }: Dynamic) => rowCount > 0 && columnCount > 0);
}
export function setDropdownCells(
  state: PageState,
  reads: WorkbookReads,
  area?: Dynamic,
  selectsArea?: Dynamic,
  { optionsFirst = [], optionsLast = [], optionsByThen: optionsByThen }: Dynamic = {},
) {
  let editor = dropdownEditorOfPane(state);
  let ownArea = editor === null ? null : ownStretchArea(state, reads, editor);
  if (editor === null || ownArea === null || editor.dropdownId === null) return withNoEffects(state);
  let cornersOf = (input?: Dynamic) => selectionOfArea(state, reads, input);
  let refuse = (input?: Dynamic) =>
    withNoEffects(
      withDropdownPane(state, {
        ...editor,
        cellsRefused: {
          why: input,
        },
      }),
    );
  let addedAreas = subtractArea(area, ownArea);
  if (!addedAreas.every((input?: Dynamic) => isAreaWithoutDropdown(state, reads, input))) return refuse('ofAnotherDropdown');
  let labels = (optionsByThen ?? editor.options).map(({ label: label }: Dynamic) => label);
  let cellsCleared = addedAreas
    .filter((input?: Dynamic) => reads.filledCellsIn(state.sheetId, input).length > 0)
    .map((input?: Dynamic) => {
      let value = cornersOf(input);
      return value === null
        ? null
        : reads.cellsThatADropdownWouldClear(value.activeCell, value.selectionCorner, {
            kind: 'new',
            labels: labels,
          });
    });
  if (cellsCleared.includes(null)) return withNoEffects(state);
  if (cellsCleared.some((input?: Dynamic) => (input?.formulas ?? 0) > 0)) return refuse('holdFormula');
  if (cellsCleared.some((input?: Dynamic) => (input?.others ?? 0) > 0)) return refuse('holdNoOption');
  let controlEdits = (area2?: Dynamic, control?: Dynamic) => {
    let corners = cornersOf(area2);
    let cells = corners === null ? null : cellBlockOfSelection(state, reads, corners);
    return cells === null ? [] : [cellControlEdit(cells, control)];
  };
  let edits = [
    ...optionsFirst,
    ...controlEdits(area, {
      kind: 'dropdown',
      dropdownId: editor.dropdownId,
    }),
    ...subtractArea(ownArea, area).flatMap(
      (input?: Dynamic) =>
        controlEdits(input, {
          kind: 'none',
        }),
    ),
    ...optionsLast,
  ];
  return queueEdits(
    state,
    edits,
    {
      ...IF_QUEUED_DEFAULTS,
      select: selectsArea ? area : null,
      done: {
        what: 'dropdownCellsSet',
        cells: areaToA1AsStored(area, ownRowOrderOfSheet(reads, state.sheetId)),
      },
      thenInDropdownEditor: 'goesOn',
    },
    {
      isEachPointedAt: true,
    },
  );
}
export function reduceDropdownEditor(state: PageState, reads: WorkbookReads, action?: Dynamic) {
  let editor = dropdownEditorOfPane(state);
  if (editor === null) return withNoEffects(state);
  let [options, { typed: typed }] = [editorOptionsOf(editor), editor];
  let { cellsRefused: cellsRefused, cellsTyped: cellsTyped, ...editorRest } = editor;
  let withEditor = (input?: Dynamic) =>
    withNoEffects(
      withDropdownPane(
        {
          ...state,
          notice: null,
        },
        {
          ...editorRest,
          ...input,
        },
      ),
    );
  let hasRoomForOption = options.length < MAX_DROPDOWN_OPTIONS;
  let typedAfterEnter = (input?: Dynamic) => (input || options.length === 0 ? EMPTY_TYPED_OPTION : null);
  switch (action.kind) {
    case 'startOption':
      return reduceDropdownEditor(state, reads, {
        kind: 'enter',
        thenStartsOption: true,
      });
    case 'type': {
      let value = typed?.optionId === action.optionId ? typed.pickedColor : null;
      let state2 = {
        optionId: action.optionId,
        label: cleanOptionLabel(action.label),
        pickedColor: value,
      };
      let value2 = typed?.optionId === action.optionId ? null : optionsAfterTypedLabel(editor);
      return value2 === null
        ? withEditor({
            typed: state2,
          })
        : commitDropdownOptions(
            withEditor({
              typed: state2,
            }).state,
            reads,
            editor,
            value2,
            'goesOn',
          );
    }
    case 'dropTyped':
      return typed === null
        ? withNoEffects(state)
        : withEditor({
            typed: typed.optionId === null ? EMPTY_TYPED_OPTION : null,
          });
    case 'pasteNames': {
      let value = typed?.optionId === action.optionId ? null : optionsAfterTypedLabel(editor);
      let value2 = value ?? options;
      let value3 =
        action.optionId === null ? value2.length : value2.findIndex((input?: Dynamic) => input.optionId === action.optionId);
      if (value3 === -1) return withNoEffects(state);
      let value4 = typed?.optionId === action.optionId ? typed.pickedColor : null;
      let { pasted: value5, ...value6 } = pasteOptionLabels(value2, value3, action.labels, value4);
      let state2 = {
        what: 'dropdownOptionsAdded',
        ...value6,
      };
      let value7 = cleanOptionLabel(action.labels[0] ?? '');
      let state3 = withEditor({
        typed: {
          optionId: action.optionId,
          label: value7,
          pickedColor: value4,
        },
      }).state;
      if (value !== null || value6.count > 0 || value5[value3]?.label !== value2[value3]?.label)
        return commitDropdownOptions(state3, reads, editor, value5, 'entered', undefined, state2);
      return withNoEffects({
        ...state3,
        lastDone: {
          ...state2,
          onlyIn: null,
        },
      });
    }
    case 'enter': {
      if (typed === null)
        return action.thenStartsOption && hasRoomForOption
          ? withEditor({
              typed: EMPTY_TYPED_OPTION,
            })
          : withNoEffects(state);
      if (action.optionId !== undefined && action.optionId !== typed.optionId) return withNoEffects(state);
      let value = typed.label.trim();
      let value2 = action.thenStartsOption && hasRoomForOption;
      let match = options.find((input?: Dynamic) => input.optionId === typed.optionId);
      if (value === '' || value === match?.label)
        return withEditor({
          typed: typedAfterEnter(value2),
        });
      let value3 = optionsAfterTypedLabel(editor);
      if (value3 === null) return withNoEffects(state);
      return commitDropdownOptions(state, reads, editor, value3, value2 ? 'startsOption' : 'entered');
    }
    case 'setColor': {
      if (action.optionId === null)
        return typed?.optionId === null
          ? withEditor({
              typed: {
                ...typed,
                pickedColor: action.color,
              },
            })
          : withNoEffects(state);
      let mapped = options.map(
        (input?: Dynamic) =>
          input.optionId === action.optionId
            ? {
                ...input,
                color: action.color,
              }
            : input,
      );
      return commitDropdownOptions(state, reads, editor, mapped, 'goesOn');
    }
    case 'setColorOfEveryOption': {
      if (action.to !== everyOptionColorOffer(editor)) return withNoEffects(state);
      let value = action.to === 'none' ? NO_COLOR : null;
      let value2 = assignOptionColors(options, (input?: Dynamic) => colorOfOptionIn(editor.lastInColor, input));
      let value3 = isDropdownDeliberatelyUncolored(value2) ? assignOptionColors(options) : value2;
      let value4 = action.to === 'none' ? withoutOptionColors(options) : value3;
      let value5 = value4.every(({ color: color }: Dynamic, index?: Dynamic) => {
        let option = options[index];
        return option !== undefined && colorsEqual(color, option.color);
      });
      let value6 = withEditor({
        typed:
          typed === null
            ? null
            : {
                ...typed,
                pickedColor: value,
              },
        ...(!value5 && {
          lastInColor: action.to === 'none' ? options : value4,
        }),
      });
      return value5 ? value6 : commitDropdownOptions(value6.state, reads, editor, value4, 'goesOn');
    }
    case 'remove': {
      if (action.optionId === null)
        return withEditor({
          typed: null,
        });
      let match = options.find((input?: Dynamic) => input.optionId === action.optionId);
      let matches = options.filter((input?: Dynamic) => input !== match);
      let value =
        match === undefined
          ? undefined
          : {
              what: 'dropdownOptionRemoved',
              label: match.label,
              isSaved: false,
            };
      return commitDropdownOptions(state, reads, editor, matches, 'goesOn', undefined, value);
    }
    case 'move': {
      let match = options.find((input?: Dynamic) => input.optionId === action.optionId);
      if (match === undefined) return withNoEffects(state);
      let matches = options.filter((input?: Dynamic) => input !== match);
      let value = Math.max(0, Math.min(action.toIndex, matches.length));
      if (options[value] === match) return withNoEffects(state);
      return commitDropdownOptions(state, reads, editor, [...matches.slice(0, value), match, ...matches.slice(value)], 'goesOn', undefined, {
        what: 'dropdownOptionMoved',
        label: match.label,
        place: value + 1,
        optionCount: options.length,
      });
    }
    case 'chooseReach':
      return withNoEffects(
        withDropdownPane(state, {
          ...editor,
          reach: action.reach,
        }),
      );
    case 'typeCells':
      return withEditor({
        cellsTyped: action.text,
      });
    case 'dropTypedCells':
      return withEditor({});
    case 'useSelection': {
      let value = selectedArea(state, reads);
      return value === null ? withEditor({}) : setDropdownCells(withEditor({}).state, reads, value, true);
    }
    case 'enterCells': {
      if (editor.cellsTyped === undefined) return withNoEffects(state);
      let value = changedCellsTyped(editor);
      if (value === null) return withEditor({});
      let match = reads.listSheets().find(({ sheetId: sheetId }: Dynamic) => sheetId === state.sheetId);
      let value2 = match === undefined ? null : parseA1AreaAsSeen(value, match);
      if (value2 !== null) return setDropdownCells(withEditor({}).state, reads, value2, action.isBeforeOtherEvent !== true);
      return withEditor({
        cellsRefused: {
          why: 'notFound',
          typed: clipHeading(value),
        },
      });
    }
    case 'setHeaderRow': {
      let value = ownStretchArea(state, reads, editor);
      if (value === null || dropdownHeaderRowState(state, reads, editor) !== (action.isOn ? 'off' : 'on')) return withNoEffects(state);
      let value2 = commitTypedOption(state, reads, editor);
      let value3 = value2?.named ?? editor.options;
      let value4 = reads.cellIdAt(state.sheetId, 0, value.leftColumnIndex);
      let value5 = value4 === null ? undefined : reads.cellOf(value4)?.dropdownOption;
      let value6 =
        value3.find(({ optionId: optionId }: Dynamic) => optionId !== null && optionId === value5?.optionId)?.label ??
        cellLabelText(reads, value4) ??
        '';
      let value7 = (area?: Dynamic, control?: Dynamic) => {
        let result = setDropdownCells(withEditor({}).state, reads, area, true, control);
        let editorAfter = dropdownEditorOfPane(result.state);
        if (editorAfter?.cellsRefused?.why === 'holdNoOption') {
          let cellsRefused2 = editor.cellsRefused;
          let refusal = {
            why: 'headingIsNoOption',
            timesBefore: cellsRefused2?.why === 'headingIsNoOption' ? cellsRefused2.timesBefore + 1 : 0,
          };
          return withNoEffects(
            withDropdownPane(result.state, {
              ...editorAfter,
              cellsRefused: refusal,
            }),
          );
        }
        let [firstEffect] = result.effects;
        let { isOn: isOn } = action;
        let [heading, cells] = [clipHeading(value6), areaToA1AsStored(area, ownRowOrderOfSheet(reads, state.sheetId))];
        return firstEffect?.kind !== 'queueEdit'
          ? result
          : {
              state: result.state,
              effects: [
                withIfQueued(firstEffect, {
                  done: {
                    what: 'headerRowSet',
                    isOn: isOn,
                    heading: heading,
                    cells: cells,
                  },
                }),
              ],
            };
      };
      let value8 = (input?: Dynamic) =>
        value2 === null
          ? input
          : {
              ...input,
              effects: [...value2.effects, ...input.effects],
            };
      if (!action.isOn) {
        let [value17] = value4 === null ? [] : (reads.dropdownOptionsToOffer(value4, value4) ?? []);
        let value18 =
          value17 !== undefined &&
          value3.length < MAX_DROPDOWN_OPTIONS &&
          value3.every(({ label: label }: Dynamic) => !isSameOptionLabel(label, value17.label));
        let [value19, ...value20] = value18
          ? [
              {
                optionId: null,
                label: value17.label,
                color: colorForAddedOption(value17.label, value3),
              },
              ...value3,
            ]
          : value3;
        let value21 =
          editor.dropdownId === null || !value18 || value19 === undefined
            ? []
            : [
                {
                  kind: 'setDropdownOptions',
                  sheetId: state.sheetId,
                  dropdownId: editor.dropdownId,
                  options: [value19, ...value20],
                  appliesTo: {
                    kind: 'everyCell',
                  },
                },
              ];
        let state3 = {
          ...value,
          topRowIndex: 0,
          rowCount: value.rowCount + 1,
        };
        let value22 = value19 === undefined ? [] : [value19, ...value20];
        return value8(
          value7(state3, {
            optionsFirst: value21,
            optionsByThen: value22,
          }),
        );
      }
      let state2 = {
        ...value,
        topRowIndex: 1,
        rowCount: value.rowCount - 1,
      };
      let value9 = value6.toLowerCase();
      let value10 = areaHasLabel(reads, state.sheetId, state2, value6)
        ? value3
        : value3.filter(({ label: label }: Dynamic) => label.toLowerCase() !== value9);
      let value11 = state.readySets ?? [];
      let value12 = readySetNamed(value11, value6) ?? value11[0]?.set;
      let value13 =
        value10.length > 0
          ? value10
          : (value12?.options ?? []).map(
              ({ label: label, color: color }: Dynamic) => ({
                optionId: null,
                label: label,
                color: color,
              }),
            );
      let [value14, ...value15] = value13;
      let value16 =
        editor.dropdownId === null || value14 === undefined || value10.length === value3.length
          ? []
          : [
              {
                kind: 'setDropdownOptions',
                sheetId: state.sheetId,
                dropdownId: editor.dropdownId,
                options: [value14, ...value15],
                appliesTo: {
                  kind: 'everyCell',
                },
              },
            ];
      return value8(
        value7(state2, {
          optionsLast: value16,
        }),
      );
    }
    case 'startFrom': {
      if ((action.set === 'custom' ? 'custom' : action.set.key) === chosenOptionSetKey(state, editor)) return withNoEffects(state);
      if (action.set !== 'custom') {
        let value2 = commitTypedOption(state, reads, editor);
        let value3 = optionsFromReadySet(value2?.named ?? editor.options, action.set);
        let value4 =
          value2 === null
            ? editor
            : {
                ...editor,
                optionsByThen: value2.named,
              };
        let value5 = commitDropdownOptions(state, reads, value4, value3, 'entered', action.set.key);
        return value2 === null
          ? value5
          : {
              ...value5,
              effects: [...value2.effects, ...value5.effects],
            };
      }
      let { state: value } = withEditor({
        typed: EMPTY_TYPED_OPTION,
        isCustom: true,
      });
      return withNoEffects({
        ...value,
        lastDone: {
          what: 'dropdownStartedFrom',
          set: 'custom',
          optionCount: 0,
        },
      });
    }
  }
}
export function startDropdownFromSet(state: PageState, reads: ReadsWithTextMeasurer, set?: Dynamic, cell?: Dynamic) {
  let dropdown = dropdownAtActiveCell(state, reads);
  let cellsOfDropdown = reads.cellsOfTheDropdownAt(activeAnchorCell(state, reads));
  if (dropdown === null || cellsOfDropdown === null) return withNoEffects(state);
  let stateAtCell = isAnchorOfActiveCell(state, reads, cell) ? state : moveActiveCellTo(closeDropdownList(state), reads, cell);
  if (chosenReadySetKey(state, dropdown.options) === set.key) return withNoEffects(stateAtCell);
  return commitDropdownOptions(
    stateAtCell,
    reads,
    {
      dropdownId: dropdown.dropdownId,
      stretches: cellsOfDropdown.stretches,
      indexOfOwnStretch: cellsOfDropdown.indexOfTheStretchWithTheCell,
      reach: 'everyCell',
    },
    optionsFromReadySet(dropdown.options, set),
    'entered',
    set.key,
  );
}
export const cellControlEdit = (cells?: Dynamic, cellControl?: Dynamic) => ({
  kind: 'formatCells',
  cells: cells,
  format: {
    cellControl: cellControl,
  },
});
export const squashSetLabel = (label?: Dynamic) => foldLabelCase(label).replaceAll(/\s/gu, '');
export const newDropdownOption = ({ label: label, color: color }: Dynamic) => ({
  label: label,
  color: color,
});
export const colorOfOptionIn = (lastInColor: Dynamic, { optionId: optionId }: Dynamic) =>
  lastInColor?.find((input?: Dynamic) => input.optionId === optionId)?.color;
export const isCellUnderMerge = (reads: WorkbookReads, cellId?: Dynamic) => !isSameCell(anchorCellOf(reads, cellId), cellId);
export const cellLabelTextAt = (reads: WorkbookReads, sheetId?: Dynamic, rowIndex?: Dynamic, columnIndex?: Dynamic) =>
  cellLabelText(reads, reads.cellIdAt(sheetId, rowIndex, columnIndex));
