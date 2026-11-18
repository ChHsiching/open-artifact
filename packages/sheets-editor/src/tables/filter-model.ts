import type { Dynamic } from '../dynamic.ts';
export function conditionFilterOfColumn(filter?: Dynamic, columnId?: Dynamic, isUsable?: Dynamic) {
  let conditionLists = (filter?.allOf ?? []).flatMap((entry?: Dynamic) => {
    let conditions = conditionsOfFilterEntry(entry, columnId);
    return conditions?.every(isUsable) === true ? [conditions] : [];
  });
  let [onlyList] = conditionLists;
  if (conditionLists.length === 1 && onlyList?.length === 2)
    return {
      conditions: onlyList,
      join: 'or',
    };
  return {
    conditions: conditionLists
      .filter((conditions?: Dynamic) => conditions.length === 1)
      .flat()
      .slice(0, 2),
    join: 'and',
  };
}
export function withConditionFilter(
  filter: Dynamic,
  columnId: Dynamic,
  knownConditions: Dynamic,
  { conditions: conditions, join: join }: Dynamic,
) {
  let entries = filter?.allOf ?? [];
  let [first, ...rest] = conditions.map(
    (condition?: Dynamic) => ({
      c: columnId,
      asked: {
        kind: 'meets',
        condition: condition,
      },
    }),
  );
  let newEntries =
    first === undefined
      ? []
      : join === 'or'
        ? [
            {
              anyOf: [first, ...rest],
            },
          ]
        : [first, ...rest].map(
            (item?: Dynamic) => ({
              anyOf: [item],
            }),
          );
  let replacedIndex = entries.findIndex((entry?: Dynamic) => isConditionEntryAmong(entry, columnId, knownConditions));
  if (replacedIndex === -1) return filterOfEntries([...entries, ...newEntries]);
  return filterOfEntries(
    entries.flatMap(
      (entry?: Dynamic, index?: Dynamic) =>
        index === replacedIndex ? newEntries : isConditionEntryAmong(entry, columnId, knownConditions) ? [] : [entry],
    ),
  );
}
export function withValueFilter(filter?: Dynamic, columnId?: Dynamic, asked?: Dynamic) {
  let entries = filter?.allOf ?? [];
  let newEntries = asked === null ? [] : [filterEntry(columnId, asked)];
  let replacedIndex = entries.findIndex((entry?: Dynamic) => isValueFilterOfColumn(entry, columnId));
  if (replacedIndex === -1) return filterOfEntries([...entries, ...newEntries]);
  return filterOfEntries(
    entries.flatMap(
      (entry?: Dynamic, index?: Dynamic) => (index === replacedIndex ? newEntries : isValueFilterOfColumn(entry, columnId) ? [] : [entry]),
    ),
  );
}
export function filterReplacingColumn(filter?: Dynamic, columnId?: Dynamic, asked?: Dynamic) {
  let newEntry = filterEntry(columnId, asked);
  let [first, ...rest] = (filter?.allOf ?? []).filter(
    ({ anyOf: anyOf }: Dynamic) => anyOf.some((item?: Dynamic) => item.c !== columnId),
  );
  return {
    allOf: first === undefined ? [newEntry] : [first, ...rest, newEntry],
  };
}
export function withValueExcluded(filter?: Dynamic, columnId?: Dynamic, value?: Dynamic) {
  let entries = filter?.allOf ?? [];
  let excludingIndex = entries
    .map((entry?: Dynamic) => isValueFilterOfColumn(entry, columnId) && entry.anyOf[0].asked.kind === 'isNoneOf')
    .lastIndexOf(true);
  let excluding = entries[excludingIndex]?.anyOf[0].asked;
  let newEntry = filterEntry(columnId, {
    kind: 'isNoneOf',
    values: excluding?.kind === 'isNoneOf' ? [value, ...excluding.values] : [value],
  });
  let [first, ...rest] =
    excludingIndex === -1
      ? [...entries, newEntry]
      : entries.map((entry?: Dynamic, index?: Dynamic) => (index === excludingIndex ? newEntry : entry));
  return {
    allOf: [first ?? newEntry, ...rest],
  };
}
export function columnsOfFilterItem({ c: columnId, asked: asked }: Dynamic) {
  let condition = asked.kind === 'meets' ? asked.condition : null;
  let operands =
    condition?.kind === 'numberIs'
      ? [condition.operand]
      : condition?.kind === 'numberIsBetween' || condition?.kind === 'numberIsNotBetween'
        ? [condition.oneEnd, condition.otherEnd]
        : [];
  return [columnId, ...operands.flatMap((operand?: Dynamic) => (operand.kind === 'sameRowInColumn' ? [operand.c] : []))];
}
export function rowIdsOutOfView(ranges?: Dynamic) {
  let rowIds: Dynamic = [];
  for (let { base: base, first: first, count: count } of ranges as Dynamic)
    for (let rowNumber: Dynamic = first; rowNumber < first + count; rowNumber += 1) rowIds.push(`${base}.${rowNumber}`);
  return rowIds;
}
export const isValueFilterOfColumn = ({ anyOf: [first, ...rest] }: Dynamic, columnId?: Dynamic) =>
  rest.length === 0 && first.c === columnId && first.asked.kind !== 'meets';
