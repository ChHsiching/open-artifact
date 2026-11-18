/** Refresh data: how long the page reuses its sources' results before loading them again. */

import { DASHBOARD_UPDATE_INTERVALS, getUpdatesIntervalMs, type DashboardUpdateSetting, type DashboardUpdates } from '@open-artifact/data-core';
import { plural } from './words.ts';

export const DASHBOARD_UPDATE_LABELS: Readonly<Record<DashboardUpdates, string>> = {
  viewed: 'On each visit',
  '5min': 'After 5 minutes',
  hour: 'After an hour',
  day: 'After a day',
  week: 'After a week',
};

export const SETTING_NOT_SAVED_MESSAGE = 'Couldn’t save that setting.';

/** A custom interval (minutes) in its largest whole unit. */
export function splitUpdatesMinutes(minutes: number): { n: number; unit: 'day' | 'hour' | 'minute' } {
  if (minutes % 1440 === 0) return { n: minutes / 1440, unit: 'day' };
  return minutes % 60 === 0 ? { n: minutes / 60, unit: 'hour' } : { n: minutes, unit: 'minute' };
}

/** "On each visit", "After an hour", or a custom interval ("After 2 days", "After 90 minutes"). */
export function updatesLabel(updates: DashboardUpdateSetting): string {
  if (typeof updates !== 'number') return DASHBOARD_UPDATE_LABELS[updates];
  const { n, unit } = splitUpdatesMinutes(updates);
  return `After ${plural(n, unit, `${unit}s`)}`;
}

/** The menu's choices: the presets, and a custom interval in its place among them. */
export function getUpdatesChoices(updates: DashboardUpdateSetting): DashboardUpdateSetting[] {
  return typeof updates === 'number'
    ? [...DASHBOARD_UPDATE_INTERVALS, updates].sort((left, right) => getUpdatesIntervalMs(left) - getUpdatesIntervalMs(right))
    : [...DASHBOARD_UPDATE_INTERVALS];
}
