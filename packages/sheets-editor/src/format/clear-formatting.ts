import type { Dynamic } from '../dynamic.ts';
import { selectionOfArea, selectedArea, mergedAreaOrCellOf } from '../selection/model.ts';
import { withNoEffects } from '../state/transitions.ts';
import { richTextMarksOfCell } from '../model/cell-values.ts';
import { cellBlockOfSelection } from '../model/cell-blocks.ts';
import { isRangeInSight } from '../grid/geometry.ts';
import { layoutOfView } from '../grid/layout.ts';
import { queueEdits, IF_QUEUED_DEFAULTS } from '../model/edit-effects.ts';
import { DEFAULT_CELL_FORMAT } from '../model/cell-format.ts';
import { colorsEqual } from '../model/colors.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export let DEFAULT_CELL_CONTROL: Dynamic;
export let DEFAULT_BORDER: Dynamic;
export let DEFAULT_NUMBER_FORMAT: Dynamic;
export let DEFAULT_FONT: Dynamic;
export let DEFAULT_ALIGNMENT: Dynamic;
export let DEFAULT_FORMAT_REST: Dynamic;
export function resetPatchOf(defaults?: Dynamic, current?: Dynamic) {
  let patch: Dynamic = {};
  for (let key in defaults) {
    let value = current[key];
    if (value === null || !isSameFormatPart(value, defaults[key])) patch[key] = defaults[key];
  }
  return patch;
}
export function touchesBorders(
  state: PageState,
  reads: WorkbookReads,
  { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount }: Dynamic,
  format?: Dynamic,
) {
  if (['top', 'right', 'bottom', 'left'].some((side?: Dynamic) => hasBorderSide(format.border, side))) return true;
  let rowStrip = {
    leftColumnIndex: leftColumnIndex,
    columnCount: columnCount,
    rowCount: 1,
  };
  let columnStrip = {
    topRowIndex: topRowIndex,
    rowCount: rowCount,
    columnCount: 1,
  };
  return [
    [
      'bottom',
      {
        ...rowStrip,
        topRowIndex: topRowIndex - 1,
      },
    ],
    [
      'top',
      {
        ...rowStrip,
        topRowIndex: topRowIndex + rowCount,
      },
    ],
    [
      'right',
      {
        ...columnStrip,
        leftColumnIndex: leftColumnIndex - 1,
      },
    ],
    [
      'left',
      {
        ...columnStrip,
        leftColumnIndex: leftColumnIndex + columnCount,
      },
    ],
  ].some(([side, area]: Dynamic) => {
    let selection = selectionOfArea(state, reads, area);
    let neighbourFormat = selection === null ? null : reads.sharedFormatBetween(selection.activeCell, selection.selectionCorner);
    return neighbourFormat !== null && hasBorderSide(neighbourFormat.border, side);
  });
}
export function clearFormattingOfSelection(state: PageState, reads: ReadsWithTextMeasurer) {
  let area = selectedArea(state, reads);
  let selection = area === null ? null : selectionOfArea(state, reads, area);
  if (area === null || selection === null) return withNoEffects(state);
  let format = reads.sharedFormatBetween(selection.activeCell, selection.selectionCorner);
  if (format === null) return withNoEffects(state);
  let numberFormatKinds =
    format.numberFormat === null
      ? reads.cellsOnShowIn(state.sheetId, area).map((cellId?: Dynamic) => reads.formatOf(cellId).numberFormat.kind)
      : [format.numberFormat.kind];
  let resetsNumberFormat =
    format.cellControl?.kind === 'none' && !numberFormatKinds.some((kind?: Dynamic) => DATE_LIKE_FORMAT_KINDS.has(kind));
  let { pattern: generalPattern } = DEFAULT_NUMBER_FORMAT;
  let richTextMarks = new (Set as Dynamic)(
    reads.filledCellsIn(state.sheetId, area).flatMap((cellId?: Dynamic) => richTextMarksOfCell(reads.cellOf(cellId))),
  );
  let fontPatch = {
    ...resetPatchOf(DEFAULT_FONT, format.font),
    ...(richTextMarks.has('bold') && {
      bold: DEFAULT_FONT.bold,
    }),
    ...(richTextMarks.has('italic') && {
      italic: DEFAULT_FONT.italic,
    }),
    ...(richTextMarks.has('underline') && {
      underline: DEFAULT_FONT.underline,
    }),
    ...(richTextMarks.has('strikethrough') && {
      strikethrough: DEFAULT_FONT.strikethrough,
    }),
  };
  let alignmentPatch = resetPatchOf(DEFAULT_ALIGNMENT, format.alignment);
  let formatPatch = {
    ...resetPatchOf(DEFAULT_FORMAT_REST, format),
    ...(hasAnyKey(fontPatch) && {
      font: fontPatch,
    }),
    ...(hasAnyKey(alignmentPatch) && {
      alignment: alignmentPatch,
    }),
    ...(resetsNumberFormat &&
      format.numberFormat?.pattern !== generalPattern && {
        numberFormat: {
          pattern: generalPattern,
        },
      }),
  };
  let cells = cellBlockOfSelection(state, reads, selection);
  if (cells === null) return withNoEffects(state);
  let edits = [
    ...(reads.hasBorderLine(state.sheetId) && touchesBorders(state, reads, area, format)
      ? [
          {
            kind: 'setBorders',
            cells: cells,
            edges: 'all',
            border: {
              kind: 'none',
            },
          },
        ]
      : []),
    ...(hasAnyKey(formatPatch)
      ? [
          {
            kind: 'formatCells',
            cells: cells,
            format: formatPatch,
          },
        ]
      : []),
  ];
  let activeArea = mergedAreaOrCellOf(reads, state.activeCell);
  let isActiveInSight = activeArea !== null && isRangeInSight(activeArea, state, layoutOfView(state, reads), state);
  return queueEdits(
    state,
    edits,
    {
      ...IF_QUEUED_DEFAULTS,
      select: isActiveInSight ? state : null,
      done: 'formattingCleared',
      leavesEntryOpen: true,
    },
    {
      isEachPointedAt: false,
    },
  );
}
({
  cellControl: DEFAULT_CELL_CONTROL,
  border: DEFAULT_BORDER,
  numberFormat: DEFAULT_NUMBER_FORMAT,
  font: DEFAULT_FONT,
  alignment: DEFAULT_ALIGNMENT,
  ...DEFAULT_FORMAT_REST
} = DEFAULT_CELL_FORMAT);
export const isSameFormatPart = (value?: Dynamic, other?: Dynamic) =>
  typeof value === 'object' && typeof other === 'object' ? colorsEqual(value, other) : value === other;
export const hasAnyKey = (record?: Dynamic) => Object.keys(record).length > 0;
export const DATE_LIKE_FORMAT_KINDS = new (Set as Dynamic)(['date', 'time', 'dateAndTime', 'duration']);
export const hasBorderSide = (border?: Dynamic, side?: Dynamic) => border[side]?.kind !== 'none';
