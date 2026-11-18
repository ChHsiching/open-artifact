import type { Dynamic } from '../dynamic.ts';
import { spanOfIndexes } from '../model/a1-references.ts';
import {
  rowSpansIn,
  mergedSpans,
  wholeRowSpanIn,
  coveringRowSpanIn,
  rowStretchesIn,
  spanCutsOwnRowOrder,
  ownRowOrderFrom,
  createLineIndex,
  parseLineId,
} from '../model/line-ids.ts';
export function spanOfRowEnds(lineIndex: Dynamic, [oneRow, otherRow]: Dynamic) {
  let [oneIndex, otherIndex] = [lineIndex.indexOf(oneRow), lineIndex.indexOf(otherRow)];
  return oneIndex === null || otherIndex === null ? null : spanOfIndexes([oneIndex, otherIndex]);
}
export function rowEndsIn(side?: Dynamic, order?: Dynamic, ends?: Dynamic, mapSpan?: Dynamic) {
  let span = spanOfRowEnds(order[otherRowOrderSide(side)], ends);
  return span === null ? ends : endRowsOfSpan(order[side], namedOrRefuse(mapSpan(side, order, span)));
}
export function rangesIn(side?: Dynamic, order?: Dynamic, ranges?: Dynamic) {
  let byColumns = new Map();
  let untouched: Dynamic = [];
  for (let range of ranges) {
    let span = spanOfRowEnds(order[otherRowOrderSide(side)], [range.topLeft.r, range.bottomRight.r]);
    if (span === null) {
      untouched.push(range);
      continue;
    }
    let columnsKey = `${range.topLeft.c} ${range.bottomRight.c}`;
    let group = byColumns.get(columnsKey) ?? {
      like: range,
      rows: [],
    };
    byColumns.set(columnsKey, {
      ...group,
      rows: group.rows.concat(rowSpansIn(side, order, span)),
    });
  }
  return [...byColumns.values()]
    .flatMap(
      ({ like: like, rows: rows }: Dynamic) =>
        mergedSpans(rows).map((rowSpan?: Dynamic) => withRowEnds(like, endRowsOfSpan(order[side], rowSpan))),
    )
    .concat(untouched);
}
export function rangesAsStoredOrRefuse(order?: Dynamic, ranges?: Dynamic) {
  let stored = rangesIn('stored', order, ranges);
  return (refuseIf(stored.length > ranges.length), firstNamedOrRefuse(stored));
}
export function cornersAsStored(
  order: Dynamic,
  { sheetId: sheetId, oneCorner: oneCorner, otherCorner: otherCorner }: Dynamic,
  mapSpan: Dynamic = wholeRowSpanIn,
) {
  let [oneRow, otherRow] = rowEndsIn('stored', order, [oneCorner.r, otherCorner.r], mapSpan);
  return {
    sheetId: sheetId,
    oneCorner: { ...oneCorner, r: oneRow },
    otherCorner: { ...otherCorner, r: otherRow },
  };
}
export function tableBodyIn(side?: Dynamic, order?: Dynamic, table?: Dynamic) {
  let bodyEnds = [table.firstRowOfBody, table.lastRowOfBody];
  let [firstRowOfBody, lastRowOfBody] = rowEndsIn(side, order, bodyEnds, coveringRowSpanIn);
  let runs = table.runs.flatMap((run?: Dynamic) => {
    let span = spanOfRowEnds(order[otherRowOrderSide(side)], [run.firstRow, run.lastRow]);
    if (span === null) return [run];
    return rowSpansIn(side, order, span).map((rowSpan?: Dynamic) => {
      let [firstRow, lastRow] = endRowsOfSpan(order[side], rowSpan);
      return { role: run.role, firstRow: firstRow, lastRow: lastRow };
    });
  });
  return {
    ...table,
    firstRowOfBody: firstRowOfBody,
    lastRowOfBody: lastRowOfBody,
    runs: runs,
  };
}
export function refuseHeaderOrFooterInOwnOrder(order: Dynamic, { headerRows: headerRows, footerRows: footerRows }: Dynamic) {
  for (let rows of [headerRows, footerRows]) {
    let span = rows === null ? null : spanOfRowEnds(order.seen, [rows.firstRow, rows.lastRow]);
    refuseIf(span !== null && indexSpansOverlap(order, span));
  }
}
export function refuseRowsSplitWhenStored(order?: Dynamic, rows?: Dynamic) {
  let span = seenSpanOfRows(order, rows);
  refuseIf(span !== null && indexSpansOverlap(order, span) && rowStretchesIn('stored', order, span).length > 1);
}
export function mayLandInAsStored(order?: Dynamic, selectedRows?: Dynamic, mayLandIn?: Dynamic) {
  let { firstIndex: firstIndex, count: count } = namedOrRefuse(seenSpanOfRows(order, selectedRows));
  let [firstStretch] = rowStretchesIn('stored', order, { firstIndex: firstIndex, count: order.seen.count - firstIndex });
  let stretch = namedOrRefuse(firstStretch);
  let landing = stretch.count >= count ? stretch : { ...stretch, count: 1 };
  let stretches = mayLandIn?.flatMap((rows?: Dynamic) => order.stored.stretchesOf(rows)) ?? [landing];
  return firstNamedOrRefuse(
    stretches.flatMap((stretchOfRows?: Dynamic) => {
      let first = Math.max(stretchOfRows.firstIndex, landing.firstIndex);
      let end = Math.min(stretchOfRows.firstIndex + stretchOfRows.count, landing.firstIndex + landing.count);
      return order.stored.runsIn({
        firstIndex: first,
        count: Math.max(0, end - first),
      });
    }),
  );
}
export function editAsStored(edit?: Dynamic, ownRowOrderOf?: Dynamic) {
  let inOrder = withOwnRowOrderOf(ownRowOrderOf);
  let checkedIn = (sheetId?: Dynamic, check?: Dynamic) =>
    inOrder(sheetId, edit, (order?: Dynamic) => (check(order), edit));
  switch (edit.kind) {
    case 'pasteRowsOfTexts':
    case 'pasteCopiedCells':
    case 'pasteValuesOfCopiedCells':
    case 'pasteCellsOfAnotherProgram':
      return inOrder(
        edit.selected.sheetId,
        edit,
        (order?: Dynamic) => ({
          ...edit,
          mayLandIn: mayLandInAsStored(order, edit.selected.rows, edit.mayLandIn),
        }),
      );
    case 'moveCells':
      return (
        checkedIn(edit.cells.sheetId, (order?: Dynamic) => refuseRowsSplitWhenStored(order, edit.cells.rows)),
        inOrder(
          edit.toSheetId,
          edit,
          (order?: Dynamic) => ({
            ...edit,
            mayLandIn: mayLandInAsStored(order, rowRunsOfRowId(edit.toTopLeft.r), edit.mayLandIn),
          }),
        )
      );
    case 'pasteValuesOfCells':
      return (refuseIf(ownRowOrderOf(edit.cells.sheetId) !== null || ownRowOrderOf(edit.toSheetId) !== null), edit);
    case 'importTableIntoSheet':
      return checkedIn(edit.table.sheetId, () => refuseIf(edit.table.how.kind !== 'addRows'));
    case 'fillCells': {
      let { source: source, linesToFill: linesToFill } = edit;
      return linesToFill.kind !== 'rows'
        ? edit
        : checkedIn(source.sheetId, (order?: Dynamic) => refuseRowsSplitWhenStored(order, [...source.rows, ...linesToFill.rows]));
    }
    case 'setBorders':
      return checkedIn(edit.cells.sheetId, (order?: Dynamic) => {
        let span = seenSpanOfRows(order, edit.cells.rows);
        if (span === null || !BORDER_EDGES_ACROSS_ROWS.has(edit.edges)) return;
        if (
          [span.firstIndex, span.firstIndex + span.count - 1].some(
            (index?: Dynamic) => indexSpansOverlap(order, { firstIndex: index, count: 1 }),
          )
        )
          refuseRowsSplitWhenStored(order, edit.cells.rows);
      });
    case 'mergeCells':
      return checkedIn(edit.cells.sheetId, (order?: Dynamic) => {
        let span = seenSpanOfRows(order, edit.cells.rows);
        refuseIf(span !== null && span.count > 1 && indexSpansOverlap(order, span));
      });
    case 'hideRows':
      return checkedIn(edit.sheetId, (order?: Dynamic) => {
        let span = seenSpanOfRows(order, edit.rows);
        refuseIf(span !== null && indexSpansOverlap(order, span));
      });
    case 'insertRows':
      return inOrder(edit.sheetId, edit, (order?: Dynamic) => {
        let insertAt = edit.afterRow === null ? 0 : (order.seen.indexOf(edit.afterRow) ?? 0) + 1;
        if (insertAt > order.firstIndex && insertAt < order.firstIndex + order.count) return edit;
        let storedRowOf = (rowId?: Dynamic) => (rowId === void 0 || rowId === null ? null : rowIdIn('stored', order, rowId));
        return {
          ...edit,
          afterRow: afterRowAsStored(order, edit.afterRow),
          formatsFromRow: storedRowOf(edit.formatsFromRow),
          groupsFromRow: storedRowOf(edit.groupsFromRow),
          formulasFromRow: storedRowOf(edit.formulasFromRow),
        };
      });
    case 'moveRows':
      return inOrder(edit.sheetId, edit, (order?: Dynamic) => {
        let [oneRow, otherRow] = rowEndsIn('stored', order, [edit.oneRow, edit.otherRow], spanUnlessItCutsTheOrder);
        let moveTo = edit.afterRow === null ? 0 : (order.seen.indexOf(edit.afterRow) ?? 0) + 1;
        return (
          refuseIf(moveTo > order.firstIndex && moveTo < order.firstIndex + order.count),
          {
            ...edit,
            oneRow: oneRow,
            otherRow: otherRow,
            afterRow: afterRowAsStored(order, edit.afterRow),
          }
        );
      });
    case 'sortRows':
    case 'groupRows':
    case 'ungroupRows':
      return inOrder(edit.sheetId, edit, (order?: Dynamic) => {
        let [oneRow, otherRow] = rowEndsIn('stored', order, [edit.oneRow, edit.otherRow], spanUnlessItCutsTheOrder);
        return { ...edit, oneRow: oneRow, otherRow: otherRow };
      });
    case 'sortCells':
      return inOrder(
        edit.cells.sheetId,
        edit,
        (order?: Dynamic) => ({
          ...edit,
          cells: cornersAsStored(order, edit.cells, spanUnlessItCutsTheOrder),
        }),
      );
    case 'addConditionalFormats':
      return inOrder(
        edit.sheetId,
        edit,
        (order?: Dynamic) => ({
          ...edit,
          rules: firstNamedOrRefuse(
            edit.rules.map(
              (rule?: Dynamic) => ({
                ...rule,
                ranges: rangesAsStoredOrRefuse(order, rule.ranges),
              }),
            ),
          ),
        }),
      );
    case 'changeConditionalFormat': {
      let { ranges: ranges } = edit;
      return ranges === void 0
        ? edit
        : inOrder(
            edit.sheetId,
            edit,
            (order?: Dynamic) => ({
              ...edit,
              ranges: rangesAsStoredOrRefuse(order, ranges),
            }),
          );
    }
    case 'addPlacedView': {
      let inputs = edit.inputs.map(
        (input?: Dynamic) =>
          inOrder(input.range.sheetId, input, (order?: Dynamic) => {
            let { topLeft: topLeft, bottomRight: bottomRight } = input.range;
            let rowEnds = rowEndsIn('stored', order, [topLeft.r, bottomRight.r], wholeRowSpanIn);
            return {
              name: input.name,
              range: { ...input.range, ...withRowEnds(input.range, rowEnds) },
            };
          }),
      );
      return inOrder(
        edit.sheetId,
        { ...edit, inputs: inputs },
        (order?: Dynamic) => ({
          ...edit,
          inputs: inputs,
          topLeft: cellIn('stored', order, edit.topLeft),
        }),
      );
    }
    case 'movePlacedView':
    case 'resizePlacedView':
    case 'copyPlacedView':
      return inOrder(
        'toSheetId' in edit ? edit.toSheetId : edit.sheetId,
        edit,
        (order?: Dynamic) => ({
          ...edit,
          topLeft: cellIn('stored', order, edit.topLeft),
        }),
      );
    case 'declareCellTable':
    case 'changeCellTable':
      return checkedIn(edit.sheetId, (order?: Dynamic) => refuseHeaderOrFooterInOwnOrder(order, edit.cellTable));
    case 'setSheetSettings': {
      let { lastFrozenRow: lastFrozenRow } = edit.settings;
      return lastFrozenRow === void 0 || lastFrozenRow === null
        ? edit
        : checkedIn(edit.sheetId, (order?: Dynamic) => {
            let index = order.seen.indexOf(lastFrozenRow) ?? -1;
            refuseIf(indexSpansOverlap(order, { firstIndex: index, count: 1 }));
          });
    }
    case 'enter':
    case 'addUserToCell':
    case 'removeUserFromCell':
    case 'setListLineChecked':
    case 'enterInCells':
    case 'enterTextWithLooksInCells':
    case 'pasteTexts':
    case 'clearCells':
    case 'unmergeCells':
    case 'formatCells':
    case 'setColumnWidths':
    case 'fitColumns':
    case 'setRowHeights':
    case 'insertColumns':
    case 'moveColumns':
    case 'deleteRows':
    case 'deleteColumns':
    case 'groupColumns':
    case 'ungroupColumns':
    case 'setRowGroupsCollapsed':
    case 'setColumnGroupsCollapsed':
    case 'showRowGroupsToDepth':
    case 'showColumnGroupsToDepth':
    case 'hideColumns':
    case 'moveConditionalFormat':
    case 'removeConditionalFormat':
    case 'deletePlacedView':
    case 'replaceWidgetNodeOfPlacedView':
    case 'removeCellTable':
    case 'addSheet':
    case 'importTableAsNewSheet':
    case 'duplicateSheet':
    case 'deleteSheet':
    case 'moveSheet':
    case 'renameSheet':
    case 'reseed':
    case 'setTimeZone':
    case 'setLocale':
    case 'makeDropdown':
    case 'addDropdownOption':
    case 'setDropdownOptions':
      return edit;
    default:
      throw new RowNotNamedInTheWayError();
  }
}
export function cellsToCopyInSeenOrder(order?: Dynamic, request?: Dynamic) {
  let { sheetId: sheetId, oneCorner: oneCorner, otherCorner: otherCorner } = request.cells;
  let span = spanOfRowEnds(order.seen, [oneCorner.r, otherCorner.r]);
  if (span === null || rowStretchesIn('stored', order, span).length === 1) return request;
  let outOfView = (request.rowsOutOfView ?? []).flatMap((rows?: Dynamic) => order.seen.stretchesOf(rows));
  let end = span.firstIndex + span.count;
  let rows: Dynamic = [];
  let at: Dynamic = span.firstIndex;
  for (let { firstIndex: firstIndex, count: count } of [...mergedSpans(outOfView), { firstIndex: end, count: 0 }]) {
    let stop = Math.min(firstIndex, end);
    if (stop > at) for (let run of order.seen.runsIn({ firstIndex: at, count: stop - at })) rows.push(run);
    at = Math.max(at, firstIndex + count);
  }
  return {
    kind: 'readCellsToCopyInTheOrderOfTheirRows',
    cells: {
      sheetId: sheetId,
      rows: firstNamedOrRefuse(rows),
      oneColumn: oneCorner.c,
      otherColumn: otherCorner.c,
    },
  };
}
export function requestAsStored(request?: Dynamic, ownRowOrderOf?: Dynamic) {
  let inOrder = withOwnRowOrderOf(ownRowOrderOf);
  switch (request.kind) {
    case 'queueEdit': {
      let withEditAsStored = (queued?: Dynamic) => ({
        ...queued,
        edit: editAsStored(queued.edit, ownRowOrderOf),
      });
      let { editsBefore: editsBefore, editsThatGoAlong: editsThatGoAlong } = request;
      return {
        ...withEditAsStored(request),
        ...(editsBefore !== void 0 && {
          editsBefore: editsBefore.map(withEditAsStored),
        }),
        ...(editsThatGoAlong !== void 0 && {
          editsThatGoAlong: editsThatGoAlong.map(withEditAsStored),
        }),
      };
    }
    case 'readCellsToCopy':
      return inOrder(request.cells.sheetId, request, (order?: Dynamic) => cellsToCopyInSeenOrder(order, request));
    case 'readConditionalFormatSuggestions':
    case 'readCellsThatADropdownWouldClear':
      return inOrder(
        request.cells.sheetId,
        request,
        (order?: Dynamic) => ({
          ...request,
          cells: cornersAsStored(order, request.cells),
        }),
      );
    case 'readConditionalFormatsAsAgentIsTold':
      return inOrder(
        request.cells.sheetId,
        request,
        (order?: Dynamic) => ({
          ...request,
          cells: cornersAsStored(order, request.cells, coveringRowSpanIn),
        }),
      );
    case 'readDropdownOptionsToOffer':
      return inOrder(
        request.sheetId,
        request,
        (order?: Dynamic) => ({
          ...request,
          ...cornersAsStored(order, request, coveringRowSpanIn),
        }),
      );
    case 'readRowsInSortedOrder':
      return inOrder(request.sheetId, request, (order?: Dynamic) => {
        let [oneRow, otherRow] = rowEndsIn('stored', order, [request.oneRow, request.otherRow], coveringRowSpanIn);
        return { ...request, oneRow: oneRow, otherRow: otherRow };
      });
    case 'readFilteredRows':
    case 'readValuesOfFilteredColumn':
      return inOrder(
        request.table.sheetId,
        request,
        (order?: Dynamic) => ({
          ...request,
          table: tableBodyIn('stored', order, request.table),
        }),
      );
    case 'readCellTableDeclaredAs':
      return inOrder(request.sheetId, request, (order?: Dynamic) => (refuseHeaderOrFooterInOwnOrder(order, request.cellTable), request));
    case 'readFormatsGiven': {
      let { asIf: asIf } = request;
      return asIf === void 0
        ? request
        : inOrder(
            request.sheetId,
            request,
            (order?: Dynamic) => ({
              ...request,
              asIf: asIf.map((rule?: Dynamic) => ruleWithRangesIn('stored', order, rule)),
            }),
          );
    }
    case 'readConditionalFormatsByAddress':
      return inOrder(
        request.sheetId,
        request,
        (order?: Dynamic) => ({
          ...request,
          rules: request.rules.map((rule?: Dynamic) => ruleWithRangesIn('stored', order, rule)),
        }),
      );
    case 'readTablesOfSheet':
      return request;
    case 'queueNextUndo':
    case 'queueNextRedo':
    case 'queueEditsThatTakeBack':
    case 'receiveStreamedEdit':
    case 'receiveSendOutcome':
    case 'receiveServerRevision':
    case 'receiveLoadPage':
    case 'answerBeforeCalculating':
    case 'calculate':
    case 'receiveClockReading':
    case 'readWorkbook':
    case 'readCells':
    case 'readCauseOfError':
    case 'readSheetLayout':
    case 'readXlsxFile':
    case 'readTimeZone':
    case 'readViews':
    case 'readInputsOfView':
    case 'readTableAtCell':
    case 'readCellTables':
    case 'readCellTableAt':
    case 'readConditionalFormatsInIds':
    case 'readProposedFormulaValue':
    case 'readWhatATableChanges':
    case 'readCellsOfTheDropdownAt':
    case 'readTypedFormula':
    case 'readTextToEdit':
    case 'readCellsToCopyInTheOrderOfTheirRows':
      return request;
    case 'readTableWithin':
    case 'readSharedCellFormat':
    default:
      throw new RowNotNamedInTheWayError();
  }
}
export function rowGroupAsSeen(order?: Dynamic, rowGroup?: Dynamic) {
  let [first, last] = rowEndsIn('seen', order, [rowGroup.ends.first, rowGroup.ends.last], coveringRowSpanIn);
  return { ...rowGroup, ends: { first: first, last: last } };
}
export function layoutInOwnRowOrder(layout?: Dynamic, order?: Dynamic) {
  if (order === null) return layout;
  if (order === 'givenUp') return { ...layout, ownRowOrder: order };
  let { seen: seen, firstIndex: firstIndex, count: count } = order;
  let { rowHeights: rowHeights, conditionalFormats: conditionalFormats, placements: placements, rowGroups: rowGroups } = layout;
  return {
    ...layout,
    rows: [...seen.runsIn({ firstIndex: 0, count: seen.count })],
    ownRowOrder: {
      firstIndex: firstIndex,
      count: count,
      asStored: {
        rows: layout.rows,
        ...(rowHeights !== void 0 && { rowHeights: rowHeights }),
        ...(conditionalFormats !== void 0 && {
          conditionalFormats: conditionalFormats,
        }),
        ...(placements !== void 0 && { placements: placements }),
        ...(rowGroups !== void 0 && { rowGroups: rowGroups }),
      },
    },
    ...(rowHeights !== void 0 && {
      rowHeights: rowHeights.flatMap(
        ({ rows: rows, heightInPixels: heightInPixels }: Dynamic) =>
          seen
            .stretchesOf(rows)
            .flatMap((stretch?: Dynamic) => seen.runsIn(stretch))
            .map(
              (run?: Dynamic) => ({
                rows: run,
                heightInPixels: heightInPixels,
              }),
            ),
      ),
    }),
    ...(conditionalFormats !== void 0 && {
      conditionalFormats: conditionalFormats.map((conditionalFormat?: Dynamic) => conditionalFormatAsSeen(order, conditionalFormat)),
    }),
    ...(placements !== void 0 && {
      placements: placements.map((placement?: Dynamic) => placementAsSeen(order, placement)),
    }),
    ...(rowGroups !== void 0 && {
      rowGroups: rowGroups.map((rowGroup?: Dynamic) => rowGroupAsSeen(order, rowGroup)),
    }),
  };
}
export function canKeepOwnRowOrder(order?: Dynamic, layout?: Dynamic) {
  let { mergedRanges: mergedRanges = [], rowGroups: rowGroups = [], lastFrozenRow: lastFrozenRow } = layout;
  let frozenIndex = lastFrozenRow === void 0 ? null : order.stored.indexOf(lastFrozenRow);
  return (
    (frozenIndex === null || !indexSpansOverlap(order, { firstIndex: frozenIndex, count: 1 })) &&
    mergedRanges.every(({ liveTopLeft: liveTopLeft, liveBottomRight: liveBottomRight }: Dynamic) => {
      let span = spanOfRowEnds(order.stored, [liveTopLeft.r, liveBottomRight.r]);
      return span === null || span.count === 1 || !indexSpansOverlap(order, span);
    }) &&
    rowGroups.every(({ ends: ends }: Dynamic) => {
      let span = spanOfRowEnds(order.stored, [ends.first, ends.last]);
      return span === null || span.count === 1 || !spanCutsOwnRowOrder(order, span);
    })
  );
}
export function dropdownStretchAsSeen(order?: Dynamic, stretch?: Dynamic) {
  let span = spanOfRowEnds(order.stored, [stretch.top.r, stretch.bottom.r]);
  if (span === null) return [stretch];
  let seenStretches = spanCutsOwnRowOrder(order, span) ? rowStretchesIn('seen', order, span) : null;
  let columnLetters = /^[A-Z]+/.exec(stretch.range)?.[0] ?? '';
  return (seenStretches ?? [span]).map((seenSpan?: Dynamic) => {
    let [topRow, bottomRow] = endRowsOfSpan(order.seen, seenSpan);
    let rowNumber = (order.stored.indexOf(topRow) ?? 0) + 1;
    let toEnd = seenSpan.count === 1 ? '' : `:${columnLetters}${rowNumber + seenSpan.count - 1}`;
    return {
      range: seenStretches === null ? stretch.range : `${columnLetters}${rowNumber}${toEnd}`,
      top: { ...stretch.top, r: topRow },
      bottom: { ...stretch.bottom, r: bottomRow },
    };
  });
}
export function answerAsSeen(request?: Dynamic, answer?: Dynamic, ownRowOrderOf?: Dynamic) {
  let inOrder = withOwnRowOrderOf(ownRowOrderOf);
  let placeAsSeen = (place?: Dynamic, picked?: Dynamic) => {
    let cells = place?.cells ?? null;
    if (place === null || cells === null) return place;
    return inOrder(place.sheetId, place, (order?: Dynamic) => {
      let stretches = mergedSpans(picked?.rows.flatMap((rows?: Dynamic) => order.stored.stretchesOf(rows)) ?? []);
      let [firstStretch, lastStretch] = [stretches[0], stretches.at(-1)];
      let pickedSpan =
        firstStretch !== void 0 &&
        lastStretch !== void 0 &&
        endRowsOfSpan(order.stored, firstStretch)[0] === cells.topLeft.r &&
        endRowsOfSpan(order.stored, lastStretch)[1] === cells.bottomRight.r
          ? seenSpanOfRows(order, picked?.rows ?? [])
          : null;
      return {
        ...place,
        cells: pickedSpan === null ? rangeAsSeen(order, cells) : withRowEnds(cells, endRowsOfSpan(order.seen, pickedSpan)),
      };
    });
  };
  let syncStateAsSeen = (syncState?: Dynamic) => ({
    ...syncState,
    ...(syncState.editsOfOthers !== void 0 && {
      editsOfOthers: syncState.editsOfOthers.map(
        (editOfOther?: Dynamic) => ({
          ...editOfOther,
          placeChanged: placeAsSeen(editOfOther.placeChanged),
        }),
      ),
    }),
  });
  if (answer.kind === 'syncState') return syncStateAsSeen(answer);
  if (answer.kind === 'editQueued') {
    let picked = request.kind === 'queueEdit' ? rowsPickedByEdit(request.edit) : null;
    let placeChanged = placeAsSeen(answer.placeChanged, picked);
    let { placesChangedBefore: placesChangedBefore, editsThatWentAlong: editsThatWentAlong } = answer;
    return {
      ...answer,
      placeChanged: placeChanged,
      ...(placesChangedBefore !== void 0 && {
        placesChangedBefore: placesChangedBefore.map((place?: Dynamic) => placeAsSeen(place) ?? place),
      }),
      ...(editsThatWentAlong !== void 0 && {
        editsThatWentAlong: editsThatWentAlong.map(
          (wentAlong?: Dynamic) =>
            wentAlong.kind === 'made'
              ? {
                  kind: 'made',
                  placeChanged: placeAsSeen(wentAlong.placeChanged),
                }
              : wentAlong,
        ),
      }),
      syncState: syncStateAsSeen(answer.syncState),
    };
  }
  let asked = 'cells' in request && 'sheetId' in request.cells ? request.cells : 'table' in request ? request.table : request;
  let order = 'sheetId' in asked ? ownRowOrderOf(asked.sheetId) : null;
  if (order === null) return answer;
  switch (answer.kind) {
    case 'formatsGiven':
      return {
        ...answer,
        colorScales: answer.colorScales.map(
          ({ ranges: ranges, stops: stops }: Dynamic) => ({
            ranges: rangesIn('seen', order, ranges),
            stops: stops,
          }),
        ),
      };
    case 'table':
      return { ...answer, read: tableReadIn('seen', order, answer.read) };
    case 'cellTableAt':
      return {
        ...answer,
        cellTable: answer.cellTable === null ? null : cellTableIn('seen', order, answer.cellTable),
      };
    case 'cellTables':
      return {
        ...answer,
        cellTables: answer.cellTables.map((cellTable?: Dynamic) => cellTableIn('seen', order, cellTable)),
      };
    case 'filteredRows': {
      let bodyEnds = [answer.firstRowOfBody, answer.lastRowOfBody];
      let [firstRowOfBody, lastRowOfBody] = rowEndsIn('seen', order, bodyEnds, coveringRowSpanIn);
      let cellsBesideTheTableOutOfView = answer.cellsBesideTheTableOutOfView.map((range?: Dynamic) => rangeAsSeen(order, range));
      return {
        ...answer,
        firstRowOfBody: firstRowOfBody,
        lastRowOfBody: lastRowOfBody,
        cellsBesideTheTableOutOfView: cellsBesideTheTableOutOfView,
      };
    }
    case 'conditionalFormatSuggestions':
      return {
        ...answer,
        about: rangeAsSeen(order, answer.about),
        ruleToStartFrom: ruleWithRangesIn('seen', order, answer.ruleToStartFrom),
        suggestions: answer.suggestions.map(
          ({ rules: rules, matches: matches }: Dynamic) => ({
            rules: firstNamedOrRefuse(rules.map((rule?: Dynamic) => ruleWithRangesIn('seen', order, rule))),
            matches: matches,
          }),
        ),
        table: {
          ...answer.table,
          records: rangeAsSeen(order, answer.table.records),
        },
      };
    case 'conditionalFormatsInIds': {
      let { read: read } = answer;
      return read.kind !== 'rules'
        ? answer
        : {
            ...answer,
            read: {
              ...read,
              rules: read.rules.map((rule?: Dynamic) => ruleWithRangesIn('seen', order, rule)),
            },
          };
    }
    case 'cellsOfDropdown': {
      let stretchesBySource = answer.stretches.map((stretch?: Dynamic) => dropdownStretchAsSeen(order, stretch));
      let stretches = stretchesBySource.flat();
      let cellIndex = 'cell' in request ? order.seen.indexOf(request.cell.r) : null;
      let stretchWithTheCell = stretchesBySource[answer.indexOfTheStretchWithTheCell]?.find(
        ({ top: top, bottom: bottom }: Dynamic) => {
          let span = spanOfRowEnds(order.seen, [top.r, bottom.r]);
          return span !== null && cellIndex !== null && indexSpansOverlap(span, { firstIndex: cellIndex, count: 1 });
        },
      );
      let indexOfTheStretchWithTheCell = Math.max(0, stretchWithTheCell === void 0 ? 0 : stretches.indexOf(stretchWithTheCell));
      return {
        ...answer,
        stretches: stretches,
        indexOfTheStretchWithTheCell: indexOfTheStretchWithTheCell,
      };
    }
    case 'nothingToChange':
    case 'toBeShownFirst':
    case 'editBeforeRefused':
    case 'nothingToReverse':
    case 'stepGivenUp':
    case 'workbookContents':
    case 'cellsContents':
    case 'sheetLayout':
    case 'xlsxFile':
    case 'views':
    case 'inputsOfView':
    case 'tablesOfSheet':
    case 'conditionalFormatsByAddress':
    case 'conditionalFormatsAsAgentIsTold':
    case 'valuesOfFilteredColumn':
    case 'rowsInSortedOrder':
    case 'typedFormula':
    case 'causeOfError':
    case 'proposedFormulaValue':
    case 'textToEdit':
    case 'cellsToCopy':
    case 'dropdownOptionsToOffer':
    case 'cellsThatADropdownWouldClear':
    case 'sharedCellFormat':
    case 'whatATableChanges':
    case 'timeZone':
    case 'refused':
      return answer;
  }
}
export function createOwnRowOrderSession(session?: Dynamic) {
  let askedOrders = new Map();
  let ordersBySheet = new Map();
  let orderOfLayout = (layout?: Dynamic) => {
    let asked = askedOrders.get(layout.sheetId);
    if (asked === void 0) return null;
    let known = ordersBySheet.get(layout.sheetId);
    if (known !== void 0) return known;
    let order = ownRowOrderFrom(createLineIndex(layout.rows), asked.rows, asked.storedThen);
    let isKept = order === null || order === 'givenUp' || canKeepOwnRowOrder(order, layout);
    return (ordersBySheet.set(layout.sheetId, isKept ? order : 'givenUp'), isKept ? order : 'givenUp');
  };
  let readLayout = (sheetId?: Dynamic) => {
    let answer = session.answer({
      kind: 'readSheetLayout',
      sheetId: sheetId,
    });
    return answer.kind === 'sheetLayout' ? answer : null;
  };
  let ownRowOrderOf = (sheetId?: Dynamic) => {
    if (!askedOrders.has(sheetId)) return null;
    let layout = ordersBySheet.has(sheetId) ? null : readLayout(sheetId);
    let order = layout === null ? ordersBySheet.get(sheetId) : orderOfLayout(layout);
    return order === void 0 || order === 'givenUp' ? null : order;
  };
  let syncStateNotingLayouts = (syncState?: Dynamic) => {
    let { changes: changes } = syncState;
    if (changes.kind === 'nothing') return syncState;
    if (changes.kind !== 'inSheets') return (ordersBySheet.clear(), syncState);
    let sheets = changes.sheets.map((sheet?: Dynamic) => {
      if (!sheet.isLayoutChanged || !askedOrders.has(sheet.sheetId)) return sheet;
      return (ordersBySheet.delete(sheet.sheetId), Object.assign({}, sheet, { areFormatsGivenChanged: true }));
    });
    return { ...syncState, changes: { ...changes, sheets: sheets } };
  };
  let keepInsertedRowsInOrder = (edit?: Dynamic, order?: Dynamic) => {
    if (edit.kind !== 'insertRows' || edit.afterRow === null || order === null) return;
    let layout = readLayout(edit.sheetId);
    let end = order.firstIndex + order.count;
    let insertAt = (order.seen.indexOf(edit.afterRow) ?? end) + 1;
    if (layout === null || insertAt >= end) return;
    if (order.stored.indexOf(edit.afterRow) !== end - 1) return;
    let rows = [
      ...order.seen.runsIn({
        firstIndex: order.firstIndex,
        count: insertAt - order.firstIndex,
      }),
      ...createLineIndex(layout.rows).runsIn({
        firstIndex: end,
        count: edit.count,
      }),
      ...order.seen.runsIn({ firstIndex: insertAt, count: end - insertAt }),
    ];
    askedOrders.set(edit.sheetId, { rows: rows, storedThen: order.stored });
  };
  return {
    seeRowsInOwnOrder(sheetId?: Dynamic, rows?: Dynamic) {
      ordersBySheet.delete(sheetId);
      let layout = rows === null ? null : readLayout(sheetId);
      if (rows === null || layout === null) askedOrders.delete(sheetId);
      else
        askedOrders.set(sheetId, {
          rows: rows,
          storedThen: createLineIndex(layout.rows),
        });
    },
    answer(request?: Dynamic) {
      if (askedOrders.size === 0) return session.answer(request);
      let storedRequest: Dynamic;
      try {
        storedRequest = requestAsStored(request, ownRowOrderOf);
      } catch (error) {
        if (!(error instanceof RowNotNamedInTheWayError)) throw error;
        return { kind: 'refused', refusal: 'rowNotNamedInTheWay' };
      }
      let edit = request.kind === 'queueEdit' ? request.edit : null;
      let orderBeforeInsert = edit?.kind === 'insertRows' ? ownRowOrderOf(edit.sheetId) : null;
      let answer = session.answer(storedRequest);
      if (answer.kind === 'workbookContents')
        return (
          ordersBySheet.clear(),
          {
            ...answer,
            sheets: answer.sheets.map((layout?: Dynamic) => layoutInOwnRowOrder(layout, orderOfLayout(layout))),
          }
        );
      if (answer.kind === 'sheetLayout') return layoutInOwnRowOrder(answer, orderOfLayout(answer));
      if (answer.kind === 'syncState') return answerAsSeen(request, syncStateNotingLayouts(answer), ownRowOrderOf);
      if (answer.kind === 'editQueued') {
        if (edit !== null) keepInsertedRowsInOrder(edit, orderBeforeInsert);
        let syncState = syncStateNotingLayouts(answer.syncState);
        return answerAsSeen(request, { ...answer, syncState: syncState }, ownRowOrderOf);
      }
      return answerAsSeen(request, answer, ownRowOrderOf);
    },
  };
}
export const RowNotNamedInTheWayError = class extends Error {};
export const namedOrRefuse = (value?: Dynamic) => {
  if (value === null || value === void 0) throw new RowNotNamedInTheWayError();
  return value;
};
export const refuseIf = (isRefused?: Dynamic) => {
  if (isRefused) throw new RowNotNamedInTheWayError();
};
export const firstNamedOrRefuse = ([first, ...rest]: Dynamic) => [namedOrRefuse(first), ...rest];
export const otherRowOrderSide = (side?: Dynamic) => (side === 'seen' ? 'stored' : 'seen');
export const endRowsOfSpan = (lineIndex: Dynamic, { firstIndex: firstIndex, count: count }: Dynamic) => [
  namedOrRefuse(lineIndex.idAt(firstIndex)),
  namedOrRefuse(lineIndex.idAt(firstIndex + count - 1)),
];
export const spanUnlessItCutsTheOrder = (side?: Dynamic, order?: Dynamic, span?: Dynamic) =>
  spanCutsOwnRowOrder(order, span) ? null : span;
