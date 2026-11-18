import type { Dynamic } from '../../dynamic.ts';
import { sheetMessages } from '../../i18n/sheet-messages.ts';
import { toolSearchWords, toolLabelWithValue } from '../../tools/search-words.ts';
import { BORDER_LINE_STYLES, BORDER_EDGE_CHOICES } from '../../format/borders.ts';
import { borderStyleLabel, borderEdgesLabel, cellColorName } from '../../i18n/format-labels.ts';
import { colorCommandChoices, colorCommandKey, colorSwatchIcon, fontSizeCommand } from './bar-commands.ts';
import { toolSearchMessages } from '../../messages/tool-search-words.ts';
import { borderChoiceIcon } from '../../format/borders-picker.ts';
import { normalizeHexColor } from '../../format/hsb-colors.ts';
import { colorsEqual } from '../../model/colors.ts';
import { fontSizesMatchingTyped, FONT_SIZE_CHOICES } from '../../format/toolbar-size-choices.ts';
import { translateMessage } from '../../i18n/messages.ts';
import { trimWordQuotes } from './matching.ts';
import { optionColorName } from '../../i18n/chip-labels.ts';
export let bordersVocabularyCache: Dynamic;
export function buildBordersVocabulary() {
  let borderWordList = wordSetOf([
    sheetMessages.borders(),
    ...singleWords(toolSearchWords('borders', 'borderInTheSingular')),
    ...borderWords.line(),
  ]);
  let outerWords = wordSetOf(borderWords.outer());
  let passedOver = new (Set as Dynamic)([...borderWordList, ...wordSetOf(borderWords.passedOver())]);
  let styleWords = BORDER_LINE_STYLES.map(
    (style?: Dynamic) => ({
      style: style,
      words: wordSetOf(singleWords([borderStyleLabel(style), ...borderWords[style]()])),
    }),
  );
  let colorWords = colorCommandChoices('textColor').flatMap(
    (color?: Dynamic) =>
      color.kind === 'none'
        ? []
        : [
            {
              color: color,
              words: wordSetOf(singleWords([textColorName(color), ...toolSearchWords(`color.${colorCommandKey(color)}`)])),
            },
          ],
  );
  let edgeNames = new (Map as Dynamic)(
    BORDER_EDGE_CHOICES.map(
      (edgesKind?: Dynamic) => [
        edgesKind,
        wordsOfText(borderEdgesLabel(edgesKind))
          .filter((word?: Dynamic) => !passedOver.has(word))
          .map((word?: Dynamic) => [word])
          .concat(toolSearchWords(`borders.${edgesKind}`).map(wordsOfText)),
      ],
    ),
  );
  return {
    passedOver: passedOver,
    styleSaidBy: (word?: Dynamic) => styleWords.find(({ words: words }: Dynamic) => words.has(word))?.style ?? null,
    colorSaidBy: (word?: Dynamic) => colorWords.find(({ words: words }: Dynamic) => words.has(word))?.color ?? null,
    saysItIsABorder: borderWordList,
    saysOuterByItself: outerWords,
    wordsOfPen: [
      ...styleWords,
      ...colorWords,
      {
        words: borderWordList,
      },
    ]
      .flatMap(({ words: words }: Dynamic) => Array.from<Dynamic>(words))
      .filter((word?: Dynamic) => !outerWords.has(word)),
    namesOfEdges: (word?: Dynamic) => edgeNames.get(word) ?? [],
  };
}
export function bordersVocabulary() {
  let borderToolName = sheetMessages.borders();
  if (bordersVocabularyCache?.forToolNamed !== borderToolName)
    bordersVocabularyCache = {
      forToolNamed: borderToolName,
      vocabulary: buildBordersVocabulary(),
    };
  return bordersVocabularyCache.vocabulary;
}
export function borderCommandsFromWords(text?: Dynamic, situation?: Dynamic, actions?: Dynamic) {
  let {
    passedOver: passedOver,
    saysItIsABorder: borderWordList,
    saysOuterByItself: outerWords,
    wordsOfPen: penWords,
    styleSaidBy: styleSaidBy,
    colorSaidBy: colorSaidBy,
    namesOfEdges: namesOfEdges,
  } = bordersVocabulary();
  let pen = {
    style: null,
    color: null,
  };
  let edgeWords: Dynamic = [];
  let words = wordsOfText(text);
  for (let word of words as Dynamic) {
    let [styleOfWord, colorOfWord] = [styleSaidBy(word), colorSaidBy(word)];
    if (styleOfWord !== null) {
      if (pen.style !== null) return [];
      pen.style = styleOfWord;
    } else if (colorOfWord !== null) {
      if (pen.color !== null) return [];
      pen.color = colorOfWord;
    } else edgeWords.push(word);
  }
  let { style: style, color: color } = pen;
  let saysBorder = edgeWords.some((word?: Dynamic) => borderWordList.has(word));
  if (style === null && (color === null || !saysBorder)) return [];
  let needsAnotherWordSet = wordSetOf(borderWords.needsAnotherWord());
  let needsAnotherWord = words.some((word?: Dynamic) => needsAnotherWordSet.has(word));
  let lastEdgeWord = edgeWords.at(-1) ?? '';
  let isLastWordTyped = lastEdgeWord === words.at(-1) && !needsAnotherWord;
  let isWordUnfinished = isLastWordTyped && lastEdgeWord.length > 1 && !borderWordList.has(lastEdgeWord);
  let isStartOfPenWord = isWordUnfinished && penWords.some((penWord?: Dynamic) => penWord.startsWith(lastEdgeWord));
  let isStartOfEdgeName = isWordUnfinished && !isStartOfPenWord;
  let wordsMatchedAt = (edgeName?: Dynamic, at?: Dynamic) => {
    for (let [offset, word] of edgeName.entries() as Dynamic) {
      let typed = edgeWords[at + offset] ?? '';
      if (typed === word) continue;
      if (at + offset !== edgeWords.length - 1 || !word.startsWith(typed)) return 0;
      return (offset > 0 ? isStartOfEdgeName || (isLastWordTyped && borderWordList.has(typed)) : isStartOfEdgeName && edgeName.length === 1)
        ? offset + 1
        : 0;
    }
    return edgeName.length;
  };
  let edgesSaidBy = (end?: Dynamic, allowsLeftover?: Dynamic) => {
    let coversWords = (names?: Dynamic) => {
      if (end <= 0) return true;
      let reachable: Dynamic = [];
      reachable[end] = true;
      for (let at: Dynamic = end - 1; at >= 0; at -= 1)
        reachable[at] =
          names.some((name?: Dynamic) => {
            let matched = wordsMatchedAt(name, at);
            return matched > 0 && at + matched <= end && reachable[at + matched] === true;
          }) ||
          (passedOver.has(edgeWords[at] ?? '') && (allowsLeftover || at < edgeWords.length - 1) && reachable[at + 1] === true);
      return reachable[0] === true;
    };
    return BORDER_EDGE_CHOICES.filter((word?: Dynamic) => coversWords(namesOfEdges(word)));
  };
  let isStillTyping =
    !isSomeEdges(edgesSaidBy(edgeWords.length - 1, true)) &&
    (isStartOfPenWord ||
      (isStartOfEdgeName &&
        BORDER_EDGE_CHOICES.some(
          (word?: Dynamic) => namesOfEdges(word).some((edgeName?: Dynamic) => wordsMatchedAt(edgeName, edgeWords.length - 1) > 0),
        )));
  let edges = edgesSaidBy(edgeWords.length, !isStillTyping);
  let meansOuter = !isSomeEdges(edges) && edgeWords.some((word?: Dynamic) => outerWords.has(word));
  let littleWords = toolSearchMessages.littleWords();
  let saysSomething =
    saysBorder || color !== null || edgeWords.some((word?: Dynamic) => !littleWords.has(word) && !passedOver.has(word));
  if (needsAnotherWord && !saysSomething) return [];
  let penLabel = borderWords.penInWords(style === null ? null : borderStyleLabel(style), color === null ? null : textColorName(color));
  return (meansOuter ? ['outer'] : edges).map(
    (edgesKind?: Dynamic) => ({
      id: `bar.borders.#.${[edgesKind, style ?? '', color === null ? '' : colorCommandKey(color)].join('-')}`,
      label: toolLabelWithValue(borderEdgesLabel(edgesKind), penLabel),
      icon: borderChoiceIcon(edgesKind),
      actsOn: 'cells',
      whyNot: situation.whyNoToolForCells,
      run: () =>
        actions.onBordersChosen(edgesKind, {
          ...(style !== null && {
            style: style,
          }),
          ...(color !== null && {
            color: color,
          }),
        }),
    }),
  );
}
export function hexColorCommands(text?: Dynamic, situation?: Dynamic, actions?: Dynamic) {
  let trimmed = text.trim();
  let hex = trimmed.startsWith('#') ? normalizeHexColor(trimmed) : null;
  if (hex === null) return [];
  let color = {
    kind: 'rgb',
    hex: hex,
  };
  let { shared: formatOfSelection } = situation.formatOfSelection;
  let colorCommand = (property?: Dynamic, label?: Dynamic, current?: Dynamic) => ({
    id: `bar.${property}.${hex}`,
    label: toolLabelWithValue(label, cellColorName(property, color)),
    otherWords: [trimmed.slice(1)],
    icon: colorSwatchIcon(property, color),
    isTicked: current !== null && colorsEqual(current, color),
    actsOn: 'cells',
    whyNot: situation.whyNoToolForCells,
    run: () =>
      actions.onFormatChosen(
        property === 'fillColor'
          ? {
              fillColor: color,
            }
          : {
              textColor: color,
            },
      ),
  });
  return [
    colorCommand('fillColor', sheetMessages.cellColor(), formatOfSelection.fillColor),
    colorCommand('textColor', sheetMessages.textColor(), formatOfSelection.font.color),
  ];
}
export function typedFontSizeCommands(typed?: Dynamic, barState?: Dynamic, actions?: Dynamic) {
  let normalized = typed.normalize('NFKC').trim().toLowerCase();
  let { name: name = '', size: size = '' } = (FONT_SIZE_AFTER_NAME.exec(normalized) ?? FONT_SIZE_BEFORE_NAME.exec(normalized))?.groups ?? {};
  let [matchedSize] = fontSizesMatchingTyped(size);
  if (matchedSize !== Number(size) || FONT_SIZE_CHOICES.some((choice?: Dynamic) => choice === matchedSize)) return [];
  let toolName = name.replace(':', '').trim();
  return [sheetMessages.fontSize(), ...toolSearchWords('fontSize')].some((word?: Dynamic) => word.toLowerCase() === toolName)
    ? [
        {
          ...fontSizeCommand(matchedSize, barState, actions),
          id: `bar.fontSize.#${matchedSize}`,
        },
      ]
    : [];
}
export const splitWordList = (list?: Dynamic) =>
  list
    .split(/[,،、，]/)
    .map((item?: Dynamic) => item.trim())
    .filter((item?: Dynamic) => item !== '');
