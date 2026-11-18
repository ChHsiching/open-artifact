import type { CellCondition } from '@open-artifact/sheets-core';
/** A span of days a due date may be asked to fall in, or before today. */
export type DueDatePreset = 'overdue' | 'thisMonth' | 'thisWeek' | 'nextWeek';
/** A condition that a number falls between two ends. */
export type SerialRangeCondition = Extract<CellCondition, { kind: 'numberIsBetween' }>;
export function serialToIsoDate(serial: number): string | null {
  if (!(serial >= dateToSerial('0001-01-01') && serial < dateToSerial('9999-12-31') + 1)) return null;
  return new Date((Math.floor(serial) - 25569) * 86400000).toISOString().slice(0, 10);
}
export function weekRangeCondition(isoDate: string, weekOffset: number): SerialRangeCondition {
  let weekStart = dateToSerial(isoDate) - new Date(`${isoDate}T00:00:00Z`).getUTCDay() + 7 * weekOffset;
  return serialRangeCondition(weekStart, weekStart + 6);
}
export function monthSpanRangeCondition(isoDate: string, spanOffset: number, monthsPerSpan: number = 1): SerialRangeCondition {
  let date = new Date(`${isoDate}T00:00:00Z`);
  let serialOf = (month: number, day: number): number => Date.UTC(date.getUTCFullYear(), month, day) / 86400000 + 25569;
  let firstMonth = (Math.floor(date.getUTCMonth() / monthsPerSpan) + spanOffset) * monthsPerSpan;
  return serialRangeCondition(serialOf(firstMonth, 1), serialOf(firstMonth + monthsPerSpan, 0));
}
export function dueDatePresetCondition(preset: DueDatePreset, today: string): CellCondition {
  if (preset === 'overdue')
    return {
      kind: 'numberIs',
      comparison: 'lessThan',
      operand: {
        kind: 'number',
        number: dateToSerial(today),
      },
    };
  if (preset === 'thisMonth') return monthSpanRangeCondition(today, 0);
  return weekRangeCondition(today, preset === 'thisWeek' ? 0 : 1);
}
export const dateToSerial = (isoDate: string): number => Date.parse(`${isoDate}T00:00:00Z`) / 86400000 + 25569;
export const END_OF_DAY_FRACTION = 0.99999;
export const serialRangeCondition = (first: number, last: number): SerialRangeCondition => ({
  kind: 'numberIsBetween',
  oneEnd: {
    kind: 'number',
    number: first,
  },
  otherEnd: {
    kind: 'number',
    number: last + END_OF_DAY_FRACTION,
  },
});