export const withRowEnds = ({ topLeft: topLeft, bottomRight: bottomRight }: Dynamic, [topRow, bottomRow]: Dynamic) => ({
  topLeft: { ...topLeft, r: topRow },
  bottomRight: { ...bottomRight, r: bottomRow },
});
export const rangeAsSeen = (order?: Dynamic, range?: Dynamic) =>
  withRowEnds(range, rowEndsIn('seen', order, [range.topLeft.r, range.bottomRight.r], coveringRowSpanIn));
export const ruleWithRangesIn = (side?: Dynamic, order?: Dynamic, rule?: Dynamic) => ({
  ...rule,
  ranges: firstNamedOrRefuse(rangesIn(side, order, rule.ranges)),
});
export const tableReadIn = (side?: Dynamic, order?: Dynamic, read?: Dynamic) =>
  read === null ? null : { ...read, table: tableBodyIn(side, order, read.table) };
export const cellTableIn = (side?: Dynamic, order?: Dynamic, cellTable?: Dynamic) => ({
  ...cellTable,
  table: tableReadIn(side, order, cellTable.table),
});
export const indexSpansOverlap = (oneSpan?: Dynamic, otherSpan?: Dynamic) =>
  oneSpan.firstIndex < otherSpan.firstIndex + otherSpan.count && otherSpan.firstIndex < oneSpan.firstIndex + oneSpan.count;
