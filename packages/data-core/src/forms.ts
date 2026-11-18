/** One of the dashboard type's own formats. */
export interface DashboardForm {
  key: string;
  name: string;
}

/** The formats a dashboard can take, in the order they are offered. */
export const DASHBOARD_FORMS: readonly DashboardForm[] = [
  { key: 'dashboard', name: 'Dashboard' },
  { key: 'visual-analysis', name: 'Visual analysis' },
  { key: 'scroll-story', name: 'Scrollyteller' },
  { key: 'visual-short', name: 'Visual short' },
];

/** Keys of formats no longer offered, which old drafts may still name. */
export const LEGACY_FORM_KEYS: readonly string[] = ['letter'];
export const DEFAULT_DASHBOARD_FORM = 'dashboard';
export const DEFAULT_DASHBOARD_TITLE = 'Dashboard';

/** A format's key as stored, current or legacy; `undefined` for an unknown one. */
export function findDashboardFormKey(value: unknown): string | undefined {
  return [...DASHBOARD_FORMS.map((form) => form.key), ...LEGACY_FORM_KEYS].find((key) => key === value);
}
