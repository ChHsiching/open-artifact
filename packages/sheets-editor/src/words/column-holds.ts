import type { Dynamic } from '../dynamic.ts';
export function isPeopleColumn(column?: Dynamic) {
  let isPeople = peopleColumnCache.get(column) ?? column.values.some(({ userIds: userIds }: Dynamic) => userIds.length > 0);
  peopleColumnCache.set(column, isPeople);
  return isPeople;
}
export const peopleColumnCache = new (WeakMap as Dynamic)();
export const valuesOfUserInColumn = (columnHolds?: Dynamic, userId?: Dynamic) =>
  userId === null || columnHolds.areMoreValuesLeftOut
    ? []
    : columnHolds.values
        .filter(({ userIds: userIds }: Dynamic) => userIds.includes(userId))
        .map(({ value: value }: Dynamic) => value);
export const measureOfColumn = ({ kind: kind }: Dynamic) =>
  kind === 'number' || kind === 'currency' || kind === 'percent' ? 'numbers' : kind === 'date' ? 'days' : null;
