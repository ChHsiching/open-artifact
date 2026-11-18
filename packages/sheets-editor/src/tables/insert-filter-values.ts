import type { Dynamic } from '../dynamic.ts';
import { filterOfEntries } from './filter-model.ts';
import { ownFiltersOfSheet, refreshStaleOwnFilters } from './own-filters.ts';
import { ownFilterRecordsArea } from './own-filter-actions.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function filterValuesOfRowsAt(state: Dynamic, reads: WorkbookReads, { sheetId: sheetId, afterRow: afterRow }: Dynamic) {
  let afterRowIndex = afterRow === null ? -1 : reads.rowIndexOf(sheetId, afterRow);
  if (afterRowIndex === null) return null;
  return filterOfEntries(
    ownFiltersOfSheet(state, sheetId).flatMap((ownFilter?: Dynamic) => {
      let area = ownFilterRecordsArea(reads, ownFilter);
      return area !== null && afterRowIndex >= area.topRowIndex - 1 && afterRowIndex < area.topRowIndex + area.rowCount
        ? (ownFilter.filter?.allOf ?? [])
        : [];
    }),
  );
}
export function addFilterValuesToInserts(step: Dynamic, reads: ReadsWithTextMeasurer) {
  let { state: state } = step;
  if (state.ownFilters.size === 0) return step;
  let effects = step.effects.map((effect?: Dynamic) => {
    if (effect.kind !== 'queueEdit' || effect.edit.kind !== 'insertRows') return effect;
    if (effect.ifQueued.entryBeforeLine !== undefined) return effect;
    let stateFresh = refreshStaleOwnFilters(state, reads, effect.edit.sheetId);
    let filterValues = filterValuesOfRowsAt(stateFresh, reads, effect.edit);
    return filterValues === null
      ? effect
      : {
          ...effect,
          edit: {
            ...effect.edit,
            valuesFromFilter: filterValues,
          },
        };
  });
  return {
    ...step,
    effects: effects,
  };
}
