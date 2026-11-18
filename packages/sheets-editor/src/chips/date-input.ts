import { DateInput } from '../kit/date-input.tsx';
import { UiRoot } from '../kit/theme.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { MESSAGE_LOCALE } from '../i18n/messages.ts';
import { jsx } from 'react/jsx-runtime';
export function dateOrderOf(formatted?: Dynamic) {
  let numbers = [...formatted.matchAll(/\d+/g)].map(([digits]: Dynamic) => Number(digits));
  let partOfNumber = new (Map as Dynamic)([
    [15, 'day'],
    [3, 'month'],
    [2026, 'year'],
  ]);
  let parts = numbers.map((number?: Dynamic) => partOfNumber.get(number));
  return new (Set as Dynamic)(parts).size === 3 && !parts.includes(undefined) ? parts.join(' ') : null;
}
export function regionOfLocale(locale?: Dynamic) {
  try {
    return new (Intl.Locale as Dynamic)(locale).region;
  } catch {
    return;
  }
}
export function dateInputLocaleFor({ locale: locale, march15: march15 }: Dynamic, formatMarch15: Dynamic = march15In) {
  let dateOrder = dateOrderOf(march15);
  if (dateOrder === null) return MESSAGE_LOCALE;
  let region = regionOfLocale(locale);
  return (
    [...(region === undefined ? [] : [`en-${region}`]), MESSAGE_LOCALE, 'en-GB', 'en-SE', 'en-CA', 'en-ZA'].find(
      (candidate?: Dynamic) => dateOrderOf(formatMarch15(candidate)) === dateOrder,
    ) ?? MESSAGE_LOCALE
  );
}
export function SheetDateInput(props?: Dynamic) {
  let localeOfHost = React.use(DateInputLocaleContext);
  let locale = React.useMemo(() => dateInputLocaleFor(localeOfHost), [localeOfHost]);
  return jsx(UiRoot, {
    locale: locale,
    className: 'contents',
    children: jsx(DateInput, {
      ...props,
    }),
  });
}
export const DateInputLocaleContext = React.createContext({
  locale: MESSAGE_LOCALE,
  march15: '3/15/2026',
});
export const march15In = (locale?: Dynamic) =>
  new (Intl.DateTimeFormat as Dynamic)(locale, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(Date.UTC(2026, 2, 15));