export const rowIdIn = (side?: Dynamic, order?: Dynamic, rowId?: Dynamic) =>
  order[side].idAt(order[otherRowOrderSide(side)].indexOf(rowId) ?? -1) ?? rowId;
export const cellIn = (side?: Dynamic, order?: Dynamic, cell?: Dynamic) => ({
  ...cell,
  r: rowIdIn(side, order, cell.r),
});
export const afterRowAsStored = (order?: Dynamic, afterRow?: Dynamic) =>
  afterRow !== null && order.seen.indexOf(afterRow) === order.firstIndex + order.count - 1 ? rowIdIn('stored', order, afterRow) : afterRow;
export const seenSpanOfRows = (order?: Dynamic, rows?: Dynamic) => {
  let stretches = mergedSpans(rows.flatMap((run?: Dynamic) => order.seen.stretchesOf(run)));
  let [first, last] = [stretches[0], stretches.at(-1)];
  return first === void 0 || last === void 0 ? null : spanOfIndexes([first.firstIndex, last.firstIndex + last.count - 1]);
};
export const rowRunsOfRowId = (rowId?: Dynamic) => [namedOrRefuse(parseLineId(rowId))];
export const withOwnRowOrderOf =
  (ownRowOrderOf?: Dynamic) =>
  (sheetId?: Dynamic, fallback?: Dynamic, inOrder?: Dynamic) => {
    let order = ownRowOrderOf(sheetId);
    return order === null ? fallback : inOrder(order);
  };
export const BORDER_EDGES_ACROSS_ROWS = new Set(['inner', 'innerHorizontal', 'outer', 'top', 'bottom']);
export const conditionalFormatAsSeen = (order?: Dynamic, conditionalFormat?: Dynamic) => ({
  ...ruleWithRangesIn('seen', order, conditionalFormat),
  liveRanges: rangesIn('seen', order, conditionalFormat.liveRanges),
});
export const placementAsSeen = (order?: Dynamic, placement?: Dynamic) => ({
  ...placement,
  liveTopLeft: cellIn('seen', order, placement.liveTopLeft),
});
export const rowsPickedByEdit = (edit?: Dynamic) => {
  let picked = 'selected' in edit ? edit.selected : 'cells' in edit ? edit.cells : null;
  return picked !== null && 'rows' in picked ? picked : null;
};
export const rowEndsAsSeen = (order?: Dynamic, ends?: Dynamic) => rowEndsIn('seen', order, ends, coveringRowSpanIn);
