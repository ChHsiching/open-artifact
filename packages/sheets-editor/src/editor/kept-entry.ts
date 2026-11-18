import type { Dynamic } from '../dynamic.ts';
import { plainLooks, FONT_MARKS, fontMarksWhere, doLooksFitText } from './text-looks.ts';
import { listFromValue } from '../ui/cell-list-attributes.ts';
export function parseKeptEntryLooks(savedLooks?: Dynamic, text?: Dynamic) {
  if (!isEntryRecord(savedLooks)) return;
  let { stretches: savedStretches, lists: savedLists } = Array.isArray(savedLooks)
    ? {
        stretches: savedLooks,
        lists: plainLooks(text, []).lists,
      }
    : savedLooks;
  if (!Array.isArray(savedStretches) || !Array.isArray(savedLists)) return;
  let stretches = savedStretches.flatMap((look?: Dynamic) => {
    if (!isEntryRecord(look)) return [];
    let { length: length, marks: marks, link: link } = look;
    if (typeof length !== 'number' || !Number.isInteger(length) || length < 1) return [];
    if (!Array.isArray(marks) || (link !== null && typeof link !== 'string')) return [];
    if (marks.some((mark?: Dynamic) => !FONT_MARKS.some((knownMark?: Dynamic) => knownMark === mark))) return [];
    return [
      {
        length: length,
        marks: fontMarksWhere((mark?: Dynamic) => marks.includes(mark)),
        link: link,
      },
    ];
  });
  let lists = savedLists.flatMap((list?: Dynamic) => listFromValue(list) ?? []);
  let looks = {
    stretches: stretches,
    lists: lists,
  };
  return stretches.length === savedStretches.length && doLooksFitText(looks, text) ? looks : undefined;
}
export function parseKeptEntry(saved?: Dynamic) {
  if (!isEntryRecord(saved) || !isEntryRecord(saved.cellId) || !isEntryRecord(saved.mode)) return null;
  let { sheetId: sheetId, rowId: rowId, columnId: columnId } = saved.cellId;
  let { text: text, textAtStart: textAtStart, typingIn: typingIn, arrowsActOn: arrowsActOn, looks: looks, ...restOfMode } = saved.mode;
  let {
    kind: kind,
    isTypedOverCell: isTypedOverCell,
    mayHoldTextOfOthers: mayHoldTextOfOthers,
    isBegunToListFunctions: isBegunToListFunctions,
    holdsOneLine: holdsOneLine,
    areSignsLeftAsTyped: areSignsLeftAsTyped,
  } = restOfMode;
  let { isExpanded: isExpanded } = restOfMode;
  if (typeof sheetId !== 'string' || typeof rowId !== 'string' || typeof columnId !== 'string') return null;
  if (kind !== 'editing' || typeof text !== 'string' || typeof textAtStart !== 'string') return null;
  if (typingIn !== 'cell' && typingIn !== 'formulaBar') return null;
  if (arrowsActOn !== undefined && arrowsActOn !== 'cells' && arrowsActOn !== 'text') return null;
  if (
    !isTrueOrMissing(isTypedOverCell) ||
    !isTrueOrMissing(mayHoldTextOfOthers) ||
    !isTrueOrMissing(isBegunToListFunctions) ||
    !isTrueOrMissing(holdsOneLine) ||
    !isTrueOrMissing(isExpanded) ||
    !isTrueOrMissing(areSignsLeftAsTyped)
  )
    return null;
  let parsedLooks = parseKeptEntryLooks(looks, text);
  return {
    cellId: {
      sheetId: sheetId,
      rowId: rowId,
      columnId: columnId,
    },
    mode: {
      kind: kind,
      text: text,
      textAtStart: textAtStart,
      typingIn: typingIn,
      ...(parsedLooks !== undefined && {
        looks: parsedLooks,
      }),
      ...(arrowsActOn !== undefined && {
        arrowsActOn: arrowsActOn,
      }),
      ...(isTypedOverCell && {
        isTypedOverCell: isTypedOverCell,
      }),
      ...(mayHoldTextOfOthers && {
        mayHoldTextOfOthers: mayHoldTextOfOthers,
      }),
      ...(isBegunToListFunctions && {
        isBegunToListFunctions: isBegunToListFunctions,
      }),
      ...(holdsOneLine && {
        holdsOneLine: holdsOneLine,
      }),
      ...(isExpanded && {
        isExpanded: isExpanded,
      }),
      ...(areSignsLeftAsTyped && {
        areSignsLeftAsTyped: areSignsLeftAsTyped,
      }),
    },
  };
}
export function takeKeptEntry(getStorage?: Dynamic, wallNowMs?: Dynamic, keepWhenUndated?: Dynamic) {
  try {
    let storage = getStorage();
    let savedText = storage.getItem(KEPT_ENTRY_STORAGE_KEY);
    storage.removeItem(KEPT_ENTRY_STORAGE_KEY);
    if (savedText === null) return null;
    let saved = JSON.parse(savedText);
    let leftAtWallMs = isEntryRecord(saved) ? saved.leftAtWallMs : undefined;
    return (typeof leftAtWallMs === 'number' ? leftAtWallMs + KEPT_ENTRY_MAX_AGE_MS >= wallNowMs : keepWhenUndated) ? parseKeptEntry(saved) : null;
  } catch {
    return null;
  }
}
export function bringBackKeptEntry(store?: Dynamic, wayIn?: Dynamic, keptEntry?: Dynamic) {
  if (wayIn === 'inEntry' && keptEntry !== null)
    store.dispatch({
      kind: 'entryOfPageBeforeFound',
      entry: keptEntry,
    });
}
export function forgetKeptEntry(getStorage?: Dynamic) {
  try {
    getStorage().removeItem(KEPT_ENTRY_STORAGE_KEY);
  } catch {}
}
export function keepEntryWhilePageIsLeft(getStorage?: Dynamic, store?: Dynamic, after?: Dynamic, page?: Dynamic) {
  let lastWritten: Dynamic;
  let hasLeftPage: Dynamic = false;
  let hasLeftAtMs: Dynamic = false;
  let isForgetPending: Dynamic = false;
  let isStopped: Dynamic = false;
  let forget = () => forgetKeptEntry(getStorage);
  let writeEntry = (entryJson?: Dynamic, leftAtWallMs?: Dynamic) => {
    hasLeftAtMs = leftAtWallMs !== undefined;
    try {
      let leftAtPart = leftAtWallMs === undefined ? '' : `,"leftAtWallMs":${leftAtWallMs}`;
      getStorage().setItem(KEPT_ENTRY_STORAGE_KEY, `${entryJson.slice(0, -1)}${leftAtPart}}`);
    } catch {
      forget();
    }
  };
  let keepEntryNow = (mustWrite: Dynamic = false) => {
    if (hasLeftPage && !page.hasCaret()) return;
    hasLeftPage = false;
    let entry = store.entryToKeep();
    if (entry !== null) {
      let entryJson = JSON.stringify(entry);
      if (mustWrite || hasLeftAtMs || entryJson !== lastWritten) writeEntry(entryJson);
      lastWritten = entryJson;
      return;
    }
    if (lastWritten === null || isForgetPending) return;
    isForgetPending = true;
    after(() => {
      isForgetPending = false;
      if (isStopped || store.entryToKeep() !== null || !page.hasCaret()) return;
      lastWritten = null;
      forget();
    });
  };
  let unsubscribers = [
    store.subscribe(() => keepEntryNow()),
    page.onLeftPage(() => {
      hasLeftPage = true;
      if (typeof lastWritten === 'string') writeEntry(lastWritten, page.wallNowMs());
    }),
    page.onCameBackToPage(() => keepEntryNow(true)),
  ];
  keepEntryNow();
  return () => {
    isStopped = true;
    for (let unsubscribe of unsubscribers as Dynamic) unsubscribe();
  };
}
export const KEPT_ENTRY_STORAGE_KEY = 'sheets-entry';
export const isEntryRecord = (value?: Dynamic) => typeof value === 'object' && value !== null;
export const isTrueOrMissing = (value?: Dynamic) => value === true || value === undefined;
export const KEPT_ENTRY_MAX_AGE_MS = 1000;
