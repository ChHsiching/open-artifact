import { TextInput } from '../kit/text-input.tsx';
import { Skeleton } from '../kit/skeleton.tsx';
import { Icon } from '../kit/icon.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { translateMessage, MESSAGE_LOCALE } from '../i18n/messages.ts';
import { importMessages, intoSheetLabel } from '../messages/import.ts';
import {
  importDestinationOf,
  importPlacesLeft,
  destinationWithColumnsLeftOut,
  NOTHING_AS_THE_SHEET_HOLDS,
  importPlanAsShown,
  withoutAsTheSheetHolds,
} from './import-flow.ts';
import { importPlanSoFar, isImportPlanComing, isDestinationQuestionOpen, stoodByHandChanges } from './import-review.ts';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { PANE_SELECT_HEIGHT_CLASSES, PaneRow, PANE_SELECT_TRIGGER_CLASSES, PaneSelectCaret, PaneSelect } from '../ui/side-pane/side-pane.ts';
import { chosenAnswersOf, questionColumnIndexes } from './column-readings.ts';
import { readingsAsTheSheetHolds } from './places.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export let GHOST_GRID_COLUMNS: Dynamic;
export let GHOST_GRID_ROWS: Dynamic;
export function useRenameField({ name: name, onNamed: onNamed, onDone: onDone }: Dynamic) {
  let [draft, setDraft] = React.useState(null);
  let isFinishingRef = React.useRef(false);
  let commitName = () => {
    if (isFinishingRef.current) return;
    let trimmed = draft?.trim() ?? '';
    if (trimmed !== '' && trimmed !== name) onNamed(trimmed);
    setDraft(null);
  };
  return {
    value: draft ?? name,
    onChange: ({ currentTarget: currentTarget }: Dynamic) => setDraft(currentTarget.value),
    onBlur: commitName,
    onKeyDown: (event?: Dynamic) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      if (event.key === 'Escape') setDraft(null);
      else commitName();
      isFinishingRef.current = true;
      onDone?.(event.currentTarget);
      isFinishingRef.current = false;
    },
  };
}
export function namesListedWithMore(names?: Dynamic) {
  let listed = names.length <= MAX_NAMES_LISTED + 1 ? names : names.slice(0, MAX_NAMES_LISTED);
  return {
    names: formatUnitList(listed.map(quotedLabel)),
    moreCount: names.length - listed.length,
  };
}
export function importHowLabel(how?: Dynamic) {
  switch (how) {
    case 'newSheet':
      return translateMessage({
        defaultMessage: 'New sheet',
        id: 'PpRu/+0n5E',
      });
    case 'addRows':
      return importMessages.addRows();
    case 'mergeByKey':
      return importMessages.merge();
    case 'replaceRows':
      return importMessages.replace();
  }
}
export function importHowDescription(how?: Dynamic) {
  switch (how) {
    case 'newSheet':
      return translateMessage({
        defaultMessage: 'Puts the file on a sheet of its own',
        id: 'J2P/Wh7yEy',
      });
    case 'addRows':
      return translateMessage({
        defaultMessage: 'Adds the file’s rows after the sheet’s rows',
        id: '9p1+TJvAR2',
      });
    case 'mergeByKey':
      return translateMessage({
        defaultMessage: 'Updates rows that match and adds the rest',
        id: 'V1EY64x2iV',
      });
    case 'replaceRows':
      return translateMessage({
        defaultMessage: 'Replaces the sheet’s rows with the file’s',
        id: 'CX0sUynxFt',
      });
  }
}
export function sheetToImportInto(open?: Dynamic) {
  let destination = importDestinationOf(open);
  let placesLeft = importPlacesLeft(open);
  return (
    (destination.kind === 'sheet' ? placesLeft.find(({ table: table }: Dynamic) => table.sheetId === destination.sheetId) : undefined) ??
    placesLeft[0]
  );
}
export function keyColumnName(open?: Dynamic, columnIndex?: Dynamic) {
  let destination = importDestinationOf(open);
  let intoColumnId = destination.kind === 'sheet' ? destination.intoColumns[columnIndex] : undefined;
  return (
    sheetToImportInto(open)?.table.columns.find(({ columnId: columnId }: Dynamic) => columnId === intoColumnId)?.name ??
    importPlanSoFar(open).plan.columns[columnIndex]?.name ??
    ''
  );
}
export function keyColumnChoices(open?: Dynamic, place?: Dynamic) {
  let { destination: destination, destinationQuestion: destinationQuestion } = open.plan;
  let optionDestinations = (destinationQuestion?.options ?? []).map((option?: Dynamic) => option.destination);
  let planKeyColumns = [importDestinationOf(open), destination, ...optionDestinations].flatMap(
    (destination2?: Dynamic) =>
      destination2.kind === 'sheet' && destination2.sheetId === place.table.sheetId && destination2.how.kind === 'mergeByKey'
        ? [destination2.how.keyColumnIndex]
        : [],
  );
  return [...new (Set as Dynamic)([...planKeyColumns, ...place.keys.map(({ keyColumnIndex: keyColumnIndex }: Dynamic) => keyColumnIndex)])];
}
export function NewSheetNameField({ name: name, isOff: isOff, onNamed: onNamed }: Dynamic) {
  let labelId = React.useId();
  return jsxs(Fragment, {
    children: [
      jsx(TextInput, {
        fullWidth: true,
        className: PANE_SELECT_HEIGHT_CLASSES.className,
        'aria-labelledby': labelId,
        disabled: isOff,
        autoComplete: 'off',
        autoCorrect: 'off',
        spellCheck: false,
        ...useRenameField({
          name: name,
          onNamed: onNamed,
        }),
      }),
      jsx('span', {
        id: labelId,
        hidden: true,
        children: importSettingsLabels.nameOfNewSheet(),
      }),
    ],
  });
}
export function readingsAsTheSheetHoldsFor(open: Dynamic, reads: WorkbookReads) {
  let destination = destinationWithColumnsLeftOut(open);
  if (destination.kind === 'newSheet') return NOTHING_AS_THE_SHEET_HOLDS;
  let place = importPlacesLeft(open).find(({ table: table }: Dynamic) => table.sheetId === destination.sheetId);
  let columnsLeftAlone = new (Set as Dynamic)([
    ...Object.entries(open.byHand.columns).flatMap(
      ([columnIndex, { reading: reading }]: Dynamic) => (reading === undefined ? [] : [Number(columnIndex)]),
    ),
    ...chosenAnswersOf(open.plan, open.answers).flatMap(
      ({ question: question }: Dynamic) =>
        questionColumnIndexes(question).filter((columnIndex?: Dynamic) => open.columnsAnswered.includes(columnIndex)),
    ),
    ...open.columnsAskedFor,
  ]);
  let keyColumnIndex = place === undefined ? undefined : keyColumnChoices(open, place)[0];
  if (!(keyColumnIndex !== undefined && (destination.intoColumns[keyColumnIndex] ?? null) !== null)) return NOTHING_AS_THE_SHEET_HOLDS;
  let shown = importPlanAsShown(withoutAsTheSheetHolds(open));
  return readingsAsTheSheetHolds(open.table, shown, destination, keyColumnIndex, columnsLeftAlone, reads);
}
export function importHowChoices(open?: Dynamic) {
  let sheet = sheetToImportInto(open);
  return ['newSheet', 'addRows', ...(sheet !== undefined && keyColumnChoices(open, sheet).length > 0 ? ['mergeByKey'] : []), 'replaceRows'];
}
export function ImportDestinationRows({ open: open, isRead = false, onPicked: onPicked, onSheetNamed: onSheetNamed }: Dynamic) {
  let destination = importDestinationOf(open);
  let placesLeft = importPlacesLeft(open);
  let sheet = sheetToImportInto(open);
  let keyColumnOptions = sheet === undefined ? [] : keyColumnChoices(open, sheet);
  let [firstKeyColumn] = keyColumnOptions;
  let isPlanIn = !isImportPlanComing(open);
  let isOff = isRead || !isPlanIn || open.agent.kind === 'isAsked';
  let how = destination.kind === 'newSheet' ? 'newSheet' : destination.how.kind;
  let keyColumnIndex = destination.kind === 'sheet' && destination.how.kind === 'mergeByKey' ? destination.how.keyColumnIndex : null;
  let pick = (how2?: Dynamic, sheetId: Dynamic = sheet?.table.sheetId, keyColumn: Dynamic = keyColumnIndex ?? firstKeyColumn) => {
    if (how2 === 'newSheet')
      return onPicked({
        kind: 'newSheet',
      });
    if (sheetId === undefined) return;
    if (how2 !== 'mergeByKey')
      return onPicked({
        kind: 'sheet',
        sheetId: sheetId,
        how: {
          kind: how2,
        },
      });
    if (keyColumn === undefined) return;
    return onPicked({
      kind: 'sheet',
      sheetId: sheetId,
      how: {
        kind: how2,
        keyColumnIndex: keyColumn,
      },
    });
  };
  let isPickTold = isPlanIn && isDestinationQuestionOpen(open);
  if (!isPlanIn)
    return jsx(PaneRow, {
      label: importSettingsLabels.importAs(),
      children: jsxs('button', {
        type: 'button',
        disabled: true,
        'aria-label': importSettingsLabels.importAs(),
        className: `${PANE_SELECT_TRIGGER_CLASSES.className} ${PANE_SELECT_HEIGHT_CLASSES.className}`,
        children: [
          jsx('span', {
            className: 'min-w-0 flex-1',
            children: jsx(Skeleton, {
              decorative: true,
              as: 'span',
              width: '70%',
              className: 'text-body',
            }),
          }),
          jsx(PaneSelectCaret, {}),
        ],
      }),
    });
  let importAsRow = jsx(PaneRow, {
    label: importSettingsLabels.importAs(),
    hasDot: isPickTold,
    isPointedAt: stoodByHandChanges(open).some(({ kind: kind }: Dynamic) => kind === 'destination'),
    children: jsx(PaneSelect, {
      name: importAsChosenName(importHowLabel(how), isPickTold),
      ...(isPickTold && {
        isSamePickTold: true,
      }),
      isOff: isOff,
      value: how,
      items: importHowChoices(open).map(
        (how2?: Dynamic) => ({
          value: how2,
          label: importHowLabel(how2),
          icon: IMPORT_HOW_ICONS[how2].icon,
          isIconTurned: IMPORT_HOW_ICONS[how2].isIconTurned === true,
          description: importHowDescription(how2),
        }),
      ),
      onChange: pick,
    }),
  });
  return jsxs(Fragment, {
    children: [
      importAsRow,
      how === 'newSheet' &&
        jsx(PaneRow, {
          label: importSettingsLabels.name(),
          isPointedAt: stoodByHandChanges(open).some(({ kind: kind }: Dynamic) => kind === 'sheetName'),
          children: jsx(NewSheetNameField, {
            name: open.newSheet?.name ?? '',
            isOff: isOff,
            onNamed: onSheetNamed,
          }),
        }),
      how !== 'newSheet' &&
        jsx(PaneRow, {
          label: importMessages.into(),
          children: jsx(PaneSelect, {
            name: intoSheetLabel(sheet?.table.name ?? ''),
            ...(isPickTold && {
              isSamePickTold: true,
            }),
            isOff: isOff,
            hasLongRows: true,
            value: sheet?.table.sheetId ?? '',
            items: placesLeft.map(
              ({ table: table, matchedCount: matchedCount }: Dynamic) => ({
                value: table.sheetId,
                label: table.name,
                hint: matchedColumnsLabel(matchedCount, open.table.columnCount),
              }),
            ),
            onChange: (sheetId?: Dynamic) => {
              let place = placesLeft.find(({ table: table }: Dynamic) => table.sheetId === sheetId);
              if (place === undefined) return;
              let [keyColumn] = keyColumnChoices(open, place);
              pick(how === 'mergeByKey' && keyColumn === undefined ? 'addRows' : how, place.table.sheetId, keyColumn);
            },
          }),
        }),
      keyColumnIndex !== null &&
        jsx(PaneRow, {
          label: importSettingsLabels.matchBy(),
          children: jsx(PaneSelect, {
            name: labelAndChosen(importSettingsLabels.matchBy(), keyColumnName(open, keyColumnIndex)),
            ...(isPickTold && {
              isSamePickTold: true,
            }),
            isOff: isOff,
            value: String(keyColumnIndex),
            items: keyColumnOptions.map(
              (columnIndex?: Dynamic) => ({
                value: String(columnIndex),
                label: keyColumnName(open, columnIndex),
              }),
            ),
            onChange: (columnIndex?: Dynamic) => pick('mergeByKey', sheet?.table.sheetId, Number(columnIndex)),
          }),
        }),
    ],
  });
}
export function ImportGhostGrid({ isGray = false }: Dynamic) {
  return jsx('div', {
    'aria-hidden': true,
    className: 'sheet-import-ghost',
    'data-is-gray': isGray || undefined,
    children: GHOST_GRID_CELLS,
  });
}
export function ImportWarningHeadline({ children: children }: Dynamic) {
  return jsxs('p', {
    className: 'm-0 text-body font-medium text-balance text-primary',
    children: [
      jsx('span', {
        className: 'me-xs inline-flex h-[1lh] items-center align-top',
        children: jsx(Icon, {
          name: 'WarningFilled',
          size: 'sm',
        }),
      }),
      children,
    ],
  });
}
export function ImportCannotShow({ headline: headline, wayOn: wayOn }: Dynamic) {
  return jsxs('div', {
    className: 'relative flex min-h-0 flex-1 flex-col overflow-hidden',
    children: [
      jsx(ImportGhostGrid, {
        isGray: true,
      }),
      jsxs('div', {
        className: 'relative m-auto flex flex-col items-center gap-sm px-xl text-center',
        children: [
          jsx(ImportWarningHeadline, {
            children: headline,
          }),
          wayOn !== null &&
            jsx('p', {
              className: 'm-0 text-body text-secondary',
              children: wayOn,
            }),
        ],
      }),
    ],
  });
}
export const summaryByAgentLabel = (summary?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Summary by Agent: {summary}',
      id: 'uveSNKwiRK',
    },
    {
      summary: summary,
    },
  );
