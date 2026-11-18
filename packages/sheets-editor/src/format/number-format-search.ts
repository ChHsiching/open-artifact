import { Menu } from '../kit/menu.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { toolSearchWords } from '../tools/search-words.ts';
import { PHONE_NUMBER_FORMAT, NUMBER_FORMAT_CHOICES, exampleOfChoice, isNorthAmericanLocale } from './number-format-choices.ts';
import { toolUnavailableText } from '../i18n/chip-labels.ts';
import {
  numberFormatChoiceLabel,
  commandSearchStopWords,
  checkboxAndDropdownSearchWords,
  customFormatOfferLabel,
  commandMatchCountText,
} from '../i18n/format-labels.ts';
import { numberFormatIconOf } from '../ui/toolbar/number-format-menu.ts';
import { localeMessages, languageNameOfLocale } from '../messages/locale.ts';
import { timeZoneMessages, shortTimeZoneLabel } from '../ui/locale-time-zone-pick.ts';
import { hasSearchWords, MATCH_RANK_OTHER_WORDS, queryMatchesOtherWords, searchCommands } from '../ui/search-menu/matching.ts';
import {
  customFormatRowLabel,
  isAgentBusyOrDone,
  handleCustomFormatKey,
  CustomFormatRowInView,
  CUSTOM_FORMAT_ROW_PROPS,
} from './custom-format-row.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { swallowRestOfPress } from '../ui/press-swallow.ts';
import { CommandRows } from '../ui/menu-with-field.ts';
export function numberFormatCommands({
  choiceOfSelection: choiceOfSelection,
  inPlaceOfFormat: inPlaceOfFormat,
  onInsertChosen: onInsertChosen,
  areFormatsOnOffer: areFormatsOnOffer,
  doesFormatTakeControlOff: doesFormatTakeControlOff,
  onChosen: onChosen,
  workbookInFormatMenu: { locale: locale, examples: examples, onLocaleAsked: onLocaleAsked, timeZone: timeZone, onTimeZoneAsked: onTimeZoneAsked },
  patternOfSelection: patternOfSelection,
}: Dynamic) {
  let phoneNumberCommand = {
    id: 'bar.numberFormat.phoneNumber',
    label: sheetMessages.phoneNumber(),
    otherWords: toolSearchWords('phoneNumber'),
    isSoughtByOtherWords: true,
    icon: 'Phone',
    isTicked: choiceOfSelection === null && !doesFormatTakeControlOff && patternOfSelection === PHONE_NUMBER_FORMAT.pattern,
    actsOn: 'cells',
    whyNot: null,
    run: () =>
      onChosen({
        customNumberFormat: {
          pattern: PHONE_NUMBER_FORMAT.pattern,
        },
      }),
    atEnd: PHONE_NUMBER_FORMAT.example,
  };
  return [
    ...inPlaceOfFormat.map(
      ({ what: what, icon: icon, label: label, fits: fits, whyNotNow: whyNotNow }: Dynamic) => ({
        id: `bar.insert.${what}`,
        label: label,
        otherWords: toolSearchWords(INSERT_OTHER_WORDS_KEYS[what]),
        isNoFormat: true,
        icon: icon,
        isTicked: choiceOfSelection === what,
        actsOn: what === 'person' ? 'activeCell' : 'cells',
        whyNot: fits ? (whyNotNow ?? null) : toolUnavailableText(label),
        run: () => onInsertChosen(what),
        atEnd: null,
      }),
    ),
    ...(areFormatsOnOffer ? NUMBER_FORMAT_CHOICES : []).map((choice?: Dynamic) => {
      let example = exampleOfChoice(examples, choice);
      return {
        id: `bar.numberFormat.${choice}`,
        label: numberFormatChoiceLabel(choice),
        otherWords: [...toolSearchWords(choice), example],
        icon: numberFormatIconOf(choice).icon,
        isTicked: choiceOfSelection === choice,
        actsOn: 'cells',
        whyNot: null,
        run: () =>
          onChosen({
            numberFormatChoice: choice,
          }),
        atEnd: example,
      };
    }),
    ...(areFormatsOnOffer && isNorthAmericanLocale(locale) ? [phoneNumberCommand] : []),
    {
      id: 'bar.locale',
      label: localeMessages.locale(),
      otherWords: toolSearchWords('locale'),
      isNoFormat: true,
      icon: 'Globe',
      actsOn: 'file',
      whyNot: null,
      run: onLocaleAsked,
      atEnd: languageNameOfLocale(locale),
    },
    {
      id: 'bar.timeZone',
      label: timeZoneMessages.timeZone(),
      otherWords: toolSearchWords('timeZone'),
      isNoFormat: true,
      icon: 'Clock',
      actsOn: 'file',
      whyNot: null,
      run: onTimeZoneAsked,
      atEnd: shortTimeZoneLabel(timeZone),
    },
  ];
}
export function looksLikeFormatPattern(text?: Dynamic) {
  if (!hasSearchWords(text) || hasRealWords(text)) return false;
  if (FORMAT_CODE_CHAR_PATTERN.test(text)) return true;
  let withoutAmPm = text.replaceAll(AM_PM_PATTERN, '');
  return DATE_CODE_ONLY_PATTERN.test(withoutAmPm) && (withoutAmPm !== text || DATE_CODE_RUN_PATTERN.test(text));
}
export function withoutLittleWords(words?: Dynamic) {
  let littleWords = new (Set as Dynamic)(formatSearchWords(commandSearchStopWords()));
  return words.filter((word?: Dynamic) => !littleWords.has(word));
}
export function wordsInAnyOrder(words?: Dynamic) {
  let sorted = [...words];
  if (!words.some((word?: Dynamic) => /^\p{N}/u.test(word))) sorted.sort();
  return sorted.join(' ');
}
export function formatWordForms(text?: Dynamic) {
  let words = formatSearchWords(text);
  return [words, withoutLittleWords(words)].map(
    (words2?: Dynamic) => ({
      inOrder: words2.join(' '),
      inAnyOrder: wordsInAnyOrder(words2),
    }),
  );
}
export function formatWordFormsOf(text?: Dynamic) {
  let forms = formatWordFormsCache.get(text) ?? (looksLikeFormatPattern(text) ? [] : formatWordForms(text));
  formatWordFormsCache.set(text, forms);
  return forms;
}
export function otherWordForms({ id: id, otherWords = [], atEnd: atEnd, isNoFormat: isNoFormat }: Dynamic) {
  let skippedWords = new (Set as Dynamic)(
    id === 'bar.insert.checkbox' || id === 'bar.insert.dropdown'
      ? checkboxAndDropdownSearchWords()
          .split(/[,،、，]/)
          .map((word?: Dynamic) => word.trim().toLowerCase())
      : [],
  );
  return otherWords
    .filter((word?: Dynamic) => isNoFormat === true || word !== atEnd)
    .filter((word?: Dynamic) => !skippedWords.has(word.toLowerCase()))
    .map(formatWordFormsOf);
}
export function namedOrBegunFormats(rows?: Dynamic, typed?: Dynamic) {
  let ordered = [
    ...rows.filter(({ isNoFormat: isNoFormat }: Dynamic) => isNoFormat !== true),
    ...rows.filter(({ isNoFormat: isNoFormat }: Dynamic) => isNoFormat),
  ];
  let rowsWithTypedExample = ordered.filter((row?: Dynamic) => isExampleTyped(row, typed));
  if (rowsWithTypedExample.length > 0)
    return {
      named: rowsWithTypedExample,
      begun: [],
    };
  let typedForms = formatWordForms(typed);
  let endsInLittleWord = withoutLittleWords(formatSearchWords(typed).slice(-1)).length === 0;
  for (let [formIndex, form] of typedForms.entries() as Dynamic) {
    if (form.inOrder === '') break;
    let rowsWithForm = (formsOf?: Dynamic) =>
      ordered.filter((row?: Dynamic) => formsOf(row).some((forms?: Dynamic) => forms[formIndex]?.inAnyOrder === form.inAnyOrder));
    let begun = (formIndex === 1 && endsInLittleWord ? [] : ordered).filter(
      (row?: Dynamic) =>
        soughtWordForms(row).some((forms?: Dynamic) => forms[formIndex]?.inOrder.startsWith(form.inOrder) === true),
    );
    let namedRows = [rowsWithForm(labelWordForms), begun.length > 0 ? [] : rowsWithForm(otherWordForms)].find(
      ({ length: length }: Dynamic) => length > 0,
    );
    if (namedRows !== undefined)
      return {
        named: namedRows,
        begun: [],
      };
    if (begun.length > 0)
      return {
        named: [],
        begun: begun,
      };
  }
  let isLabelBegun = (row?: Dynamic) => `${typedForms[1]?.inOrder} `.startsWith(`${formatWordFormsOf(row)[1]?.inOrder} `);
  return {
    named: [],
    begun: ordered.filter(({ isNoFormat: isNoFormat, label: label }: Dynamic) => isNoFormat === true && isLabelBegun(label)),
  };
}
export function numberFormatEnterAction(rows?: Dynamic, typed?: Dynamic, isSearching?: Dynamic) {
  if (!isSearching) {
    let [topRow] = numberFormatRowsFor(rows, typed);
    return topRow?.whyNot === null
      ? {
          does: 'takes',
          row: topRow,
        }
      : {
          does: 'nothing',
        };
  }
  let { named: named, begun: begun } = namedOrBegunFormats(rows, typed);
  let [first, ...rest] = [...named, ...begun];
  let isPatternTyped = looksLikeFormatPattern(typed) && !(first !== undefined && isExampleTyped(first, typed));
  if (first === undefined || first.whyNot !== null || isPatternTyped)
    return {
      does: 'typesOn',
    };
  return (
    named.length > 0
      ? rest.every((row?: Dynamic) => row.label.startsWith(first.label))
      : withoutLittleWords(formatSearchWords(typed)).join('').length >= MATCH_RANK_OTHER_WORDS
  )
    ? {
        does: 'takes',
        row: first,
      }
    : {
        does: 'typesOn',
      };
}
export function numberFormatSearchField(props?: Dynamic) {
  let written = {
    ...props.written,
    takesTypedPattern:
      props.written.takesTypedPattern &&
      !(SHORT_WORD_PATTERN.test(props.written.text.trim()) && !looksLikeFormatPattern(props.written.text)) &&
      FORMAT_TOKEN_PATTERN.test(
        props.written.text.replaceAll(
          FORMAT_LITERAL_PATTERN,
          (typedText?: Dynamic) => (ELAPSED_TIME_PATTERN.test(typedText) ? typedText : ''),
        ),
      ),
  };
  let typed = written.text;
  let enteredRef = React.useRef(false);
  let [isEntered, setIsEntered] = React.useState(false);
  let typePattern = (typedText?: Dynamic) =>
    props.onChosen({
      patternToType: true,
      typedSoFar: typedText.trim(),
    });
  let saidOfTyped = (typed2?: Dynamic, withEnterHint?: Dynamic) => {
    let rows = numberFormatCommands(props);
    let enterAction = numberFormatEnterAction(rows, typed2, props.areFormatsOnOffer);
    let enterLabel = (
      {
        takes: enterAction.does === 'takes' ? enterAction.row.label : null,
        typesOn: customFormatRowLabel(written) ?? customFormatOfferLabel(typed2.trim()),
        nothing: null,
      } as Dynamic
    )[enterAction.does];
    return commandMatchCountText(numberFormatRowsFor(rows, typed2).length, withEnterHint ? enterLabel : null);
  };
  return {
    name: sheetMessages.findNumberFormat(),
    saidOf: (typedText?: Dynamic, withEnterHint: Dynamic = true) =>
      typedText.trim() !== '' && !isEntered && !isAgentBusyOrDone(written) && saidOfTyped(typedText, withEnterHint),
    typed: typed,
    onTyped(typedText?: Dynamic) {
      enteredRef.current = false;
      setIsEntered(false);
      written.onTyped(typedText);
    },
    takeKeyFirst: (typedText?: Dynamic) =>
      props.areFormatsOnOffer &&
      handleCustomFormatKey(
        written,
        typedText,
        !enteredRef.current && numberFormatEnterAction(numberFormatCommands(props), typed, props.areFormatsOnOffer).does === 'typesOn',
      ),
    hasRowsAtRest: true,
    renderRowsFor(typed2?: Dynamic) {
      if (typed2.trim() === '') return null;
      let rows = numberFormatCommands(props);
      let shownRows = numberFormatRowsFor(rows, typed2);
      let enterAction = numberFormatEnterAction(rows, typed2, props.areFormatsOnOffer);
      let isPatternUnderEnter = enterAction.does === 'typesOn';
      let [first, ...rest] = shownRows;
      let isFirstUnderEnter = first !== undefined && 'row' in enterAction && !isAgentBusyOrDone(written);
      let patternRow =
        props.areFormatsOnOffer &&
        jsx(CustomFormatRowInView, {
          list: written,
          isUnderEnter: isPatternUnderEnter,
          rowToDialog: (description?: Dynamic) =>
            jsx(Menu.Item, {
              icon: 'Sliders',
              labelDir: 'auto',
              description: description,
              descriptionLines: 2,
              ...CUSTOM_FORMAT_ROW_PROPS,
              keepOpen: true,
              ...(isPatternUnderEnter && {
                className: 'sheet-row-under-enter',
              }),
              onClick: (event?: Dynamic) => {
                if (written.isActTooSoon()) return;
                swallowRestOfPress(event);
                typePattern(typed2);
              },
              children: customFormatOfferLabel(typed2.trim()),
            }),
        });
      let separator = props.areFormatsOnOffer && shownRows.length > 0 && jsx(Menu.Separator, {});
      return jsxs(Fragment, {
        children: [
          isPatternUnderEnter && patternRow,
          isPatternUnderEnter && separator,
          jsx(Menu.Group, {
            'aria-label': sheetMessages.numberFormat(),
            children: jsx(CommandRows, {
              commands: isFirstUnderEnter
                ? [
                    {
                      ...first,
                      isUnderEnter: true,
                    },
                    ...rest,
                  ]
                : shownRows,
              isRowUnderEnterLit: true,
              isOneChoice: true,
              hintOf: ({ id: id }: Dynamic) => rows.find((row?: Dynamic) => row.id === id)?.atEnd ?? null,
              isPointerCoarse: props.isPointerCoarse,
              describe: () => null,
              onTaken: ({ run: run }: Dynamic) => run(),
            }),
          }),
          !isPatternUnderEnter && separator,
          !isPatternUnderEnter && patternRow,
        ],
      });
    },
    onEntered(typed2?: Dynamic) {
      let enterAction = numberFormatEnterAction(numberFormatCommands(props), typed2, props.areFormatsOnOffer);
      if (enterAction.does === 'nothing') return 'stay';
      if (enteredRef.current) return 'stay';
      enteredRef.current = true;
      setIsEntered(true);
      if ('row' in enterAction) enterAction.row.run();
      else typePattern(typed2);
      return 'shut';
    },
  };
}
export const INSERT_OTHER_WORDS_KEYS = {
  checkbox: 'insertCheckbox',
  dropdown: 'insertDropdown',
  person: 'insertPerson',
  date: 'insertDate',
};
export const MAX_FORMAT_ROWS = 100;
export const FORMAT_LITERAL_PATTERN = /"[^"]*"|\[[^\]]*\]|\\./gu;
export const LONG_LETTER_RUN_PATTERN = /\p{L}{3,}/gu;
export const REPEATED_LETTER_PATTERN = /^(.)\1*$/iu;
export const hasRealWords = (text?: Dynamic) =>
  (text.replaceAll(FORMAT_LITERAL_PATTERN, '').match(LONG_LETTER_RUN_PATTERN) ?? []).some(
    (word?: Dynamic) => !REPEATED_LETTER_PATTERN.test(word),
  );
