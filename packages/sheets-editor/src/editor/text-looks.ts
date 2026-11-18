import type { Dynamic } from '../dynamic.ts';
export function isFontMarkOn(mark: Dynamic, { font: font }: Dynamic) {
  switch (mark) {
    case 'bold':
    case 'italic':
    case 'strikethrough':
      return font[mark] === true;
    case 'underline':
      return font.underline === 'single' || font.underline === 'double';
  }
}
export function fontMarkFormat(mark?: Dynamic, isOn?: Dynamic) {
  switch (mark) {
    case 'bold':
      return {
        bold: isOn,
      };
    case 'italic':
      return {
        italic: isOn,
      };
    case 'strikethrough':
      return {
        strikethrough: isOn,
      };
    case 'underline':
      return {
        underline: isOn ? 'single' : 'none',
      };
  }
}
export function toggledFontMark(mark?: Dynamic, font?: Dynamic) {
  return fontMarkFormat(mark, !isFontMarkOn(mark, font));
}
export function diffShiftedToCaret(shift: Dynamic, { from: from, to: to, written: written }: Dynamic, before: Dynamic, after: Dynamic) {
  if (shift <= 0 || shift > from || (from !== to && written !== '')) return null;
  let [text, distance] = from === to ? [after, written.length] : [before, to - from];
  for (let index = from - shift; index < from; index += 1) if (text[index] !== text[index + distance]) return null;
  let shiftedFrom = from - shift;
  return {
    from: shiftedFrom,
    to: to - shift,
    written: after.slice(shiftedFrom, shiftedFrom + written.length),
  };
}
export function diffTexts(before?: Dynamic, after?: Dynamic, caret?: Dynamic) {
  let shorterLength = Math.min(before.length, after.length);
  let from: Dynamic = 0;
  while (from < shorterLength && before[from] === after[from]) from += 1;
  if (isHighSurrogate(before[from - 1])) from -= 1;
  let sameAtEnd: Dynamic = 0;
  while (sameAtEnd < shorterLength - from && before.at(-1 - sameAtEnd) === after.at(-1 - sameAtEnd)) sameAtEnd += 1;
  if (sameAtEnd > 0 && isLowSurrogate(before.at(-sameAtEnd))) sameAtEnd -= 1;
  let diff = {
    from: from,
    to: before.length - sameAtEnd,
    written: after.slice(from, after.length - sameAtEnd),
  };
  if (caret === undefined) return diff;
  return diffShiftedToCaret(diff.from + diff.written.length - caret, diff, before, after) ?? diff;
}
export function mergeLookRuns(runs?: Dynamic) {
  let merged: Dynamic = [];
  for (let run of runs as Dynamic) {
    let last = merged.at(-1);
    if (run.length === 0) continue;
    if (last !== undefined && isSameLook(last, run))
      merged[merged.length - 1] = {
        ...last,
        length: last.length + run.length,
      };
    else merged.push(run);
  }
  return merged;
}
export function sliceLookRuns(runs?: Dynamic, from?: Dynamic, to?: Dynamic) {
  let position: Dynamic = 0;
  return runs.flatMap((run?: Dynamic) => {
    let [start, end] = [Math.max(from, position), Math.min(to, position + run.length)];
    position += run.length;
    return end > start
      ? [
          {
            ...run,
            length: end - start,
          },
        ]
      : [];
  });
}
export function joinLookLines(lines?: Dynamic, marksIfEmpty?: Dynamic) {
  let { marks: firstMarks } = lines.flat()[0] ?? {
    marks: marksIfEmpty,
  };
  let runs: Dynamic = [];
  for (let [lineIndex, lineRuns] of lines.entries() as Dynamic) {
    if (lineIndex > 0)
      runs.push({
        length: 1,
        marks: runs.at(-1)?.marks ?? firstMarks,
        link: null,
      });
    (runs.push as Dynamic)(...lineRuns);
  }
  return mergeLookRuns(runs);
}
export function lookRunsByLine(runs?: Dynamic, text?: Dynamic) {
  let position: Dynamic = 0;
  return textLines(text).map(
    (line?: Dynamic) => ((position += line.length + 1), sliceLookRuns(runs, position - line.length - 1, position - 1)),
  );
}
export function looksFromRichText({ paragraphs: paragraphs }: Dynamic, marksOn?: Dynamic, leadLength?: Dynamic) {
  let { stretches: stretches, lists: lists } = looksFromLines(
    paragraphs.map(
      ({ list: list, runs: runs }: Dynamic) => ({
        list: list,
        stretches: runs.map(
          ({ text: text, marks: marks, link: link }: Dynamic) => ({
            length: text.length,
            marks: fontMarksWhere((input?: Dynamic) => marks.includes(input) || marksOn.includes(input)),
            link: link,
          }),
        ),
      }),
    ),
    marksOn,
  );
  return {
    stretches: mergeLookRuns([
      {
        length: leadLength,
        marks: stretches[0]?.marks ?? marksOn,
        link: null,
      },
      ...stretches,
    ]),
    lists: lists,
  };
}
export function listsAfterTyping(lists: Dynamic, textBefore: Dynamic, { from: from, to: to, written: written }: Dynamic) {
  let [firstLine, lastLine] = [lineIndexAt(textBefore, from), lineIndexAt(textBefore, to)];
  if (
    firstLine === lastLine &&
    !written.includes(`
`)
  )
    return lists;
  let isFromLineStart =
    from === 0 ||
    textBefore[from - 1] ===
      `
`;
  let isToLineEnd =
    textBefore[to - 1] ===
      `
` ||
    (to < textBefore.length &&
      textBefore[to] !==
        `
`);
  if (written === '' && isFromLineStart && isToLineEnd) return [...lists.slice(0, firstLine), ...lists.slice(lastLine)];
  let addedLists = textLines(written)
    .slice(1)
    .map(() => uncheckedList(lists[firstLine] ?? NO_LIST));
  return from === to && /^\n+$/.test(written) && isFromLineStart
    ? [...lists.slice(0, firstLine), ...addedLists, ...lists.slice(firstLine)]
    : [...lists.slice(0, firstLine + 1), ...addedLists, ...lists.slice(lastLine + 1)];
}
export function looksAfterTyping(
  { stretches: stretches, lists: lists }: Dynamic,
  textBefore?: Dynamic,
  textAfter?: Dynamic,
  caret?: Dynamic,
  marksIfNone: Dynamic = PLAIN_LOOK.marks,
) {
  let diff = diffTexts(textBefore, textAfter, caret);
  let { from: from, to: to, written: written } = diff;
  let [looksBefore, looksAfter] = [sliceLookRuns(stretches, 0, from), sliceLookRuns(stretches, to, textBefore.length)];
  let marks = (looksBefore.at(-1) ?? sliceLookRuns(stretches, from, to)[0] ?? looksAfter[0])?.marks ?? marksIfNone;
  let link = looksBefore.at(-1)?.link === looksAfter[0]?.link ? (looksAfter[0]?.link ?? null) : null;
  let writtenRuns =
    written === ''
      ? []
      : [
          {
            length: written.length,
            marks: marks,
            link: link,
          },
        ];
  return {
    stretches: looksForText([...looksBefore, ...writtenRuns, ...looksAfter], textAfter),
    lists: listsAfterTyping(lists, textBefore, diff),
  };
}
export function marksAcross({ stretches: stretches }: Dynamic, text?: Dynamic, from?: Dynamic, to?: Dynamic) {
  let position: Dynamic = 0;
  let runsAcross = textLines(text).flatMap(
    (line?: Dynamic) => (
      (position += line.length + 1),
      sliceLookRuns(stretches, Math.max(from, position - line.length - 1), Math.min(to, position - 1))
    ),
  );
  return fontMarksWhere(
    (input?: Dynamic) => runsAcross.length > 0 && runsAcross.every(({ marks: marks }: Dynamic) => marks.includes(input)),
  );
}
export function linkSpansOfLooks({ stretches: stretches }: Dynamic) {
  let spans: Dynamic = [];
  let position: Dynamic = 0;
  for (let { length: length, link: link } of stretches as Dynamic) {
    let last = spans.at(-1);
    if (link !== null && last?.end === position && last.link === link)
      spans[spans.length - 1] = {
        ...last,
        end: position + length,
      };
    else if (link !== null)
      spans.push({
        start: position,
        end: position + length,
        link: link,
      });
    position += length;
  }
  return spans;
}
export function listKindAcross({ lists: lists }: Dynamic, text?: Dynamic, from?: Dynamic, to?: Dynamic) {
  let [firstLine, lastLine] = lineRangeOf(text, from, to);
  let [first, ...rest] = lists.slice(firstLine, lastLine + 1);
  if (first === undefined || first.kind === 'none') return null;
  return rest.every(({ kind: kind }: Dynamic) => kind === first.kind) ? first.kind : null;
}
export function toggleListKind(looks?: Dynamic, text?: Dynamic, from?: Dynamic, to?: Dynamic, kind?: Dynamic) {
  let isAllOfKind = listKindAcross(looks, text, from, to) === kind;
  return mapListsInRange(looks, text, from, to, (list?: Dynamic) => {
    if (isAllOfKind) return NO_LIST;
    if (list.kind === kind) return list;
    let level = list.kind === 'none' ? 0 : list.level;
    return kind === 'checkbox'
      ? {
          kind: kind,
          level: level,
          isChecked: false,
        }
      : {
          kind: kind,
          level: level,
        };
  });
}
export function indentLists(looks?: Dynamic, text?: Dynamic, from?: Dynamic, to?: Dynamic, levelChange?: Dynamic) {
  let [firstLine, lastLine] = lineRangeOf(text, from, to);
  let cannotGoIn = (list?: Dynamic, line?: Dynamic) => {
    if (list.kind === 'none' || line < firstLine || line > lastLine) return false;
    let listAbove = looks.lists[line - 1] ?? NO_LIST;
    let hasParent = listAbove.kind !== 'none' && (line > firstLine || listAbove.level >= list.level);
    return list.level >= LIST_INDENT_LIMIT || !hasParent;
  };
  if (levelChange === 1 && looks.lists.some(cannotGoIn)) return looks;
  return mapListsInRange(
    looks,
    text,
    from,
    to,
    (list?: Dynamic) =>
      list.kind === 'none'
        ? list
        : {
            ...list,
            level: Math.max(0, list.level + levelChange),
          },
  );
}
export function listAtCaret({ lists: lists }: Dynamic, text?: Dynamic, caret?: Dynamic) {
  let line = lineIndexAt(text, caret);
  return {
    line: line,
    list: lists[line] ?? NO_LIST,
    isAtStart:
      caret === 0 ||
      text[caret - 1] ===
        `
`,
    isEmpty: textLines(text)[line] === '',
  };
}
export function trimLooksHistory(looksHistory?: Dynamic) {
  let roomLeft: Dynamic = LOOKS_HISTORY_LIMIT;
  let firstKeptAfter = looksHistory.findLastIndex(({ text: text }: Dynamic) => ((roomLeft -= text.length), roomLeft < 0));
  return looksHistory.slice(firstKeptAfter + 1);
}
export function pushLooksHistory(looksHistory?: Dynamic, entry?: Dynamic) {
  if (entry === undefined)
    return looksHistory === undefined
      ? undefined
      : {
          ...looksHistory,
          toRedo: [],
        };
  return {
    toUndo: trimLooksHistory([...(looksHistory?.toUndo ?? []), entry]),
    toRedo: [],
  };
}
export function stepLooksHistory(looksHistory?: Dynamic, direction?: Dynamic, current?: Dynamic, text?: Dynamic) {
  let { toUndo: toUndo, toRedo: toRedo } = looksHistory ?? {
    toUndo: [],
    toRedo: [],
  };
  let [from, to] = direction === 'undo' ? [toUndo, toRedo] : [toRedo, toUndo];
  let index = from.findLastIndex((input?: Dynamic) => input.text === text);
  let skipped = index < 0 ? [] : from.slice(index + 1);
  skipped.reverse();
  let remaining = index < 0 ? from : from.slice(0, index);
  let moved = trimLooksHistory([...to, ...(current === undefined ? [] : [current]), ...skipped]);
  return {
    looks: from[index]?.looks,
    history:
      direction === 'undo'
        ? {
            toUndo: remaining,
            toRedo: moved,
          }
        : {
            toUndo: moved,
            toRedo: remaining,
          },
  };
}
export function withEntryText(entry?: Dynamic, text?: Dynamic, caret?: Dynamic) {
  let { text: previousText, looks: looks } = entry;
  if (text === previousText) return entry;
  let looksHistory = pushLooksHistory(
    entry.looksInHistory,
    looks === undefined
      ? undefined
      : {
          text: previousText,
          looks: looks,
        },
  );
  return {
    ...entry,
    text: text,
    ...(looks !== undefined && {
      looks: looksAfterTyping(looks, previousText, text, caret),
    }),
    ...(looksHistory !== undefined && {
      looksInHistory: looksHistory,
    }),
  };
}
export function richTextFromLooks(text: Dynamic, { stretches: stretches, lists: lists }: Dynamic) {
  let position: Dynamic = 0;
  return {
    kind: 'textWithLooks',
    paragraphs: lookRunsByLine(stretches, text).map((lineRuns?: Dynamic, line?: Dynamic) => {
      let runs = lineRuns.map(
        ({ length: length, marks: marks, link: link }: Dynamic) => (
          (position += length),
          {
            text: text.slice(position - length, position),
            marks: [...marks],
            link: link,
          }
        ),
      );
      return (
        (position += 1),
        {
          list: lists[line] ?? NO_LIST,
          runs: runs,
        }
      );
    }),
  };
}
export const FONT_MARKS = ['bold', 'italic', 'underline', 'strikethrough'];
export const FONT_MARK_SHORTCUTS = {
  bold: {
    letter: 'b',
    isWithShift: false,
  },
  italic: {
    letter: 'i',
    isWithShift: false,
  },
  underline: {
    letter: 'u',
    isWithShift: false,
  },
  strikethrough: {
    letter: 'x',
    isWithShift: true,
  },
};
export const fontMarkOfShortcut = (keyPress?: Dynamic) =>
  FONT_MARKS.find((mark?: Dynamic) => {
    let { letter: letter, isWithShift: isWithShift } = FONT_MARK_SHORTCUTS[mark];
    return keyPress.isModifierHeld && !keyPress.isAltHeld && letter === keyPress.key.toLowerCase() && isWithShift === keyPress.isShiftHeld;
  });
