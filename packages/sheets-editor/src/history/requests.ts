import type { Dynamic } from '../dynamic.ts';
import { isRecord, isUint32, asArrayOrEmpty } from '../store/json.ts';
import { answerOf, classifyStoreFailure } from '../store/requests.ts';
import type { StoreCall } from '../store/sheet-stream.ts';
import { booleanText } from '../model/cell-text.ts';
export function versionsRequest(before: { firstRevision: number } | null): StoreCall {
  return { route: 'read', request: { kind: 'versions', limit: VERSIONS_PAGE_SIZE, ...(before !== null && { before: before.firstRevision }) } };
}

export type TakeBack = { kind: 'allSince'; revision: number } | { kind: 'ranges'; ranges: readonly { first: number; last: number }[] };

export function editsThatTakeBackRequest(takeBack: TakeBack): StoreCall {
  return takeBack.kind === 'allSince'
    ? { route: 'read', request: { kind: 'editsThatRestore', revision: takeBack.revision } }
    : { route: 'read', request: { kind: 'editsThatUndo', ranges: takeBack.ranges.map(({ first, last }) => ({ first, last })) } };
}

export function cellHistoryRequest({ sheetId, rowId, columnId }: { sheetId: string; rowId: string; columnId: string }): StoreCall {
  return { route: 'read', request: { kind: 'cellHistory', sheetId, r: rowId, c: columnId } };
}

export function rowHistoryRequest({ sheetId, rowId }: { sheetId: string; rowId: string }): StoreCall {
  return { route: 'read', request: { kind: 'rowHistory', sheetId, r: rowId } };
}

export function historyFailureWhy(failure?: Dynamic) {
  let why = HISTORY_FAILURE_WHY.get(failure.word);
  if (why !== undefined) return why;
  if (failure.cause === 'noAnswer') return 'noAnswer';
  return failure.cause === 'storeFailed' && failure.saveOutcome !== 'refused' ? 'busy' : 'refused';
}
export type EditAuthor = { kind: 'agent' } | { kind: 'person'; userId: string };

export function parseEditAuthor(actor: unknown): EditAuthor | null {
  if (!isRecord(actor)) return null;
  if (actor.isAgent === true) return { kind: 'agent' };
  return typeof actor.personId === 'string' && actor.personId !== '' ? { kind: 'person', userId: actor.personId } : null;
}

export function parseVersionRow(row?: Dynamic) {
  if (!isRecord(row)) return null;
  let { revision: revision, firstRevision: firstRevision, at: at2, authors: authors } = row;
  let atMs = typeof at2 === 'string' ? Date.parse(at2) : Number.NaN;
  if (!isUint32(revision) || !isUint32(firstRevision)) return null;
  if (firstRevision < 1 || firstRevision > revision || Number.isNaN(atMs)) return null;
  return {
    revision: revision,
    firstRevision: firstRevision,
    atMs: atMs,
    authors: dedupeAgentAuthors(
      asArrayOrEmpty(authors)
        .map(parseEditAuthor)
        .filter((author?: Dynamic) => author !== null),
    ),
  };
}
export function readVersions(outcome?: Dynamic) {
  let failure = classifyStoreFailure(outcome);
  if (failure !== null)
    return {
      kind: 'notRead',
      why: historyFailureWhy(failure),
    };
  let { rows: rows } = answerOf(outcome) ?? {};
  let versions = asArrayOrEmpty(rows).map(parseVersionRow);
  let inOrder = versions.every(
    (version?: Dynamic, index?: Dynamic) => index === 0 || (version?.revision ?? 0) < (versions[index - 1]?.firstRevision ?? 0),
  );
  let parsed = versions.filter((version?: Dynamic) => version !== null);
  if (!Array.isArray(rows) || parsed.length < versions.length || !inOrder)
    return {
      kind: 'notRead',
      why: 'refused',
    };
  return {
    kind: 'read',
    versions: parsed,
    hasOlder: (parsed.at(-1)?.firstRevision ?? 1) > 1,
  };
}
export function parseHeldContent(content?: Dynamic) {
  if (content === undefined)
    return {
      kind: 'nothing',
    };
  let input = isRecord(content) ? content.input : undefined;
  if (!isRecord(content) || !isRecord(input) || !isHeldContentKind(input.kind)) return null;
  return HELD_CONTENT_READERS[input.kind](input, content);
}
export function parseHistoryChange(row?: Dynamic, readCells?: Dynamic) {
  if (!isRecord(row)) return null;
  let { revision: revision, at: at } = row;
  let atMs = typeof at === 'string' ? Date.parse(at) : Number.NaN;
  let cells = readCells(row);
  if (!isUint32(revision) || revision < 1 || Number.isNaN(atMs) || cells === null) return null;
  return {
    revision: revision,
    atMs: atMs,
    author: parseEditAuthor(row.actor),
    cells: cells,
  };
}
export function readHistoryChanges(outcome?: Dynamic, readCells?: Dynamic) {
  let failure = classifyStoreFailure(outcome);
  if (failure !== null)
    return {
      kind: 'notRead',
      why: CELL_HISTORY_FAILURE_WHY.get(failure.word) ?? historyFailureWhy(failure),
    };
  let { rows: rows, truncated: truncated } = answerOf(outcome) ?? {};
  let parsed = asArrayOrEmpty(rows).map((row?: Dynamic) => parseHistoryChange(row, readCells));
  let inOrder = parsed.every(
    (change?: Dynamic, index?: Dynamic) => index === 0 || (change?.revision ?? 0) < (parsed[index - 1]?.revision ?? 0),
  );
  let changes = parsed.filter((change?: Dynamic) => change !== null);
  let allLeftOut = changes.length === 0 && truncated === true;
  if (!Array.isArray(rows) || changes.length < parsed.length || !inOrder || allLeftOut)
    return {
      kind: 'notRead',
      why: 'refused',
    };
  return {
    kind: 'read',
    changes: changes,
    areEarlierLeftOut: truncated === true,
  };
}
export function readEditsThatTakeBack(outcome?: Dynamic) {
  let failure = classifyStoreFailure(outcome);
  if (failure !== null)
    return {
      kind: 'notRead',
      why: TAKE_BACK_FAILURE_WHY.get(failure.word) ?? historyFailureWhy(failure),
    };
  let answer = answerOf(outcome);
  let { revision, edits } = answer?.kind === 'editsToTakeBack' ? answer : {};
  if (!isUint32(revision) || !Array.isArray(edits))
    return {
      kind: 'notRead',
      why: 'refused',
    };
  return {
    kind: 'read',
    builtOnRevision: revision,
    edits: edits,
  };
}
export function whyRevisionNotLoaded(outcome?: Dynamic) {
  let failure = classifyStoreFailure(outcome);
  if (failure === null) return 'refused';
  return failure.word === 'unknownRevision' ? failure.word : historyFailureWhy(failure);
}
export const VERSIONS_PAGE_SIZE = 50;
export const HISTORY_FAILURE_WHY = new (Map as Dynamic)([
  ['unknownReadKind', 'storeDoesNotKnowHow'],
  ['switchedOff', 'storeDoesNotKnowHow'],
  ['historyDoesNotMatch', 'recordDoesNotMatch'],
  ['historyTookTooLong', 'tookTooLong'],
  ['historyBusy', 'busy'],
]);
export const TAKE_BACK_FAILURE_WHY = new (Map as Dynamic)([
  ['unknownRevision', 'unknownRevision'],
  ['changedSince', 'changedSince'],
  ['tooMuchToTakeBack', 'tooMuch'],
  ['reverseNotAccepted', 'notAccepted'],
]);
export const CELL_HISTORY_FAILURE_WHY = new (Map as Dynamic)([
  ['unknownRow', 'cellIsGone'],
  ['unknownColumn', 'cellIsGone'],
  ['answerTooLarge', 'answerIsTooLarge'],
]);
export const dedupeAgentAuthors = (authors?: Dynamic) =>
  authors.filter(
    ({ kind: kind }: Dynamic, index?: Dynamic) =>
      kind !== 'agent' || authors.findIndex((other?: Dynamic) => other.kind === kind) === index,
  );
