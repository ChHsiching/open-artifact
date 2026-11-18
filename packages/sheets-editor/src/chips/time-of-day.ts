import type { Dynamic } from '../dynamic.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function timeOfDayFraction(dayFraction?: Dynamic) {
  let seconds = Math.round(dayFraction * 86400);
  let roundedFraction = seconds / 86400;
  if (seconds < 0 || seconds >= 86400) return null;
  if (Math.abs(roundedFraction - dayFraction) > 0.000000001) return null;
  return {
    time: timeOfSeconds(seconds),
    isExact: roundedFraction === dayFraction,
  };
}
export function minuteChoicesOf(digits?: Dynamic, choicesIfNone?: Dynamic) {
  if (digits === '') return choicesIfNone;
  let number = Number(digits);
  if (digits.length === 1) return number < 6 ? [number * 10, number * 10 + 5] : [];
  return number < 60 ? [number] : [];
}
export function hourChoicesOf(hour?: Dynamic, halfOfDay?: Dynamic) {
  if (hour > 23) return [];
  if (hour === 0 || hour > 12) return halfOfDay === null ? [hour] : [];
  if (halfOfDay !== null) return [(hour % 12) + (halfOfDay === 'p' ? 12 : 0)];
  return hour === 12 ? [12, 0] : [hour, hour + 12];
}
export function hourMinuteSplitsOf(digits?: Dynamic, hasHalfOfDay?: Dynamic) {
  let splitAt = (at?: Dynamic) => [digits.slice(0, at), digits.slice(at)];
  if (digits.length === 1) return [splitAt(1)];
  if (digits.length === 4) return [splitAt(2)];
  if (digits.length === 2) return [splitAt(Number(digits[0]) > 2 && !hasHalfOfDay ? 1 : 2)];
  return hasHalfOfDay ? [splitAt(1)] : [splitAt(1), splitAt(2)];
}
export function timesTypedAs(text?: Dynamic, most?: Dynamic) {
  let match = typedTimePattern.exec(text.trim());
  if (match === null) return [];
  let [, digits, hourText = '', minuteText = '', secondText = '', halfOfDayText] = match;
  let halfOfDay = halfOfDayText === undefined ? null : halfOfDayText.toLowerCase() === 'p' ? 'p' : 'a';
  let times = (digits === undefined ? [[hourText, minuteText]] : hourMinuteSplitsOf(digits, halfOfDay !== null)).flatMap(
    ([hourText2, minuteText2]: Dynamic) =>
      hourChoicesOf(Number(hourText2), halfOfDay).flatMap(
        (hour?: Dynamic) =>
          minuteChoicesOf(minuteText2, QUARTER_HOUR_MINUTES).flatMap(
            (minute?: Dynamic) =>
              minuteChoicesOf(secondText, [0])
                .slice(0, 1)
                .map(
                  (second?: Dynamic) => ({
                    hour: hour,
                    minute: minute,
                    second: second,
                  }),
                ),
          ),
      ),
  );
  let timeKeys = times.map(secondsOfTime);
  return times.filter((time?: Dynamic, index?: Dynamic) => timeKeys.indexOf(secondsOfTime(time)) === index).slice(0, most);
}
export const secondsOfTime = ({ hour: hour, minute: minute, second: second }: Dynamic) => hour * 3600 + minute * 60 + second;
export const timeOfSeconds = (seconds?: Dynamic) => ({
  hour: Math.floor(seconds / 3600),
  minute: Math.floor(seconds / 60) % 60,
  second: seconds % 60,
});
export const dayFractionOfTime = (time?: Dynamic) => secondsOfTime(time) / 86400;
export const shownTimeIn = (reads: WorkbookReads, time?: Dynamic, pattern?: Dynamic) =>
  reads.shownWithRoomForAll(
    {
      kind: 'number',
      value: dayFractionOfTime(time),
    },
    pattern,
  ) ?? '';
export const isTwelveHourPattern = (pattern?: Dynamic) => /AM\/PM|A\/P/i.test(pattern);
export const shownTimeFor = (reads: WorkbookReads, time?: Dynamic, pattern?: Dynamic) =>
  reads.shownWithRoomForAll(
    {
      kind: 'number',
      value: dayFractionOfTime(time),
    },
    `h:mm${time.second === 0 ? '' : ':ss'}${isTwelveHourPattern(pattern) ? ' AM/PM' : ''}`,
  );
export const typedTimePattern = /^(?:(\d{1,4})|(\d{1,2}):(\d{0,2})(?::(\d{0,2}))?)\s*(?:([ap])\.?m?\.?)?$/i;
export const QUARTER_HOUR_MINUTES = [0, 15, 30, 45];
export const timeTypedAs = (text?: Dynamic) => timesTypedAs(text, 1)[0] ?? null;
export const timesFrom = (start?: Dynamic, stepMinutes?: Dynamic, count?: Dynamic) =>
  Array.from<Dynamic, Dynamic>(
    {
      length: count,
    },
    (input?: Dynamic, index?: Dynamic) => timeOfSeconds((secondsOfTime(start) + index * stepMinutes * 60) % 86400),
  );