export const importSettingsLabels = {
  name: () =>
    translateMessage({
      defaultMessage: 'Name',
      id: '4pND26YoAZ',
    }),
  headings: () =>
    translateMessage({
      defaultMessage: 'Headings',
      id: 'i4RCq6UwPt',
    }),
  noHeadings: () =>
    translateMessage({
      defaultMessage: 'No headings',
      id: 'C0bcU/r2RV',
    }),
  importAs: () =>
    translateMessage({
      defaultMessage: 'Import as',
      id: 'tYHTYRU0cG',
    }),
  leftOut: () =>
    translateMessage({
      defaultMessage: 'Left out',
      id: 'ifkuBfOpqJ',
    }),
  nameOfNewSheet: () =>
    translateMessage({
      defaultMessage: 'Name of the new sheet',
      id: '0Xqu6C19NA',
    }),
  summary: () =>
    translateMessage({
      defaultMessage: 'Summary',
      id: 'lBe/xOYlTv',
    }),
  summaryByAgent: () =>
    translateMessage({
      defaultMessage: 'Summary by Agent',
      id: 'tt67oQyMwo',
    }),
  byAgent: () =>
    translateMessage({
      defaultMessage: 'By Agent',
      id: 'q725UmuovD',
    }),
  notCertain: () =>
    translateMessage({
      defaultMessage: 'Agent wasn’t certain of this one',
      id: 'oISmIkm6Yc',
    }),
  commaDecimal: () =>
    translateMessage({
      defaultMessage: 'Comma decimal',
      id: 'd8rDqVcaiq',
    }),
  periodDecimal: () =>
    translateMessage({
      defaultMessage: 'Period decimal',
      id: 'ImqFStOwMH',
    }),
  aboveTheHeadings: () =>
    translateMessage({
      defaultMessage: 'Above the headings, so it can’t be a row',
      id: 'pTrmByLX3R',
    }),
  matchBy: () =>
    translateMessage({
      defaultMessage: 'Match by',
      id: 'rruIXiLpHo',
    }),
};
export const labelAndChosen = (label?: Dynamic, chosen?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{label}: {chosen}',
      id: 'UQE+W02iZS',
    },
    {
      label: label,
      chosen: chosen,
    },
  );
