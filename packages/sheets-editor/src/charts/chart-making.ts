import type { Dynamic } from '../dynamic.ts';
import { countCellsLeftOutOfChart } from './stock-programs.ts';
export function settleChartMaking(making: Dynamic, { nth: nth, atPress: atPress }: Dynamic, outcome?: Dynamic) {
  if (typeof outcome === 'string')
    return {
      nth: nth,
      is: 'notAdded',
      why: outcome,
    };
  return making?.nth === nth
    ? {
        nth: nth,
        is: 'added',
        atPress: atPress,
        ...outcome,
        valuesNotShown: null,
        isCardLost: false,
      }
    : making;
}
export function chartMakingOutcome(outcome?: Dynamic, isForPage?: Dynamic, hasLeftSheet: Dynamic = false) {
  if (outcome === 'stopped')
    return hasLeftSheet
      ? {
          made: 'leftSheet',
        }
      : {
          inCard: null,
        };
  if (typeof outcome === 'object' || outcome === 'full' || outcome === 'notMade' || outcome === 'codeRefused')
    return {
      made: outcome,
    };
  if (!isForPage)
    return {
      made: outcome === 'notChanged' ? 'notMade' : 'notForPage',
    };
  return {
    inCard: outcome === 'tooLarge' ? 'forChat' : outcome,
  };
}
export function chartMakingForView(making?: Dynamic, view?: Dynamic) {
  if (making === null || making.is === 'notAdded') return making;
  if (shownSheetIdOf(view) !== making.atPress.sheetId) return null;
  if (making.is === 'awaited') return making;
  if (view.latestStep !== making.step) return null;
  let { chart: chart } = placedViewOfAddedChart(making, view) ?? {};
  if (chart?.kind !== 'code') return making.valuesNotShown === null ? making : null;
  if (view.undoOfTurnOffered !== null && !making.isCardLost)
    return {
      ...making,
      isCardLost: true,
    };
  if (making.valuesNotShown !== null) return making;
  let { kind: pressKind } = making.atPress;
  let valuesNotShown = pressKind === 'byAgent' ? 0 : countCellsLeftOutOfChart(chart.inputs, pressKind);
  return {
    ...making,
    valuesNotShown: valuesNotShown,
  };
}
export const shownSheetIdOf = ({ listedSheets: listedSheets }: Dynamic) =>
  listedSheets.find(({ isShown: isShown }: Dynamic) => isShown)?.sheetId ?? null;
export const awaitedChartMaking = (nth?: Dynamic, pressKind?: Dynamic, view?: Dynamic) => ({
  nth: nth,
  is: 'awaited',
  atPress: {
    kind: pressKind,
    sheetId: shownSheetIdOf(view),
    allSelectedText: view.allSelectedText,
    activeCellKey: view.activeCellKey,
    changesAskedFor: view.grid.changesAskedFor,
  },
});
export const dropAddedChartMaking = (making?: Dynamic) => (making?.is === 'added' ? null : making);
export const dropChartMakingOfNth = (making?: Dynamic, nth?: Dynamic) => (making?.nth === nth ? null : making);
export const placedViewOfAddedChart = (making: Dynamic, { grid: grid }: Dynamic) =>
  making?.is === 'added'
    ? grid.placedViews.find(({ chart: chart }: Dynamic) => chart.kind === 'code' && chart.nodeId === making.nodeId)
    : undefined;
export const addedChartForCard = (
  making: Dynamic,
  isShown: Dynamic,
  { contextBarMenu: contextBarMenu, viewOnlyBecause: viewOnlyBecause, undoOfTurnOffered: undoOfTurnOffered, entryCellKey: entryCellKey }: Dynamic,
) =>
  making?.is === 'added' &&
  !making.isCardLost &&
  isShown &&
  contextBarMenu !== 'chart' &&
  viewOnlyBecause === null &&
  entryCellKey === null &&
  undoOfTurnOffered === null
    ? making
    : null;
export const isAddedChartStillAtPress = (
  making: Dynamic,
  { mode: mode, menu: menu, contextBarMenu: contextBarMenu, allSelectedText: allSelectedText, activeCellKey: activeCellKey, grid: grid }: Dynamic,
) =>
  making?.is === 'added' &&
  grid.changesAskedFor === making.atPress.changesAskedFor + 1 &&
  mode.kind === 'navigating' &&
  menu === null &&
  contextBarMenu === null &&
  !grid.placedViews.some(({ isSelected: isSelected }: Dynamic) => isSelected) &&
  allSelectedText === making.atPress.allSelectedText &&
  activeCellKey === making.atPress.activeCellKey;
