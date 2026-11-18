import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { useRenameField } from './destination.ts';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { ColumnKindMenu, IMPORT_LINE_NUMBER_SELECTOR, LineNumberMenu, readingLabelOfColumn } from './preview-table.ts';
import { nameOfColumnLabel } from './csv-file.ts';
import { importPlanSoFar, openImportQuestionIds, columnsQuestionDecides } from './import-review.ts';
import { dataLineNumbers } from './column-readings.ts';
import { fileLineOfRowNumber } from './picture-lines-and-focus.ts';
import { importColumnsLeftOut } from './bring-in.ts';
import { HEADING_FORMAT_ROOM_PX, measureHeadingTextWidth } from './review-in-dialog.ts';
export function ImportHeadingCell({
  column: column,
  open: open,
  isOnlyColumn: isOnlyColumn,
  isUncertain: isUncertain,
  isNarrow: isNarrow,
  formatInThePlay: formatInThePlay,
  isTabStop: isTabStop2,
  onKindsWanted: onKindsWanted,
  onChangedByHand: onChangedByHand,
}: Dynamic) {
  let { columnIndex: columnIndex, name: columnName } = column;
  let nameFieldRef = React.useRef(null);
  let nameField = useRenameField({
    name: columnName,
    onNamed: (name?: Dynamic) =>
      onChangedByHand?.({
        kind: 'column',
        columnIndex: columnIndex,
        name: name,
      }),
    onDone: (input?: Dynamic) => input.parentElement?.querySelector('button')?.focus(),
  });
  return jsxs(Fragment, {
    children: [
      jsx('span', {
        className: 'sheet-import-heading-format',
        'data-is-uncertain': isUncertain || undefined,
        'data-in-the-play': formatInThePlay ?? undefined,
        children: jsx(ColumnKindMenu, {
          column: column,
          kinds: open.kinds[columnIndex],
          isLeftOut: false,
          mustComeIn: isOnlyColumn,
          isTabStop: isTabStop2,
          onKindsWanted: onKindsWanted,
          onChanged: onChangedByHand,
          nameField: () => nameFieldRef.current ?? undefined,
          showsIconAlone: isNarrow,
          isLeftOpen: isUncertain,
        }),
      }),
      jsx('input', {
        ref: nameFieldRef,
        className: 'sheet-import-heading-name',
        tabIndex: -1,
        'aria-label': nameOfColumnLabel(columnName),
        title: columnName,
        autoComplete: 'off',
        autoCorrect: 'off',
        spellCheck: false,
        readOnly: onChangedByHand === null,
        ...nameField,
      }),
    ],
  });
}
export function rovingHeadingTabStop(headingsRow?: Dynamic, focusTarget?: Dynamic) {
  let caps = [...headingsRow.querySelectorAll(HEADING_CAP_SELECTOR)];
  let tabStopCap =
    caps.find((input?: Dynamic) => input === focusTarget) ?? caps.find((input?: Dynamic) => input.tabIndex === 0) ?? caps[0];
  for (let cap of caps as Dynamic) cap.tabIndex = cap === tabStopCap ? 0 : -1;
}
export function headingIndexForKey({ key: key, target: target }: Dynamic, columnCount?: Dynamic) {
  let cap = target instanceof Element && target.matches(HEADING_CAP_SELECTOR) ? target.closest(`[${COLUMN_DRAWN_ATTRIBUTE}]`) : null;
  let columnNumber = Number(cap?.getAttribute(COLUMN_DRAWN_ATTRIBUTE) ?? Number.NaN);
  if (Number.isNaN(columnNumber)) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return columnCount - 1;
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
  return Math.max(0, Math.min(columnCount - 1, columnNumber + (key === 'ArrowRight' ? 1 : -1)));
}
export function ImportRowNumbers(props?: Dynamic) {
  let { open: open, picture: picture, lastRow: lastRow, place: place, zoom: zoom, onChangedByHand: onChangedByHand } = props;
  let { plan: plan } = importPlanSoFar(open);
  let tableRows = React.useMemo(() => dataLineNumbers(open.table, plan), [open.table, plan]);
  let headingRowNumber = picture.rowsDrawn.find(
    ({ rowNumber: rowNumber }: Dynamic) => rowNumber <= lastRow && fileLineOfRowNumber(plan.headerLine, tableRows, rowNumber) !== null,
  )?.rowNumber;
  return jsx('div', {
    role: 'presentation',
    className: 'sheet-import-numbers',
    onKeyDownCapture: (event?: Dynamic) => {
      let step = (
        {
          ArrowUp: -1,
          ArrowDown: 1,
        } as Dynamic
      )[event.key];
      if (step === undefined || !(event.target instanceof HTMLElement)) return;
      let rowButtons = [...event.currentTarget.querySelectorAll(IMPORT_LINE_NUMBER_SELECTOR)].toSorted(
        (left?: Dynamic, right?: Dynamic) => Number(left.dataset.line) - Number(right.dataset.line),
      );
      let nextRowButton = rowButtons[rowButtons.indexOf(event.target) + step];
      if (!event.target.matches(IMPORT_LINE_NUMBER_SELECTOR)) return;
      event.preventDefault();
      event.stopPropagation();
      nextRowButton?.focus({
        preventScroll: true,
      });
    },
    style: {
      left: place.left,
      top: place.top + picture.body.top * zoom,
      width: picture.body.left * zoom,
      height: picture.body.height * zoom,
      ...importZoomStyle(zoom),
    },
    children: picture.rowsDrawn.map(({ rowNumber: rowNumber, top: top, height: height }: Dynamic) => {
      let isFirstRow = rowNumber === 1;
      let headingLine = fileLineOfRowNumber(plan.headerLine, tableRows, rowNumber);
      return headingLine === null || rowNumber > lastRow
        ? null
        : jsx(
            'div',
            {
              className: 'sheet-import-number',
              'data-is-long': rowNumber >= 1000 || undefined,
              'data-is-frozen': isFirstRow || undefined,
              style: {
                top: top * zoom,
                height: height * zoom,
                ...(isFirstRow && {
                  zIndex: 1,
                }),
              },
              children: jsx(LineNumberMenu, {
                rowNumber: rowNumber,
                line: headingLine,
                becomes: isFirstRow ? 'names' : 'row',
                isLastRow: headingLine === tableRows.at(-1),
                isOnlyRow: tableRows.length === 1,
                isTabStop: rowNumber === headingRowNumber,
                onChanged: onChangedByHand,
              }),
            },
            rowNumber,
          );
    }),
  });
}
export function formatsInThePlay(columnIndexes: Dynamic, { revealed: revealed, read: read }: Dynamic) {
  if (revealed === null) return columnIndexes.map(() => null);
  let firstUnread = columnIndexes.find((input?: Dynamic) => input >= revealed);
  return columnIndexes.map((columnPosition?: Dynamic) => {
    if (columnPosition < revealed) return 'hasCome';
    return columnPosition === firstUnread && columnPosition < read ? 'isNext' : 'isToCome';
  });
}
export function ImportHeadingsRow({
  open: open,
  picture: picture,
  place: place,
  zoom: zoom,
  columnsRevealed: columnsRevealed,
  columnsUnfolded: columnsUnfolded,
  onKindsWanted: onKindsWanted,
  onChangedByHand: onChangedByHand,
  onColumnWanted: onColumnWanted,
}: Dynamic) {
  let planSoFar = importPlanSoFar(open);
  let columnsShown = React.useMemo(() => {
    let { plan: plan, preview: preview } = importPlanSoFar(open);
    let leftOutColumns = new (Set as Dynamic)(importColumnsLeftOut(open, plan));
    return preview.columns.filter(
      ({ columnIndex: columnIndex }: Dynamic) => !leftOutColumns.has(columnIndex) || columnsUnfolded.includes(columnIndex),
    );
  }, [open, columnsUnfolded]);
  let headingsRowRef = React.useRef(null);
  let focusAfterRef = React.useRef(null);
  React.useLayoutEffect(() => {
    if (headingsRowRef.current !== null) rovingHeadingTabStop(headingsRowRef.current, null);
    if (focusAfterRef.current === null) return;
    let capToFocus = headingCapOfColumn(headingsRowRef.current, focusAfterRef.current);
    if (capToFocus === null) return;
    focusAfterRef.current = null;
    capToFocus.focus({
      preventScroll: true,
    });
  });
  let firstRow = picture.rowsDrawn.find(({ rowNumber: rowNumber }: Dynamic) => rowNumber === 1);
  if (firstRow === undefined) return null;
  let canChangeHeadings = !planSoFar.isAwaited && columnsRevealed === null && open.agent.kind !== 'isAsked';
  let formatOfColumn = formatsInThePlay(
    columnsShown.map(({ columnIndex: columnIndex }: Dynamic) => columnIndex),
    {
      revealed: columnsRevealed,
      read: planSoFar.isAwaited ? planSoFar.columnsReadCount : planSoFar.plan.columns.length,
    },
  );
  let openQuestionIds = new (Set as Dynamic)(openImportQuestionIds(open));
  let uncertainColumns = new (Set as Dynamic)(
    planSoFar.plan.questions
      .filter(({ id: id }: Dynamic) => openQuestionIds.has(id))
      .flatMap((input?: Dynamic) => columnsQuestionDecides(input)),
  );
  return jsx('div', {
    ref: headingsRowRef,
    role: 'presentation',
    className: 'sheet-import-headings',
    style: {
      left: place.left + picture.body.left * zoom,
      top: place.top,
      width: picture.body.width * zoom,
      height: (picture.body.top + firstRow.top + firstRow.height) * zoom,
      ...headingCapsHeightStyle(picture.body.top * zoom),
      ...importZoomStyle(zoom),
    },
    onKeyDownCapture: (event?: Dynamic) => {
      let columnNumber = headingIndexForKey(event, columnsShown.length);
      if (columnNumber === null) return;
      event.preventDefault();
      event.stopPropagation();
      let cap = headingCapOfColumn(event.currentTarget, columnNumber);
      focusAfterRef.current = cap === null ? columnNumber : null;
      setTimeout(() => void (focusAfterRef.current = null), 300);
      cap?.focus({
        preventScroll: true,
      });
      onColumnWanted(columnNumber);
    },
    onFocusCapture: ({ currentTarget: currentTarget, target: target }: Dynamic) => rovingHeadingTabStop(currentTarget, target),
    children: picture.columnHeaders.map(({ columnNumber: columnNumber, left: left, width: width }: Dynamic) => {
      let column = columnsShown[columnNumber - 1];
      return column === undefined
        ? null
        : jsx(
            'div',
            {
              className: 'sheet-import-heading',
              style: {
                left: left * zoom,
                width: width * zoom - 1,
              },
              ...{
                [COLUMN_DRAWN_ATTRIBUTE]: columnNumber - 1,
              },
              children: jsx(ImportHeadingCell, {
                formatInThePlay: formatOfColumn[columnNumber - 1] ?? null,
                column: column,
                open: open,
                isOnlyColumn: columnsShown.length - columnsUnfolded.length === 1,
                isUncertain: uncertainColumns.has(column.columnIndex),
                isNarrow: width < HEADING_FORMAT_ROOM_PX + measureHeadingTextWidth(readingLabelOfColumn(column)),
                isTabStop: column === columnsShown[0],
                onKindsWanted: onKindsWanted,
                onChangedByHand: canChangeHeadings && !columnsUnfolded.includes(column.columnIndex) ? onChangedByHand : null,
              }),
            },
            column.columnIndex,
          );
    }),
  });
}
export const PICTURE_ORIGIN = {
  left: 0,
  top: 0,
};
export const HEADING_CAP_SELECTOR = '.sheet-import-cap';
export const headingCapsHeightStyle = (heightPx?: Dynamic) => ({
  '--sheet-import-caps-height': `${heightPx}px`,
});
export const importZoomStyle = (zoom?: Dynamic) => ({
  '--sheet-import-zoom': String(zoom),
});
export const COLUMN_DRAWN_ATTRIBUTE = 'data-column-drawn';
export const headingCapOfColumn = (headingsRow?: Dynamic, columnDrawn?: Dynamic) =>
  headingsRow?.querySelector(`[${COLUMN_DRAWN_ATTRIBUTE}="${columnDrawn}"] ${HEADING_CAP_SELECTOR}`) ?? null;
