import type { Dynamic } from '../dynamic.ts';
import { parseA1AreaAsSeen, columnLabelEnds } from '../model/a1-references.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { translateMessage } from '../i18n/messages.ts';
import { truncateGraphemes } from '../i18n/grid-action-labels.ts';
import { toolLabelWithValue } from '../tools/search-words.ts';
export function goToCellsCommands(typed: Dynamic, { sheet: sheet }: Dynamic, actions?: Dynamic) {
  let area = parseA1AreaAsSeen(typed, sheet);
  if (area === null) return [];
  let { first: firstRow, last: lastRow } = columnLabelEnds(area);
  let cellsLabel = area.rowCount === sheet.rowCount ? `${firstRow}:${lastRow}` : areaToA1AsStored(area, sheet.ownRowOrder);
  let isOneCell = area.rowCount === 1 && area.columnCount === 1;
  return [
    goToCommandMaker(actions)('goTo.cells', cellsToGoToLabel(cellsLabel, isOneCell), {
      kind: 'cellsGoneTo',
      area: area,
    }),
  ];
}
export function goToSheetAndColumnCommands(typed?: Dynamic, most?: Dynamic, places?: Dynamic, actions?: Dynamic) {
  let typedWords = wordsOfLabel(typed);
  if (!typedWords.some((word?: Dynamic) => word.length >= MIN_GO_TO_WORD_LENGTH)) return [];
  let headingCounts = new (Map as Dynamic)();
  for (let { heading: heading } of places.columnsToGoTo as Dynamic)
    headingCounts.set(isolatedShortName(heading), (headingCounts.get(isolatedShortName(heading)) ?? 0) + 1);
  return [
    ...places.listedSheets
      .filter(({ isShown: isShown }: Dynamic) => !isShown)
      .map(
        ({ sheetId: sheetId, name: sheetName }: Dynamic) =>
          goToCommandMaker(actions)(`goTo.sheet.${sheetId.replaceAll('.', '%2E')}`, sheetToGoToLabel(isolatedShortName(sheetName)), {
            kind: 'sheetChosen',
            sheetId: sheetId,
            canPoint: false,
          }),
      ),
    ...places.columnsToGoTo.map(
      ({ heading: heading, cells: cells }: Dynamic) =>
        goToCommandMaker(actions)(
          `goTo.column.${areaToA1AsStored(cells, null)}`,
          (headingCounts.get(isolatedShortName(heading)) ?? 0) > 1
            ? columnWithCellsToGoToLabel(isolatedShortName(heading), areaToA1AsStored(cells, places.sheet.ownRowOrder))
            : columnToGoToLabel(isolatedShortName(heading)),
          {
            kind: 'cellsGoneTo',
            area: cells,
          },
        ),
    ),
  ]
    .filter(({ label: label }: Dynamic) => {
      let labelWords2 = wordsOfLabel(label);
      return typedWords.every((typedWord?: Dynamic) => labelWords2.some((labelWord?: Dynamic) => labelWord.startsWith(typedWord)));
    })
    .slice(0, most);
}
export const goToLabel = () =>
  translateMessage({
    defaultMessage: 'Go to',
    id: 'sEkOesbgxD',
  });
export const cellsToGoToLabel = (cells?: Dynamic, isOneCell?: Dynamic) =>
  isOneCell
    ? translateMessage(
        {
          defaultMessage: 'Cell {cells}',
          id: '60XybrQKzd',
        },
        {
          cells: cells,
        },
      )
    : translateMessage(
        {
          defaultMessage: 'Cells {cells}',
          id: '8ekhz6lHQ3',
        },
        {
          cells: cells,
        },
      );
export const sheetToGoToLabel = (sheetName?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Sheet “{name}”',
      id: '/ZLkuH42A+',
    },
    {
      name: sheetName,
    },
  );
export const columnToGoToLabel = (heading?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Column “{heading}”',
      id: 'ERUM3VYbgm',
    },
    {
      heading: heading,
    },
  );
export const columnWithCellsToGoToLabel = (heading?: Dynamic, cells?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Column “{heading}” ({cells})',
      id: 'JT8oHmj63k',
    },
    {
      heading: heading,
      cells: cells,
    },
  );
export const wordsOfLabel = (label?: Dynamic) =>
  label
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll('’', "'")
    .split(/[^\p{L}\p{N}']+/u)
    .filter((word?: Dynamic) => word !== '');
export const MIN_GO_TO_WORD_LENGTH = 2;
export const MAX_GO_TO_NAME_LENGTH = 60;
export const isolatedShortName = (label?: Dynamic) => `⁨${truncateGraphemes(label, MAX_GO_TO_NAME_LENGTH)}⁩`;
export const goToCommandMaker =
  ({ dispatch: dispatch }: Dynamic) =>
  (id?: Dynamic, label?: Dynamic, action?: Dynamic) => ({
    id: id,
    label: toolLabelWithValue(goToLabel(), label),
    icon: null,
    actsOn: 'goesTo',
    whyNot: null,
    run: () => dispatch(action),
  });
