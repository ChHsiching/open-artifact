import type { Dynamic } from '../dynamic.ts';
export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export const browserLocales = (
  languages: Dynamic = [...(navigator as Dynamic).languages, Intl.DateTimeFormat().resolvedOptions().locale],
) =>
  languages.flatMap((tag?: Dynamic) => {
    try {
      let { language: language, region: region } = new (Intl.Locale as Dynamic)(tag).maximize();
      return [region === undefined ? language : `${language}-${region}`];
    } catch {
      return [];
    }
  });
