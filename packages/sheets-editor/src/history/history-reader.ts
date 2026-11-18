import type { Dynamic } from '../dynamic.ts';
import { failureOf } from '../store/workbook-node.ts';
import { syncRetryDelayMs } from '../store/workbook-sync.ts';
import {
  editsThatTakeBackRequest,
  readEditsThatTakeBack,
  whyRevisionNotLoaded,
  versionsRequest,
  readVersions,
  cellHistoryRequest,
  readCellHistory,
  rowHistoryRequest,
  readRowHistory,
} from './requests.ts';
import { loadAtRevisionRequest, readLoadedOps, type LoadedOps } from '../store/requests.ts';
import { reportErrorSoftly } from '../engine/loader.ts';
export function createVersionHistoryReader(deps?: Dynamic) {
  let workbookNode: Dynamic = null;
  let changesQueue: Dynamic = Promise.resolve();
  let asItWasQueue: Dynamic = Promise.resolve();
  let cachedVersions = new Map<number, LoadedOps>();
  let keepVersion = (revision: number, loaded: LoadedOps): void => {
    cachedVersions.delete(revision);
    cachedVersions.set(revision, loaded);
    for (let oldRevision of [...cachedVersions.keys()].slice(0, -MAX_CACHED_VERSION_BODIES)) cachedVersions.delete(oldRevision);
  };
  let askNode = async (
    requestFor?: Dynamic,
    readReply?: Dynamic,
    isStillWanted: Dynamic = () => true,
    attempt: Dynamic = 0,
  ): Promise<Dynamic> => {
    if (workbookNode === null)
      return readReply({
        kind: 'notSent',
      });
    let { call, noteFailure } = workbookNode;
    let reply = await call(requestFor());
    let answer = readReply(reply);
    let isAnswerFine = answer.kind === 'read' || answer.why === 'changedSince' || answer.why === 'cellIsGone';
    let failure = isAnswerFine && answer.kind === 'notRead' ? null : failureOf(reply, isAnswerFine);
    if (failure !== null)
      noteFailure({
        ...failure,
        action: 'readHistory',
      });
    if (!(answer.kind === 'notRead' && answer.why === 'busy') || attempt + 1 === MAX_HISTORY_READ_TRIES) return answer;
    await deps.wait(syncRetryDelayMs(attempt));
    return isStillWanted() ? askNode(requestFor, readReply, isStillWanted, attempt + 1) : answer;
  };
  let collectEditsThatTakeBack = (takeBack: Dynamic): Promise<Dynamic> => askNode(() => editsThatTakeBackRequest(takeBack), readEditsThatTakeBack);
  let openAsItWas = async (revision?: Dynamic, isStillWanted?: Dynamic): Promise<Dynamic> => {
    let node = workbookNode;
    if (node === null)
      return {
        kind: 'notRead',
        why: 'noAnswer',
      };
    if (node.openViewOnly === undefined)
      return {
        kind: 'notRead',
        why: 'notOffered',
      };
    let { call, noteFailure } = node;
    let isStillCurrent = () => isStillWanted() && workbookNode === node;
    let whyNotRead: Dynamic = 'notOffered';
    let version = await node.openViewOnly(revision, {
      async loadOps(): Promise<Dynamic> {
        if (!isStillCurrent()) return null;
        let cached = cachedVersions.get(revision);
        if (cached !== undefined) {
          keepVersion(revision, cached);
          return cached;
        }
        let reply = await call(loadAtRevisionRequest(revision));
        let loaded = readLoadedOps(reply);
        let ops = loaded !== null && typeof loaded === 'object' && 'ops' in loaded && loaded.revision === revision ? loaded : null;
        if (ops === null) whyNotRead = whyRevisionNotLoaded(reply);
        else keepVersion(revision, ops);
        let failure = failureOf(reply, ops !== null);
        if (failure !== null)
          noteFailure({
            ...failure,
            action: 'readHistory',
          });
        return loaded === 'pageOutOfDate' ? loaded : ops;
      },
      save: () =>
        Promise.resolve({
          kind: 'notSent',
        }),
      askRevision: () => Promise.resolve(revision),
    });
    if (!isStillCurrent()) version?.end();
    if (!isStillCurrent())
      return {
        kind: 'notRead',
        why: 'calledOff',
      };
    return version === null
      ? {
          kind: 'notRead',
          why: whyNotRead,
        }
      : {
          kind: 'read',
          version: version,
        };
  };
  let asItWas = (revision?: Dynamic, isStillWanted?: Dynamic) => {
    let result = asItWasQueue
      .then(
        () =>
          isStillWanted()
            ? openAsItWas(revision, isStillWanted)
            : {
                kind: 'notRead',
                why: 'calledOff',
              },
      )
      .catch(
        (error?: Dynamic) => (
          reportErrorSoftly(error, 'versionHistory'),
          {
            kind: 'notRead',
            why: 'refused',
          }
        ),
      );
    asItWasQueue = result;
    return result;
  };
  let queueChangesRead = (requestFor?: Dynamic, readReply?: Dynamic, isStillWanted?: Dynamic) => {
    let result = changesQueue.then(
      () =>
        isStillWanted()
          ? askNode(requestFor, readReply, isStillWanted)
          : readReply({
              kind: 'notSent',
            }),
    );
    changesQueue = result;
    return result;
  };
  return {
    workbookOpened(node?: Dynamic) {
      workbookNode = node;
      cachedVersions.clear();
    },
    asItWas: asItWas,
    versions: (before?: Dynamic) => askNode(() => versionsRequest(before ?? null), readVersions),
    editsThatTakeBack: (takeBack?: Dynamic) => collectEditsThatTakeBack(takeBack),
    changesOfCell: (cell?: Dynamic, isStillWanted?: Dynamic) =>
      queueChangesRead(
        () => cellHistoryRequest(cell),
        (reply?: Dynamic) => readCellHistory(reply, cell.columnId),
        isStillWanted,
      ),
    changesOfRow: (row?: Dynamic, isStillWanted?: Dynamic) =>
      queueChangesRead(() => rowHistoryRequest(row), readRowHistory, isStillWanted),
  };
}
export const MAX_CACHED_VERSION_BODIES = 4;
export const MAX_HISTORY_READ_TRIES = 3;
