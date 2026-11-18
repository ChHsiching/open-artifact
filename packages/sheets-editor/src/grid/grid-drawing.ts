import { Checkbox } from '../kit/checkbox.tsx';
import { Surface } from '../kit/surface.tsx';
import { Tooltip, TooltipGroup } from '../kit/tooltip.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import {
  ariaIndex,
  ariaRowIndexText,
  ariaColIndexText,
  textPaintStyle,
  referenceTintStyle,
  AnnounceActiveCellContext,
  ACTIVE_CELL_ADDRESS_ID,
  SELECTION_SUMMARY_ID,
  BlankCellWordsContext,
  JUSTIFY_BY_ALIGNMENT,
  ALIGN_ITEMS_BY_VERTICAL,
  TEXT_TINT_COLORS,
  cellFontStyle,
  textMarksStyle,
  textFadeStyle,
  wrappedTextLineStyle,
  importMarkDelayStyle,
  textClearanceStyle,
  whiteOwedStyle,
  cutByViewStyle,
  fillPaintStyle,
  WordsForScreenReader,
  TextThatRunsOn,
  LinkAddressOrGithubChip,
  PeopleChips,
  CellChip,
  fadesFromRightButton,
} from './cell-drawing.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { preventMouseDownDefault, IS_APPLE_PLATFORM } from '../ui/dom-events.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { keyOfLine, NO_LINE_KEYS, LIST_KEY_SUFFIX } from './line-keys.ts';
import { clipBoxToShown } from './view-boxes.ts';
import {
  zoomedEditorOffset,
  zoomedEditorMargin,
  unzoomedEditorWidth,
  cellTextInsets,
  listIndentOfLevel,
  textOverflowAtSides,
} from './cell-metrics.ts';
import { rowHeightForLines, firstLineLeading, nextLineHeight } from './cell-metrics-values.ts';
import { bandClipPath, groupIndexAt, useLinesSlide, createSlideTold } from './lines-slide.ts';
import { useSheenDelayStyle, ChangeByAgentMark } from '../agent/changes-by-agent-marks.ts';
import { NO_FLAGS_HIDDEN } from '../presence/flags-at-pointer.ts';
import { IS_IOS_BROWSER } from './cell-drawing-values.ts';
import { columnLetters } from '../model/a1-references.ts';
import { LINK_DESCRIPTION_ID, linksInTextDescriptionId, githubLinkFace, CellLinkSpan, LINK_ADDRESS_ID } from '../links/cell-links-view.ts';
import { linkCountLabel, selectionSummaryText } from '../i18n/status-labels.ts';
import { FlagsAtRest } from '../presence/name-flags.ts';
import { foldedFlagsCountText } from '../i18n/menu-labels.ts';
import { AgentAtWork } from '../agent/agent-at-work.ts';
import { listAttributesOf } from '../ui/cell-list-attributes.ts';
import { checkedStateWords } from '../messages/import.ts';
import { MAX_LINKS_IN_TEXT, groupLinkParts } from '../links/text-links.ts';
import { agentFixLabel } from '../i18n/formula-fix-labels.ts';
import { checkboxCellLabel } from '../i18n/format-labels.ts';
import { flattenLineBreaks, flattenLineBreaksAcrossParts } from './text-overflow.ts';
import { levelInList } from '../model/cell-values.ts';
import { ERROR_DESCRIPTION_ID } from '../messages/formula-errors.ts';
import { turnsChipsWhite } from '../format/cell-colors.ts';
import { MENU_CARETS } from '../ui/menu-trigger.ts';
import { flagTop } from '../presence/flags.ts';
export function cellPositionOfElement(element?: Dynamic) {
  let cellElement = element.closest('[role="gridcell"]');
  let indexTexts = [
    cellElement?.getAttribute('aria-rowindex') ?? cellElement?.closest('[role="row"]')?.getAttribute('aria-rowindex'),
    cellElement?.getAttribute('aria-colindex'),
  ];
  let [rowIndex = Number.NaN, columnIndex = Number.NaN] = indexTexts.map(
    (indexText?: Dynamic) => Number(indexText ?? undefined) - ariaIndex(1),
  );
  return Number.isNaN(rowIndex) || Number.isNaN(columnIndex)
    ? null
    : {
        rowIndex: rowIndex,
        columnIndex: columnIndex,
      };
}
export function CellCheckbox({ checkbox: checkbox }: Dynamic) {
  let { isChecked: isChecked, middleFromLeft: middleFromLeft, middleFromTop: middleFromTop, canBeChanged: canBeChanged } = checkbox;
  return jsx('span', {
    role: 'presentation',
    'aria-hidden': true,
    className: 'sheet-checkbox',
    onMouseDown: preventMouseDownDefault,
    'data-can-be-changed': canBeChanged || undefined,
    style: {
      left: middleFromLeft,
      top: middleFromTop,
    },
    children: jsx(Checkbox, {
      checked: isChecked,
      animated: true,
      tabIndex: -1,
      'aria-label': sheetMessages.checkboxCells(),
    }),
  });
}
export function areCellPropsEqual(before?: Dynamic, after?: Dynamic) {
  return (
    before.partsWithLinks.length === after.partsWithLinks.length &&
    before.partsWithLinks.every((part?: Dynamic, index?: Dynamic) => isSameLinkPart(part, after.partsWithLinks[index])) &&
    before.linesInTextBox.length === after.linesInTextBox.length &&
    before.linesInTextBox.every((line?: Dynamic, index?: Dynamic) => line === after.linesInTextBox[index]) &&
    before.otherPeople.length === after.otherPeople.length &&
    before.otherPeople.every((person?: Dynamic, index?: Dynamic) => isSamePerson(person, after.otherPeople[index])) &&
    (before.checkbox === null || after.checkbox === null
      ? before.checkbox === after.checkbox
      : shallowEqualExcept(before.checkbox, after.checkbox)) &&
    shallowEqualExcept(before, after, ['linesInTextBox', 'otherPeople', 'checkbox', 'partsWithLinks'])
  );
}
export function partsByLine(parts?: Dynamic) {
  let lines = [
    {
      breakBefore: null,
      ofLine: [],
    },
  ];
  for (let part of parts)
    if (part.text === '\n')
      lines.push({
        breakBefore: part,
        ofLine: [],
      });
    else lines.at(-1)?.ofLine.push(part);
  return lines;
}
export function GridRow(props?: Dynamic) {
  let { row: row, body: body, density: density, cellsAsBefore: cellsAsBefore, isNumberUnderHandle: isNumberUnderHandle } = props;
  let arePlacesHeld = props.arePlacesHeld === true && !row.isBehindBars;
  return jsxs('div', {
    role: 'row',
    'aria-hidden': row.isBehindBars || undefined,
    'aria-rowindex': ariaIndex(row.rowNumber),
    ...ariaRowIndexText(row.headerText),
    'aria-label': props.isNamed === true ? row.headerText : undefined,
    className: 'sheet-row',
    'data-row': row.key,
    style: {
      top: body.top + row.top,
      height: row.height,
    },
    children: [
      arePlacesHeld &&
        row.isNumberBehindBars &&
        jsx(AriaPlaceKeeper, {
          role: 'rowheader',
        }),
      jsx('div', {
        role: 'rowheader',
        'aria-hidden': row.isNumberBehindBars || undefined,
        'aria-colindex': 1,
        ...ariaRowIndexText(row.headerText),
        className: row.isActive ? 'sheet-row-header is-active' : 'sheet-row-header',
        'data-is-frozen': row.isFrozen || undefined,
        'data-is-under-handle': isNumberUnderHandle === true || undefined,
        style: {
          width: body.left,
          paddingTop: row.outOfViewAbove,
          paddingBottom: row.outOfViewBelow,
        },
        children: row.headerText,
      }),
      row.cells
        .filter(({ cornersOfTable: cornersOfTable }: Dynamic) => cornersOfTable !== null)
        .map(
          ({
            key: key,
            left: left,
            width: width,
            top: top,
            height: height,
            frozenBy: frozenBy,
            hiddenAtLeft: hiddenAtLeft,
            hiddenAtTop: hiddenAtTop,
          }: Dynamic) =>
            jsx(
              'div',
              {
                'aria-hidden': true,
                className: 'sheet-under-corner-of-table',
                'data-frozen-by': frozenBy ?? undefined,
                style: {
                  left: body.left + left,
                  width: width,
                  top: top,
                  height: height,
                  ...clipInsetStyle({
                    left: hiddenAtLeft,
                    top: hiddenAtTop,
                    right: 0,
                    bottom: 0,
                  }),
                },
              },
              `under ${key}`,
            ),
        ),
      row.cells.flatMap(
        ({ key: key, ...input }: Dynamic) => [
          arePlacesHeld &&
            input.isBehindBars &&
            jsx(
              AriaPlaceKeeper,
              {
                role: 'gridcell',
              },
              `${key}-held`,
            ),
          jsx(
            GridCell,
            {
              bodyLeft: body.left,
              density: density,
              ...input,
            },
            keyOfLine(
              key,
              props.keysOfColumns ?? NO_LINE_KEYS,
              input.opensDropdownList || input.opensPeopleList || input.opensCalendar ? LIST_KEY_SUFFIX : undefined,
            ),
          ),
        ],
      ),
      cellsAsBefore.map(({ keyOfMark: keyOfMark, goesAfterMs: goesAfterMs, cell: { key: input, ...input2 } }: Dynamic) => {
        let match = row.cells.find((input3?: Dynamic) => input3.key === input);
        return (
          match !== undefined &&
          jsx(
            'div',
            {
              'aria-hidden': true,
              inert: true,
              className: 'sheet-cell-as-before',
              'data-mark': keyOfMark,
              'data-goes-after-ms': goesAfterMs,
              children: jsx(GridCell, {
                bodyLeft: body.left,
                density: density,
                ...input2,
                elementId: null,
                isActive: match.isActive,
                left: match.left,
                width: match.width,
                top: match.top,
                height: match.height,
                frozenBy: match.frozenBy,
                textLeft: match.left + (input2.textLeft - input2.left),
                textWidth: match.width + (input2.textWidth - input2.width),
              }),
            },
            `${input} ${keyOfMark}`,
          )
        );
      }),
    ],
  });
}
export function ColumnHeaderRow(props?: Dynamic) {
  let { columnHeaders: columnHeaders, body: body, keysOfColumns: keysOfColumns = NO_LINE_KEYS } = props;
  return jsxs('div', {
    role: 'row',
    'aria-rowindex': 1,
    className: 'sheet-header-row',
    style: {
      height: body.top,
    },
    children: [
      jsx('div', {
        role: 'columnheader',
        'aria-colindex': 1,
        className: 'sheet-corner',
        style: {
          width: body.left,
        },
        children: jsx('span', {
          className: 'sr-only',
          children: sheetMessages.rowNumbers(),
        }),
      }),
      columnHeaders.map(
        ({ key: key, text: text, columnNumber: columnNumber, left: left, width: width, isActive: isActive, isFrozen: isFrozen }: Dynamic) =>
          jsx(
            'div',
            {
              role: 'columnheader',
              'aria-colindex': ariaIndex(columnNumber),
              ...ariaColIndexText(text),
              className: isActive ? 'sheet-column-header is-active' : 'sheet-column-header',
              'data-is-frozen': isFrozen || undefined,
              style: {
                left: body.left + left,
                width: width,
              },
              children: text,
            },
            keyOfLine(key, keysOfColumns),
          ),
      ),
    ],
  });
}
export function EndOfFrozenLines(props?: Dynamic) {
  let { isOf: isOf, end: end, crossedBy = null, isHeld: isHeld, body: body } = props;
  if (end === null) return null;
  let gapStyle =
    crossedBy === null
      ? {}
      : {
          '--sheet-gap-in-line-at': `${crossedBy.at - 1}px`,
        };
  let [lineBox, shadowBox] =
    isOf === 'rows'
      ? [
          {
            top: body.top + end.at,
            left: body.left,
            width: end.length,
          },
          {
            top: body.top + end.at,
            left: 0,
            width: body.left,
          },
        ]
      : [
          {
            left: body.left + end.at,
            top: body.top,
            height: end.length,
          },
          {
            left: body.left + end.at,
            top: 0,
            height: body.top,
          },
        ];
  return jsxs(Fragment, {
    children: [
      jsx('div', {
        'aria-hidden': true,
        className: 'sheet-end-of-frozen',
        'data-is-of': isOf,
        'data-is-over-cells': end.isOverCells || undefined,
        'data-is-held': isHeld || undefined,
        'data-has-gap': crossedBy !== null || undefined,
        style: {
          ...lineBox,
          ...gapStyle,
        },
      }),
      jsx('div', {
        'aria-hidden': true,
        className: 'sheet-end-of-frozen',
        'data-is-of': isOf,
        'data-is-on-headers': true,
        'data-is-over-cells': end.isOverCells || undefined,
        'data-is-held': isHeld || undefined,
        style: shadowBox,
      }),
    ],
  });
}
export function FreezeBar(props?: Dynamic) {
  let { isOf: isOf, bar: bar, isHeld: isHeld, body: body } = props;
  return jsx(Tooltip, {
    content: isOf === 'rows' ? sheetMessages.dragToSetFrozenRows() : sheetMessages.dragToSetFrozenColumns(),
    side: isOf === 'rows' ? 'right' : 'bottom',
    ...(isHeld
      ? {
          open: false,
        }
      : {}),
    children: jsx('div', {
      'aria-hidden': true,
      className: 'sheet-freeze-bar',
      'data-is-of': isOf,
      'data-is-in-corner': bar.start < 0 || undefined,
      'data-is-held': isHeld || undefined,
      style:
        isOf === 'rows'
          ? {
              top: body.top + bar.start,
              height: bar.size,
              width: body.left,
            }
          : {
              left: body.left + bar.start,
              width: bar.size,
              height: body.top,
            },
    }),
  });
}
export function boxWithGridline(box?: Dynamic) {
  let overlap = gridlineOverlap(box);
  return {
    left: box.left - overlap.x,
    top: box.top - overlap.y,
    width: box.width + overlap.x,
    height: box.height + overlap.y,
  };
}
export function activeCellCutoutPath(activeCellBox?: Dynamic, body?: Dynamic) {
  let {
    left: left,
    top: top,
    width: width,
    height: height,
  } = boxInBody(
    clipBoxToShown({
      ...boxWithGridline(activeCellBox),
      showsIn: activeCellBox.showsIn,
    }),
    body,
  );
  let [leftPx, topPx] = [Math.floor(left), Math.floor(top)];
  let [rightPx, bottomPx] = [Math.ceil(left + width), Math.ceil(top + height)];
  return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${`${leftPx}px ${topPx}px, ${rightPx}px ${topPx}px, ${rightPx}px ${bottomPx}px, ${leftPx}px ${bottomPx}px, ${leftPx}px ${topPx}px`})`;
}
export function hiddenInsetOfBox({ left: left, top: top, showsIn: showsIn }: Dynamic, overlap?: Dynamic) {
  let [hiddenLeft, hiddenTop] = [showsIn.left - left, showsIn.top - top];
  return {
    left: hiddenLeft > 0 ? hiddenLeft + overlap.x : 0,
    top: hiddenTop > 0 ? hiddenTop + overlap.y : 0,
  };
}
export function entryShiftIntoView(box?: Dynamic, scale?: Dynamic) {
  return {
    x: Math.max(0, Math.min(zoomedEditorOffset(scale, 'along'), box.left - box.showsIn.left)),
    y: Math.max(0, Math.min(zoomedEditorOffset(scale, 'down'), box.top - box.showsIn.top)),
  };
}
export function entryGridlineOverlap(box?: Dynamic, scale?: Dynamic) {
  let { x: shiftX, y: shiftY } = entryShiftIntoView(box, scale);
  return gridlineOverlap({
    ...box,
    left: box.left - shiftX,
    top: box.top - shiftY,
  });
}
export function cellEntryBoxStyle(
  box: Dynamic,
  body: Dynamic,
  { font: font, alignment: alignment }: Dynamic,
  density?: Dynamic,
  { lineCount: lineCount, foldsAt: foldsAt, scale = 1 }: Dynamic = {
    lineCount: 1,
    foldsAt: null,
  },
) {
  let marginAlong = zoomedEditorMargin(scale, 'along');
  let marginDown = zoomedEditorMargin(scale, 'down');
  let { x: value2, y: value3 } = entryShiftIntoView(box, scale);
  let { width: value4, ...value5 } = outlineBoxInBody(
    {
      ...box,
      left: box.left - value2,
      top: box.top - value3,
    },
    body,
  );
  let value6 = entryGridlineOverlap(box, scale);
  let value7 = Math.max(box.width, unzoomedEditorWidth(body.width - box.left + value2, scale, 'along'));
  let value8 = (foldsAt?.width ?? value7) + value6.x;
  let { over: value9, under: value10, left: value11, right: value12 } = density;
  let isOneLineRowZoomed = marginAlong > 0 && lineCount > 1 && box.height <= rowHeightForLines(1, font.size, density);
  let linesInRow = isOneLineRowZoomed ? 1 : lineCount;
  let value13 = box.height - rowHeightForLines(linesInRow, font.size, density);
  let value14 = linesInRow > 1 ? Math.max(0, value13) : value13;
  let value15 =
    (scale > 1 && value14 < 0
      ? 0.5
      : (
          {
            top: 0,
            center: 0.5,
            bottom: 1,
          } as Dynamic
        )[alignment.vertical]) * value14;
  let value16 = marginDown + firstLineLeading(font.size);
  let value17 = isOneLineRowZoomed ? value16 : 0;
  let value18 = hiddenInsetOfBox(box, value6);
  let [mapped, mapped2] = [value18.top, value18.left].map((input?: Dynamic) => (input > 0 ? input / scale : -ENTRY_CLIP_OVERSHOOT));
  return {
    ...value5,
    height: value5.height + 2 * marginDown,
    minWidth: (foldsAt?.isLineFolded === true ? value8 : value4) + 2 * marginAlong,
    maxWidth: value8 + 2 * marginAlong,
    paddingTop: value6.y + (value9 - ENTRY_TEXT_NUDGE) + value15 + value16 - value17 + (marginAlong > 0 ? ENTRY_TEXT_NUDGE : 0),
    paddingBottom: value10 - ENTRY_TEXT_NUDGE + value14 - value15 + value16 - value17,
    ...(value17 > 0 && {
      lineHeightInPixels: nextLineHeight(font.size) + 2 * value17,
    }),
    ...(value18.top + value18.left > 0 && {
      clipPath: `inset(${mapped}px ${-ENTRY_CLIP_OVERSHOOT}px ${-ENTRY_CLIP_OVERSHOOT}px ${mapped2}px)`,
    }),
    '--sheet-clear-left-of-text': `${value11}px`,
    '--sheet-clear-right-of-text': `${value12}px`,
    ...(scale > 1 && {
      '--sheet-entry-scale': String(scale),
    }),
  };
}
export function zoomedEntryBox(box?: Dynamic, body?: Dynamic, scale?: Dynamic) {
  let { x: shiftX, y: shiftY } = entryShiftIntoView(box, scale);
  return {
    left: body.left + box.left - shiftX,
    top: body.top + box.top - shiftY,
    width: (box.width + 2 * zoomedEditorMargin(scale, 'along')) * scale,
    height: (box.height + 2 * zoomedEditorMargin(scale, 'down')) * scale,
  };
}
export function BorderLinesInBands(props?: Dynamic) {
  let { grid: grid, axis: axis, bands: bands, asBefore: asBefore } = props;
  if (grid.borderLines.every(({ lines: lines }: Dynamic) => lines.length === 0)) return null;
  let bodyStart = axis === 'rows' ? grid.body.top : grid.body.left;
  return bands.map(
    (band?: Dynamic) =>
      jsx(
        'div',
        {
          'data-band': true,
          className: 'sheet-band-of-border-lines',
          style: {
            clipPath: bandClipPath(axis, bodyStart, band),
            zIndex: asBefore === undefined ? undefined : 3 * groupIndexAt(asBefore, band.start) + 1,
          },
          children: jsx(BorderLines, {
            grid: grid,
          }),
        },
        band.start,
      ),
  );
}
export function BorderLinesOfSlide(props?: Dynamic) {
  let { grid: grid, slideTold: slideTold } = props;
  let slide = React.useSyncExternalStore(slideTold.subscribe, slideTold.now, slideTold.now);
  if (slide === null)
    return jsx(BorderLines, {
      grid: grid,
    });
  return jsx(BorderLinesInBands, {
    grid: grid,
    axis: slide.axis,
    bands: slide.bandsNow,
  });
}
export function endOfLinesDrawn(grid?: Dynamic, axis?: Dynamic) {
  if (grid === null) return 0;
  let [lastColumn, lastRow] = [grid.columnHeaders.at(-1), grid.rows.at(-1)];
  return axis === 'columns'
    ? grid.body.left + (lastColumn === undefined ? 0 : lastColumn.left + lastColumn.width)
    : grid.body.top + (lastRow === undefined ? 0 : lastRow.top + lastRow.height);
}
export function LinesAsBefore(props?: Dynamic) {
  let { grid: grid } = props;
  let [asBefore, ref] = useLinesSlide({
    grid: grid,
    lines: props.linesOnShow,
    slideTold: props.slideTold,
  });
  return jsxs('div', {
    ref: ref,
    'aria-hidden': true,
    inert: true,
    className: 'sheet-lines-as-before',
    'data-is-of': asBefore.slide?.axis,
    children: [
      asBefore.groups.map(
        ({ by: by, rows: rows }: Dynamic, index?: Dynamic) =>
          jsxs(
            'div',
            {
              className: 'sheet-lines-that-go',
              'data-goes-by': by,
              style: {
                zIndex: 3 * index,
              },
              children: [
                asBefore.columnHeaders.length > 0 &&
                  jsx(ColumnHeaderRow, {
                    columnHeaders: asBefore.columnHeaders.map(
                      (header?: Dynamic) => ({
                        ...header,
                        isActive: false,
                      }),
                    ),
                    body: grid.body,
                  }),
                rows.map(
                  (row?: Dynamic) =>
                    jsx(
                      GridRow,
                      {
                        row: {
                          ...row,
                          isActive: false,
                          cells: row.cells.map(
                            (cell?: Dynamic) => ({
                              ...cell,
                              elementId: null,
                            }),
                          ),
                        },
                        body: grid.body,
                        density: grid.density,
                        cellsAsBefore: NO_CELLS_AS_BEFORE,
                      },
                      row.key,
                    ),
                ),
              ],
            },
            rows[0]?.key,
          ),
      ),
      asBefore.slide !== null &&
        asBefore.grid !== null &&
        jsx(BorderLinesInBands, {
          grid: asBefore.grid,
          axis: asBefore.slide.axis,
          bands: asBefore.slide.bandsAsBefore,
          asBefore: asBefore,
        }),
      asBefore.veils.map(
        ({ start: start, size: size, by: by }: Dynamic) =>
          jsx(
            'div',
            {
              className: 'sheet-veil-over-lines-that-go',
              'data-goes-by': by,
              style: {
                zIndex: 3 * groupIndexAt(asBefore, start) + 2,
                ...(asBefore.slide?.axis === 'rows'
                  ? {
                      top: grid.body.top + start,
                      height: size,
                      left: 0,
                      width: endOfLinesDrawn(asBefore.grid, 'columns'),
                    }
                  : {
                      left: grid.body.left + start,
                      width: size,
                      top: 0,
                      height: endOfLinesDrawn(asBefore.grid, 'rows'),
                    }),
              },
            },
            start,
          ),
      ),
    ],
  });
}
export function BorderLines({ grid: grid }: Dynamic) {
  let { body: value, borderLines: value2 } = grid;
  return value2.map(
    ({ key: key, box: box, lines: lines }: Dynamic) =>
      jsx(
        'svg',
        {
          'aria-hidden': true,
          className: 'sheet-border-lines',
          style: boxInBody(box, value),
          children: lines.map(
            ({ key: key2, path: path, strokeWidth: strokeWidth, dashes: dashes, paint: paint }: Dynamic) =>
              jsx(
                'path',
                {
                  d: path,
                  strokeWidth: strokeWidth,
                  strokeDasharray: dashes ?? undefined,
                  'data-has-text-paint': paint !== null || undefined,
                  style: textPaintStyle(paint),
                },
                key2,
              ),
          ),
        },
        key,
      ),
  );
}
export function ReferenceMarks({ marks: marks, body: body }: Dynamic) {
  return marks.map(({ cells: cells, box: box, hue: hue, leavesTextAsItIs: leavesTextAsItIs, arrivesAtPart: arrivesAtPart }: Dynamic) => {
    let state = {
      ...clippedBoxStyle(box, body),
      ...referenceTintStyle(hue),
      ...(arrivesAtPart !== null && {
        '--sheet-part-of-arrival': String(arrivesAtPart),
      }),
    };
    let value = arrivesAtPart !== null || undefined;
    return jsxs(
      React.Fragment,
      {
        children: [
          !leavesTextAsItIs &&
            jsx('div', {
              'aria-hidden': true,
              className: 'sheet-text-under-mark-of-reference',
              'data-arrives': value,
              style: state,
            }),
          jsx('div', {
            'aria-hidden': true,
            className: 'sheet-mark-of-reference',
            'data-arrives': value,
            style: state,
          }),
        ],
      },
      cells,
    );
  });
}
export function CommentWash({
  mark: { key: key, isOpen: isOpen, isPointedAt: isPointedAt, isWithAgent: isWithAgent, ...box },
  body: body,
}: Dynamic) {
  return jsx('div', {
    'aria-hidden': true,
    className: 'sheet-comment-wash',
    'data-is-open': isOpen,
    'data-is-comment-pointed-at': isPointedAt || undefined,
    'data-is-with-agent': isWithAgent || undefined,
    ...{
      [COMMENT_LAYER_ATTR]: key,
    },
    style: {
      ...useSheenDelayStyle(isWithAgent),
      ...clippedBoxStyle(box, body),
    },
  });
}
export function HeaderKept({
  kept: kept,
  body: body,
  density: density,
  marks: marks,
  tableOutline: tableOutline,
  endOfFrozenColumns: endOfFrozenColumns,
  rowNumberUnderHandle: rowNumberUnderHandle,
}: Dynamic) {
  let top = body.top + kept.top;
  let bottom = kept.top + kept.height;
  let [firstPart] = kept.parts;
  let isUnderFrozenColumns =
    endOfFrozenColumns !== null &&
    kept.parts.some(({ left: left, width: width }: Dynamic) => left < endOfFrozenColumns.at && left + width >= endOfFrozenColumns.at);
  let value = (input?: Dynamic, options?: Dynamic, context?: Dynamic) =>
    jsxs('div', {
      className: 'sheet-header-kept-cells',
      inert: true,
      style: {
        left: -input,
        top: -top - kept.leavesBy,
        width: body.left + body.width,
      },
      children: [
        options.map(
          (input2?: Dynamic) =>
            jsx(
              GridRow,
              {
                row: input2,
                body: body,
                density: density,
                cellsAsBefore: NO_CELLS_AS_BEFORE,
                isNumberUnderHandle: input2.rowNumber === rowNumberUnderHandle,
              },
              input2.key,
            ),
        ),
        context !== null &&
          kept.groundsOfButtonsHeld.map(
            ({ box: box, grounds: grounds }: Dynamic) =>
              jsx(
                FilterButtonGround,
                {
                  box: box,
                  grounds: grounds,
                  body: body,
                },
                box.left,
              ),
          ),
        context,
        jsx(BorderLines, {
          grid: {
            body: body,
            borderLines: kept.borderLines,
          },
        }),
        jsx(ReferenceMarks, {
          marks: kept.marksOfReferences,
          body: body,
        }),
        kept.selectionBoxes.map(
          ({ key: key, box: box }: Dynamic) =>
            jsx(
              'div',
              {
                className: 'sheet-selection',
                style: clippedBoxStyle(box, body),
              },
              key,
            ),
        ),
      ],
    });
  return jsxs('div', {
    'aria-hidden': true,
    children: [
      kept.parts.map((input?: Dynamic, options?: Dynamic) => {
        let value2 = body.left + input.left;
        let state = {
          left: value2,
          top: top,
          width: input.width,
          height: kept.height,
        };
        let value3 = !input.goesOnAtLeft && input.left !== endOfFrozenColumns?.at;
        let value4 =
          options > 0 || endOfFrozenColumns === null || input.left < endOfFrozenColumns.at
            ? HEADER_KEPT_SHADOW
            : Math.min(HEADER_KEPT_SHADOW, input.left - endOfFrozenColumns.at);
        let value5 = jsx('div', {
          className: 'sheet-ring-of-header-kept',
          'data-is-of-found-table': kept.isOfFoundTable || undefined,
          style: {
            left: value2,
            top: top + kept.leavesBy,
            width: input.width - (input.goesOnAtRight ? 0 : 1),
            height: kept.height - 1,
            clipPath: `inset(0 ${input.goesOnAtRight ? 0 : -1}px -1px ${value3 ? -1 : 0}px)`,
          },
        });
        let value6 = value3 ? 1 : 0;
        return jsxs(
          React.Fragment,
          {
            children: [
              jsx('div', {
                className: 'sheet-shadow-of-header-kept',
                style: {
                  ...state,
                  clipPath: `inset(0 ${-HEADER_KEPT_SHADOW}px ${-HEADER_KEPT_SHADOW}px ${-value4}px)`,
                },
              }),
              jsx('div', {
                className: 'sheet-header-kept',
                style: {
                  ...state,
                  left: value2 - value6,
                  width: input.width + value6,
                },
                children: value(value2 - value6, kept.rows, value5),
              }),
            ],
          },
          input.startOfPane,
        );
      }),
      isUnderFrozenColumns &&
        jsx('div', {
          className: 'sheet-end-of-frozen',
          'data-is-of': 'columns',
          'data-is-over-header-kept': true,
          'data-is-over-cells': endOfFrozenColumns.isOverCells || undefined,
          style: {
            left: body.left + endOfFrozenColumns.at,
            top: top,
            height: kept.height,
          },
        }),
      tableOutline?.overHeader === kept.key &&
        jsx('div', {
          className: 'sheet-table-outline',
          'data-is-of-formula': tableOutline.isOfFormula,
          'data-is-over-header-kept': true,
          style: clippedBoxStyle(
            {
              ...tableOutline,
              showsIn: {
                ...tableOutline.showsIn,
                height: bottom - tableOutline.showsIn.top,
              },
            },
            body,
          ),
        }),
      marks
        .filter(({ box: box }: Dynamic) => box.top >= bottom && box.top < bottom + 1)
        .map(({ key: key, box: box }: Dynamic) => {
          let { left: value2, width: value3 } = outlineBoxInBody(box, body);
          let value4 = box.left < box.showsIn.left ? body.left + box.showsIn.left : value2;
          let value5 = Math.min(value2 + value3, body.left + box.showsIn.left + box.showsIn.width);
          let value6 = box.top - 1;
          return jsx(
            'div',
            {
              className: 'sheet-mark-over-header-kept',
              style: {
                left: value4,
                top: body.top + value6,
                width: Math.max(0, value5 - value4),
                height: bottom - value6,
              },
            },
            key,
          );
        }),
      kept.areRowNumbersItsOwn &&
        jsx('div', {
          className: 'sheet-header-kept',
          'data-is-on-headers': true,
          style: {
            left: 0,
            top: top,
            width: body.left,
            height: kept.height,
          },
          children: value(
            0,
            kept.rows.map(
              (input?: Dynamic) => ({
                ...input,
                cells: [],
              }),
            ),
            null,
          ),
        }),
      kept.areRowNumbersItsOwn &&
        firstPart?.left === 0 &&
        !firstPart.goesOnAtLeft &&
        jsxs(Fragment, {
          children: [
            jsx('div', {
              className: 'sheet-shadow-of-header-kept',
              'data-is-over-headers': true,
              style: {
                left: body.left,
                top: top,
                width: firstPart.width,
                height: kept.height,
                clipPath: `inset(0 100% ${-HEADER_KEPT_SHADOW}px ${-HEADER_KEPT_SHADOW}px)`,
              },
            }),
            jsx('div', {
              className: 'sheet-ring-of-header-kept',
              'data-is-of-found-table': kept.isOfFoundTable || undefined,
              'data-is-over-headers': true,
              style: {
                left: body.left,
                top: top,
                width: firstPart.width,
                height: kept.height - 1,
                clipPath: 'inset(0 100% -1px -1px)',
              },
            }),
          ],
        }),
    ],
  });
}
export function PlainGridDrawing({ grid: grid }: Dynamic) {
  let { body: body } = grid;
  return jsxs(Fragment, {
    children: [
      jsx(ColumnHeaderRow, {
        columnHeaders: grid.columnHeaders.map(
          (input?: Dynamic) => ({
            ...input,
            isActive: false,
          }),
        ),
        body: body,
      }),
      grid.rowsDrawn.map(
        (input?: Dynamic) =>
          jsx(
            GridRow,
            {
              row: {
                ...input,
                isActive: false,
                cells: input.cells.map(
                  (input2?: Dynamic) => ({
                    ...input2,
                    elementId: null,
                    isActive: false,
                  }),
                ),
              },
              body: body,
              density: grid.density,
              cellsAsBefore: NO_CELLS_AS_BEFORE,
            },
            input.key,
          ),
      ),
      jsx(BorderLines, {
        grid: grid,
      }),
      jsx(EndOfFrozenLines, {
        isOf: 'rows',
        end: grid.endOfFrozenRows,
        isHeld: false,
        body: body,
      }),
      jsx(EndOfFrozenLines, {
        isOf: 'columns',
        end: grid.endOfFrozenColumns,
        crossedBy: grid.endOfFrozenRows,
        isHeld: false,
        body: body,
      }),
    ],
  });
}
export function GridDrawing({
  grid: grid,
  cornerOnTop = null,
  cornersCalledUp = NO_CORNERS_CALLED_UP,
  flagsHidden = NO_FLAGS_HIDDEN,
  cellsAsBefore = NO_CELLS_AS_BEFORE,
  rowNumberUnderHandle = null,
  areRowsNamed = false,
  arePlacesHeld = IS_IOS_BROWSER,
  rows = grid.rowsDrawn,
  keysOfColumns = NO_LINE_KEYS,
  linesOnShow = null,
}: Dynamic) {
  let {
    body: body,
    columnHeaders: columnHeaders,
    activeCellBox: activeCellBox,
    selectionBox: selectionBox,
    selectionSummary: selectionSummary,
    freezeBars: freezeBars,
  } = grid;
  let [slideTold] = React.useState(createSlideTold);
  let activeCellCutout = activeCellBox === null ? undefined : activeCellCutoutPath(activeCellBox, body);
  let outlinedBoxes =
    grid.copiedCellsBox === null && grid.editorBox === null
      ? [
          ...(activeCellBox === null
            ? []
            : [
                {
                  key: 'activeCell',
                  box: activeCellBox,
                },
              ]),
          ...(selectionBox === null
            ? []
            : [
                {
                  key: 'selection',
                  box: selectionBox,
                },
              ]),
          ...grid.otherRangeBoxes,
        ]
      : [];
  let value = React.use(AnnounceActiveCellContext)
    ? grid.rowsDrawn.flatMap((input?: Dynamic) => input.cells).find((input?: Dynamic) => input.elementId !== null)
    : undefined;
  let value2 = value === undefined ? null : `${columnLetters(value.columnNumber - 1)}${value.rowNumberWritten},`;
  return jsxs(Fragment, {
    children: [
      value2 !== null &&
        jsx('span', {
          id: ACTIVE_CELL_ADDRESS_ID,
          hidden: true,
          children: value2,
        }),
      jsx('span', {
        id: LINK_DESCRIPTION_ID,
        hidden: true,
        children: sheetMessages.link(),
      }),
      jsx('span', {
        id: COMMENT_DESCRIPTION_ID,
        hidden: true,
        children: sheetMessages.hasComment(),
      }),
      LINK_COUNTS_IN_TEXT.map(
        (input?: Dynamic) =>
          jsx(
            'span',
            {
              id: linksInTextDescriptionId(input),
              hidden: true,
              children: linkCountLabel(input),
            },
            input,
          ),
      ),
      jsx(ColumnHeaderRow, {
        columnHeaders: columnHeaders,
        body: body,
        keysOfColumns: keysOfColumns,
      }),
      grid.columnEdgeGrips.map(
        ({ key: key, isOfFrozen: isOfFrozen, left: left, width: width, edgeFromLeft: edgeFromLeft }: Dynamic) =>
          jsx(
            'div',
            {
              'aria-hidden': true,
              className: 'sheet-column-edge-grip',
              'data-is-of-frozen': isOfFrozen || undefined,
              style: {
                left: body.left + left,
                width: width,
                height: body.top,
              },
              children: jsx('div', {
                className: 'sheet-held-edge',
                'data-is-of': 'column',
                style: {
                  left: edgeFromLeft,
                },
              }),
            },
            key,
          ),
      ),
      grid.gripOfColumnsForFingerAt !== null &&
        jsx('div', {
          'aria-hidden': true,
          className: 'sheet-grip-of-columns',
          style: {
            left: body.left + grid.gripOfColumnsForFingerAt,
            height: body.top,
          },
        }),
      grid.rowEdgeGrips.map(
        ({ key: key, isOfFrozen: isOfFrozen, top: top, height: height, edgeFromTop: edgeFromTop }: Dynamic) =>
          jsx(
            'div',
            {
              'aria-hidden': true,
              className: 'sheet-row-edge-grip',
              'data-is-of-frozen': isOfFrozen || undefined,
              style: {
                top: body.top + top,
                height: height,
                width: body.left,
              },
              children: jsx('div', {
                className: 'sheet-held-edge',
                'data-is-of': 'row',
                style: {
                  top: edgeFromTop,
                },
              }),
            },
            key,
          ),
      ),
      grid.seams.rows.map(
        (input?: Dynamic) =>
          jsx(
            'div',
            {
              'aria-hidden': true,
              className: 'sheet-seam',
              'data-of': 'rows',
              'data-is-of-own-filter': grid.seamsOfOwnFilters.includes(input) || undefined,
              style: {
                top: body.top + input,
                width: body.left,
              },
            },
            input,
          ),
      ),
      grid.seams.columns.map(
        (input?: Dynamic) =>
          jsx(
            'div',
            {
              'aria-hidden': true,
              className: 'sheet-seam',
              'data-of': 'columns',
              style: {
                left: body.left + input,
                height: body.top,
              },
            },
            input,
          ),
      ),
      grid.heldEdgeAt !== null &&
        jsx('div', {
          className: 'sheet-held-edge',
          'data-is-of': grid.heldEdgeIsOf,
          style:
            grid.heldEdgeIsOf === 'row'
              ? {
                  top: body.top + grid.heldEdgeAt,
                }
              : {
                  left: body.left + grid.heldEdgeAt,
                },
        }),
      grid.landingLine !== null &&
        jsx('div', {
          className: 'sheet-landing-line',
          'data-between': grid.landingLine.between,
          style:
            grid.landingLine.between === 'rows'
              ? {
                  top: body.top + grid.landingLine.offset,
                }
              : {
                  left: body.left + grid.landingLine.offset,
                },
        }),
      jsx(LinesAsBefore, {
        grid: grid,
        linesOnShow: linesOnShow,
        slideTold: slideTold,
      }),
      jsx(TooltipGroup, {
        children: rows.map(
          (input?: Dynamic) =>
            jsx(
              GridRow,
              {
                keysOfColumns: keysOfColumns,
                row: input,
                body: body,
                density: grid.density,
                cellsAsBefore:
                  cellsAsBefore.length === 0
                    ? NO_CELLS_AS_BEFORE
                    : cellsAsBefore.filter(({ rowKey: rowKey }: Dynamic) => rowKey === input.key),
                isNumberUnderHandle: input.rowNumber === rowNumberUnderHandle,
                arePlacesHeld: arePlacesHeld,
                isNamed: areRowsNamed,
              },
              input.key,
            ),
        ),
      }),
      jsx(BorderLinesOfSlide, {
        grid: grid,
        slideTold: slideTold,
      }),
      jsx(EndOfFrozenLines, {
        isOf: 'rows',
        end: grid.endOfFrozenRows,
        isHeld: grid.freezeBarHeld === 'rows',
        body: body,
      }),
      jsx(EndOfFrozenLines, {
        isOf: 'columns',
        end: grid.endOfFrozenColumns,
        crossedBy: grid.endOfFrozenRows,
        isHeld: grid.freezeBarHeld === 'columns',
        body: body,
      }),
      freezeBars !== null &&
        jsxs(TooltipGroup, {
          children: [
            jsx(FreezeBar, {
              isOf: 'columns',
              bar: freezeBars.columns,
              isHeld: grid.freezeBarHeld === 'columns',
              body: body,
            }),
            jsx(FreezeBar, {
              isOf: 'rows',
              bar: freezeBars.rows,
              isHeld: grid.freezeBarHeld === 'rows',
              body: body,
            }),
          ],
        }),
      grid.boxesReachedByEditor.map(
        (input?: Dynamic) =>
          jsx(
            'div',
            {
              className: 'sheet-reach-of-editor',
              style: clippedBoxStyle(input, body),
            },
            `${input.left} ${input.top}`,
          ),
      ),
      grid.marksOfFixes.map(
        ({ key: key, box: box, isAwaited: isAwaited }: Dynamic) =>
          jsx(
            'div',
            {
              'aria-hidden': true,
              className: isAwaited ? 'sheet-outline-of-other sheet-fix-awaited' : 'sheet-spill-outline',
              'data-is-if-kept': !isAwaited || undefined,
              style: clippedBoxStyle(box, body),
            },
            key,
          ),
      ),
      grid.spillOutline !== null &&
        jsx('div', {
          'aria-hidden': true,
          className: 'sheet-spill-outline',
          'data-is-blocked': grid.spillOutline.isBlocked || undefined,
          'data-is-if-kept': grid.spillOutline.isIfKept || undefined,
          style: clippedBoxStyle(grid.spillOutline.box, body),
        }),
      grid.tableOutline !== null &&
        jsx('div', {
          'aria-hidden': true,
          className: 'sheet-table-outline',
          'data-is-of-formula': grid.tableOutline.isOfFormula,
          style: clippedBoxStyle(grid.tableOutline, body),
        }),
      jsx(ReferenceMarks, {
        marks: grid.marksOfReferences,
        body: body,
      }),
      grid.outlinesOfOthers.map(
        ({ key: key, box: box, color: color }: Dynamic) =>
          jsx(
            'div',
            {
              'aria-hidden': true,
              className: 'sheet-outline-of-other',
              style: {
                ...clippedBoxStyle(box, body),
                color: color,
              },
            },
            key,
          ),
      ),
      grid.marksOfComments.map(
        (mark?: Dynamic) =>
          jsx(
            CommentWash,
            {
              mark: mark,
              body: body,
            },
            mark.key,
          ),
      ),
      grid.markOfNewComment !== null &&
        jsx('div', {
          'aria-hidden': true,
          className: 'sheet-comment-wash',
          'data-is-open': true,
          style: clippedBoxStyle(grid.markOfNewComment, body),
        }),
      grid.edgesToMoveCellsBy.map(
        (input?: Dynamic) =>
          jsx(
            'div',
            {
              'aria-hidden': true,
              className: 'sheet-edge-to-move-cells-by',
              style: boxInBody(input, body),
            },
            `${input.table?.key ?? ''} ${input.side}`,
          ),
      ),
      grid.marksOfComments.map(
        ({ key: key, isOpen: isOpen, isPointedAt: isPointedAt, endsWith: endsWith, ...input }: Dynamic) =>
          jsx(
            'div',
            {
              'aria-hidden': true,
              className: 'sheet-comment-mark',
              'data-is-open': isOpen,
              'data-is-comment-pointed-at': isPointedAt || undefined,
              ...{
                [COMMENT_LAYER_ATTR]: key,
              },
              'data-is-corner-under-outline': endsWith !== null,
              style: clippedBoxStyle(input, body),
              children: jsx('div', {
                [COMMENT_CORNER_ATTR]: key,
              }),
            },
            key,
          ),
      ),
      grid.tintsOfFind.map(
        ({ key: key, isCellFound: isCellFound, ...input }: Dynamic) =>
          jsx(
            'div',
            {
              'aria-hidden': true,
              className: 'sheet-found',
              'data-is-cell-found': isCellFound,
              style: clippedBoxStyle(input, body),
            },
            key,
          ),
      ),
      grid.marksOnChangesByAgent.map(
        ({ key: key, fadeBeginsAtMs: fadeBeginsAtMs, box: box, ...input }: Dynamic) =>
          jsx(
            ChangeByAgentMark,
            {
              keyOfMark: key,
              fadeBeginsAtMs: fadeBeginsAtMs,
              isWithoutSheen: input.isOfWholeLines || input.isOfPlaceShown,
              place: clippedBoxStyle(box, body),
            },
            key,
          ),
      ),
      selectionBox !== null &&
        jsx('div', {
          className: 'sheet-selection',
          'data-is-just-imported': grid.isSelectionJustImported || undefined,
          'data-is-in-open-comment': grid.isSelectionInOpenComment || undefined,
          style: clippedBoxStyle(selectionBox, body),
        }),
      grid.otherRangeBoxes.map(
        ({ key: key, box: box }: Dynamic) =>
          jsx(
            'div',
            {
              className: 'sheet-selection',
              style: clippedBoxStyle(box, body),
            },
            key,
          ),
      ),
      activeCellBox !== null &&
        jsx('div', {
          className: 'sheet-active-cell-outline',
          style: clippedBoxStyle(activeCellBox, body),
        }),
      grid.copiedCellsBox !== null &&
        jsx('div', {
          className: 'sheet-copied-cells',
          style: clippedBoxStyle(grid.copiedCellsBox, body),
        }),
      grid.fillPreviewBox !== null &&
        jsx('div', {
          className: 'sheet-fill-preview',
          style: clippedBoxStyle(grid.fillPreviewBox, body),
        }),
      grid.landingOfCellsBox !== null &&
        grid.cellsHeld === null &&
        jsx('div', {
          className: 'sheet-fill-preview',
          style: clippedBoxStyle(grid.landingOfCellsBox, body),
        }),
      grid.headersKept.map(
        (input?: Dynamic) =>
          jsx(
            HeaderKept,
            {
              kept: input,
              body: body,
              density: grid.density,
              marks: outlinedBoxes,
              tableOutline: grid.tableOutline,
              endOfFrozenColumns: grid.endOfFrozenColumns,
              rowNumberUnderHandle: rowNumberUnderHandle,
            },
            input.key,
          ),
      ),
      grid.nameFlagsOfOthers.length > 0 &&
        jsx('div', {
          'aria-hidden': true,
          className: 'sheet-name-flags',
          style: {
            clipPath: activeCellCutout,
          },
          children: grid.nameFlagsOfOthers.map(
            ({ key: key, box: box, stands: stands, end: end, flags: flags, countFolded: countFolded, ...input }: Dynamic) =>
              jsx(
                'div',
                {
                  'aria-hidden': true,
                  className: 'sheet-name-flags-of-others',
                  'data-stands': stands,
                  'data-end': end,
                  'data-is-on-top': key === cornerOnTop || undefined,
                  'data-is-hidden': flagsHidden.corners.includes(key) || undefined,
                  style: nameFlagsStyle(
                    key,
                    {
                      stands: stands,
                      box: box,
                    },
                    grid.outlinesOfOthers,
                    body,
                  ),
                  children: jsx(FlagsAtRest, {
                    lastMoveAtMs: input.lastMoveAtMs,
                    isKeptUp: input.isAllThatShows || cornersCalledUp.includes(key),
                    children: flags.map(
                      ({ key: key2, name: name, color: color, inkColor: inkColor }: Dynamic, options?: Dynamic) =>
                        jsxs(
                          'span',
                          {
                            style: {
                              background: color,
                              color: inkColor,
                            },
                            children: [
                              jsx('bdi', {
                                children: name,
                              }),
                              countFolded > 0 && options === flags.length - 1 && foldedFlagsCountText(countFolded),
                            ],
                          },
                          key2,
                        ),
                    ),
                  }),
                },
                key,
              ),
          ),
        }),
      jsx('div', {
        'aria-hidden': true,
        className: 'sheet-name-flags',
        style: {
          clipPath: activeCellCutout,
        },
        children: grid.marksOnChangesByAgent.map(
          ({ key: key, fadeBeginsAtMs: fadeBeginsAtMs, name: name, box: box }: Dynamic) =>
            name !== null &&
            jsx(
              ChangeByAgentMark,
              {
                keyOfMark: key,
                fadeBeginsAtMs: fadeBeginsAtMs,
                place: flagPlaceStyle(name, box, body),
                nameStands: name.stands,
                isHidden: flagsHidden.isOfAgent,
              },
              key,
            ),
        ),
      }),
      selectionSummary !== null &&
        jsx(Surface, {
          'aria-hidden': true,
          id: SELECTION_SUMMARY_ID,
          elevation: 'popover',
          className: 'sheet-selection-summary',
          'data-opens-menu': selectionSummary.opensMenu,
          style: selectionSummaryStyle(selectionSummary, body),
          children: jsx('span', {
            className: 'sheet-selection-summary-words',
            children: selectionSummaryText(selectionSummary.summary),
          }),
        }),
      grid.fillHandleBox !== null &&
        jsx('div', {
          'aria-hidden': true,
          className: 'sheet-fill-handle',
          'data-has-flag-beside': grid.isFlagInSquareOfFillHandle || undefined,
          style: {
            ...boxInBody(grid.fillHandleBox, body),
            ...clipInsetStyle({
              ...hiddenInsetOfBox(grid.fillHandleBox, NO_GRIDLINE_OVERLAP),
              right: 0,
              bottom: 0,
            }),
          },
        }),
      grid.roomOfAgentAtWork !== null &&
        jsx(AgentAtWork, {
          style: boxInBody(
            {
              ...grid.roomOfAgentAtWork,
              left: 0,
              top: 0,
            },
            body,
          ),
        }),
    ],
  });
}
export const isSamePerson = (person?: Dynamic, other?: Dynamic) =>
  person.userId === other?.userId && person.name === other.name && person.avatarUrl === other.avatarUrl;
export const shallowEqualExcept = (before?: Dynamic, after?: Dynamic, keysToSkip: Dynamic = []) =>
  Object.keys(before).every((key?: Dynamic) => keysToSkip.includes(key) || Object.is(before[key], after[key]));
export const isSameLinkPart = (part?: Dynamic, other?: Dynamic) =>
  part.text === other?.text &&
  part.startsAt === other.startsAt &&
  part.url === other.url &&
  part.isLinkOnWords === other.isLinkOnWords &&
  part.marks.join() === other.marks.join();
export const CheckboxOfLine = ({ isChecked: isChecked }: Dynamic) =>
  jsx('span', {
    role: 'presentation',
    'aria-hidden': true,
    className: 'sheet-box-of-line',
    onMouseDown: preventMouseDownDefault,
    children: jsx(Checkbox, {
      checked: isChecked,
      animated: true,
      tabIndex: -1,
      'aria-label': sheetMessages.checkboxCells(),
    }),
  });
export const LINE_WITHOUT_LIST = {
  list: {
    kind: 'none',
  },
  number: null,
};
export const LineInCell = ({
  line: line,
  drawnBefore: drawnBefore = LINE_WITHOUT_LIST,
  whereCut: whereCut,
  children: children,
}: Dynamic) =>
  jsxs('span', {
    className: 'sheet-line-in-cell',
    'data-line': line,
    ...listAttributesOf(drawnBefore),
    children: [
      drawnBefore.list.kind === 'checkbox' &&
        jsxs(Fragment, {
          children: [
            jsx(CheckboxOfLine, {
              isChecked: drawnBefore.list.isChecked,
            }),
            jsxs('span', {
              className: 'sr-only',
              children: [checkedStateWords(drawnBefore.list.isChecked), ' '],
            }),
          ],
        }),
      whereCut === null
        ? children
        : jsx('span', {
            className: 'sheet-text-that-fades',
            style: whereCut,
            children: children,
          }),
    ],
  });
export const LINK_COUNTS_IN_TEXT = Array.from<Dynamic, Dynamic>(
  {
    length: MAX_LINKS_IN_TEXT,
  },
  (input?: Dynamic, index?: Dynamic) => index + 1,
);
export const GridCell = React.memo(function (props?: Dynamic) {
  let { bodyLeft: bodyLeft, density: density, columnNumber: columnNumber, left: left, width: width, top: top, height: height } = props;
  let { linkUrl: linkUrl, partsWithLinks: partsWithLinks, listLines: listLines } = props;
  let { mergedFromRowNumber: mergedFromRowNumber, mergedRowCount: mergedRowCount, mergedColumnCount: mergedColumnCount } = props;
  let { hiddenAtLeft: hiddenAtLeft, hiddenAtTop: hiddenAtTop } = props;
  let {
    text: text,
    spokenText: spokenText,
    textColor: textColor,
    alignment: alignment,
    isCutAtEndOnly: isCutAtEndOnly,
    indentToCenter: indentToCenter,
  } = props;
  let { format: format, paints: paints } = props;
  let {
    textLeft: textLeft,
    textWidth: textWidth,
    isTextWrapped: isTextWrapped,
    hasLineAtRight: hasLineAtRight,
    isSelected: isSelected,
    elementId: elementId,
  } = props;
  let {
    pill: pill,
    opensDropdownList: opensDropdownList,
    isDropdownListOpen: isDropdownListOpen,
    isPerson: isPerson,
    avatarUrl: avatarUrl,
    otherPeople: otherPeople,
  } = props;
  let {
    opensCalendar: opensCalendar,
    isCalendarOpen: isCalendarOpen,
    opensPeopleList: opensPeopleList,
    isPeopleListOpen: isPeopleListOpen,
    frozenBy: frozenBy,
  } = props;
  let { checkbox: checkbox, isError: isError, looksLikeError: looksLikeError, isErrorMuted: isErrorMuted } = props;
  let announcesActiveCell = React.use(AnnounceActiveCellContext) && elementId !== null;
  let blankCellWords = React.use(BlankCellWordsContext);
  let hasWordsForReader =
    text.trim() === '' &&
    linkUrl === null &&
    !isPerson &&
    blankCellWords !== 'none' &&
    (blankCellWords === 'all' || checkbox !== null || opensDropdownList || props.isActive);
  let areWordsInsteadOfLabel = hasWordsForReader && blankCellWords !== 'all';
  let cellLabel =
    props.shownForFixThatWaits !== null
      ? agentFixLabel(text, props.shownForFixThatWaits, props.areKeysForFix)
      : checkbox === null
        ? (spokenText ?? undefined)
        : checkboxCellLabel(checkbox);
  let isStruckWithDoubleUnderline = format.font.strikethrough && format.font.underline === 'double';
  let font = isStruckWithDoubleUnderline
    ? {
        ...format.font,
        strikethrough: false,
      }
    : format.font;
  let isTextBoxOffCell = textLeft !== left || textWidth !== width;
  let isPillFillingCell = checkbox === null && !isTextBoxOffCell && linkUrl === null && !isPerson && (pill !== null || opensDropdownList);
  let hasChip =
    isPerson || (isPillFillingCell && pill !== null) || (linkUrl !== null && props.linkDrawnAs !== 'words' && githubLinkFace(linkUrl) !== null);
  let textClearance = cellTextInsets(
    height,
    format.font.size,
    density,
    isPillFillingCell ? 'left' : alignment,
    props.hiddenByBorderAtFoot,
    hasChip,
  );
  let showsAsError = looksLikeError && paints.fill === null;
  let usesTextPaint = !showsAsError && textColor === null && paints.text !== null;
  let cellStyle = {
    justifyContent: `${isCutAtEndOnly ? 'safe ' : ''}${JUSTIFY_BY_ALIGNMENT[alignment]}`,
    alignItems: ALIGN_ITEMS_BY_VERTICAL[format.alignment.vertical],
    color: showsAsError ? 'var(--sheet-color-of-error)' : textColor === null ? undefined : TEXT_TINT_COLORS[textColor],
    ...(usesTextPaint ? textPaintStyle(paints.text) : undefined),
    ...cellFontStyle(font),
  };
  let textDecorationLine = isStruckWithDoubleUnderline ? 'line-through' : undefined;
  let value = partsWithLinks.map((input?: Dynamic) => input.text).join('') === text ? partsWithLinks : [];
  let size = new (Set as Dynamic)(value.flatMap(({ url: url }: Dynamic) => url ?? [])).size;
  let value2 = (input?: Dynamic) => (isTextWrapped ? input : flattenLineBreaks(input));
  let mapped = value.map((input?: Dynamic) => input.text);
  let value3 = isTextWrapped ? mapped : flattenLineBreaksAcrossParts(mapped);
  let partsDrawn = value.map(
    (input?: Dynamic, options?: Dynamic) => ({
      ...input,
      drawn: value3[options],
    }),
  );
  let drawParts = (parts?: Dynamic) =>
    groupLinkParts(parts).map((input?: Dynamic) => {
      let mapped2 = input.map(
        ({ startsAt: startsAt, marks: marks, drawn: drawn }: Dynamic) =>
          marks.length === 0
            ? drawn
            : jsx(
                'span',
                {
                  style: textMarksStyle(marks),
                  children: drawn,
                },
                startsAt,
              ),
      );
      let [{ startsAt: value11, url: value12, isLinkOnWords: value13 }] = input;
      return value12 === null
        ? mapped2
        : jsx(
            CellLinkSpan,
            {
              url: value12,
              cellKeyOfWords: props.linkCellKey,
              isAmongText: true,
              isOnWords: value13,
              children: mapped2,
            },
            value11,
          );
    });
  let fadesCutLines = props.areLinesCut && props.isInTable;
  let lineFadeStyle = ({ list: list }: Dynamic = LINE_WITHOUT_LIST) =>
    fadesCutLines && (list.kind !== 'none' || alignment === 'left')
      ? textFadeStyle(
          {
            ...props,
            alignment: 'left',
          },
          {
            ...textClearance,
            left: textClearance.left + listIndentOfLevel(levelInList(list), format.font.size),
          },
        )
      : null;
  let value4 =
    value.length === 0
      ? value2(text)
      : listLines.length === 0
        ? drawParts(partsDrawn)
        : partsByLine(partsDrawn).map(
            ({ breakBefore: breakBefore, ofLine: ofLine }: Dynamic, line?: Dynamic) =>
              jsxs(
                React.Fragment,
                {
                  children: [
                    !isTextWrapped && breakBefore?.drawn,
                    jsx(LineInCell, {
                      line: line,
                      drawnBefore: listLines[line],
                      whereCut: lineFadeStyle(listLines[line]),
                      children: drawParts(ofLine),
                    }),
                  ],
                },
                ofLine[0]?.startsAt ?? `empty ${line}`,
              ),
          );
  let value5 = isStruckWithDoubleUnderline || indentToCenter !== 0 || value.length > 0;
  let value6 = isTextWrapped
    ? jsx('span', {
        className: 'sheet-wrapped-text',
        'data-cuts-lines': props.areLinesCut || undefined,
        style: {
          textDecorationLine: textDecorationLine,
          textAlign: alignment,
          ...wrappedTextLineStyle(format.font.size),
          ...(props.takenAtRight > 0 && {
            overflow: 'clip',
          }),
        },
        children: value4,
      })
    : value5
      ? jsx('span', {
          style: {
            textDecorationLine: textDecorationLine,
            marginLeft: indentToCenter === 0 ? undefined : indentToCenter,
          },
          children: value4,
        })
      : value4;
  let value7 = props.mayTextFade ? textFadeStyle(props, textClearance) : null;
  let value8 = (input?: Dynamic) =>
    value7 === null
      ? input
      : jsx('span', {
          className: 'sheet-text-that-fades',
          style: value7,
          children: input,
        });
  let value9 = (input?: Dynamic) =>
    jsx(CellLinkSpan, {
      url: input,
      cellKeyOfWords: props.linkCellKey ?? '',
      children: jsx('span', {
        className: 'sheet-link-words',
        style: {
          color: textColor === null ? undefined : 'inherit',
          marginLeft: indentToCenter === 0 ? undefined : indentToCenter,
        },
        children: value8(
          isStruckWithDoubleUnderline
            ? jsx('span', {
                style: {
                  textDecorationLine: textDecorationLine,
                },
                children: value2(text),
              })
            : value2(text),
        ),
      }),
    });
  let value10 =
    linkUrl !== null
      ? props.linkDrawnAs === 'words' && elementId !== null
        ? `${LINK_DESCRIPTION_ID} ${LINK_ADDRESS_ID}`
        : LINK_DESCRIPTION_ID
      : size > 0
        ? linksInTextDescriptionId(size)
        : isError && elementId !== null
          ? ERROR_DESCRIPTION_ID
          : undefined;
  let matches = [
    linkUrl === null && size === 0 ? null : 'Alt+Enter',
    props.isSaidToHaveComment && elementId !== null ? COMMENT_SHORTCUT : null,
  ].filter(Boolean);
  let matches2 = [
    announcesActiveCell ? ACTIVE_CELL_ADDRESS_ID : null,
    value10,
    props.isSaidToHaveComment ? COMMENT_DESCRIPTION_ID : null,
  ].filter(Boolean);
  return jsxs('div', {
    role: 'gridcell',
    'aria-hidden': props.isBehindBars || undefined,
    id: elementId ?? undefined,
    'aria-rowindex': mergedFromRowNumber === null ? undefined : ariaIndex(mergedFromRowNumber),
    'aria-colindex': ariaIndex(columnNumber),
    'aria-rowspan': mergedRowCount ?? undefined,
    'aria-colspan': mergedColumnCount ?? undefined,
    'aria-describedby': matches2.length === 0 ? undefined : matches2.join(' '),
    'data-is-error': isError || undefined,
    'data-looks-like-error': looksLikeError || undefined,
    'data-is-error-muted': isErrorMuted || undefined,
    'data-fix-waits': props.shownForFixThatWaits !== null || undefined,
    'aria-keyshortcuts': matches.length === 0 ? undefined : matches.join(' '),
    'aria-selected': isSelected,
    'aria-label': areWordsInsteadOfLabel ? undefined : cellLabel,
    'aria-haspopup': opensDropdownList || opensPeopleList ? 'listbox' : opensCalendar ? 'dialog' : undefined,
    'aria-expanded': opensDropdownList ? isDropdownListOpen : opensPeopleList ? isPeopleListOpen : opensCalendar ? isCalendarOpen : undefined,
    ...ariaRowIndexText(props.rowNumberWritten),
    ...ariaColIndexText(columnLetters(columnNumber - 1)),
    className: 'sheet-cell',
    'data-is-active': props.isActive || undefined,
    'data-comes-at-key': props.comesAtKey,
    'data-frozen-by': frozenBy ?? undefined,
    'data-has-no-line-at-right': !hasLineAtRight || undefined,
    'data-text-runs-on': isTextBoxOffCell || undefined,
    'data-is-cut-at-end-only': isCutAtEndOnly || undefined,
    'data-may-text-fade': props.mayTextFade || fadesCutLines || undefined,
    'data-is-cut-by-view': props.cutByViewAt !== null || undefined,
    'data-has-fill': paints.fill !== null || undefined,
    'data-turns-chips-white': (usesTextPaint && turnsChipsWhite(paints)) || undefined,
    'data-has-text-paint': (!isTextBoxOffCell && usesTextPaint) || undefined,
    'data-has-tint-of-filter-header': props.hasTintOfFilterHeader || undefined,
    'data-has-ground-of-found-header': props.hasGroundOfFoundHeader || undefined,
    'data-is-in-table': props.isInTable || undefined,
    'data-is-in-hand': props.isInHand || undefined,
    'data-corners-of-table': props.cornersOfTable ?? undefined,
    'data-has-color-of-heading': props.hasColorOfHeading || undefined,
    'data-has-weight-of-heading': (props.isHeadingOfTable && !format.font.bold && !isTextWrapped) || undefined,
    'data-mark-of-import': props.markOfImport ?? undefined,
    'data-words-for-voiceover': hasWordsForReader && blankCellWords === 'whereAPressActsByCss' ? (cellLabel ?? sheetMessages.blankCell()) : undefined,
    style: {
      ...(props.markOfImport !== null && importMarkDelayStyle(props.markOfImportDelayMs)),
      left: bodyLeft + left,
      width: width,
      top: top,
      height: height,
      ...textClearanceStyle(textClearance, hasChip ? density : null),
      ...(isPerson || linkUrl !== null ? whiteOwedStyle(textOverflowAtSides(textClearance, alignment)) : undefined),
      ...(props.takenAtRight > 0
        ? {
            paddingRight: props.takenAtRight + (hasLineAtRight ? 0 : 1),
          }
        : undefined),
      ...clipInsetStyle({
        left: hiddenAtLeft,
        top: hiddenAtTop,
        right: 0,
        bottom: 0,
      }),
      ...(props.cutByViewAt !== null && cutByViewStyle(props.cutByViewAt)),
      ...fillPaintStyle(paints.fill),
      ...(isTextBoxOffCell ? undefined : cellStyle),
    },
    children: [
      hasWordsForReader &&
        blankCellWords !== 'whereAPressActsByCss' &&
        jsx(WordsForScreenReader, {
          words: cellLabel ?? sheetMessages.blankCell(),
        }),
      checkbox !== null
        ? jsx(CellCheckbox, {
            checkbox: checkbox,
          })
        : isTextBoxOffCell
          ? jsx(TextThatRunsOn, {
              left: textLeft - left,
              cell: props,
              style: cellStyle,
              hasTextPaint: usesTextPaint,
              children: jsx('span', {
                style: {
                  textDecorationLine: textDecorationLine,
                },
                children: value8(value4),
              }),
            })
          : linkUrl !== null && props.linkDrawnAs === 'words'
            ? isTextWrapped
              ? jsx('span', {
                  className: 'sheet-wrapped-text',
                  style: {
                    textAlign: alignment,
                    ...wrappedTextLineStyle(format.font.size),
                  },
                  children: value9(linkUrl),
                })
              : value9(linkUrl)
            : linkUrl !== null
              ? jsx(CellLinkSpan, {
                  url: linkUrl,
                  cellKeyOfWords: null,
                  holdsChip: githubLinkFace(linkUrl) !== null,
                  children: jsx(LinkAddressOrGithubChip, {
                    url: linkUrl,
                    isTypedWithWww: props.linkDrawnAs === 'addressWithoutScheme',
                  }),
                })
              : isPerson
                ? jsx(PeopleChips, {
                    first: {
                      name: text,
                      avatarUrl: avatarUrl,
                    },
                    firstName: value6,
                    textDecorationLine: textDecorationLine,
                    others: otherPeople,
                    cellWidth: width,
                    font: format.font,
                    opensList: opensPeopleList,
                  })
                : isPillFillingCell
                  ? jsx(CellChip, {
                      optionPaints: pill,
                      hasBox: pill !== null,
                      fillsCell: true,
                      isBlank: pill !== null && text === '',
                      isBold: format.font.bold,
                      textProps: {
                        style: {
                          textAlign: alignment,
                        },
                      },
                      after: opensDropdownList && MENU_CARETS.chipInCell,
                      children: value6,
                    })
                  : props.takenAtRight > 0 && !isTextWrapped
                    ? jsx('span', {
                        className: 'sheet-text-short-of-button',
                        'data-ends-at-button': (value7 !== null && fadesFromRightButton(props)) || undefined,
                        children: value8(value6),
                      })
                    : value8(value6),
    ],
  });
}, areCellPropsEqual);
export const AriaPlaceKeeper = ({ role: role }: Dynamic) =>
  jsx('div', {
    role: role,
    style: {
      position: 'absolute',
      width: 0,
      height: 0,
    },
  });
export const ARE_ROWS_NAMED_HERE =
  IS_APPLE_PLATFORM && !IS_IOS_BROWSER && typeof CSS < 'u' && !CSS.supports('-moz-appearance', 'none') && !CSS.supports('font', '-apple-system-body');
export const COMMENT_DESCRIPTION_ID = 'comment-description';
export const COMMENT_SHORTCUT = IS_APPLE_PLATFORM ? 'Meta+Alt+M' : 'Control+Alt+M';
export const COMMENT_CORNER_ATTR = 'data-comment-corner';
export const COMMENT_LAYER_ATTR = 'data-comment-layer';
export const boxInBody = (input?: Dynamic, options?: Dynamic) => ({
  left: options.left + input.left,
  top: options.top + input.top,
  width: input.width,
  height: input.height,
});
export const gridlineOverlap = (input?: Dynamic) => ({
  x: input.left >= 1 ? 1 : 0,
  y: input.top >= 1 ? 1 : 0,
});
export const outlineBoxInBody = (input?: Dynamic, options?: Dynamic) => boxInBody(boxWithGridline(input), options);
export const nameFlagsStyle = (input?: Dynamic, options?: Dynamic, context?: Dynamic, value?: Dynamic) => {
  let value2 = outlineBoxInBody(options.box, value);
  let value3 = context.find((input2?: Dynamic) => input2.key === input)?.box;
  let value4 = outlineBoxInBody(value3 ?? options.box, value);
  return {
    ...flagPlaceStyle(options, value3, value),
    '--sheet-width-of-first-outline': `${value4.left + value4.width - value2.left}px`,
  };
};
export const FAR_CLIP_INSET = -9999;
export const flagPlaceStyle = (input?: Dynamic, options?: Dynamic, context?: Dynamic) => {
  let { showsIn: box } = input.box;
  let value = outlineBoxInBody(input.box, context);
  let value2 = options !== undefined && options.left < box.left;
  let value3 = context.left + box.left - value.left;
  let value4 = value2 && value3 > 0 ? value3 : FAR_CLIP_INSET;
  let value5 = flagTop(input) < box.top ? context.top + box.top - value.top : FAR_CLIP_INSET;
  return value4 === FAR_CLIP_INSET && value5 === FAR_CLIP_INSET
    ? value
    : {
        ...value,
        clipPath: `inset(${value5}px ${FAR_CLIP_INSET}px ${FAR_CLIP_INSET}px ${value4}px)`,
      };
};
export const clipInsetStyle = ({ top: top, right: right, bottom: bottom, left: left }: Dynamic) =>
  top + right + bottom + left === 0
    ? {}
    : {
        clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px)`,
      };