export const fontMarksOfFormat = (format?: Dynamic) => ({
  bold: isFontMarkOn('bold', format),
  italic: isFontMarkOn('italic', format),
  underline: isFontMarkOn('underline', format),
  strikethrough: isFontMarkOn('strikethrough', format),
});
export const isHighSurrogate = (input?: Dynamic) => input !== undefined && input >= '\uD800' && input <= '\uDBFF';
export const isLowSurrogate = (input?: Dynamic) => input !== undefined && input >= '\uDC00' && input <= '\uDFFF';
export const PLAIN_LOOK = {
  marks: [],
  link: null,
};
export const NO_LIST = {
  kind: 'none',
};
export const isSameLook = (look?: Dynamic, otherLook?: Dynamic) =>
  look.link === otherLook.link &&
  look.marks.length === otherLook.marks.length &&
  look.marks.every((input?: Dynamic, options?: Dynamic) => input === otherLook.marks[options]);
export const isSameList = (list?: Dynamic, otherList?: Dynamic) =>
  list.kind === otherList?.kind &&
  (list.kind === 'none' || otherList.kind === 'none' || list.level === otherList.level) &&
  (list.kind !== 'checkbox' || otherList.kind !== 'checkbox' || list.isChecked === otherList.isChecked);
export const areSameLookLines = (looks?: Dynamic, otherLooks?: Dynamic) =>
  looks.stretches.length === otherLooks.stretches.length &&
  looks.stretches.every(
    (stretch?: Dynamic, index?: Dynamic) =>
      stretch.length === otherLooks.stretches[index]?.length && isSameLook(stretch, otherLooks.stretches[index]),
  ) &&
  looks.lists.length === otherLooks.lists.length &&
  looks.lists.every((list?: Dynamic, index?: Dynamic) => isSameList(list, otherLooks.lists[index]));
