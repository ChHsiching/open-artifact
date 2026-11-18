/**
 * The page's colour mode: the UI follows the system unless the host pins
 * `data-theme` on `<html>`; `data-mode` mirrors a pinned theme for the
 * dashboard's own styles.
 */

/** Mirrors `data-theme` into `data-mode` on the document's root; returns a stop function. */
export function followColorScheme(doc: Document = document): () => void {
  const root = doc.documentElement;
  const sync = (): void => {
    const theme = root.getAttribute('data-theme');
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-mode', theme);
    else root.removeAttribute('data-mode');
  };
  sync();
  const Observer = doc.defaultView?.MutationObserver;
  if (Observer === undefined) return () => undefined;
  const observer = new Observer(sync);
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/**
 * Sets the language (and direction) of the dashboard's content (`dash/meta.lang`)
 * on the element that holds it; the UI around it keeps `<html lang="en">`.
 */
export function applyPageLanguage(lang: string | null, element: HTMLElement): void {
  if (lang === null) {
    element.removeAttribute('lang');
    element.removeAttribute('dir');
    return;
  }
  element.lang = lang;
  const direction = textDirection(lang);
  if (direction !== undefined) element.dir = direction;
}

const RTL_LANGUAGES = new Set(['ar', 'arc', 'dv', 'fa', 'ha', 'he', 'khw', 'ks', 'ku', 'ps', 'sd', 'ur', 'yi']);

/** `rtl` for a right-to-left language tag, `ltr` otherwise. */
export function textDirection(lang: string): 'ltr' | 'rtl' | undefined {
  try {
    const locale = new Intl.Locale(lang) as Intl.Locale & { getTextInfo?: () => { direction?: string }; textInfo?: { direction?: string } };
    const info = locale.getTextInfo?.() ?? locale.textInfo;
    if (info?.direction === 'rtl' || info?.direction === 'ltr') return info.direction;
    return RTL_LANGUAGES.has(locale.language) ? 'rtl' : 'ltr';
  } catch {
    return undefined;
  }
}
