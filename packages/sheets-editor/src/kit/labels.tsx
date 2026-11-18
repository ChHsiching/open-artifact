import { uiLabel, type UiLabelValues } from '../i18n/ui-labels.ts';

/** A control's built-in words, in the page's language. */
export function useKitLabel(key: string, values: UiLabelValues = {}): string {
  return uiLabel(key, values) ?? key;
}