export const looksLength = (runs?: Dynamic) => runs.reduce((total?: Dynamic, run?: Dynamic) => total + run.length, 0);
export const textLines = (text?: Dynamic) =>
  text.split(`
`);
export const doLooksFitText = ({ stretches: stretches, lists: lists }: Dynamic, text?: Dynamic) =>
  looksLength(stretches) === text.length && lists.length === textLines(text).length;
export const fontMarksWhere = (isOn?: Dynamic) => FONT_MARKS.filter(isOn);
export const fontMarksOfStyle = ({ font: font }: Dynamic) =>
  fontMarksWhere((input?: Dynamic) => (input === 'underline' ? font.underline !== 'none' : font[input]));
export const plainLooks = (text?: Dynamic, marks?: Dynamic) => ({
  stretches: mergeLookRuns([
    {
      length: text.length,
      marks: marks,
      link: null,
    },
  ]),
  lists: textLines(text).map(() => NO_LIST),
});
export const looksFromLines = (lines?: Dynamic, marksIfEmpty?: Dynamic) => ({
  stretches: joinLookLines(
    lines.map(({ stretches: stretches }: Dynamic) => stretches),
    marksIfEmpty,
  ),
  lists: lines.map(({ list: list }: Dynamic) => list),
});
export const looksForText = (runs?: Dynamic, text?: Dynamic) => joinLookLines(lookRunsByLine(runs, text), runs[0]?.marks ?? []);
export const lineIndexAt = (text?: Dynamic, position?: Dynamic) => textLines(text.slice(0, position)).length - 1;
export const lineRangeOf = (text?: Dynamic, from?: Dynamic, to?: Dynamic) => [
  lineIndexAt(text, from),
  lineIndexAt(
    text,
    from < to &&
      text[to - 1] ===
        `
`
      ? to - 1
      : to,
  ),
];
export const uncheckedList = (list?: Dynamic) =>
  list.kind === 'checkbox'
    ? {
        ...list,
        isChecked: false,
      }
    : list;
