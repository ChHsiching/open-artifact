import type { Dynamic } from '../dynamic.ts';
import { isSameJson, importTextAt, optionsLimitedToColumns, doOptionsDiffer } from './column-readings.ts';
export function applyByHandChange(byHand?: Dynamic, change?: Dynamic) {
  switch (change.kind) {
    case 'sheetName':
      return {
        ...byHand,
        sheetName: change.name,
      };
    case 'headings':
      return {
        ...byHand,
        headings: {
          line: change.line,
        },
      };
    case 'line':
      return {
        ...byHand,
        lines: {
          ...byHand.lines,
          [change.line]: change.isLeftOut,
        },
      };
    case 'column': {
      let { kind: kind, columnIndex: columnIndex, ...columnChange } = change;
      let column = {
        ...byHand.columns[columnIndex],
        ...columnChange,
      };
      return {
        ...byHand,
        columns: {
          ...byHand.columns,
          [columnIndex]: column,
        },
      };
    }
  }
}
export function questionOptionOfReading(questions?: Dynamic, columnIndex?: Dynamic, reading?: Dynamic) {
  let readings = [
    {
      columnIndex: columnIndex,
      reading: reading,
    },
  ];
  for (let { id: questionId, options: options } of questions as Dynamic) {
    let optionIndex = options.findIndex(({ readings: readings2 }: Dynamic) => isSameJson(readings2, readings));
    if (optionIndex >= 0)
      return {
        questionId: questionId,
        optionIndex: optionIndex,
      };
  }
  return null;
}
export function wordIndexesIn(text?: Dynamic, word?: Dynamic) {
  let indexes: Dynamic = [];
  if (word === '') return indexes;
  for (let index: Dynamic = text.indexOf(word); index >= 0; index = text.indexOf(word, index + 1)) {
    let end = index + word.length;
    let isPlural = word.length >= 3 && text[end] === 's';
    if (!isWordCharacterOfNote(text[index - 1]) && !isWordCharacterOfNote(text[isPlural ? end + 1 : end])) indexes.push(index);
  }
  return indexes;
}
export function withoutTrailingParenthesis(name?: Dynamic) {
  let openIndex = name.endsWith(')') ? name.lastIndexOf('(') : -1;
  return openIndex < 0 ? name : name.slice(0, openIndex).trimEnd();
}
export function columnsNamedInNote(note?: Dynamic, columns?: Dynamic) {
  let columnsByName = new (Map as Dynamic)();
  let lowerNames = columns.map(({ name: name }: Dynamic) => name.toLowerCase());
  lowerNames.forEach((name?: Dynamic, columnIndex?: Dynamic) => {
    columnsByName.set(name, [...(columnsByName.get(name) ?? []), columnIndex]);
  });
  lowerNames.forEach((name?: Dynamic, columnIndex?: Dynamic) => {
    let shortName = withoutTrailingParenthesis(name);
    if (lowerNames.includes(shortName)) return;
    columnsByName.set(shortName, [...(columnsByName.get(shortName) ?? []), columnIndex]);
  });
  let lowerNote: Dynamic = note.toLowerCase();
  let namedColumns = new (Set as Dynamic)();
  let longestFirst = [...columnsByName].toSorted(([a]: Dynamic, [b2]: Dynamic) => b2.length - a.length);
  for (let [value, value2] of longestFirst as Dynamic)
    for (let value3 of wordIndexesIn(lowerNote, value) as Dynamic) {
      for (let value4 of value2 as Dynamic) namedColumns.add(value4);
      lowerNote = lowerNote.slice(0, value3) + ' '.repeat(value.length) + lowerNote.slice(value3 + value.length);
    }
  return [...namedColumns].toSorted((input?: Dynamic, options?: Dynamic) => input - options);
}
export function changesByHand(
  plan: Dynamic,
  { sheetName: sheetName, headings: headings, lines: lines, columns: columns }: Dynamic,
  previousPlan: Dynamic = null,
) {
  let headerLine = headings === null ? plan.headerLine : headings.line;
  return [
    ...(headings !== null && headings.line !== plan.headerLine
      ? [
          {
            kind: 'headings',
          },
        ]
      : []),
    ...Object.entries(lines).flatMap(
      ([line, isLeftOut]: Dynamic) =>
        Number(line) <= (headerLine ?? 0) || isLeftOut === plan.linesLeftOut.includes(Number(line))
          ? []
          : [
              {
                kind: 'line',
                line: Number(line),
              },
            ],
    ),
    ...(sheetName !== null && ![sheetName, previousPlan?.sheetName].includes(plan.sheetName)
      ? [
          {
            kind: 'sheetName',
          },
        ]
      : []),
    ...Object.entries(columns).flatMap(([columnIndex, { name: name, reading: reading }]: Dynamic) => {
      let planColumn = plan.columns[Number(columnIndex)];
      return (reading !== undefined && !isSameJson(reading, planColumn?.reading)) ||
        (name !== undefined && ![name, previousPlan?.columns[Number(columnIndex)]?.name].includes(planColumn?.name))
        ? [
            {
              kind: 'column',
              columnIndex: Number(columnIndex),
            },
          ]
        : [];
    }),
  ];
}
export function notesStillTrue(plan?: Dynamic, byHand?: Dynamic) {
  let changes = changesByHand(plan, byHand);
  let isColumnTouched = (columnIndex?: Dynamic) =>
    byHand.columns[columnIndex]?.isLeftOut === true ||
    changes.some((input?: Dynamic) => input.kind === 'column' && input.columnIndex === columnIndex);
  let isAboutTouchedLine = (note?: Dynamic) => {
    let numbers = new (Set as Dynamic)((note.match(/(?<![\d.,:/$€£¥-])\d+(?![.,:/]?\d|%)/g) ?? []).map(Number));
    return changes.some((input?: Dynamic) => input.kind === 'line' && plan.linesLeftOut.includes(input.line) && numbers.has(input.line));
  };
  return plan.notes.filter((note?: Dynamic) => !columnsNamedInNote(note, plan.columns).some(isColumnTouched) && !isAboutTouchedLine(note));
}
export function byHandAfterNewPlan(byHand?: Dynamic, plans?: Dynamic, newPlan?: Dynamic) {
  let isUnlikeAll = (value4?: Dynamic, valueOf?: Dynamic) =>
    [value4, ...plans.map(valueOf)].every((other?: Dynamic) => !isSameJson(valueOf(newPlan), other));
  let { sheetName: value, headings: value2, columns: value3 } = byHand;
  return {
    ...byHand,
    sheetName: value !== null && isUnlikeAll(value, (input?: Dynamic) => input.sheetName) ? null : value,
    headings: value2 !== null && isUnlikeAll(value2.line, (input?: Dynamic) => input.headerLine) ? null : value2,
    columns: Object.fromEntries(
      Object.entries(value3).flatMap(([columnIndex, { name: name, reading: reading, isLeftOut: isLeftOut }]: Dynamic) => {
        let index = Number(columnIndex);
        let kept = {
          ...(name !== undefined &&
            !isUnlikeAll(name, (input?: Dynamic) => input.columns[index]?.name) && {
              name: name,
            }),
          ...(reading !== undefined &&
            !isUnlikeAll(reading, (input?: Dynamic) => input.columns[index]?.reading) && {
              reading: reading,
            }),
          ...(isLeftOut !== undefined && {
            isLeftOut: isLeftOut,
          }),
        };
        return Object.keys(kept).length === 0 ? [] : [[columnIndex, kept]];
      }),
    ),
  };
}
export function linesWithByHand(plan?: Dynamic, byHand?: Dynamic, file?: Dynamic) {
  let headerLine = byHand.headings === null ? plan.headerLine : byHand.headings.line;
  let linesAboveHeader =
    headerLine === null ? file.lines.slice(0, (plan.headerLine ?? 1) - 1).map((line?: Dynamic, index?: Dynamic) => index + 1) : [];
  let leftOut = new (Set as Dynamic)([...linesAboveHeader, ...plan.linesLeftOut]);
  for (let [value, value2] of Object.entries(byHand.lines) as Dynamic)
    if (value2) leftOut.add(Number(value));
    else leftOut.delete(Number(value));
  let linesLeftOut = [...leftOut].filter((input?: Dynamic) => input > (headerLine ?? 0));
  linesLeftOut.sort((input?: Dynamic, options?: Dynamic) => input - options);
  return {
    headerLine: headerLine,
    linesLeftOut: linesLeftOut,
  };
}
export function planWithByHand(plan?: Dynamic, byHand?: Dynamic, file?: Dynamic, blankColumns?: Dynamic) {
  let { headerLine: headerLine, linesLeftOut: linesLeftOut } = linesWithByHand(plan, byHand, file);
  let headingAt = (columnIndex?: Dynamic) => {
    let heading = headerLine === null ? '' : importTextAt(file, headerLine, columnIndex).trim();
    return heading === '' ? (blankColumns.columns[columnIndex] ?? '') : heading;
  };
  return {
    ...plan,
    sheetName: byHand.sheetName ?? plan.sheetName,
    headerLine: headerLine,
    linesLeftOut: linesLeftOut,
    columns: plan.columns.map(
      (column?: Dynamic, columnIndex?: Dynamic) => ({
        name: byHand.columns[columnIndex]?.name ?? (headerLine === plan.headerLine ? column.name : headingAt(columnIndex)),
        reading: byHand.columns[columnIndex]?.reading ?? column.reading,
      }),
    ),
    questions: questionsLeftByHand(byHand, plan.questions),
    notes: notesStillTrue(plan, byHand),
    summary: summaryStillTrue(plan, byHand),
  };
}
export const NOTHING_BY_HAND = {
  sheetName: null,
  headings: null,
  lines: {},
  columns: {},
};
export const withoutReadingsByHand = (byHand?: Dynamic, columnIndexes?: Dynamic) => ({
  ...byHand,
  columns: Object.fromEntries(
    Object.entries(byHand.columns).map(([columnIndex, column]: Dynamic) => {
      let { reading: reading, ...withoutReading } = column;
      return [columnIndex, columnIndexes.includes(Number(columnIndex)) ? withoutReading : column];
    }),
  ),
});
export const isWordCharacterOfNote = (character?: Dynamic) => character !== undefined && /[\p{L}\p{N}]/u.test(character);
export const summaryStillTrue = (plan?: Dynamic, byHand?: Dynamic) =>
  changesByHand(plan, byHand).some(({ kind: kind }: Dynamic) => kind === 'headings') ? null : (plan.summary ?? null);
export const columnsLeftOutByHand = ({ columns: columns }: Dynamic) =>
  Object.entries(columns).flatMap(([columnIndex, { isLeftOut: isLeftOut }]: Dynamic) => (isLeftOut === true ? [Number(columnIndex)] : []));
export const questionsLeftByHand = ({ columns: columns }: Dynamic, questions?: Dynamic) =>
  questions.flatMap((question?: Dynamic) => {
    let options = optionsLimitedToColumns(question, (columnIndex?: Dynamic) => columns[columnIndex]?.reading === undefined);
    return doOptionsDiffer(options)
      ? [
          {
            ...question,
            options: options,
          },
        ]
      : [];
  });
