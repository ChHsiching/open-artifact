import type { Dynamic } from '../dynamic.ts';
import { parseA1AreaAsSeen, areaAsSeen } from '../model/a1-references.ts';
import { unionOfAreas } from '../selection/model.ts';
import { showSheet } from '../state/sheet-tabs.ts';
import { showChangeByAgent, isViewFreeToFollow, doesPersonTakeViewBack } from './follow-agent.ts';
import { scrollToPlacedView } from '../charts/placed-views.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function readShownByAgentAsk(asked?: Dynamic) {
  return {
    at: (Array.isArray(asked.at) ? asked.at : [asked.at])
      .slice(0, MAX_SHOWN_REFERENCES)
      .flatMap((reference?: Dynamic) => shownReferenceText(reference) ?? []),
    inSheet: shownReferenceText(asked.in),
  };
}
export function parseShownArea(text?: Dynamic, sheet?: Dynamic) {
  let match = /^\$?(\d{1,7}):\$?(\d{1,7})$/.exec(text.trim());
  if (match === null)
    return parseA1AreaAsSeen(text, {
      ...sheet,
      ownRowOrder: null,
    });
  let [firstRow, lastRow] = [Number(match[1]), Number(match[2])];
  let [topRow, bottomRow] = [Math.min(firstRow, lastRow), Math.max(firstRow, lastRow)];
  if (topRow < 1 || bottomRow > sheet.rowCount) return null;
  return {
    topRowIndex: topRow - 1,
    leftColumnIndex: 0,
    rowCount: bottomRow - topRow + 1,
    columnCount: sheet.columnCount,
  };
}
export function areaShownAsSeen(text?: Dynamic, sheet?: Dynamic) {
  let area = parseShownArea(text, sheet);
  return area === null ? null : areaAsSeen(area, sheet.ownRowOrder);
}
export function splitSheetOfReference(reference?: Dynamic) {
  let bangAt = reference.lastIndexOf('!');
  if (bangAt < 0)
    return {
      sheet: null,
      range: reference,
    };
  let sheetPart = reference.slice(0, bangAt);
  return {
    sheet: sheetPart.length > 1 && sheetPart.startsWith("'") && sheetPart.endsWith("'") ? sheetPart.slice(1, -1).replaceAll("''", "'") : sheetPart,
    range: reference.slice(bangAt + 1),
  };
}
export function chartPlaceOfViewId(workbook: WorkbookReads, viewId?: Dynamic) {
  for (let { sheetId: sheetId } of workbook.listSheets() as Dynamic) {
    let placement = workbook.placementsIn(sheetId).find(({ viewId: viewId2 }: Dynamic) => viewId2 === viewId);
    if (placement !== undefined)
      return {
        kind: 'chart',
        sheetId: sheetId,
        viewId: placement.viewId,
      };
  }
  return null;
}
export function placeShownByAgent(asked: Dynamic, currentSheetId: Dynamic, workbook: WorkbookReads) {
  for (let viewId of asked.at as Dynamic) {
    let chartPlace = chartPlaceOfViewId(workbook, viewId);
    if (chartPlace !== null) return chartPlace;
  }
  let references = asked.at.map(splitSheetOfReference);
  let sheetName = asked.inSheet ?? references.find(({ sheet: sheet2 }: Dynamic) => sheet2 !== null)?.sheet ?? null;
  let sheet =
    sheetName === null
      ? workbook.listSheets().find(({ sheetId: sheetId2 }: Dynamic) => sheetId2 === currentSheetId)
      : findSheetByIdNameOrNumber(workbook, sheetName);
  if (sheet === undefined) return null;
  let { sheetId: sheetId } = sheet;
  if (references.length === 0)
    return {
      kind: 'cells',
      sheetId: sheetId,
      cells: null,
    };
  let areas = references.flatMap(
    ({ sheet: sheet2, range: range }: Dynamic) =>
      sheet2 === null || findSheetByIdNameOrNumber(workbook, sheet2)?.sheetId === sheetId ? (areaShownAsSeen(range, sheet) ?? []) : [],
  );
  let [firstArea, ...otherAreas] = areas;
  if (firstArea === undefined) return null;
  let area = otherAreas.reduce(unionOfAreas, firstArea);
  let activeCell = workbook.cellIdAt(sheetId, area.topRowIndex, area.leftColumnIndex);
  let selectionCorner = workbook.cellIdAt(sheetId, area.topRowIndex + area.rowCount - 1, area.leftColumnIndex + area.columnCount - 1);
  if (activeCell === null || selectionCorner === null) return null;
  return {
    kind: 'cells',
    sheetId: sheetId,
    cells: {
      activeCell: activeCell,
      selectionCorner: selectionCorner,
    },
  };
}
export function showSheetToFollow(state: PageState, workbook: ReadsWithTextMeasurer, sheetId?: Dynamic) {
  let sheetName = workbook.listSheets().find((sheet?: Dynamic) => sheet.sheetId === sheetId)?.name;
  let shownState = sheetId === state.sheetId ? state : showSheet(state, workbook, sheetId);
  if (shownState === state || sheetName === undefined) return state;
  let lastDone = {
    what: 'sheetShownToFollow',
    name: sheetName,
  };
  return {
    ...shownState,
    notice: state.notice,
    lastDone: lastDone,
  };
}
export function goToShownPlace(state: PageState, workbook: ReadsWithTextMeasurer, place?: Dynamic) {
  if (place.kind === 'cells')
    return place.cells === null
      ? showSheetToFollow(state, workbook, place.sheetId)
      : showChangeByAgent(state, workbook, {
          cells: place.cells,
        });
  let onSheet = showSheetToFollow(state, workbook, place.sheetId);
  let placement = workbook.placementsIn(place.sheetId).find(({ viewId: viewId }: Dynamic) => viewId === place.viewId);
  return placement === undefined ? onSheet : scrollToPlacedView(onSheet, workbook, placement);
}
export function applyShownByAgent(state: PageState, workbook: ReadsWithTextMeasurer, shown?: Dynamic) {
  let place = state.gridHeight === 0 ? null : (shown.place ?? placeShownByAgent(shown.asked, state.sheetId, workbook));
  if (place === null)
    return {
      ...state,
      shownByAgent: shown,
      isFollowingAgent: keepsFollowingAgent(state, shown),
    };
  if (shown.staysOnSheet && place.sheetId !== state.sheetId)
    return {
      ...state,
      shownByAgent: null,
    };
  let shownState = {
    ...state,
    shownByAgent: {
      ...shown,
      place: place,
    },
    isFollowingAgent: false,
    followed: null,
    changedOffShowSinceRest: null,
  };
  return goToShownPlace(shownState, workbook, place);
}
export function stepShownByAgent(before: Dynamic, step: Dynamic, event: Dynamic, { reads: reads }: Dynamic) {
  let { state: state } = step;
  if (event.kind === 'viewShownByAgentChanged') {
    let { shown: shown } = event;
    if (shown === null)
      return state.shownByAgent === null
        ? state
        : {
            ...state,
            shownByAgent: null,
            isFollowingAgent: keepsFollowingAgent(state, state.shownByAgent),
          };
    if (!isViewFreeToFollow(state))
      return {
        ...state,
        shownByAgent: null,
      };
    return applyShownByAgent(state, reads, {
      asked: shown,
      place: null,
      staysOnSheet: event.isPersonAtWorkInPage === true,
      goesWithEdits: state.shownByAgent?.goesWithEdits ?? (state.isFollowingAgent || !state.isAgentWorking),
    });
  }
  if (state.shownByAgent === null) return state;
  if ((event.kind === 'followAsked' && event.tabKey !== null) || event.kind === 'keyPressed' || doesPersonTakeViewBack(before, step, event))
    return {
      ...state,
      shownByAgent: null,
    };
  let isGridHidden = event.kind === 'gridResized' && before.gridHeight === 0;
  if (event.kind !== 'workbookChanged' && !isGridHidden) return state;
  let { place: place } = state.shownByAgent;
  if (place?.kind === 'cells' && place.cells === null) return state;
  return applyShownByAgent(state, reads, state.shownByAgent);
}
export const MAX_SHOWN_REFERENCES = 64;
export const MAX_SHOWN_REFERENCE_LENGTH = 256;
export const shownReferenceText = (reference?: Dynamic) => {
  let text = typeof reference === 'number' ? `${reference}` : reference;
  return typeof text === 'string' && text !== '' && text.length <= MAX_SHOWN_REFERENCE_LENGTH ? text : null;
};
export const cellsShownByAgent = ({ shownByAgent: shownByAgent }: Dynamic) =>
  shownByAgent?.place?.kind === 'cells' ? shownByAgent.place.cells : null;
export const findSheetByIdNameOrNumber = (workbook: WorkbookReads, sheetKey?: Dynamic) => {
  let sheets = workbook.listSheets();
  let lowerKey = sheetKey.toLowerCase();
  return (
    sheets.find(({ sheetId: sheetId }: Dynamic) => sheetId === sheetKey) ??
    sheets.find(({ name: name }: Dynamic) => name.toLowerCase() === lowerKey) ??
    (/^\d+$/.test(sheetKey) ? sheets[Number(sheetKey) - 1] : undefined)
  );
};
export const keepsFollowingAgent = (state: PageState, shown?: Dynamic) =>
  state.isFollowingAgent || (shown.goesWithEdits && state.isAgentWorking && state.followed === null && isViewFreeToFollow(state));
