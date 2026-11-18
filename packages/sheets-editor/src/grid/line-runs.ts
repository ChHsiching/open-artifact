import type { Dynamic } from '../dynamic.ts';
export function indexRunsOfIds(order?: Dynamic, ids?: Dynamic, fromIndex?: Dynamic) {
  let indices = new (Float64Array as Dynamic)(ids.size);
  let count: Dynamic = 0;
  for (let value of ids as Dynamic) {
    let value2 = order.indexOf(value);
    if (value2 === null || value2 < fromIndex) continue;
    indices[count] = value2;
    count += 1;
  }
  let sorted = indices.subarray(0, count);
  sorted.sort();
  let runs: Dynamic = [];
  for (let value of sorted as Dynamic) {
    let value2 = runs.at(-1);
    if (value2 !== undefined && runEnd(value2) === value)
      runs[runs.length - 1] = {
        ...value2,
        count: value2.count + 1,
      };
    else
      runs.push({
        firstIndex: value,
        count: 1,
      });
  }
  return runs;
}
export function mergeIndexRuns(runs?: Dynamic, otherRuns?: Dynamic) {
  if (runs.length === 0) return otherRuns;
  if (otherRuns.length === 0) return runs;
  let merged: Dynamic = [];
  let [index, otherIndex]: Dynamic = [0, 0];
  for (;;) {
    let [run, otherRun] = [runs[index], otherRuns[otherIndex]];
    let takesRun = run !== undefined && (otherRun === undefined || run.firstIndex <= otherRun.firstIndex);
    let next = takesRun ? run : otherRun;
    if (next === undefined) return merged;
    if (takesRun) index += 1;
    else otherIndex += 1;
    let last = merged.at(-1);
    if (last === undefined || runEnd(last) < next.firstIndex) merged.push(next);
    else
      merged[merged.length - 1] = {
        ...last,
        count: Math.max(runEnd(last), runEnd(next)) - last.firstIndex,
      };
  }
}
export function clipIndexRuns(runs?: Dynamic, clip?: Dynamic) {
  let [low, high]: Dynamic = [0, runs.length];
  while (low < high) {
    let value = Math.floor((low + high) / 2);
    let value2 = runs[value];
    if (value2 !== undefined && runEnd(value2) <= clip.firstIndex) low = value + 1;
    else high = value;
  }
  let clipped: Dynamic = [];
  for (; low < runs.length; low += 1) {
    let value = runs[low];
    if (value === undefined || value.firstIndex >= runEnd(clip)) break;
    let value2 = Math.max(value.firstIndex, clip.firstIndex);
    clipped.push({
      firstIndex: value2,
      count: Math.min(runEnd(value), runEnd(clip)) - value2,
    });
  }
  return clipped;
}
export function groupsNotInsideCollapsed(groups?: Dynamic) {
  let coveredUntil: Dynamic = 0;
  return groups.filter(({ firstIndex: firstIndex, count: count, isCollapsed: isCollapsed }: Dynamic) => {
    if (firstIndex < coveredUntil) return false;
    if (isCollapsed) coveredUntil = firstIndex + count;
    return true;
  });
}
export function collapsedIndexRuns(groups?: Dynamic) {
  let runs: Dynamic = [];
  for (let { firstIndex: firstIndex, count: count, isCollapsed: isCollapsed } of groupsNotInsideCollapsed(groups) as Dynamic) {
    if (!isCollapsed) continue;
    let last = runs.at(-1);
    if (last !== undefined && last.firstIndex + last.count === firstIndex)
      runs[runs.length - 1] = {
        ...last,
        count: last.count + count,
      };
    else
      runs.push({
        firstIndex: firstIndex,
        count: count,
      });
  }
  return runs;
}
export const NO_ROWS_OUT_OF_VIEW_BY_FILTERS = new (Map as Dynamic)();
export const runEnd = ({ firstIndex: firstIndex, count: count }: Dynamic) => firstIndex + count;
export const NO_OWN_COLLAPSING = new (Map as Dynamic)();
export const withOwnCollapsing = (overrides?: Dynamic, groups?: Dynamic) =>
  overrides.size === 0
    ? groups
    : groups.map(
        (group?: Dynamic) => ({
          ...group,
          isCollapsed: overrides.get(group.groupId) ?? group.isCollapsed,
        }),
      );
export const leadingRunCount = ([firstRun]: Dynamic) => (firstRun?.firstIndex === 0 ? firstRun.count : 0);
export const countInIndexRun = (runs?: Dynamic, clip?: Dynamic) =>
  clipIndexRuns(runs, clip).reduce((total: Dynamic, { count: count }: Dynamic) => total + count, 0);