export const labelAndExample = (label?: Dynamic, example?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{label}, {example}',
      id: '7kha9HJI+B',
    },
    {
      label: label,
      example: example,
    },
  );
export const MAX_NAMES_LISTED = 3;
export const quotedLabel = (label?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '“{label}”',
      id: '7jUVxZKdHl',
    },
    {
      label: label,
    },
  );
export const notCheckedYetLabel = (setting?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{setting} (not checked yet)',
      id: '8qxk+tj/BV',
    },
    {
      setting: setting,
    },
  );
export const formatUnitList = (units?: Dynamic) =>
  new (Intl.ListFormat as Dynamic)(MESSAGE_LOCALE, {
    type: 'unit',
  }).format(units);
export const importLineLabel = (line?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Line {line, number, ::group-off}',
      id: 'B2IQKVKbaZ',
    },
    {
      line: line,
    },
  );
export const lineCountLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {# line} other {{count, number} lines}}',
      id: 'mUK+QMyqHt',
    },
    {
      count: count,
    },
  );
export const moreLinesLeftOutLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {# more line left out} other {{count, number} more lines left out}}',
      id: 'J6lNZIlsDS',
    },
    {
      count: count,
    },
  );
export const matchedColumnsLabel = (matchedCount?: Dynamic, columnCount?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{matchedCount, number} of {columnCount, plural, one {# column matches} other {{columnCount, number} columns match}}',
      id: 'XVvs2pB+kf',
    },
    {
      matchedCount: matchedCount,
      columnCount: columnCount,
    },
  );
export const plusCountLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '+{count, number}',
      id: 'eBy7HukaxC',
    },
    {
      count: count,
    },
  );
