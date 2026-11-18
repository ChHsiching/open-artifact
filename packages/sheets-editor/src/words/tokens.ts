import type { Dynamic } from '../dynamic.ts';
export function wordPatternsOf(numberPattern?: Dynamic, symbolGuard?: Dynamic, numberToRewritePattern?: Dynamic) {
  let source = String.raw`(?<![\p{L}\p{N}])-?(?:${numberPattern})(?![\p{L}\p{N}])|[\p{L}\p{N}'’]+|(?:(?!\.\p{N})${symbolGuard}[^\s\p{L}\p{N}'’])+`;
  return {
    piece: new (RegExp as Dynamic)(source, 'gu'),
    pieceOrWSlash: new (RegExp as Dynamic)(String.raw`(?<![\p{L}\p{N}])[wW]\/[oO]?(?![\p{L}\p{N}])|${source}`, 'gu'),
    numberToRewrite: numberToRewritePattern === null ? null : new (RegExp as Dynamic)(`^-?(?:${numberToRewritePattern})$`, 'u'),
  };
}
export function plainOfSymbol(symbol?: Dynamic, charBefore?: Dynamic, charAfter?: Dynamic, dropsQuotes?: Dynamic) {
  let unquoted = dropsQuotes ? symbol.replace(quoteMarkPattern, '') : symbol;
  let unbracketed = unquoted.replace(/[()[\]]/g, '');
  let symbolText = /^,+$/.test(unbracketed) ? unbracketed : unquoted;
  if (symbolText === '') return '';
  if (/^[,;]+$/.test(symbolText)) return ',';
  if (symbolText === '/') return 'or';
  if (symbolText === '!=' || symbolText === '<>' || symbolText === '≠') return 'not';
  if (symbolText === '=' || symbolText === ':') return 'is';
  if (/^[\p{Extended_Pictographic}\uFE0F\u200D]+$/u.test(symbolText)) return '';
  let [isBlankBefore, isBlankAfter] = [isBlankOrEdgeCharacter(charBefore), isBlankOrEdgeCharacter(charAfter)];
  if (isBlankBefore && isBlankAfter && /^[–—]+$/.test(symbolText)) return '';
  if (isBlankBefore && isBlankAfter) return symbolText === '&' || symbolText === '+' ? 'and' : symbolText;
  if (isBlankBefore && (symbolText === '-' || symbolText === '!')) return 'not';
  return (!isBlankBefore && !isBlankAfter && /^[-._]$/.test(symbolText)) || /^[.?!"“”()[\]…]+$/.test(symbolText) ? '' : symbolText;
}
export function splitIntoWords(typed?: Dynamic, readsSymbols: Dynamic = true, signs?: Dynamic) {
  let words: Dynamic = [];
  let [lastEnd, quoteCount]: Dynamic = [0, 0];
  let {
    piece: piece,
    pieceOrWSlash: pieceOrWSlash,
    numberToRewrite: numberToRewrite,
  } = signs === undefined ? wordPatternWithSlashAbbreviations : WORD_PATTERN(signs);
  for (let { 0: said, index: at } of typed.matchAll(/[wW]\//.test(typed) ? pieceOrWSlash : piece) as Dynamic) {
    let lowered =
      numberToRewrite?.test(said) === true ? said.replaceAll('.', '').replace(',', '.') : said.toLowerCase().replace(/['’]/g, '');
    let plain = /[\p{L}\p{N}]/u.test(said)
      ? (WORD_ABBREVIATIONS.get(lowered) ?? lowered)
      : plainOfSymbol(said, typed[at - 1], typed[at + said.length], readsSymbols);
    let isAfterHyphen = typed[at - 1] === '-' && !isBlankOrEdgeCharacter(typed[at - 2]);
    let isAfterBlank = isBlankOrEdgeCharacter(typed[at - 1]);
    if (plain === '') continue;
    let gap = typed.slice(lastEnd, at);
    quoteCount += (gap + (/[\p{L}\p{N}]/u.test(said) ? '' : said)).match(quoteMarkPattern)?.length ?? 0;
    let isInQuotes = quoteCount % 2 === 1;
    let lastWord = words.at(-1);
    if (lastWord !== undefined)
      words[words.length - 1] = {
        ...lastWord,
        tail: gap,
      };
    words.push({
      said: said,
      plain: plain,
      at: words.length,
      isAfterHyphen: isAfterHyphen,
      isAfterBlank: isAfterBlank,
      gap: gap,
      tail: typed.slice(at + said.length),
      isInQuotes: isInQuotes,
    });
    lastEnd = at + said.length;
  }
  return words;
}
export function longestPhraseAt(phrases?: Dynamic, words?: Dynamic, at?: Dynamic) {
  let longest: Dynamic = null;
  for (let [phrase, meant] of phrases as Dynamic)
    if (phrase.length > (longest?.wordCount ?? 0) && wordsMatchAt(words, at, phrase))
      longest = {
        meant: meant,
        wordCount: phrase.length,
      };
  return longest;
}
export const COMMA_NUMBER_AFTER_SIGN_GUARD = String.raw`(?!(?<=[(<>=≤≥$€£¥+-]),[0-9]+(?![\p{L}\p{N}]))`;
export const POINT_NUMBER_PATTERN = String.raw`\p{N}{1,3}(?:,\p{N}{3})+(?:\.\p{N}+)?|\p{N}+(?:\.\p{N}+)?|\.\p{N}+`;
export const wordPatternWithSlashAbbreviations = wordPatternsOf(POINT_NUMBER_PATTERN, '', null);
export const DOT_GROUPED_NUMBER_PATTERN = String.raw`[1-9][0-9]{0,2}(?:\.[0-9]{3})+(?:,[0-9]+)?`;
export const COMMA_DECIMAL_PATTERN = String.raw`[0-9]*,[0-9]+`;
export const COMMA_GROUPED_POINT_NUMBER_PATTERN = String.raw`[0-9]{1,3}(?:,[0-9]{3})+\.[0-9]+`;
export const wordPatternsOfPointGroups = wordPatternsOf(
  `${DOT_GROUPED_NUMBER_PATTERN}|${COMMA_GROUPED_POINT_NUMBER_PATTERN}|${COMMA_DECIMAL_PATTERN}|${POINT_NUMBER_PATTERN}`,
  COMMA_NUMBER_AFTER_SIGN_GUARD,
  `${DOT_GROUPED_NUMBER_PATTERN}|${COMMA_DECIMAL_PATTERN}`,
);
export const wordPatternsOfCommaDecimals = wordPatternsOf(
  `${COMMA_GROUPED_POINT_NUMBER_PATTERN}|${COMMA_DECIMAL_PATTERN}|${POINT_NUMBER_PATTERN}`,
  COMMA_NUMBER_AFTER_SIGN_GUARD,
  COMMA_DECIMAL_PATTERN,
);
export const WORD_PATTERN = ({ decimalSign: decimalSign, groupSign: groupSign }: Dynamic) =>
  decimalSign === 'point' ? wordPatternWithSlashAbbreviations : groupSign === 'point' ? wordPatternsOfPointGroups : wordPatternsOfCommaDecimals;
export const quoteMarkPattern = /["“”]/g;
export const WORD_ABBREVIATIONS = new (Map as Dynamic)(
  Object.entries({
    'w/': 'with',
    'w/o': 'without',
    wk: 'week',
    wks: 'weeks',
    tmrw: 'tomorrow',
    tmw: 'tomorrow',
  }),
);
export const isBlankOrEdgeCharacter = (character?: Dynamic) => character === undefined || /\s/.test(character);
export const NO_WORD_TOKEN = {
  said: '',
  plain: '',
  at: -1,
  isAfterHyphen: false,
  isAfterBlank: true,
  gap: '',
  tail: '',
  isInQuotes: false,
};
export const plainWordsOf = (text?: Dynamic) => splitIntoWords(text).map(({ plain: plain }: Dynamic) => plain);
export const wordsMatchAt = (words?: Dynamic, at?: Dynamic, phrase?: Dynamic) =>
  phrase.every((plain?: Dynamic, offset?: Dynamic) => words[at + offset]?.plain === plain);
export const pluralEsPattern = /(?:[sxzo]|ch|sh|.{3}[dlnrj])$/;
export const isWordOrItsPlural = (word?: Dynamic, singular?: Dynamic) =>
  word === singular ||
  (singular.length > 1 &&
    (word === `${singular}s` ||
      (pluralEsPattern.test(singular) && word === `${singular}es`) ||
      (singular.endsWith('y') && word === `${singular.slice(0, -1)}ies`)));
export const isSymbolForNotOrIs = ({ plain: plain, said: said }: Dynamic) =>
  (plain === 'not' || plain === 'is') && !/[\p{L}\p{N}]/u.test(said);
export const phrasesMeaning = (meaning?: Dynamic, phrases?: Dynamic) =>
  phrases.split(', ').map((phrase?: Dynamic) => [phrase.split(' '), meaning]);
