import type { Dynamic } from '../dynamic.ts';
import { wordsMatchAt } from './tokens.ts';
import { TABLE_SUBJECT_NOUNS, TASK_NOUNS, ROW_NOUNS } from './vocabulary.ts';
export function readFormatPartAt(words?: Dynamic, at2?: Dynamic) {
  let [word, nextWord] = [words[at2], words[at2 + 1]];
  if (!isUnquotedWord(word)) return null;
  for (let [phrase, style] of FONT_STYLE_PHRASES as Dynamic) {
    let phraseWords = phrase.split(' ');
    if (wordsMatchAt(words, at2, phraseWords) && phraseWords.length === 2)
      return {
        meant: {
          kind: style,
        },
        wordCount: 2,
      };
  }
  let styleWord = FONT_STYLE_PHRASES.find(([phrase]: Dynamic) => phrase === word.plain);
  if (styleWord !== undefined)
    return {
      meant: {
        kind: styleWord[1],
      },
      wordCount: 1,
    };
  let nextPlain = isUnquotedWord(nextWord) ? nextWord.plain : '';
  if (TEXT_COLOR_WORDS.has(word.plain) || FILL_WORDS.has(word.plain)) {
    let phrase = HUE_WORDS.get(nextPlain);
    let style = TEXT_COLOR_WORDS.has(word.plain) ? 'text' : 'fill';
    return phrase === undefined
      ? null
      : {
          meant: {
            kind: style,
            hue: phrase,
          },
          wordCount: 2,
        };
  }
  let paleWordCount = PALE_WORDS.has(word.plain) ? 1 : 0;
  let hueWord = words[at2 + paleWordCount];
  let hue = isUnquotedWord(hueWord) ? HUE_WORDS.get(hueWord.plain) : undefined;
  if (hue === undefined) return null;
  let wordAfterHue = words[at2 + paleWordCount + 1];
  let plainAfterHue = isUnquotedWord(wordAfterHue) ? wordAfterHue.plain : '';
  let kind = TEXT_COLOR_WORDS.has(plainAfterHue) ? 'text' : FILL_WORDS.has(plainAfterHue) ? 'fill' : 'tint';
  return {
    meant: {
      kind: kind,
      hue: hue,
    },
    wordCount: paleWordCount + (kind === 'tint' ? 1 : 2),
  };
}
export function readFormatPartsAt(words?: Dynamic, from?: Dynamic) {
  let readings: Dynamic = [];
  let [at, parts]: Dynamic = [from, []];
  for (;;) {
    let partAt = parts.length > 0 && FORMAT_PART_JOINERS.has(words[at]?.plain ?? '') ? at + 1 : at;
    let part = readFormatPartAt(words, partAt);
    if (part === null || parts.length === MOST_FORMAT_PARTS) return readings;
    [at, parts] = [partAt + part.wordCount, [...parts, part.meant]];
    readings.push({
      meant: parts,
      wordCount: at - from,
    });
  }
}
export function formatOfParts(parts?: Dynamic) {
  let fillColors = parts.flatMap(
    (part?: Dynamic) => (part.kind === 'tint' || part.kind === 'fill' ? [standardFormatColor(part.hue, 100)] : []),
  );
  let textColors = parts.flatMap(
    (part?: Dynamic) =>
      part.kind === 'tint' ? [standardFormatColor(part.hue, 800)] : part.kind === 'text' ? [standardFormatColor(part.hue, 600)] : [],
  );
  let hasPart = (kind?: Dynamic) => parts.some((part?: Dynamic) => part.kind === kind);
  if (
    fillColors.length > 1 ||
    textColors.length > 1 ||
    new (Set as Dynamic)(parts.map(({ kind: kind }: Dynamic) => kind)).size < parts.length
  )
    return null;
  let [[fillColor], [textColor]] = [fillColors, textColors];
  let font = {
    ...(textColor !== undefined && {
      color: textColor,
    }),
    ...(hasPart('bold') && {
      bold: true,
    }),
    ...(hasPart('italic') && {
      italic: true,
    }),
    ...(hasPart('underline') && {
      underline: 'single',
    }),
    ...(hasPart('strikethrough') && {
      strikethrough: true,
    }),
  };
  return {
    ...(fillColor !== undefined && {
      fillColor: fillColor,
    }),
    ...(Object.keys(font).length > 0 && {
      font: font,
    }),
  };
}
export function formatPartsAtStart(words?: Dynamic) {
  let start: Dynamic = 0;
  for (let found: Dynamic; (found = POLITE_OPENINGS.find((phrase?: Dynamic) => wordsMatchAt(words, start, phrase))) !== undefined; )
    start += found.length;
  let readings = [
    {
      from: start,
      parts: [],
    },
  ];
  let addReading = (from?: Dynamic, parts?: Dynamic) => {
    readings.push({
      from: from,
      parts: parts,
    });
    if (CONDITION_OPENERS.has(words[from]?.plain ?? ''))
      readings.push({
        from: from + 1,
        parts: parts,
      });
  };
  if (CONDITION_OPENERS.has(words[start]?.plain ?? ''))
    readings.push({
      from: start + 1,
      parts: [],
    });
  for (let { meant: found, wordCount: wordCount } of readFormatPartsAt(words, start) as Dynamic) addReading(start + wordCount, found);
  for (let [found, wordCount] of FORMAT_VERB_PHRASES as Dynamic) if (wordsMatchAt(words, start, found)) addReading(start + found.length, [wordCount]);
  let word = words[start];
  if (isUnquotedWord(word) && (FORMAT_VERBS.has(word.plain) || word.plain === 'fill')) {
    let found: Dynamic = start + 1;
    while (['the', 'it', 'them', 'all'].includes(words[found]?.plain ?? '')) found += 1;
    addReading(found, []);
    for (let { meant: wordCount, wordCount: partsWordCount } of readFormatPartsAt(words, found) as Dynamic)
      addReading(found + partsWordCount, wordCount);
  }
  return readings;
}
export function formatPartsAtEnd(words?: Dynamic) {
  let end: Dynamic = words.length;
  while (end > 0 && words[end - 1]?.plain === 'please') end -= 1;
  let readings = [
    {
      to: end,
      parts: [],
    },
  ];
  for (let at: Dynamic = end - 1; at >= 0; at -= 1)
    for (let { meant: parts, wordCount: wordCount } of readFormatPartsAt(words, at) as Dynamic) {
      if (at + wordCount !== end) continue;
      readings.push({
        to: at,
        parts: parts,
      });
      for (let leadIn of FORMAT_LEAD_INS as Dynamic)
        if (at >= leadIn.length && wordsMatchAt(words, at - leadIn.length, leadIn))
          readings.push({
            to: at - leadIn.length,
            parts: parts,
          });
    }
  return readings;
}
export function formatPartsInMiddle(words?: Dynamic) {
  let readings = [
    {
      words: [],
      parts: [],
    },
  ];
  for (let at: Dynamic = 1; at < words.length - 1; at += 1)
    for (let { meant: parts, wordCount: wordCount } of readFormatPartsAt(words, at) as Dynamic)
      if (RELATIVE_PRONOUNS.has(words[at + wordCount]?.plain ?? ''))
        readings.push({
          words: words.slice(at, at + wordCount),
          parts: parts,
        });
  return readings;
}
export const FORMAT_PARTS_NOT_READ = {
  kind: 'notRead',
  isOnItsWay: false,
};
export const HUE_WORDS = new (Map as Dynamic)([
  ['gray', 'gray'],
  ['grey', 'gray'],
  ['red', 'red'],
  ['orange', 'orange'],
  ['yellow', 'yellow'],
  ['green', 'green'],
  ['teal', 'teal'],
  ['blue', 'blue'],
  ['purple', 'purple'],
  ['magenta', 'magenta'],
  ['pink', 'magenta'],
]);
export const FONT_STYLE_PHRASES = [
  ['bold', 'bold'],
  ['bolded', 'bold'],
  ['italic', 'italic'],
  ['italics', 'italic'],
  ['underline', 'underline'],
  ['underlined', 'underline'],
  ['strikethrough', 'strikethrough'],
  ['strike through', 'strikethrough'],
  ['struck through', 'strikethrough'],
  ['crossed out', 'strikethrough'],
];
export const TEXT_COLOR_WORDS = new (Set as Dynamic)(['text', 'font', 'letters']);
export const FILL_WORDS = new (Set as Dynamic)(['background', 'fill', 'highlight']);
export const PALE_WORDS = new (Set as Dynamic)(['light', 'pale']);
export const isUnquotedWord = (word?: Dynamic) => word !== undefined && !word.isInQuotes;
export const FORMAT_PART_JOINERS = new (Set as Dynamic)(['and', ',', 'with']);
export const MOST_FORMAT_PARTS = 7;
export const standardFormatColor = (hue?: Dynamic, shade?: Dynamic) => ({
  kind: 'standard',
  hue: hue,
  shade: shade,
});
export const POLITE_OPENINGS = ['please', 'can you', 'could you', 'i want', 'i need', 'id like'].map(
  (phrase?: Dynamic) => phrase.split(' '),
);
export const FORMAT_VERBS = new (Set as Dynamic)('highlight color colour make turn mark flag shade paint format set'.split(' '));
export const FORMAT_VERB_PHRASES = [
  [
    ['bold'],
    {
      kind: 'bold',
    },
  ],
  [
    ['italicize'],
    {
      kind: 'italic',
    },
  ],
  [
    ['underline'],
    {
      kind: 'underline',
    },
  ],
  [
    ['strike', 'through'],
    {
      kind: 'strikethrough',
    },
  ],
  [
    ['strike', 'out'],
    {
      kind: 'strikethrough',
    },
  ],
  [
    ['cross', 'out'],
    {
      kind: 'strikethrough',
    },
  ],
  [
    ['gray', 'out'],
    {
      kind: 'tint',
      hue: 'gray',
    },
  ],
  [
    ['grey', 'out'],
    {
      kind: 'tint',
      hue: 'gray',
    },
  ],
];
export const CONDITION_OPENERS = new (Set as Dynamic)(['if', 'when', 'whenever', 'where', 'for', 'on']);
export const FORMAT_LEAD_INS = [
  'then',
  'in',
  'in a',
  'as',
  'to',
  'with',
  'with a',
  'should be',
  'should turn',
  'should go',
  'then make it',
  'go',
  'goes',
  'turn',
  'turns',
  'get',
  'gets',
  'highlighted',
  'highlighted in',
  'colored',
  'colored in',
  'coloured',
  'coloured in',
  'shaded',
  'shaded in',
  'marked',
  'marked in',
  'filled with',
].map((phrase?: Dynamic) => phrase.split(' '));
export const RELATIVE_PRONOUNS = new (Set as Dynamic)(['where', 'whose', 'if', 'when', 'whenever', 'that', 'which']);
export const WHOLE_WORDS = new (Set as Dynamic)(['whole', 'entire', 'full']);
export const RECORD_KIND_NOUNS = new (Set as Dynamic)([...TABLE_SUBJECT_NOUNS, ...TASK_NOUNS]);
export const CELL_NOUNS = new (Set as Dynamic)(['cell', 'cells', 'value', 'values']);
export const RULE_PREAMBLE_WORDS = new (Set as Dynamic)([...ROW_NOUNS, ...WHOLE_WORDS, ...CONDITION_OPENERS, ...RELATIVE_PRONOUNS, 'the']);
