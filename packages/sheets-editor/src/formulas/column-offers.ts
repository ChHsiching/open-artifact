import type { Dynamic } from '../dynamic.ts';
import { tablesInSightOf, hasTableHeadings, isTableCertain } from '../tables/finding.ts';
import { headingTextAt } from '../ui/sort-menu.ts';
import { trimAreaToShownRows } from '../tables/filtered-rows.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function tableColumnOffers(state: PageState, workbook: ReadsWithTextMeasurer) {
  let { sheetId: sheetId } = state;
  let room: Dynamic = MAX_COLUMN_OFFERS;
  return tablesInSightOf(state, workbook).flatMap(({ table: table, header: header, body: body, columns: columns }: Dynamic) => {
    if (body === null || room === 0 || !hasTableHeadings(table)) return [];
    let count = Math.min(columns.last - columns.first + 1, room);
    room -= count;
    return Array.from<Dynamic, Dynamic>(
      {
        length: count,
      },
      (item?: Dynamic, offset?: Dynamic) => {
        let columnIndex = columns.first + offset;
        let heading = headingTextAt(
          state,
          workbook,
          {
            rowIndex: header.last,
            columnIndex: columnIndex,
          },
          isTableCertain(table),
        );
        let area = {
          topRowIndex: body.first,
          leftColumnIndex: columnIndex,
          rowCount: body.last - body.first + 1,
          columnCount: 1,
        };
        return {
          heading: heading,
          cells: trimAreaToShownRows(state, workbook, area, sheetId),
        };
      },
    ).filter(({ heading: heading }: Dynamic) => heading !== '');
  });
}
export const MAX_COLUMN_OFFERS = 100;
