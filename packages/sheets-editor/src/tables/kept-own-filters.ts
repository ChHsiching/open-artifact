import type { Dynamic } from '../dynamic.ts';
import { ownFiltersToKeep } from './own-filter-actions.ts';
export function parseEveryKept(kept?: Dynamic, parseOne?: Dynamic) {
  if (!Array.isArray(kept)) return null;
  let parsed: Dynamic = [];
  for (let keptItem of kept as Dynamic) {
    let parsedItem = parseOne(keptItem);
    if (parsedItem === null) return null;
    parsed.push(parsedItem);
  }
  return parsed;
}
export function parseKeptRowSpan(kept?: Dynamic) {
  if (!isKeptFilterRecord(kept)) return null;
  let { firstRow: firstRow, lastRow: lastRow } = kept;
  return typeof firstRow === 'string' && typeof lastRow === 'string'
    ? {
        firstRow: firstRow,
        lastRow: lastRow,
      }
    : null;
}
export function parseKeptFilterTable(kept?: Dynamic) {
  if (!isKeptFilterRecord(kept)) return null;
  let {
    sheetId: sheetId,
    firstColumn: firstColumn,
    lastColumn: lastColumn,
    firstRowOfBody: firstRowOfBody,
    lastRowOfBody: lastRowOfBody,
    rowUnderTheBody: rowUnderTheBody,
  } = kept;
  let header = parseKeptRowSpan(kept.header);
  let isHeaderSure = isKeptFilterRecord(kept.header) ? kept.header.isSure : null;
  let runs = parseEveryKept(kept.runs, (keptRun?: Dynamic) => {
    let rowSpan = parseKeptRowSpan(keptRun);
    let role = isKeptFilterRecord(keptRun) ? keptRun.role : null;
    return rowSpan !== null && isKeptRunRole(role)
      ? {
          ...rowSpan,
          role: role,
        }
      : null;
  });
  if (
    typeof sheetId !== 'string' ||
    typeof firstColumn !== 'string' ||
    typeof lastColumn !== 'string' ||
    typeof firstRowOfBody !== 'string' ||
    typeof lastRowOfBody !== 'string' ||
    (rowUnderTheBody !== null && typeof rowUnderTheBody !== 'string') ||
    header === null ||
    typeof isHeaderSure !== 'boolean' ||
    runs === null
  )
    return null;
  return {
    sheetId: sheetId,
    header: {
      ...header,
      isSure: isHeaderSure,
    },
    firstColumn: firstColumn,
    lastColumn: lastColumn,
    firstRowOfBody: firstRowOfBody,
    lastRowOfBody: lastRowOfBody,
    rowUnderTheBody: rowUnderTheBody,
    runs: runs,
  };
}
export function parseKeptFilterColumn(kept?: Dynamic) {
  if (!isKeptFilterRecord(kept)) return null;
  let { c: columnId, name: name, kind: kind } = kept;
  return typeof columnId === 'string' && (name === null || typeof name === 'string') && isKeptColumnKind(kind)
    ? {
        c: columnId,
        name: name,
        kind: kind,
      }
    : null;
}
export function parseKeptFilterTerm(kept?: Dynamic) {
  if (!isKeptFilterRecord(kept)) return null;
  let { c: columnId, asked: asked } = kept;
  return typeof columnId === 'string' && isKeptFilterAsk(asked)
    ? {
        c: columnId,
        asked: asked,
      }
    : null;
}
export function parseKeptAnyOf(kept?: Dynamic) {
  let [firstTerm, ...otherTerms] = parseEveryKept(isKeptFilterRecord(kept) ? kept.anyOf : null, parseKeptFilterTerm) ?? [];
  return firstTerm === undefined
    ? null
    : {
        anyOf: [firstTerm, ...otherTerms],
      };
}
export function parseKeptAllOf(kept?: Dynamic) {
  let [firstAnyOf, ...otherAnyOfs] = parseEveryKept(isKeptFilterRecord(kept) ? kept.allOf : null, parseKeptAnyOf) ?? [];
  return firstAnyOf === undefined
    ? null
    : {
        allOf: [firstAnyOf, ...otherAnyOfs],
      };
}
export function parseKeptSortBy(kept?: Dynamic) {
  let [firstSort, ...otherSorts] =
    parseEveryKept(kept, (keptSort?: Dynamic) => {
      let { c: columnId, direction: direction } = isKeptFilterRecord(keptSort) ? keptSort : {};
      return typeof columnId === 'string' && (direction === 'ascending' || direction === 'descending')
        ? {
            c: columnId,
            direction: direction,
          }
        : null;
    }) ?? [];
  return firstSort === undefined ? null : [firstSort, ...otherSorts];
}
export function parseKeptCellTable(kept?: Dynamic) {
  if (!isKeptFilterRecord(kept)) return null;
  let { firstColumn: firstColumn, lastColumn: lastColumn } = kept;
  let [headerRows, footerRows] = [parseKeptRowSpan(kept.headerRows), parseKeptRowSpan(kept.footerRows)];
  return headerRows !== null && typeof firstColumn === 'string' && typeof lastColumn === 'string' && (footerRows !== null || kept.footerRows === null)
    ? {
        headerRows: headerRows,
        firstColumn: firstColumn,
        lastColumn: lastColumn,
        footerRows: footerRows,
      }
    : null;
}
export function parseKeptOwnFilter(kept?: Dynamic) {
  if (!isKeptFilterRecord(kept)) return null;
  let { cellTableId: cellTableId } = kept;
  let cellTable = parseKeptCellTable(kept.cellTable);
  let liveCellTable = parseKeptCellTable(kept.liveCellTable);
  let table = parseKeptFilterTable(kept.table);
  let columns = parseEveryKept(kept.columns, parseKeptFilterColumn);
  return (cellTableId === null || typeof cellTableId === 'string') &&
    cellTable !== null &&
    liveCellTable !== null &&
    table !== null &&
    columns !== null
    ? {
        cellTableId: cellTableId,
        cellTable: cellTable,
        liveCellTable: liveCellTable,
        table: table,
        columns: columns,
        filter: parseKeptAllOf(kept.filter),
        sortBy: parseKeptSortBy(kept.sortBy),
      }
    : null;
}
export function withKeptFiltersStorage(getStorage?: Dynamic, useStorage?: Dynamic) {
  try {
    return useStorage(getStorage());
  } catch {
    return null;
  }
}
export function writeKeptOwnFilters(getStorage?: Dynamic, viewer?: Dynamic, record?: Dynamic) {
  removeKeptOwnFilters(getStorage);
  withKeptFiltersStorage(
    getStorage,
    (storage?: Dynamic) =>
      storage.setItem(
        KEPT_OWN_FILTERS_STORAGE_KEY,
        JSON.stringify({
          ...record,
          viewer: viewer,
        }),
      ),
  );
}
export function parseKeptFiltersJson(json?: Dynamic) {
  try {
    return json === null ? null : JSON.parse(json);
  } catch {
    return null;
  }
}
export function readKeptOwnFilters(getStorage?: Dynamic, viewer?: Dynamic) {
  let written = parseKeptFiltersJson(
    withKeptFiltersStorage(getStorage, (storage?: Dynamic) => storage.getItem(KEPT_OWN_FILTERS_STORAGE_KEY)),
  );
  return isKeptFilterRecord(written) && written.viewer === viewer
    ? {
        tables: parseEveryKept(written.tables, parseKeptOwnFilter) ?? [],
        written: written,
      }
    : null;
}
export function takeBrowserKeptOwnFilters({ findBrowsers: findBrowsers, wallNowMs: wallNowMs }: Dynamic, viewer?: Dynamic) {
  let kept = readKeptOwnFilters(findBrowsers, viewer);
  if (kept === null) return [];
  let { keptAtMs: keptAtMs, openedUnpainted: openedUnpainted } = kept.written;
  if (
    typeof keptAtMs !== 'number' ||
    Math.abs(wallNowMs() - keptAtMs) >= KEPT_OWN_FILTERS_MAX_AGE_MS ||
    typeof openedUnpainted !== 'number' ||
    openedUnpainted >= MAX_UNPAINTED_OPENS_OF_KEPT_FILTERS
  ) {
    removeKeptOwnFilters(findBrowsers);
    return [];
  }
  if (kept.tables.length > 0)
    writeKeptOwnFilters(findBrowsers, viewer, {
      ...kept.written,
      openedUnpainted: openedUnpainted + 1,
    });
  return kept.tables;
}
export function takeKeptOwnFilters(storages?: Dynamic, viewer?: Dynamic) {
  let keptInTab = readKeptOwnFilters(storages.findTabs, viewer);
  if (viewer !== null && readKeptOwnFilters(storages.findBrowsers, viewer) === null) removeKeptOwnFilters(storages.findBrowsers);
  let tables = keptInTab?.tables ?? (viewer === null ? [] : takeBrowserKeptOwnFilters(storages, viewer));
  writeKeptOwnFilters(storages.findTabs, viewer, {
    tables: [],
    isOpeningWithSome: tables.length > 0,
  });
  return tables;
}
export function clearKeptOwnFilters(storages?: Dynamic) {
  let viewer = storages.viewer();
  let keptInTab = readKeptOwnFilters(storages.findTabs, viewer);
  if (keptInTab === null || keptInTab.tables.length > 0 || keptInTab.written.isOpeningWithSome === true)
    forgetBrowserKeptOwnFilters(storages, viewer);
  writeKeptOwnFilters(storages.findTabs, viewer, {
    tables: [],
  });
}
export function keepOwnFiltersAcrossReloads(storages?: Dynamic, store?: Dynamic, after?: Dynamic) {
  let viewer = storages.viewer();
  let broughtBack = takeKeptOwnFilters(storages, viewer);
  let lastOwnFilters: Dynamic = store.ownFilters();
  let lastTabJson: Dynamic = broughtBack.length > 0 ? null : '[]';
  let lastStamp: Dynamic = keptOwnFiltersStamp(broughtBack);
  let isWritePending: Dynamic = false;
  let isStopped: Dynamic = false;
  let keepInBrowser = (tables?: Dynamic) => {
    let stampBefore = lastStamp;
    lastStamp = keptOwnFiltersStamp(tables);
    let keptInBrowser = readKeptOwnFilters(storages.findBrowsers, viewer);
    let isBrowserCopyCurrent = keptInBrowser !== null && keptOwnFiltersStamp(keptInBrowser.tables) === stampBefore;
    if (viewer === null || (lastStamp === stampBefore && !isBrowserCopyCurrent)) return;
    if (tables.length === 0) return forgetBrowserKeptOwnFilters(storages, viewer);
    writeKeptOwnFilters(storages.findBrowsers, viewer, {
      keptAtMs: storages.wallNowMs(),
      openedUnpainted: 0,
      tables: tables,
    });
  };
  let unsubscribe = store.subscribe(() => {
    if (isWritePending || store.ownFilters() === lastOwnFilters) return;
    isWritePending = true;
    after(() => {
      isWritePending = false;
      if (isStopped || storages.viewer() !== viewer) return;
      lastOwnFilters = store.ownFilters();
      let tables = ownFiltersToKeep({
        ownFilters: lastOwnFilters,
      });
      let tablesJson = JSON.stringify(tables);
      if (tablesJson === lastTabJson) return;
      lastTabJson = tablesJson;
      writeKeptOwnFilters(storages.findTabs, viewer, {
        tables: tables,
      });
      keepInBrowser(tables);
    });
  });
  if (broughtBack.length > 0)
    try {
      store.dispatch({
        kind: 'ownFiltersBroughtBack',
        kept: broughtBack,
      });
    } catch (error: Dynamic) {
      reportError(error);
    }
  return () => {
    isStopped = true;
    unsubscribe();
  };
}
export const KEPT_OWN_FILTERS_STORAGE_KEY = 'sheets-own-filters';
export const KEPT_OWN_FILTERS_MAX_AGE_MS = 2592000000;
export const MAX_UNPAINTED_OPENS_OF_KEPT_FILTERS = 2;
export const KEPT_COLUMN_KINDS = {
  number: true,
  currency: true,
  percent: true,
  date: true,
  fewWords: true,
  checkbox: true,
  text: true,
};
export const KEPT_RUN_ROLES = {
  record: true,
  spacer: true,
  section: true,
  subtotal: true,
  headerAgain: true,
};
export const isKeptFilterRecord = (value?: Dynamic) => typeof value === 'object' && value !== null;
export const isKeptColumnKind = (value?: Dynamic) => typeof value === 'string' && Object.hasOwn(KEPT_COLUMN_KINDS, value);
export const isKeptRunRole = (value?: Dynamic) => typeof value === 'string' && Object.hasOwn(KEPT_RUN_ROLES, value);
export const isKeptFilterAsk = (value?: Dynamic) => isKeptFilterRecord(value) && typeof value.kind === 'string';
export const removeKeptOwnFilters = (getStorage?: Dynamic) =>
  void withKeptFiltersStorage(getStorage, (storage?: Dynamic) => storage.removeItem(KEPT_OWN_FILTERS_STORAGE_KEY));
export const forgetBrowserKeptOwnFilters = ({ findBrowsers: findBrowsers }: Dynamic, viewer?: Dynamic) =>
  void (readKeptOwnFilters(findBrowsers, viewer) !== null && removeKeptOwnFilters(findBrowsers));
export const keptOwnFiltersStamp = (tables?: Dynamic) =>
  JSON.stringify(
    tables.map(
      ({ table: { sheetId: sheetId, firstColumn: firstColumn, header: header }, filter: filter, sortBy: sortBy }: Dynamic) => [
        sheetId,
        [firstColumn, header.firstRow, header.lastRow],
        filter,
        sortBy,
      ],
    ),
  );