export const marksAtCaret = ({ stretches: stretches }: Dynamic, caret?: Dynamic) =>
  (sliceLookRuns(stretches, caret - 1, caret)[0] ?? sliceLookRuns(stretches, caret, caret + 1)[0] ?? PLAIN_LOOK).marks;
export const setMarkInLooks = (looks?: Dynamic, from?: Dynamic, to?: Dynamic, mark?: Dynamic, isOn?: Dynamic) =>
  mergeLookRuns([
    ...sliceLookRuns(looks, 0, from),
    ...sliceLookRuns(looks, from, to).map(
      ({ length: length, marks: marks, link: link }: Dynamic) => ({
        length: length,
        marks: fontMarksWhere((input?: Dynamic) => (input === mark ? isOn : marks.includes(input))),
        link: link,
      }),
    ),
    ...sliceLookRuns(looks, to, looksLength(looks)),
  ]);
export const withMarkSet = (
  { stretches: stretches, lists: lists }: Dynamic,
  from?: Dynamic,
  to?: Dynamic,
  mark?: Dynamic,
  isOn?: Dynamic,
) => ({
  stretches: setMarkInLooks(stretches, from, to, mark, isOn),
  lists: lists,
});
export const withLinkSet = ({ stretches: stretches, lists: lists }: Dynamic, from?: Dynamic, to?: Dynamic, link?: Dynamic) => ({
  stretches: mergeLookRuns([
    ...sliceLookRuns(stretches, 0, from),
    ...sliceLookRuns(stretches, from, to).map(
      ({ length: length, marks: marks }: Dynamic) => ({
        length: length,
        marks: marks,
        link: link,
      }),
    ),
    ...sliceLookRuns(stretches, to, looksLength(stretches)),
  ]),
  lists: lists,
});
export const looksWithRangeReplaced = (
  { stretches: stretches, lists: lists }: Dynamic,
  text?: Dynamic,
  from?: Dynamic,
  to?: Dynamic,
  written?: Dynamic,
) => ({
  stretches: mergeLookRuns([
    ...sliceLookRuns(stretches, 0, from),
    {
      ...(sliceLookRuns(stretches, from, to)[0] ?? PLAIN_LOOK),
      length: written.length,
    },
    ...sliceLookRuns(stretches, to, looksLength(stretches)),
  ]),
  lists: listsAfterTyping(lists, text, {
    from: from,
    to: to,
    written: written,
  }),
});
export const withMarkSetEverywhere = ({ stretches: stretches, lists: lists }: Dynamic, mark?: Dynamic, isOn?: Dynamic) => ({
  stretches: setMarkInLooks(stretches, 0, looksLength(stretches), mark, isOn),
  lists: lists,
});
export const toggleMarkInLooks = (looks?: Dynamic, text?: Dynamic, from?: Dynamic, to?: Dynamic, mark?: Dynamic) => ({
  stretches: looksForText(setMarkInLooks(looks.stretches, from, to, mark, !marksAcross(looks, text, from, to).includes(mark)), text),
  lists: looks.lists,
});
export const mapListsInRange = (
  { stretches: stretches, lists: lists }: Dynamic,
  text?: Dynamic,
  from?: Dynamic,
  to?: Dynamic,
  change?: Dynamic,
) => {
  let [firstLine, lastLine] = lineRangeOf(text, from, to);
  return {
    stretches: stretches,
    lists: lists.map((list?: Dynamic, line?: Dynamic) => (line < firstLine || line > lastLine ? list : change(list))),
  };
};
export const MAX_LIST_LEVEL = 7;
export const isListLevel = (level?: Dynamic) => Number.isInteger(level) && level >= 0 && level <= MAX_LIST_LEVEL;
export const LIST_INDENT_LIMIT = 2;
export const clearListAt = (looks?: Dynamic, text?: Dynamic, at?: Dynamic) =>
  mapListsInRange(looks, text, at, at, () => NO_LIST);
