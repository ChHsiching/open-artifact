import type { Dynamic } from '../dynamic.ts';
export function viewerFontOf(element?: Dynamic, userAgent?: Dynamic) {
  let chosenFont = element.getAttribute('data-viewer-font');
  return VIEWER_FONTS.find((input?: Dynamic) => input === chosenFont) ?? defaultViewerFont(userAgent);
}
export function setChosenThemeAttribute(element?: Dynamic, theme?: Dynamic) {
  if (theme === null) element.removeAttribute('data-theme-chosen');
  else element.setAttribute('data-theme-chosen', theme);
}
export function restoreChosenTheme(element?: Dynamic, getStorage: Dynamic = defaultThemeStorage) {
  try {
    setChosenThemeAttribute(element, asThemeMode(getStorage().getItem('sheets-theme')));
  } catch {}
}
export function chooseSheetsTheme(element?: Dynamic, theme?: Dynamic, getStorage: Dynamic = defaultThemeStorage) {
  setChosenThemeAttribute(element, theme);
  try {
    if (theme === null) getStorage().removeItem('sheets-theme');
    else getStorage().setItem('sheets-theme', theme);
  } catch {}
}
export const VIEWER_FONTS = ['system'];
export const VIEWER_FONT_ATTRIBUTE = 'data-viewer-font';
export const defaultViewerFont = () => 'system';
export const THEME_CHOSEN_ATTRIBUTE = 'data-theme-chosen';
export const asThemeMode = (input?: Dynamic) => (input === 'light' || input === 'dark' ? input : null);
export const defaultThemeStorage = () => localStorage;
