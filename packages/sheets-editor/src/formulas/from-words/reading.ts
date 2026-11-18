import type { Dynamic } from '../../dynamic.ts';
import { parseA1Area } from '../../model/a1-references.ts';
import { formulaArgumentSeparator } from '../../format/number-signs.ts';
export function splitIntoWordPieces(text?: Dynamic) {
  if (/\d,\d/.test(text)) return null;
  let pieces: Dynamic = [];
  for (let index: Dynamic = 0; index < text.length; ) {
    if (/\s/.test(text[index] ?? '')) {
      index += 1;
      continue;
    }
    let start = index;
    for (let [kind, pattern] of WORD_PIECE_PATTERNS as Dynamic) {
      pattern.lastIndex = start;
      let match = pattern.exec(text)?.[0];
      if (match === undefined) continue;
      let typed = kind === 'quoted' ? match.slice(1, -1) : match.toLowerCase();
      pieces.push({
        kind: kind,
        typed: typed,
        from: start,
        to: start + match.length,
      });
      index += match.length;
      break;
    }
    if (index === start) return null;
  }
  return pieces;
}
export function cellsSaidByAddress(address?: Dynamic, typed?: Dynamic, where?: Dynamic) {
  let cells = parseA1Area(address, where);
  return cells === null || areaHoldsCell(cells, where)
    ? null
    : {
        written: address,
        typed: typed,
        cells: cells,
        number: null,
      };
}
export function textNamesHeading(text?: Dynamic, heading?: Dynamic) {
  let textWords = wordsInText(text).join(' ');
  return (
    pluralAndSingularForms(text).includes(normalizeHeadingText(heading).trim()) ||
    (textWords !== '' && pluralAndSingularForms(textWords).includes(wordsInText(heading).join(' ')))
  );
}
export function isInsideLongerHeading({ text: text, pieces: pieces, where: where }: Dynamic, from?: Dynamic, to?: Dynamic) {
  let [spanStart = 0, spanEnd2 = 0] = [pieces[from]?.from, pieces[to - 1]?.to];
  let neighborWords = new (Set as Dynamic)([
    wordsInText(text.slice(0, spanStart)).findLast(isNotFillerWord),
    wordsInText(text.slice(spanEnd2)).find(isNotFillerWord),
  ]);
  neighborWords.delete(undefined);
  let spanWords = wordsInText(text.slice(spanStart, spanEnd2));
  let lastWordForms = new (Set as Dynamic)(pluralAndSingularForms(spanWords.at(-1) ?? ''));
  let matchesSpanAt = (words?: Dynamic, at?: Dynamic) =>
    spanWords.every(
      (word?: Dynamic, offset?: Dynamic) =>
        offset === spanWords.length - 1 ? lastWordForms.has(words[at + offset] ?? '') : words[at + offset] === word,
    );
  return where.headings.some((heading?: Dynamic) => {
    let headingWords = wordsInText(heading);
    return headingWords.some(
      (word?: Dynamic, at?: Dynamic) =>
        matchesSpanAt(headingWords, at) && (neighborWords.has(headingWords[at - 1]) || neighborWords.has(headingWords[at + spanWords.length])),
    );
  });
}
export function nextPieceNamesColumn({ pieces: pieces, where: where }: Dynamic, at2?: Dynamic, cellsWritten?: Dynamic) {
  let { typed = '' } = pieces[at2] ?? {};
  let [kind, cells] = [KIND_NOUNS[typed], parseA1Area(cellsWritten, where)];
  if (kind === undefined || cells === null) return COLUMN_NOUNS.has(typed);
  let kinds = where.kindsHeldIn(cells);
  return kinds.size === 1 && kinds.has(kind);
}
export function headedColumnsSaidAt(reading?: Dynamic, start?: Dynamic) {
  let { pieces: pieces, where: where } = reading;
  let headingStart = ((index?: Dynamic) => pieces[index]?.typed === 'column')(start) ? start + 1 : start;
  let found: Dynamic = [];
  for (let value: Dynamic = headingStart + 1; value <= Math.min(pieces.length, headingStart + MAX_HEADING_PIECES); value += 1) {
    let typed = typedTextOfPieces(reading, headingStart, value).toLowerCase();
    let column = where.columns.find(
      ({ heading: heading }: Dynamic) =>
        pluralAndSingularForms(typed).includes(normalizeHeadingText(heading)) && !isFalseEsPlural(normalizeHeadingText(heading), typed),
    );
    let headingsNamed = where.headings.filter((heading?: Dynamic) => textNamesHeading(typed, heading));
    if (column === undefined || headingsNamed.length > 1 || isInsideLongerHeading(reading, headingStart, value)) continue;
    found.push([column.cells, value]);
    if (headingStart === start && nextPieceNamesColumn(reading, value, column.cells)) found.push([column.cells, value + 1]);
  }
  let letters = pieces[headingStart]?.typed ?? '';
  if (headingStart > start && COLUMN_LETTERS_PATTERN.test(letters)) {
    let match = where.columns.find(
      ({ cells: cells }: Dynamic) => cells.toLowerCase().startsWith(letters) && /^\d/.test(cells.slice(letters.length)),
    );
    if (match !== undefined) found.push([match.cells, headingStart + 1]);
  }
  return found;
}
export function isWithinAHeading(text?: Dynamic, where?: Dynamic) {
  if (namesAnyHeading(text, where)) return true;
  let words = wordsInText(text);
  if (words.length === 0) return false;
  let lastWordForms = new (Set as Dynamic)(pluralAndSingularForms(words.at(-1) ?? ''));
  return where.headings.some((heading?: Dynamic) => {
    let headingWords = wordsInText(heading);
    return headingWords.some(
      (word?: Dynamic, at2?: Dynamic) =>
        words.every(
          (word2?: Dynamic, offset?: Dynamic) =>
            offset === words.length - 1 ? lastWordForms.has(headingWords[at2 + offset] ?? '') : headingWords[at2 + offset] === word2,
        ),
    );
  });
}
export function mayMeanTheTable(words?: Dynamic, where?: Dynamic) {
  let byWords: Dynamic = mayMeanTheTableCache.get(where);
  if (byWords === undefined) mayMeanTheTableCache.set(where, (byWords = new (Map as Dynamic)()));
  let mayMean: Dynamic = byWords.get(words);
  if (mayMean === undefined) {
    mayMean = where.countOfColumnsThatHold(words) > 0 || namesAnyHeading(words, where);
    byWords.set(words, mayMean);
  }
  return mayMean;
}
export function slotReadingsAt(reader?: Dynamic, reading?: Dynamic, start?: Dynamic) {
  if (reader === undefined) return [];
  let byReader: Dynamic = slotReadingsCache.get(reading.pieces);
  if (byReader === undefined) slotReadingsCache.set(reading.pieces, (byReader = new (Map as Dynamic)()));
  let byStart: Dynamic = byReader.get(reader);
  if (byStart === undefined) byReader.set(reader, (byStart = new (Map as Dynamic)()));
  let readings: Dynamic = byStart.get(start);
  if (readings === undefined) byStart.set(start, (readings = reader(reading, start)));
  return readings;
}
export function* matchWordsTemplate(
  slotReaders?: Dynamic,
  template?: Dynamic,
  partIndex?: Dynamic,
  reading?: Dynamic,
  at2?: Dynamic,
  match?: Dynamic,
): Generator<Dynamic, Dynamic, Dynamic> {
  let { pieces: pieces } = reading;
  let part = template[partIndex];
  if (part === undefined) {
    if (at2 === pieces.length) yield match;
    return;
  }
  let start: Dynamic = at2;
  while (pieces[start]?.typed === 'the' && pieces[start]?.kind === 'word') start += 1;
  if ('slot' in part) {
    for (let [matched, matchedInfo] of slotReadingsAt(slotReaders[part.slot], reading, start) as Dynamic)
      yield* matchWordsTemplate(slotReaders, template, partIndex + 1, reading, matchedInfo, {
        ...match,
        said: [...match.said, matched],
      });
    return;
  }
  let pieceMatches = (word?: Dynamic, offset?: Dynamic) =>
    pieces[start + offset]?.typed === word && pieces[start + offset]?.kind !== 'quoted';
  for (let matched of part.phrases.filter((phrase?: Dynamic) => phrase.every(pieceMatches)) as Dynamic) {
    let matchedInfo = match.mayMeanTheTable || mayMeanTheTable(matched.join(' '), reading.where);
    yield* matchWordsTemplate(slotReaders, template, partIndex + 1, reading, start + matched.length, {
      ...match,
      mayMeanTheTable: matchedInfo,
    });
  }
  if (part.isOptional) yield* matchWordsTemplate(slotReaders, template, partIndex + 1, reading, at2, match);
}
export function compileWordsRules(rules?: Dynamic, extraSlotReaders: Dynamic = {}) {
  let slotReaders = {
    ...SLOT_READERS,
    ...extraSlotReaders,
  };
  let templates = rules.map(([template, build]: Dynamic) => [parseWordsTemplate(template), build]);
  for (let [template] of templates as Dynamic)
    for (let part of template as Dynamic) if ('slot' in part && !(part.slot in slotReaders)) throw Error('no slot <' + part.slot + '>');
  return (reading?: Dynamic) => {
    let separator = formulaArgumentSeparator(reading.where.decimalSign);
    let builder = {
      where: reading.where,
      call: (name?: Dynamic, ...args: Dynamic[]) => name + '(' + args.map(argumentFormulaText).join(separator) + ')',
    };
    let typedWords = new (Set as Dynamic)(reading.pieces.map((piece?: Dynamic) => piece.typed));
    return templates.flatMap(([template, build]: Dynamic) => {
      if (!areTemplateWordsTyped(template, typedWords)) return [];
      return Array.from<Dynamic>(matchWordsTemplate(slotReaders, template, 0, reading, 0, EMPTY_TEMPLATE_MATCH)).flatMap(
        (match?: Dynamic) => {
          let formula = build(match.said, builder);
          if (formula !== null && match.mayMeanTheTable) return [AMBIGUOUS_READING];
          return formula === null ? [] : [formula];
        },
      );
    });
  };
}
export const WORD_PIECE_PATTERNS = [
  ['quoted', /"[^"]*"|“[^”]*”|'[^']*'(?![a-z])/iy],
  ['nth', /\d+(?:st|nd|rd|th)\b/iy],
  ['address', /\$?[a-z]{1,3}\$?[1-9]\d*\b/iy],
  ['number', /\$?(?:0|[1-9]\d*)(?:\.\d+)?%?(?:(?![\w.])|(?=[ap]m\b))/iy],
  ['word', /[a-z][a-z0-9']*|0\d+/iy],
  ['sign', /[<>]=|=[<>]|<>|[^\s\p{L}\p{N}]/uy],
];
export const NOTHING_SAID = {
  written: '',
  typed: '',
  cells: null,
  number: null,
};
export const typedTextOfPieces = ({ text: text, pieces: pieces }: Dynamic, from?: Dynamic, to?: Dynamic) =>
  text.slice(pieces[from]?.from, pieces[to - 1]?.to).replaceAll(/\s+/g, ' ');
export const areaHoldsCell = (area: Dynamic, { rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) =>
  rowIndex >= area.topRowIndex &&
  rowIndex < area.topRowIndex + area.rowCount &&
  columnIndex >= area.leftColumnIndex &&
  columnIndex < area.leftColumnIndex + area.columnCount;
export const QUARTER_OR_HALF_PATTERN = /^[qh][1-4]$/;
export const addressTypedAt = ({ pieces: pieces, where: where }: Dynamic, at?: Dynamic) => {
  let piece = pieces[at];
  if (piece?.kind !== 'address' || where.isWordOfAHeading(piece.typed.replaceAll('$', ''))) return null;
  let cells = QUARTER_OR_HALF_PATTERN.test(piece.typed) ? parseA1Area(piece.typed, where) : null;
  return cells !== null && where.kindsHeldIn(cells).size === 0 ? null : piece.typed.toUpperCase();
};
export const MAX_HEADING_PIECES = 6;
export const COLUMN_LETTERS_PATTERN = /^[a-z]{1,3}$/;
export const normalizeHeadingText = (text?: Dynamic) => text.toLowerCase().replaceAll(/\s+/g, ' ');
export const pluralAndSingularForms = (word?: Dynamic) =>
  [word, word.replace(/'?s$/, ''), word.replace(/es$/, ''), word.replace(/ies$/, 'y'), word + 's', word + 'es', word.replace(/y$/, 'ies')].filter(
    (form?: Dynamic) => form !== '',
  );
export const SIBILANT_END_PATTERN = /(?:[sxz]|ch|sh)$/;
export const isFalseEsPlural = (heading?: Dynamic, typed?: Dynamic) =>
  (typed === heading + 'es' && !SIBILANT_END_PATTERN.test(heading)) || (heading === typed + 'es' && !SIBILANT_END_PATTERN.test(typed));
export const wordsInText = (text?: Dynamic) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
export const FILLER_WORDS = new (Set as Dynamic)(['the', 'of', 'for', 'in', 'from', 'all']);
export const isNotFillerWord = (word?: Dynamic) => !FILLER_WORDS.has(word);
export const COLUMN_NOUNS = new (Set as Dynamic)(['column', 'field', 'entry', 'entries']);
export const KIND_NOUNS = {
  name: 'text',
  names: 'text',
  date: 'date',
  dates: 'date',
};
export const RANGE_JOINING_WORDS = new (Set as Dynamic)(['to', 'through', 'thru', 'until', ':']);
export const ORDINAL_WORDS = 'zeroth first second third fourth fifth sixth seventh eighth ninth tenth'.split(' ');
export const saidNumber = (written?: Dynamic, typed?: Dynamic, number?: Dynamic) => ({
  written: written,
  typed: typed,
  cells: null,
  number: number,
});
export const SLOT_READERS = {
  cells: (reading?: Dynamic, start?: Dynamic) => {
    let { pieces: pieces, where: where } = reading;
    let isRangeJoined = RANGE_JOINING_WORDS.has(pieces[start + 1]?.typed ?? '');
    let end = start + (isRangeJoined ? 3 : 2);
    let [fromAddress, toAddress] = [addressTypedAt(reading, start), addressTypedAt(reading, end - 1)];
    let byAddress =
      fromAddress === null || toAddress === null
        ? null
        : cellsSaidByAddress(fromAddress + ':' + toAddress, typedTextOfPieces(reading, start, end), where);
    let { rowCount = 0, columnCount = 0 } = byAddress?.cells ?? {};
    let isLine = isRangeJoined || rowCount === 1 || columnCount === 1;
    let byHeading = headedColumnsSaidAt(reading, start).flatMap(([cellsWritten, end2]: Dynamic) => {
      let said = cellsSaidByAddress(cellsWritten, typedTextOfPieces(reading, start, end2), where);
      return said === null
        ? []
        : [
            [
              {
                ...said,
                isByHeading: true,
              },
              end2,
            ],
          ];
    });
    return [...(byAddress !== null && isLine ? [[byAddress, end]] : []), ...byHeading];
  },
  number: ({ pieces: pieces, where: where }: Dynamic, start?: Dynamic) => {
    let piece = pieces[start];
    let isNegative = piece?.typed === '-' && piece.to === pieces[start + 1]?.from;
    let numberPiece = pieces[isNegative ? start + 1 : start];
    if (numberPiece?.kind !== 'number' || (numberPiece.typed.includes('.') && where.decimalSign === 'comma')) return [];
    if (/^\$?[1-9]\d{0,2}\.\d{3}%?$/.test(numberPiece.typed)) return [];
    let written = (isNegative ? '-' : '') + numberPiece.typed.replace('$', '');
    let number = written.endsWith('%') ? Number(written.slice(0, -1)) / 100 : Number(written);
    return [[saidNumber(written, written, number), start + (isNegative ? 2 : 1)]];
  },
  nth: ({ pieces: pieces }: Dynamic, start?: Dynamic) => {
    let { kind: kind, typed = '' } = pieces[start] ?? {};
    let nth = kind === 'nth' ? Number.parseInt(typed, 10) : ORDINAL_WORDS.indexOf(typed);
    return nth < 1 ? [] : [[saidNumber(String(nth), typed, nth), start + 1]];
  },
  words: (reading?: Dynamic, start?: Dynamic) =>
    reading.pieces.slice(start).map((piece?: Dynamic, offset?: Dynamic) => {
      let typed = typedTextOfPieces(reading, start, start + offset + 1);
      return [
        {
          written: quoteForFormula(typed),
          typed: typed,
          cells: null,
          number: null,
        },
        start + offset + 1,
      ];
    }),
};
export const quoteForFormula = (text?: Dynamic) => '"' + text.replaceAll('"', '""') + '"';
export const AMBIGUOUS_READING = '?';
export const parseWordsTemplate = (template?: Dynamic) =>
  template.split(' ').map((part?: Dynamic) => {
    if (part.startsWith('<'))
      return {
        slot: part.slice(1, -1),
      };
    let isOptional = part.startsWith('[');
    return {
      phrases: (isOptional ? part.slice(1, -1) : part).split('/').map((phrase?: Dynamic) => phrase.split('_')),
      isOptional: isOptional,
    };
  });
export const namesAnyHeading = (text?: Dynamic, where?: Dynamic) =>
  where.headings.some((heading?: Dynamic) => textNamesHeading(text, heading));
export const mayMeanTheTableCache = new (WeakMap as Dynamic)();
export const slotReadingsCache = new (WeakMap as Dynamic)();
export const areTemplateWordsTyped = (template?: Dynamic, typedWords?: Dynamic) =>
  template.every(
    (part?: Dynamic) =>
      'slot' in part ||
      part.isOptional ||
      part.phrases.some((phrase?: Dynamic) => phrase.every((word?: Dynamic) => typedWords.has(word))),
  );
export const argumentFormulaText = (argument?: Dynamic) => (typeof argument === 'string' ? argument : argument.written);
export const EMPTY_TEMPLATE_MATCH = {
  said: [],
  mayMeanTheTable: false,
};
