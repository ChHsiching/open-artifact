import type { Dynamic } from '../dynamic.ts';
import { decodeHtmlEntities } from './html-reading.ts';
import { acceptedEncodedLinkUrl, runsWithLinksOnWords } from '../links/text-links.ts';
import { isSameLook, fontMarksWhere } from '../editor/text-looks.ts';
export function readTagIntoRichText(
  reading: Dynamic,
  { name: name, isClosing: isClosing, attributes: attributes, writtenBefore: writtenBefore }: Dynamic,
  lookOfAttributes?: Dynamic,
) {
  let { open: openTags, parts: parts } = reading;
  let innermostTag = openTags.at(-1);
  if (parts === null || innermostTag === undefined) return;
  let text = decodeHtmlEntities(writtenBefore);
  if (text === null) {
    reading.parts = null;
    return;
  }
  if (text !== '')
    parts.push({
      written: text,
      marks: marksOfFont(innermostTag.font),
      link: innermostTag.link,
    });
  if (isClosing || name === 'a') {
    let value = openTags.findLastIndex((openTag?: Dynamic) => openTag.name === name);
    if (value > 0) openTags.length = value;
  }
  let openTag = openTags.at(-1);
  if (isClosing || openTag === undefined) return;
  if (openTags.length > MOST_OPEN_HTML_TAGS) reading.parts = null;
  if (openTags.length > MOST_OPEN_HTML_TAGS || VOID_HTML_TAGS.has(name)) return;
  let state = {
    ...FONT_OF_HTML_TAGS.get(name),
    ...lookOfAttributes(attributes),
  };
  let lineMarks = {
    ...openTag.lines,
    ...lineMarksOfFont(state),
  };
  let href = name === 'a' ? attributes.get('href') : undefined;
  let link = href === undefined ? openTag.link : acceptedEncodedLinkUrl(href);
  openTags.push({
    name: name,
    font: {
      ...openTag.font,
      ...state,
      ...lineMarks,
    },
    lines: lineMarks,
    link: link,
  });
}
export function runsMatchingShownText(shownText?: Dynamic, parts?: Dynamic) {
  let runs: Dynamic = [];
  let addRun = (text?: Dynamic, part?: Dynamic) => {
    let lastRun = runs.at(-1);
    if (text === '') return;
    if (lastRun !== undefined && isSameLook(lastRun, part)) lastRun.text += text;
    else
      runs.push({
        text: text,
        marks: [...part.marks],
        link: part.link,
      });
  };
  let readIndex: Dynamic = 0;
  let lastPart: Dynamic = null;
  let blankPartBefore: Dynamic = null;
  for (let part of parts as Dynamic) {
    let letters = part.written.replaceAll(/\s+/g, '');
    if (letters === '') {
      blankPartBefore = part;
      continue;
    }
    let runStart: Dynamic = readIndex;
    while (isWhitespaceCharacter(shownText[runStart])) runStart += 1;
    let partForSpaces =
      lastPart !== null && isWhitespaceCharacter(lastPart.written.at(-1))
        ? lastPart
        : isWhitespaceCharacter(part.written[0])
          ? part
          : blankPartBefore;
    addRun(shownText.slice(readIndex, runStart), partForSpaces ?? part);
    let runEnd2: Dynamic = runStart;
    for (let letterIndex: Dynamic = 0; letterIndex < letters.length; letterIndex += 1) {
      while (isWhitespaceCharacter(shownText[runEnd2])) runEnd2 += 1;
      if (shownText[runEnd2] !== letters[letterIndex]) return null;
      runEnd2 += 1;
    }
    addRun(shownText.slice(runStart, runEnd2), part);
    readIndex = runEnd2;
    lastPart = part;
    blankPartBefore = null;
  }
  if (lastPart === null || /\S/.test(shownText.slice(readIndex))) return null;
  addRun(shownText.slice(readIndex), lastPart);
  return runs;
}
export function richTextOfPastedCell(shownText: Dynamic, { open: openTags, parts: parts }: Dynamic) {
  let runs = parts === null || shownText.length > MOST_RICH_TEXT_LENGTH ? null : runsMatchingShownText(shownText, parts);
  if (runs === null || runs.length > MOST_PASTED_RUNS_IN_CELL) return null;
  let runsWithLinks = runsWithLinksOnWords(shownText, runs);
  let plainLook = {
    marks: marksOfFont(openTags[0]?.font ?? {}),
    link: null,
  };
  if (runsWithLinks.every((run?: Dynamic) => isSameLook(run, plainLook))) return null;
  return {
    paragraphs: [
      {
        list: {
          kind: 'none',
        },
        runs: runsWithLinks,
      },
    ],
  };
}
export const emptyRichTextReading = (font?: Dynamic) => ({
  open: [
    {
      name: '',
      font: font,
      lines: {},
      link: null,
    },
  ],
  parts: [],
});
export const FONT_OF_HTML_TAGS = new (Map as Dynamic)([
  [
    'b',
    {
      bold: true,
    },
  ],
  [
    'strong',
    {
      bold: true,
    },
  ],
  [
    'i',
    {
      italic: true,
    },
  ],
  [
    'em',
    {
      italic: true,
    },
  ],
  [
    'u',
    {
      underline: 'single',
    },
  ],
  [
    'ins',
    {
      underline: 'single',
    },
  ],
  [
    's',
    {
      strikethrough: true,
    },
  ],
  [
    'strike',
    {
      strikethrough: true,
    },
  ],
  [
    'del',
    {
      strikethrough: true,
    },
  ],
]);
export const lineMarksOfFont = ({ underline = 'none', strikethrough: strikethrough }: Dynamic) => ({
  ...(underline !== 'none' && {
    underline: underline,
  }),
  ...(strikethrough === true && {
    strikethrough: strikethrough,
  }),
});
export const VOID_HTML_TAGS = new (Set as Dynamic)('br col hr img input link meta wbr'.split(' '));
export const MOST_OPEN_HTML_TAGS = 50;
export const marksOfFont = (font?: Dynamic) =>
  fontMarksWhere((mark?: Dynamic) => (mark === 'underline' ? (font.underline ?? 'none') !== 'none' : font[mark] === true));
export const isWhitespaceCharacter = (character?: Dynamic) => character !== undefined && !/\S/.test(character);
export const MOST_PASTED_RUNS_IN_CELL = 300;
export const MOST_RICH_TEXT_LENGTH = 40000;
