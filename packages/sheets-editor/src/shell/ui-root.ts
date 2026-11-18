import { ToastProvider } from '../kit/toast.tsx';
import { UiRoot } from '../kit/theme.tsx';
import type { Dynamic } from '../dynamic.ts';
import { asThemeMode, THEME_CHOSEN_ATTRIBUTE, viewerFontOf, VIEWER_FONT_ATTRIBUTE } from './root-theme.ts';
import { jsx } from 'react/jsx-runtime';
import { isTextInputOrEntryEditor, entryEditorOf } from '../dom/entry-editor.ts';
import { MESSAGE_LOCALE } from '../i18n/messages.ts';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';
export function syncRootThemeAttributes(element: HTMLElement, userAgent: string, isSystemDark: boolean): void {
  const mode = asThemeMode(element.getAttribute(THEME_CHOSEN_ATTRIBUTE)) ?? asThemeMode(element.getAttribute('data-theme')) ?? (isSystemDark ? 'dark' : 'light');
  if (element.getAttribute('data-mode') !== mode) element.setAttribute('data-mode', mode);
  element.setAttribute('data-font', viewerFontOf(element, userAgent));
  if (/windows/i.test(userAgent)) element.setAttribute('data-ui-windows', '');
}
export function setUpUiRootElement(element: HTMLElement): void {
  element.classList.add('ui-root');
  element.dataset.density = 'compact';
  const win = element.ownerDocument.defaultView ?? window;
  const darkScheme = win.matchMedia(DARK_SCHEME_QUERY);
  const syncAttributes = (): void => syncRootThemeAttributes(element, win.navigator.userAgent, darkScheme.matches);
  syncAttributes();
  darkScheme.addEventListener('change', syncAttributes);
  new win.MutationObserver(syncAttributes).observe(element, {
    attributes: true,
    attributeFilter: ['data-theme', THEME_CHOSEN_ATTRIBUTE, VIEWER_FONT_ATTRIBUTE],
  });
}
export const TOAST_SELECTOR = '[data-ui="Toast"]';
export const STATUS_ROLE_SELECTOR = '[role="status"]';
export const DIALOG_ROLE_SELECTOR = ':is([role="dialog"], [role="alertdialog"])';
export const OPEN_DIALOG_SELECTOR = `${DIALOG_ROLE_SELECTOR}:not([data-ending-style], [data-limited])`;
export const AT_FOOT_ATTRIBUTE = 'data-at-foot';
export const MOVED_WHILE_FADING_ATTRIBUTE = 'data-moved-while-fading';
export const hasInteractiveToast = (element?: Dynamic) =>
  element.querySelector(`${TOAST_SELECTOR} :is(button, [data-pinned])`) !== null;
export const isInsideToast = (input?: Dynamic) => (input?.closest(TOAST_SELECTOR) ?? null) !== null;
export const isInsideUnpinnedToast = (input?: Dynamic) =>
  isInsideToast(input) && (input?.closest('[data-pinned]') ?? null) === null;
export const markToastUncommentable = (element?: Dynamic) => {
  let toast = element?.closest(TOAST_SELECTOR);
  toast?.setAttribute('data-comment-pass', '');
  toast?.setAttribute('data-uncommentable', '');
};
export const UncommentableToastText = ({ children: children }: Dynamic) =>
  jsx('span', {
    ref: markToastUncommentable,
    children: children,
  });
export const preventToastMouseDown = (event?: Dynamic) => {
  if (event.target instanceof Element && isInsideToast(event.target)) event.preventDefault();
};
export const preventMiddleClick = (event?: Dynamic) => {
  let { target: target } = event;
  let isTextEntry = isTextInputOrEntryEditor(entryEditorOf(target));
  let isToastLink = target instanceof Element && target.closest(`${TOAST_SELECTOR} a[href], a[data-checked-address]`) !== null;
  if (event.button === 1 && !isTextEntry && !isToastLink) event.preventDefault();
};
export const renderInSheetsRoot = (children?: Dynamic) =>
  jsx(UiRoot, {
    density: 'compact',
    className: 'contents',
    locale: MESSAGE_LOCALE,
    children: jsx('div', {
      role: 'presentation',
      className: 'h-full',
      onMouseDown: preventToastMouseDown,
      onPointerUp: preventMiddleClick,
      onAuxClick: preventMiddleClick,
      children: jsx(ToastProvider, {
        viewportClassName: 'z-50! max-w-[calc(100vw-var(--sheet-room-kept-at-right,0px)-2rem)]',
        children: children,
      }),
    }),
  });
export const renderInCompactRoot = (children?: Dynamic) =>
  jsx(UiRoot, {
    density: 'compact',
    className: 'contents',
    children: children,
  });