export const NO_GRIDLINE_OVERLAP = {
  x: 0,
  y: 0,
};
export const clippedBoxStyle = (input?: Dynamic, options?: Dynamic) => ({
  ...outlineBoxInBody(input, options),
  ...clipInsetStyle({
    ...hiddenInsetOfBox(input, gridlineOverlap(input)),
    right: Math.max(0, input.left + input.width - (input.showsIn.left + input.showsIn.width)),
    bottom: Math.max(0, input.top + input.height - (input.showsIn.top + input.showsIn.height)),
  }),
});
export const ENTRY_CLIP_OVERSHOOT = 12;
export const ENTRY_TEXT_NUDGE = 2;
export const SUMMARY_EDGE_GAP = 1;
export const selectionSummaryStyle = ({ center: center, top: top, height: height }: Dynamic, options?: Dynamic) => ({
  left: options.left + center,
  top: options.top + top,
  height: height,
  maxWidth: options.width - 2 * SUMMARY_EDGE_GAP,
  translate: `clamp(${SUMMARY_EDGE_GAP - center}px, -50%, calc(${options.width - SUMMARY_EDGE_GAP - center}px - 100%))`,
});
export const NO_CELLS_AS_BEFORE: Dynamic = [];
export const gridlinesDataAttribute = ({ areGridlinesHidden: areGridlinesHidden }: Dynamic) => ({
  'data-hides-gridlines': areGridlinesHidden || undefined,
});
export const FilterButtonGround = React.memo(function ({
  box: { left: input, top: input2, width: input3, height: input4, fade: input5 },
  grounds: grounds,
  body: body,
}: Dynamic) {
  let state = {
    left: body.left + input,
    top: body.top + input2,
    width: input3,
    height: input4,
    '--sheet-fade-of-ground': `${input5}px`,
  };
  return jsx('div', {
    'aria-hidden': true,
    className: 'sheet-ground-of-filter-button-held',
    style: state,
    children: grounds.map(
      ({ left: left, width: width, ground: ground }: Dynamic) =>
        jsx(
          'div',
          {
            'data-ground': typeof ground === 'string' ? ground : 'fill',
            style: {
              left: left - input,
              width: width,
              ...fillPaintStyle(typeof ground === 'string' ? null : ground),
            },
          },
          left,
        ),
    ),
  });
});
export const HEADER_KEPT_SHADOW = 32;
export const CopiedRowsDrawing = React.memo(function ({
  rows: rows,
  borderLines: borderLines,
  body: body,
  density: density,
}: Dynamic) {
  return jsxs(Fragment, {
    children: [
      rows.map(
        (row?: Dynamic) =>
          jsx(
            GridRow,
            {
              row: row,
              body: body,
              density: density,
              cellsAsBefore: NO_CELLS_AS_BEFORE,
            },
            row.key,
          ),
      ),
      borderLines !== null &&
        jsx(BorderLines, {
          grid: {
            body: body,
            borderLines: borderLines,
          },
        }),
    ],
  });
});
export const RidingRowsDrawing = React.memo(function ({
  rows: rows,
  borderLines: borderLines,
  body: body,
  density: density,
}: Dynamic) {
  return jsxs(Fragment, {
    children: [
      rows.map(
        (row?: Dynamic) =>
          jsx(
            GridRow,
            {
              row: row,
              body: body,
              density: density,
              cellsAsBefore: NO_CELLS_AS_BEFORE,
            },
            row.key,
          ),
      ),
      jsx(BorderLines, {
        grid: {
          body: body,
          borderLines: borderLines,
        },
      }),
    ],
  });
});
export const NO_CORNERS_CALLED_UP: Dynamic = [];
