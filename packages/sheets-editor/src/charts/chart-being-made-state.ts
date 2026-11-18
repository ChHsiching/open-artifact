import type { Dynamic } from '../dynamic.ts';
import { parseA1AreaAsSeen } from '../model/a1-references.ts';
import { placedViewBox, nodeIdOfRef, isBoxInView } from './placed-views.ts';
import { DEFAULT_CHART_SIZE } from './placement.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function chartBeingMadeTold(
  { sheetId: sheetId, chartBeingMade: chartBeingMade }: Dynamic,
  workbook: WorkbookReads,
  { nth: nth, chart: chart }: Dynamic,
) {
  if (chart === null || !('topLeft' in chart))
    return chartBeingMade?.nth !== nth
      ? chartBeingMade
      : chart === null
        ? null
        : {
            ...chartBeingMade,
            ...chart,
          };
  if (chart.sheetId !== sheetId) return null;
  let sheet = workbook.listSheets().find((sheet2?: Dynamic) => sheet2.sheetId === sheetId);
  let area =
    sheet === undefined
      ? null
      : parseA1AreaAsSeen(chart.topLeft, {
          ...sheet,
          ownRowOrder: null,
        });
  let topLeft = area === null ? null : workbook.cellIdAt(sheetId, area.topRowIndex, area.leftColumnIndex);
  return topLeft === null
    ? null
    : {
        nth: nth,
        topLeft: topLeft,
        kind: chart.kind,
        nodeSent: null,
        nodeAdded: null,
      };
}
export function shownChartBeingMade(state: PageState, workbook: ReadsWithTextMeasurer, placedViews?: Dynamic) {
  let { chartBeingMade: chartBeingMade } = state;
  if (chartBeingMade === null || chartBeingMade.topLeft.sheetId !== state.sheetId) return null;
  let position = workbook.positionOfCell(chartBeingMade.topLeft);
  if (position === null) return null;
  let { nth: nth, kind: kind, nodeSent: nodeSent, nodeAdded: nodeAdded } = chartBeingMade;
  let box = placedViewBox(state, workbook, {
    ...position,
    offsetFromAnchorCell: {
      xInPixels: 0,
      yInPixels: 0,
    },
    ...DEFAULT_CHART_SIZE,
  });
  let nodeIdOfPlaced = ({ viewId: viewId }: Dynamic) =>
    nodeIdOfRef(workbook.viewAsItStands(viewId)?.view.elements[0]?.embed.ref ?? '');
  let nodeId = nodeAdded ?? nodeSent;
  let placed = nodeId === null ? undefined : placedViews.find((placed2?: Dynamic) => nodeIdOfPlaced(placed2) === nodeId);
  return {
    nth: nth,
    box: box,
    isInView: isBoxInView(box),
    kind: kind,
    isAdded: nodeAdded !== null || placed !== undefined,
    placementId: placed?.placementId ?? null,
    hasLandedElsewhere: placed !== undefined && (placed.box.left !== box.left || placed.box.top !== box.top),
  };
}