export const writtenHeldContent = (text?: Dynamic) =>
  typeof text === 'string'
    ? {
        kind: 'written',
        text: text,
      }
    : null;
export const shownTextHeldContent = ({ value: value }: Dynamic) =>
  isRecord(value) && value.kind === 'text' ? writtenHeldContent(value.value) : null;
export const HELD_CONTENT_READERS = {
  number({ value: value }: Dynamic, { numberIsEditedAs: numberIsEditedAs }: Dynamic) {
    if (numberIsEditedAs !== undefined) return writtenHeldContent(numberIsEditedAs);
    return typeof value === 'number'
      ? {
          kind: 'number',
          value: value,
        }
      : null;
  },
  text: ({ value: value }: Dynamic) => writtenHeldContent(value),
  boolean: ({ value: value }: Dynamic) => (typeof value === 'boolean' ? writtenHeldContent(booleanText(value)) : null),
  formula: (input: Dynamic, { formulaText: formulaText }: Dynamic) => writtenHeldContent(formulaText),
  dropdownOption: (input?: Dynamic, content?: Dynamic) => shownTextHeldContent(content),
  user: (input?: Dynamic, content?: Dynamic) => shownTextHeldContent(content),
  users: (input?: Dynamic, content?: Dynamic) => shownTextHeldContent(content),
  richText: (input?: Dynamic, content?: Dynamic) => shownTextHeldContent(content),
};
export const isHeldContentKind = (kind?: Dynamic) => typeof kind === 'string' && Object.hasOwn(HELD_CONTENT_READERS, kind);
export const readCellHistory = (outcome?: Dynamic, columnId?: Dynamic) =>
  readHistoryChanges(outcome, ({ content: content }: Dynamic) => {
    let held = parseHeldContent(content);
    return held === null
      ? null
      : [
          {
            columnId: columnId,
            held: held,
          },
        ];
  });
export const readRowHistory = (outcome?: Dynamic) =>
  readHistoryChanges(outcome, ({ cells: cells }: Dynamic) => {
    if (!Array.isArray(cells)) return null;
    let parsed = cells.map((cell?: Dynamic) => {
      let held = isRecord(cell) ? parseHeldContent(cell.content) : null;
      let columnId = isRecord(cell) ? cell.c : null;
      return held === null || typeof columnId !== 'string'
        ? null
        : {
            columnId: columnId,
            held: held,
          };
    });
    let cellChanges = parsed.filter((cell?: Dynamic) => cell !== null);
    return cellChanges.length === parsed.length && cellChanges.length > 0 ? cellChanges : null;
  });