export const setListAt = (looks?: Dynamic, text?: Dynamic, at?: Dynamic, list?: Dynamic) =>
  mapListsInRange(looks, text, at, at, () => list);
export const LIST_STARTERS = [
  [
    /^[-*] $/,
    {
      kind: 'bullet',
      level: 0,
    },
  ],
  [
    /^1[.)] $/,
    {
      kind: 'numbered',
      level: 0,
    },
  ],
  [
    /^\[ ?\] $/,
    {
      kind: 'checkbox',
      level: 0,
      isChecked: false,
    },
  ],
  [
    /^\[[xX]\] $/,
    {
      kind: 'checkbox',
      level: 0,
      isChecked: true,
    },
  ],
];
export const listOfStarter = (word?: Dynamic) =>
  LIST_STARTERS.find(([pattern]: Dynamic) => pattern.test(word))?.[1] ?? null;
export const leadingWord = (text?: Dynamic) => /^\S+ /.exec(text)?.[0] ?? '';
export const startsWithListStarter = (text?: Dynamic) => listOfStarter(leadingWord(text)) !== null;
export const toggleCheckboxAt = ({ stretches: stretches, lists: lists }: Dynamic, line?: Dynamic) => ({
  stretches: stretches,
  lists: lists.map(
    (list?: Dynamic, index?: Dynamic) =>
      index === line && list.kind === 'checkbox'
        ? {
            ...list,
            isChecked: !list.isChecked,
          }
        : list,
  ),
});
export const LOOKS_HISTORY_LIMIT = 1e6;
export const hasLists = ({ lists: lists }: Dynamic) => lists.some(({ kind: kind }: Dynamic) => kind !== 'none');
export const isWholeLookMarked = (looks?: Dynamic, marks?: Dynamic) =>
  !hasLists(looks) &&
  looks.stretches.every(
    (input?: Dynamic) =>
      isSameLook(input, {
        marks: marks,
        link: null,
      }),
  );