export const optionNthLabel = (nth?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Option {nth, number, ::group-off}',
      id: '1GjLqGdE7u',
    },
    {
      nth: nth,
    },
  );
export const IMPORT_HOW_ICONS = {
  newSheet: {
    icon: 'FileAdd',
  },
  addRows: {
    icon: 'TableRowInsertBelow',
  },
  mergeByKey: {
    icon: 'ArrowsIn',
    isIconTurned: true,
  },
  replaceRows: {
    icon: 'ArrowClockwise',
  },
};
export const importAsChosenName = (chosen?: Dynamic, isPickTold?: Dynamic) => {
  let label = labelAndChosen(importSettingsLabels.importAs(), chosen);
  return isPickTold ? notCheckedYetLabel(label) : label;
};
[GHOST_GRID_COLUMNS, GHOST_GRID_ROWS] = [12, 32];
export const GHOST_BAR_WIDTHS = [62, 40, 78, 52, 34, 70, 46];
export const GHOST_GRID_CELLS = Array.from<Dynamic, Dynamic>(
  {
    length: GHOST_GRID_ROWS * GHOST_GRID_COLUMNS,
  },
  (unused?: Dynamic, cellIndex?: Dynamic) =>
    jsx(
      'div',
      {
        className: 'sheet-import-ghost-cell',
        ...(cellIndex < GHOST_GRID_COLUMNS && {
          'data-is-name': true,
        }),
        children: jsx('span', {
          className: 'sheet-import-ghost-bar',
          style: {
            width: `${cellIndex % GHOST_GRID_COLUMNS === 0 ? 40 : GHOST_BAR_WIDTHS[cellIndex % GHOST_BAR_WIDTHS.length]}%`,
          },
        }),
      },
      cellIndex,
    ),
);
