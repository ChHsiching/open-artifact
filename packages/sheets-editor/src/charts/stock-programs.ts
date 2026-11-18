import type { StockKind } from '@open-artifact/sheets-core/stock-charts';
import type { ChartCell, ChartRow } from '../chart-frame/messages.ts';

export { STOCK_CHART_PROGRAMS, STOCK_KINDS, type StockKind } from '@open-artifact/sheets-core/stock-charts';

const isNumericCell = (cell: ChartCell | undefined): boolean => typeof cell?.value === 'number';
const isYearLikeCell = ({ value }: ChartCell): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value > 1800 && value < 2200;
const hasText = (row: ChartRow): boolean => row.some(({ text }) => text !== '');

/** How many cells a stock chart of this kind leaves out of its drawing because they hold words and not numbers. */
export function countCellsLeftOutOfChart({ rows = [] }: { rows?: readonly ChartRow[] }, chartKind: StockKind | 'any'): number {
  const rowsWithText = rows.slice(0, 100).filter(hasText);
  const hasHeaderRow = rowsWithText.length > 1 && rowsWithText[0]?.some(isNumericCell) === false;
  const dataRows = rowsWithText.slice(hasHeaderRow ? 1 : 0);
  const columnCount = dataRows[0]?.length ?? 0;
  const firstColumnCells = dataRows.flatMap((row) => row.slice(0, 1));
  const firstColumnIsLabels = columnCount > 1 && (!firstColumnCells.some(isNumericCell) || firstColumnCells.every(isYearLikeCell));
  const isChartedColumn = (_cell: ChartCell, columnIndex: number): boolean =>
    columnIndex >= (firstColumnIsLabels ? 1 : 0) && dataRows.some((row) => isNumericCell(row[columnIndex]));
  return rows
    .filter(hasText)
    .slice(hasHeaderRow ? 1 : 0)
    .filter((row) => !firstColumnIsLabels || row[0]?.text !== '')
    .flatMap((row) => row.filter(isChartedColumn).slice(0, chartKind === 'pie' ? 1 : undefined))
    .filter((cell) => !isNumericCell(cell) && cell.text !== '').length;
}
