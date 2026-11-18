import type { Dynamic } from '../dynamic.ts';
import { listCellsChangedBetween } from './changes-by-agent.ts';
export function runsOfConsecutive(indices?: Dynamic) {
  let runs: Dynamic = [];
  for (let index of indices as Dynamic) {
    let lastRun = runs.at(-1);
    if (lastRun?.last === index - 1) lastRun.last = index;
    else
      runs.push({
        first: index,
        last: index,
      });
  }
  return runs;
}
export function createTurnChangesTracker(turn?: Dynamic, now: Dynamic = Date.now) {
  let pendingRevisions = new (Set as Dynamic)();
  let changedCellsBySheet = new (Map as Dynamic)();
  let turnRevisions: Dynamic = [];
  let editsAfterTurn: Dynamic = [];
  let lastMissAtMs: Dynamic = Number.NEGATIVE_INFINITY;
  let statedRevision: Dynamic = null;
  let loadedRevision: Dynamic = 0;
  let turnEndedAtMs: Dynamic = null;
  let turnSeenFromStart: Dynamic = false;
  let mayHaveMissed: Dynamic = false;
  let hasEdits: Dynamic = false;
  let cellsAreComplete: Dynamic = false;
  let dropCells = () => void (cellsAreComplete = false);
  let isWithinTurn = () => turn.isWorking() || (turnEndedAtMs !== null && isWithinTurnSettle(turnEndedAtMs, now()));
  let noteMissedChanges = () => {
    dropCells();
    lastMissAtMs = now();
    if (isWithinTurn()) mayHaveMissed = true;
  };
  let isTurnSeenWhole = () => (turnEndedAtMs === null ? turn.isTurnSeenFromItsStart() : turnSeenFromStart);
  let areCellsKnown = () => cellsAreComplete && isTurnSeenWhole();
  let wasWorking: Dynamic = turn.isWorking();
  turn.onChanged(() => {
    let isWorking = turn.isWorking();
    let [hasStarted, hasEnded] = [isWorking && !wasWorking, !isWorking && wasWorking];
    wasWorking = isWorking;
    if (hasEnded) {
      turnSeenFromStart = turn.isTurnSeenFromItsStart();
      turnEndedAtMs = now();
    }
    if (!hasStarted) return;
    pendingRevisions.clear();
    changedCellsBySheet.clear();
    turnEndedAtMs = null;
    let editsInSettle = editsAfterTurn.filter(({ atMs: atMs }: Dynamic) => isWithinTurnSettle(atMs, now()));
    mayHaveMissed = isWithinTurnSettle(lastMissAtMs, now()) || editsInSettle.length < editsAfterTurn.length;
    turnRevisions = editsInSettle.map(({ revision: revision }: Dynamic) => revision);
    editsAfterTurn = [];
    hasEdits = turnRevisions.length > 0;
    cellsAreComplete = !hasEdits;
  });
  return {
    streamChanged: noteMissedChanges,
    changesMayBeMissed: noteMissedChanges,
    revisionStated(revision?: Dynamic, isNext?: Dynamic) {
      if (!(isNext ? revision - 1 === statedRevision : revision <= (statedRevision ?? -1))) noteMissedChanges();
      statedRevision = Math.max(statedRevision ?? 0, revision);
    },
    editByAgentStreamed(revision?: Dynamic, isOfThisTurn?: Dynamic) {
      if (!turn.isWorking()) {
        if (!isOfThisTurn) return;
        if (isWithinTurn()) mayHaveMissed = true;
        editsAfterTurn = editsAfterTurn.filter(({ atMs: atMs }: Dynamic, index?: Dynamic) => index === 0 || isWithinTurnSettle(atMs, now()));
        if (revision > (editsAfterTurn.at(-1)?.revision ?? 0))
          editsAfterTurn.push({
            revision: revision,
            atMs: now(),
          });
        else noteMissedChanges();
        return;
      }
      hasEdits = true;
      if (!isOfThisTurn) dropCells();
      else if (revision > (turnRevisions.at(-1) ?? 0)) turnRevisions.push(revision);
      else noteMissedChanges();
      if (revision > loadedRevision) pendingRevisions.add(revision);
      else noteMissedChanges();
    },
    editsOfOthersMade(edits?: Dynamic, workbookBefore?: Dynamic, workbookAfter?: Dynamic) {
      let matchedCount = edits.filter(({ revision: revision }: Dynamic) => pendingRevisions.delete(revision)).length;
      if (matchedCount === 0 || !areCellsKnown()) return;
      let changedCells =
        workbookBefore === null || matchedCount < edits.length ? null : listCellsChangedBetween(workbookBefore, workbookAfter);
      if (changedCells === null) dropCells();
      for (let cell of (changedCells ?? []) as Dynamic) {
        let sheetCells = changedCellsBySheet.get(cell.sheetId) ?? new (Map as Dynamic)();
        changedCellsBySheet.set(cell.sheetId, sheetCells.set(`${cell.rowId} ${cell.columnId}`, cell));
      }
    },
    caughtUpByLoad({ revisionBefore: revisionBefore, revision: revision }: Dynamic) {
      loadedRevision = Math.max(loadedRevision, revision);
      for (let pendingRevision of pendingRevisions as Dynamic) {
        if (pendingRevision <= revisionBefore || pendingRevision > revision) continue;
        pendingRevisions.delete(pendingRevision);
        dropCells();
      }
    },
    changedInTurn() {
      if (!hasEdits) return null;
      let editRuns = runsOfConsecutive(turnRevisions);
      let othersInterleaved = pendingRevisions.size > 0 || loadedRevision > (statedRevision ?? 0);
      let edits =
        !mayHaveMissed && !othersInterleaved && isTurnSeenWhole() && editRuns.length > 0 && editRuns.length <= MAX_TURN_EDIT_RUNS ? editRuns : null;
      if (!areCellsKnown() || othersInterleaved)
        return {
          cellsBySheet: null,
          edits: edits,
        };
      let cellEntries = Array.from<Dynamic, Dynamic>(
        changedCellsBySheet,
        ([sheetId, cells]: Dynamic) => [sheetId, Array.from<Dynamic>(cells.values())],
      );
      return {
        cellsBySheet: new (Map as Dynamic)(cellEntries),
        edits: edits,
      };
    },
  };
}
export const MAX_TURN_EDIT_RUNS = 64;
export const TURN_SETTLE_MS = 5000;
export const isWithinTurnSettle = (atMs?: Dynamic, nowMs2?: Dynamic) => nowMs2 - atMs <= TURN_SETTLE_MS;
export const withTurnTakeBackGuard = (versionHistory?: Dynamic, changedInTurn?: Dynamic) => ({
  ...versionHistory,
  editsThatTakeBack: (request?: Dynamic) =>
    request.kind === 'only' && (changedInTurn()?.edits ?? null) === null
      ? Promise.resolve({
          kind: 'notRead',
          why: 'refused',
        })
      : versionHistory.editsThatTakeBack(request),
});
