import type { Dynamic } from '../dynamic.ts';
import { filterOfEntries, filterEntry } from '../tables/filter-model.ts';
export function viewersValuesColumn(columns?: Dynamic, viewerId?: Dynamic) {
  let [found, ...others] = columns.flatMap((column?: Dynamic) => {
    let viewersValues = column.values.filter(({ userIds: userIds }: Dynamic) => viewerId !== null && userIds.includes(viewerId));
    return viewersValues.length === 0
      ? []
      : [
          {
            column: column,
            values: viewersValues,
          },
        ];
  });
  return others.length > 0 || found?.column.areMoreValuesLeftOut === true ? null : (found ?? null);
}
export function suggestedAsksOf(holds?: Dynamic, viewerId?: Dynamic) {
  let { columns: columns } = holds;
  let priorityColumn = columns.find((column?: Dynamic) => column.name !== null && isPriorityColumn(column));
  let byPriority =
    priorityColumn === undefined
      ? NO_SORT_KEYS
      : [
          {
            c: priorityColumn.c,
            direction: 'ascending',
          },
        ];
  let suggestAsk = (what?: Dynamic, valuesFound?: Dynamic, kind?: Dynamic, sortBy: Dynamic = NO_SORT_KEYS) => {
    let [firstValue, ...otherValues] = valuesFound?.values.map(({ value: value }: Dynamic) => value) ?? [];
    if (valuesFound === null || firstValue === undefined) return [];
    let recordsOfValues = valuesFound.values.reduce((sum: Dynamic, { records: records2 }: Dynamic) => sum + records2, 0);
    let records = kind === 'isOneOf' ? recordsOfValues : holds.records - recordsOfValues;
    if (records <= 0 || records >= holds.records) return [];
    let filter = filterOfEntries([
      filterEntry(valuesFound.column.c, {
        kind: kind,
        values: [firstValue, ...otherValues],
      }),
    ]);
    return [
      {
        what: what,
        asked: {
          filter: filter,
          sortBy: sortBy,
        },
        records: records,
      },
    ];
  };
  let viewersValues = viewersValuesColumn(columns, viewerId);
  let priorityName = priorityColumn?.name ?? null;
  return [
    ...(priorityName === null
      ? []
      : suggestAsk(
          {
            kind: 'mineSorted',
            column: priorityName,
          },
          viewersValues,
          'isOneOf',
          byPriority,
        )),
    ...suggestAsk(
      {
        kind: 'mine',
      },
      viewersValues,
      'isOneOf',
    ),
    ...statusValuesMatching(columns, doneStatusPattern)
      .flatMap(
        (status?: Dynamic) =>
          suggestAsk(
            {
              kind: 'allBut',
              label: status.label,
            },
            status,
            'isNoneOf',
          ),
      )
      .slice(0, 1),
    ...statusValuesMatching(columns, inProgressStatusPattern)
      .flatMap(
        (status?: Dynamic) =>
          suggestAsk(
            {
              kind: 'only',
              label: status.label,
            },
            status,
            'isOneOf',
          ),
      )
      .slice(0, 1),
    ...(priorityName === null || holds.records < 2
      ? []
      : [
          {
            what: {
              kind: 'sorted',
              column: priorityName,
            },
            asked: {
              filter: null,
              sortBy: byPriority,
            },
            records: null,
          },
        ]),
  ];
}
export const doneStatusPattern = /^(?:shipped|done|complete|completed|closed|finished|resolved)$/i;
export const isDoneStatus = (text?: Dynamic) => doneStatusPattern.test(text.trim());
export const inProgressStatusPattern = /^(?:in progress|doing|started|under way|active)$/i;
export const priorityLevelPattern = /^p\d+$/i;
export const isChoiceColumn = ({ kind: kind, optionsOfDropdown: optionsOfDropdown }: Dynamic) =>
  optionsOfDropdown !== null || kind === 'fewWords';
export const textOfFilterValue = (filterValue?: Dynamic) => (filterValue?.kind === 'text' ? filterValue.value : null);
export const statusValuesMatching = (columnHolds?: Dynamic, pattern?: Dynamic) =>
  columnHolds.filter(isChoiceColumn).flatMap(
    (column?: Dynamic) =>
      column.values.flatMap((entry?: Dynamic) => {
        let label = textOfFilterValue(entry.value)?.trim() ?? '';
        return pattern.test(label)
          ? [
              {
                column: column,
                values: [entry],
                label: label,
              },
            ]
          : [];
      }),
  );
export const isPriorityColumn = (column?: Dynamic) =>
  column.optionsOfDropdown !== null &&
  column.values.length > 1 &&
  (/^(?:prio|priority|priorities)$/i.test(column.name?.trim() ?? '') ||
    column.values.filter(({ value: value }: Dynamic) => priorityLevelPattern.test(textOfFilterValue(value) ?? '')).length > 1);
export const NO_SORT_KEYS: Dynamic = [];