export const FORMAT_CODE_CHAR_PATTERN = /[\d#?@]/;
export const ELAPSED_TIME_PATTERN = /^\[(?:h+|m+|s+)\]$/i;
export const FORMAT_TOKEN_PATTERN = /[\d#?@dmyhs]|general/i;
export const SHORT_WORD_PATTERN = /^\p{L}{1,2}$/u;
export const AM_PM_PATTERN = /AM\/PM|A\/P/gi;
export const DATE_CODE_ONLY_PATTERN = /^[dmyhs\P{L}]*$/iu;
export const DATE_CODE_RUN_PATTERN = /([dmyhs])\1|[dmyhs]\P{L}+[dmyhs]/iu;
export const formatSearchWords = (text?: Dynamic) =>
  text
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+|[\p{S}%#@*]/gu) ?? [];
export const formatWordFormsCache = new (Map as Dynamic)();
export const labelWordForms = ({ label: label, atEnd: atEnd, isNoFormat: isNoFormat }: Dynamic) =>
  [label, ...label.split(/[()]/), ...((isNoFormat === true ? null : atEnd)?.match(/^[\p{S}%]|[\p{S}%]$/gu) ?? [])].map(formatWordFormsOf);
export const soughtWordForms = ({ label: label, otherWords = [], isSoughtByOtherWords: isSoughtByOtherWords }: Dynamic) =>
  (isSoughtByOtherWords === true ? otherWords : [label]).map(formatWordFormsOf);
export const isExampleTyped = ({ atEnd: atEnd, isNoFormat: isNoFormat }: Dynamic, typed?: Dynamic) =>
  isNoFormat !== true && atEnd?.toLowerCase() === typed.trim().toLowerCase();
export const numberFormatRowsFor = (rows?: Dynamic, typed?: Dynamic) => {
  let { named: named, begun: begun } = namedOrBegunFormats(rows, typed);
  let searchable = rows.filter((row?: Dynamic) => row.isSoughtByOtherWords !== true || queryMatchesOtherWords(row, typed));
  let found = [...new (Set as Dynamic)([...named, ...begun, ...searchCommands(searchable, typed, MAX_FORMAT_ROWS)])];
  return [
    ...found.filter(({ whyNot: whyNot }: Dynamic) => whyNot === null),
    ...found.filter(({ whyNot: whyNot }: Dynamic) => whyNot !== null),
  ];
};