export const valueFiltersOfColumn = (filter?: Dynamic, columnId?: Dynamic) =>
  (filter?.allOf ?? []).flatMap((entry?: Dynamic) => (isValueFilterOfColumn(entry, columnId) ? [entry.anyOf[0].asked] : []));
export const MAX_FILTER_CONDITIONS = 2;
export const conditionsOfFilterEntry = ({ anyOf: anyOf }: Dynamic, columnId?: Dynamic) =>
  anyOf.every((item?: Dynamic) => item.c === columnId && item.asked.kind === 'meets')
    ? anyOf.flatMap(({ asked: asked }: Dynamic) => (asked.kind === 'meets' ? [asked.condition] : []))
    : null;
export const isConditionEntryAmong = (entry?: Dynamic, columnId?: Dynamic, conditions?: Dynamic) =>
  conditionsOfFilterEntry(entry, columnId)?.every((condition?: Dynamic) => conditions.includes(condition)) === true;
export const mixedEntryIndexesOfColumn = (filter?: Dynamic, columnId?: Dynamic, conditions?: Dynamic) =>
  (filter?.allOf ?? []).flatMap(
    (entry?: Dynamic, index?: Dynamic) =>
      entry.anyOf.some((item?: Dynamic) => item.c === columnId) &&
      !isValueFilterOfColumn(entry, columnId) &&
      !isConditionEntryAmong(entry, columnId, conditions)
        ? [index]
        : [],
  );
export const filterForColumnValues = (filter?: Dynamic, columnId?: Dynamic) =>
  filterOfEntries(
    (filter?.allOf ?? []).filter(
      (entry?: Dynamic) => isValueFilterOfColumn(entry, columnId) || entry.anyOf.every((item?: Dynamic) => item.c !== columnId),
    ),
  );
export const isColumnFiltered = (filter?: Dynamic, columnId?: Dynamic) =>
  filter?.allOf.some(({ anyOf: anyOf }: Dynamic) => anyOf.some((item?: Dynamic) => item.c === columnId)) === true;
export const filterOfEntries = ([first, ...rest]: Dynamic) =>
  first === undefined
    ? null
    : {
        allOf: [first, ...rest],
      };
export const filterEntry = (columnId?: Dynamic, asked?: Dynamic) => ({
  anyOf: [
    {
      c: columnId,
      asked: asked,
    },
  ],
});
export const filterWithoutEntry = (filter?: Dynamic, index?: Dynamic) =>
  filterOfEntries(filter.allOf.filter((entry?: Dynamic, at?: Dynamic) => at !== index));
export const keepFilterClausesWhereColumns = (filter?: Dynamic, isKept?: Dynamic) =>
  filterOfEntries(
    filter.allOf.filter(
      ({ anyOf: anyOf }: Dynamic) => anyOf.every((clause?: Dynamic) => columnsOfFilterItem(clause).every(isKept)),
    ),
  );
