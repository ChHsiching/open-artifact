import type { Dynamic } from '../dynamic.ts';
import { MESSAGE_LOCALE, translateMessage } from '../i18n/messages.ts';
export let languageNamesFormatter: Dynamic;
export function languageNameOfLocale(locale?: Dynamic) {
  languageNamesFormatter ??= new (Intl.DisplayNames as Dynamic)(MESSAGE_LOCALE, {
    type: 'language',
    languageDisplay: 'standard',
  });
  return languageNamesFormatter.of(locale) ?? locale;
}
export const sortByLabel = (choices?: Dynamic) =>
  [...choices].toSorted((choice?: Dynamic, other?: Dynamic) => (choice.label < other.label ? -1 : choice.label > other.label ? 1 : 0));
export const foldTextForSearch = (text?: Dynamic) =>
  text
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export const labelMatchesSearch = ({ label: label }: Dynamic, search?: Dynamic) =>
  ` ${foldTextForSearch(label)}`.includes(` ${foldTextForSearch(search)}`);
export const localeMessages = {
  locale: () =>
    translateMessage({
      defaultMessage: 'Locale',
      id: 'FCjgO9b5WB',
    }),
  whatGoesByIt: () =>
    translateMessage({
      defaultMessage:
        'Sets how numbers (1,234.5 or 1.234,5), dates (12/31/2026 or 31/12/2026), new currency amounts, and month and day names are written for everyone who opens this Sheet. With a decimal comma, formulas separate arguments with semicolons.',
      id: 'zR1o5jt0ws',
    }),
};
languageNamesFormatter = null;
export const localeSetWords = (locale?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Locale set to {locale}',
      id: 'sjyIYA/suy',
    },
    {
      locale: languageNameOfLocale(locale),
    },
  );
export const localeChoices = (locales?: Dynamic) =>
  sortByLabel(
    locales.map(
      (locale?: Dynamic) => ({
        value: locale,
        label: languageNameOfLocale(locale),
      }),
    ),
  );
