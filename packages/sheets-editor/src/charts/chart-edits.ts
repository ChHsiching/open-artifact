import { CHART_ROWS_INPUT } from './chart-kind-fit.ts';
export { CHART_ROWS_INPUT };
import type { Dynamic } from '../dynamic.ts';
import { areaOfHeld } from './cells-held.ts';
import { placeChartForArea, DEFAULT_CHART_SIZE } from './placement.ts';
import { parseA1AreaAsSeen } from '../model/a1-references.ts';
import { nodeRefOf } from './placed-views.ts';
import { cellRefOf } from '../model/workbook.ts';
import { doesCommentModePick } from '../comments/comment-state.ts';
import { withNoEffects } from '../state/transitions.ts';
import { queueEdit, IF_QUEUED_DEFAULTS } from '../model/edit-effects.ts';
import { refusalMessageKey, isEditRefusalReason } from '../model/refusals.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function editToAddChart(reads: WorkbookReads, { nodeId: nodeId, name: name, cells: cells }: Dynamic) {
  let { sheetId: sheetId } = cells;
  let sheet = reads.listSheets().find((candidate?: Dynamic) => candidate.sheetId === sheetId);
  let area = areaOfHeld(reads, cells);
  let placed = area === null ? null : placeChartForArea(reads, sheetId, area);
  if (sheet === undefined || placed === null) return null;
  let [rangeArea, topLeftArea] = [
    parseA1AreaAsSeen(placed.range, sheet),
    parseA1AreaAsSeen(placed.topLeft, {
      ...sheet,
      ownRowOrder: null,
    }),
  ];
  if (rangeArea === null || topLeftArea === null) return null;
  let [firstCell, lastCell, topLeftCell] = [
    reads.cellIdAt(sheetId, rangeArea.topRowIndex, rangeArea.leftColumnIndex),
    reads.cellIdAt(sheetId, rangeArea.topRowIndex + rangeArea.rowCount - 1, rangeArea.leftColumnIndex + rangeArea.columnCount - 1),
    reads.cellIdAt(sheetId, topLeftArea.topRowIndex, topLeftArea.leftColumnIndex),
  ];
  if (firstCell === null || lastCell === null || topLeftCell === null) return null;
  return {
    kind: 'addPlacedView',
    sheetId: sheetId,
    name: name,
    embed: {
      ref: nodeRefOf(nodeId),
      caption: '',
    },
    inputs: [
      {
        name: CHART_ROWS_INPUT,
        range: {
          sheetId: sheetId,
          topLeft: cellRefOf(firstCell),
          bottomRight: cellRefOf(lastCell),
        },
      },
    ],
    topLeft: cellRefOf(topLeftCell),
    ...DEFAULT_CHART_SIZE,
  };
}
export function editToPointChartAt(reads: WorkbookReads, { viewId: viewId, from: from, to: to, renaming: renaming }: Dynamic) {
  let [placed] = reads.listSheets().flatMap(
    ({ sheetId: sheetId }: Dynamic) =>
      reads
        .placementsIn(sheetId)
        .filter((placement?: Dynamic) => placement.viewId === viewId)
        .map(
          ({ placementId: placementId }: Dynamic) => ({
            sheetId: sheetId,
            placementId: placementId,
          }),
        ),
  );
  if (placed === undefined) return null;
  let isNameOfKind = renaming !== null && reads.viewAsItStands(viewId)?.view.name === renaming.from;
  return {
    kind: 'replaceWidgetNodeOfPlacedView',
    ...placed,
    oldNode: nodeRefOf(from),
    newNode: nodeRefOf(to),
    ...(isNameOfKind && {
      newName: renaming.to,
    }),
  };
}
export function reduceEditOfChartAsked(
  state: PageState,
  { reads: reads, refusalOfEveryEdit: refusalOfEveryEdit }: Dynamic,
  { asked: asked, askId: askId }: Dynamic,
) {
  if (refusalOfEveryEdit !== null || doesCommentModePick(state)) return withNoEffects(state);
  let edit = asked.kind === 'add' ? editToAddChart(reads, asked) : editToPointChartAt(reads, asked);
  return edit === null
    ? withNoEffects(state)
    : queueEdit(state, edit, {
        ...IF_QUEUED_DEFAULTS,
        select: null,
        done: null,
        leavesEntryOpen: true,
        askOfChart: askId,
      });
}
export function chartEditOutcome(answer?: Dynamic) {
  if (answer.kind === 'editQueued')
    return {
      step: answer.step ?? null,
    };
  if (answer.kind === 'nothingToChange')
    return {
      step: null,
    };
  if (answer.kind === 'toBeShownFirst') return 'notMade';
  let messageKey = refusalMessageKey(answer.refusal);
  if (messageKey === 'tooManyCharts') return 'full';
  if (answer.refusal === 'widgetNodeNotShownByTheView') return 'showsAnother';
  return isEditRefusalReason(messageKey) || answer.refusal === 'widgetNodeOfAnotherView' ? 'unsure' : 'notMade';
}
