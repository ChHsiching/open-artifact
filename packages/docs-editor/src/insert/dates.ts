/** Calendar dates as a date chip keeps them (`YYYY-MM-DD`, local), the month grid and the dates words name. */

const pad = (n: number) => String(n).padStart(2, '0');

/** A local day as `YYYY-MM-DD` (never through `toISOString`, which would shift it to UTC). */
export const isoDate = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The local day a chip's `ts` names: a plain date, or the date part of a timestamp. */
export function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (plain) {
    const date = new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]));
    return Number.isNaN(date.getTime()) || isoDate(date) !== value ? null : date;
  }
  const stamp = new Date(value);
  return Number.isNaN(stamp.getTime()) ? null : new Date(stamp.getFullYear(), stamp.getMonth(), stamp.getDate());
}

export const addDays = (date: Date, days: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** The same day `months` months on, or the month's last day when it is shorter. */
export function addMonths(date: Date, months: number): Date {
  const last = new Date(date.getFullYear(), date.getMonth() + months + 1, 0).getDate();
  return new Date(date.getFullYear(), date.getMonth() + months, Math.min(date.getDate(), last));
}

export const today = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

export interface CalendarDay {
  iso: string;
  day: number;
  /** In the month shown (the grid starts and ends with days of the months around it). */
  inMonth: boolean;
  isToday: boolean;
}

/** Six weeks covering a month, starting on `firstDay` (0 = Sunday). */
export function monthGrid(year: number, month: number, firstDay: number, todayIso: string): CalendarDay[] {
  const first = new Date(year, month, 1);
  let day = addDays(first, -((first.getDay() - firstDay + 7) % 7));
  const out: CalendarDay[] = [];
  for (let index = 0; index < 42; index++) {
    const iso = isoDate(day);
    out.push({ iso, day: day.getDate(), inMonth: day.getMonth() === month, isToday: iso === todayIso });
    day = addDays(day, 1);
  }
  return out;
}

interface WeekInfo {
  firstDay?: number;
}

/** The locale's first day of the week (0 = Sunday), Sunday when the browser doesn't say. */
export function firstDayOfWeek(locale?: string): number {
  try {
    const tag = new Intl.Locale(locale ?? (typeof navigator === 'undefined' ? 'en-US' : navigator.language)) as Intl.Locale & {
      weekInfo?: WeekInfo;
      getWeekInfo?: () => WeekInfo;
    };
    const info = tag.getWeekInfo?.() ?? tag.weekInfo;
    return typeof info?.firstDay === 'number' ? info.firstDay % 7 : 0;
  } catch {
    return 0;
  }
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** The day typed words name (`today`, `tomorrow`, `yesterday`, a weekday = its next one, `YYYY-MM-DD`), or null. */
export function dateFromWords(words: string, from: Date = today()): string | null {
  const query = words.trim().toLowerCase();
  if (!query) return null;
  if (query === 'today') return isoDate(from);
  if (query === 'tomorrow') return isoDate(addDays(from, 1));
  if (query === 'yesterday') return isoDate(addDays(from, -1));
  const weekday = query.length >= 3 ? WEEKDAYS.findIndex(name => name.startsWith(query.replace(/^next\s+/, ''))) : -1;
  if (weekday >= 0) return isoDate(addDays(from, ((weekday - from.getDay() + 7) % 7) || 7));
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(query) ? parseIsoDate(query) : null;
  return parsed ? isoDate(parsed) : null;
}

/** A day as the picker reads it out: "Wednesday, November 18, 2026". */
export const longDate = (date: Date): string => date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
