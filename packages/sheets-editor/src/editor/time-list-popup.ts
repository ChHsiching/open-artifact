import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { useLastNonNull, ListUnderCell, ListRow, ListRowLabel } from '../ui/list-under-cell.ts';
import { jsx } from 'react/jsx-runtime';
import { timesForCellLabel } from '../i18n/menu-labels.ts';
export function timeListActiveDescendant({ rows: rows, highlightedRow: highlightedRow }: Dynamic) {
  let highlighted = highlightedRow === null ? undefined : rows[highlightedRow];
  return {
    id: TIME_LIST_ID,
    highlightedRowId: highlighted === undefined ? null : timeListRowId(highlighted),
  };
}
export const TIME_LIST_ID = 'time-list';
export const timeListRowId = ({ secondOfDay: secondOfDay }: Dynamic) => `${TIME_LIST_ID}-${secondOfDay}`;
export const EMPTY_TIME_LIST = {
  cell: '',
  rows: [],
  highlightedRow: null,
};
export const TimeListPopup = React.memo(function ({
  list: list,
  anchor: anchor,
  cellElementId: cellElementId,
  onRowChosen: onRowChosen,
  onRowPointedAt: onRowPointedAt,
  onShut: onShut,
}: Dynamic) {
  let { cell: cell, rows: rows, highlightedRow: highlightedRow } = useLastNonNull(list) ?? EMPTY_TIME_LIST;
  return jsx(ListUnderCell, {
    id: TIME_LIST_ID,
    isOpen: list !== null,
    anchor: anchor,
    cellElementId: cellElementId,
    label: timesForCellLabel(cell),
    className: 'min-w-[var(--anchor-width)]',
    onShut: onShut,
    children: rows.map(
      (row?: Dynamic, index?: Dynamic) =>
        jsx(
          ListRow,
          {
            id: timeListRowId(row),
            placeInList: index + 1,
            rowsInList: rows.length,
            isHighlighted: index === highlightedRow,
            onChosen: () => onRowChosen(index),
            onPointedAt: () => onRowPointedAt(index),
            children: jsx(ListRowLabel, {
              children: row.shown,
            }),
          },
          row.secondOfDay,
        ),
    ),
  });
});