export const borderWords = {
  thin: () =>
    splitWordList(
      translateMessage({
        defaultMessage: 'thinner, hairline',
        id: '3/OSCQXW8l',
      }),
    ),
  medium: () => [],
  thick: () =>
    splitWordList(
      translateMessage({
        defaultMessage: 'thicker',
        id: 'DNt15WT+K/',
      }),
    ),
  dashed: () =>
    splitWordList(
      translateMessage({
        defaultMessage: 'dash, dashes',
        id: 'rmwH3oNx22',
      }),
    ),
  dotted: () =>
    splitWordList(
      translateMessage({
        defaultMessage: 'dots, doted',
        id: '342xm9bhLn',
      }),
    ),
  double: () =>
    splitWordList(
      translateMessage({
        defaultMessage: 'doubled, dubble',
        id: 'ARG/owu9RA',
      }),
    ),
  passedOver: () =>
    splitWordList(
      translateMessage({
        defaultMessage: 'a, an, the, and, with, in, of, on, at',
        id: 'i+2LYApDbk',
      }),
    ),
  line: () =>
    splitWordList(
      translateMessage({
        defaultMessage: 'line',
        id: 'mp2lM8sTwa',
      }),
    ),
  outer: () =>
    splitWordList(
      translateMessage({
        defaultMessage: 'outline, frame',
        id: 'wJ/9s3bAT+',
      }),
    ),
  needsAnotherWord: () =>
    splitWordList(
      translateMessage({
        defaultMessage: 'medium',
        id: '+knp4PS5mD',
      }),
    ),
  penInWords: (style?: Dynamic, color?: Dynamic) =>
    style !== null && color !== null
      ? translateMessage(
          {
            defaultMessage: '{style}, {color}',
            id: 'oyYiS3z2OJ',
          },
          {
            style: style,
            color: color,
          },
        )
      : (style ?? color ?? ''),
};
export const wordsOfText = (text?: Dynamic) =>
  text
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll('’', "'")
    .split(/[^\p{L}\p{N}']+/u)
    .map(trimWordQuotes)
    .filter((word?: Dynamic) => word !== '');
export const wordSetOf = (texts?: Dynamic) => new (Set as Dynamic)(texts.flatMap(wordsOfText));
export const singleWords = (texts?: Dynamic) => texts.filter((text?: Dynamic) => wordsOfText(text).length === 1);
export const textColorName = (color?: Dynamic) =>
  color.kind === 'standard' ? optionColorName(color) : cellColorName('textColor', color);
bordersVocabularyCache = null;
export const isSomeEdges = (edges?: Dynamic) => edges.length < BORDER_EDGE_CHOICES.length;
export const FONT_SIZE_AFTER_NAME = /^(?<name>\D*[\s:])(?<size>\d+)\s*(?:pt)?$/u;
export const FONT_SIZE_BEFORE_NAME = /^(?<size>\d+)(?<name>\D+)$/u;
