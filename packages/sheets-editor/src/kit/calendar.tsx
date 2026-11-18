import * as React from 'react';
import {
  type CalendarDate,
  endOfMonth,
  getWeeksInMonth,
  GregorianCalendar,
  isSameMonth,
  isToday,
  parseDate,
} from '@internationalized/date';
import { I18nProvider, mergeProps, useCalendar, useCalendarCell, useCalendarGrid, useFocusRing, useLocale as useAriaLocale } from 'react-aria';
import { type CalendarState, useCalendarState } from 'react-stately';
import { Button } from './button.tsx';
import { cn } from './cn.ts';
import { useKitLabel } from './labels.tsx';
import { useLocale } from './theme.tsx';

/** Reads `YYYY-MM-DD`; anything else is no date. */
export function parseIsoDate(iso: string | null | undefined): CalendarDate | null {
  if (iso === null || iso === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  try {
    return parseDate(iso);
  } catch {
    return null;
  }
}

export const isoDateOf = (date: CalendarDate): string => date.toString();

export const createGregorianCalendar = (): GregorianCalendar => new GregorianCalendar();

export interface CalendarProps {
  'aria-label'?: string;
  'aria-labelledby'?: string;
  /** The chosen day, as `YYYY-MM-DD`. */
  value?: string | null;
  onChange?: (iso: string) => void;
  minDate?: string;
  maxDate?: string;
  /** Puts focus on the chosen day (or today) when the calendar appears. */
  autoFocus?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  className?: string;
}

const DAY_CLASSES =
  'ui-reset relative flex h-control w-control cursor-default items-center justify-center rounded text-body font-normal text-primary outline-none select-none focus-visible:outline-hidden';

function CalendarDay({ state, date }: { state: CalendarState; date: CalendarDate }): React.ReactElement {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const { cellProps, buttonProps, isSelected, isDisabled, isUnavailable, formattedDate } = useCalendarCell({ date }, state, ref);
  const { isFocusVisible, focusProps } = useFocusRing();
  const isOff = isDisabled || isUnavailable;
  return (
    <td {...cellProps} className="h-control w-control p-0">
      <div
        {...mergeProps(buttonProps, focusProps)}
        ref={ref}
        className={cn(
          DAY_CLASSES,
          !isSelected && !isOff && 'hover:bg-fill-ghost-hover',
          isToday(date, state.timeZone) && !isSelected && 'font-semibold text-[color:var(--ui-text-accent)]',
          isSelected && 'bg-fill-accent text-on-accent forced-color-adjust-none forced-colors:bg-[color:Highlight] forced-colors:text-[color:HighlightText]',
          isFocusVisible && 'shadow-focus',
          isOff && 'text-muted opacity-disabled',
          state.isReadOnly && 'pointer-events-none',
        )}
      >
        {formattedDate}
      </div>
    </td>
  );
}

function CalendarMonth({ state, locale }: { state: CalendarState; locale: string }): React.ReactElement {
  const monthStart = state.visibleRange.start;
  const { gridProps, headerProps, weekDays } = useCalendarGrid({ startDate: monthStart, endDate: endOfMonth(monthStart), weekdayStyle: 'narrow' }, state);
  const weekCount = getWeeksInMonth(monthStart, locale);
  return (
    <table {...gridProps} className="block border-collapse">
      <thead {...headerProps} role="rowgroup" className="block">
        <tr role="row" className="flex">
          {weekDays.map((weekDay, index) => (
            <th key={index} role="columnheader" className="flex h-control w-control items-center justify-center p-0 text-caption font-normal text-secondary">
              {weekDay}
            </th>
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup" className="flex flex-col gap-y-0.5">
        {Array.from({ length: weekCount }, (_week, weekIndex) => (
          <tr key={weekIndex} role="row" className="flex">
            {state.getDatesInWeek(weekIndex, monthStart).map((date, dayIndex) =>
              date !== null && isSameMonth(date, monthStart) ? (
                <CalendarDay key={isoDateOf(date)} state={state} date={date} />
              ) : (
                <td key={dayIndex} role="gridcell" aria-hidden className="h-control w-control p-0" />
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CalendarBody({
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  value,
  onChange,
  minDate,
  maxDate,
  autoFocus,
  readOnly,
  disabled,
  className,
}: CalendarProps): React.ReactElement {
  const { locale } = useAriaLocale();
  const previousMonthLabel = useKitLabel('previousMonth');
  const nextMonthLabel = useKitLabel('nextMonth');
  const day = React.useMemo(() => (value === undefined ? undefined : parseIsoDate(value)), [value]);
  const minValue = React.useMemo(() => parseIsoDate(minDate), [minDate]);
  const maxValue = React.useMemo(() => parseIsoDate(maxDate), [maxDate]);
  const state = useCalendarState({
    value: day,
    onChange: (picked) => {
      if (picked !== null) onChange?.(isoDateOf(picked));
    },
    autoFocus,
    locale,
    createCalendar: createGregorianCalendar,
    minValue,
    maxValue,
    isReadOnly: readOnly,
    isDisabled: disabled,
  });
  const { calendarProps, prevButtonProps, nextButtonProps, title } = useCalendar(
    { 'aria-label': ariaLabelledby === undefined ? ariaLabel : undefined, 'aria-labelledby': ariaLabelledby, isDisabled: disabled },
    state,
  );
  return (
    <div data-ui="Calendar" {...calendarProps} className={cn('flex w-max flex-col', className)}>
      <div className="flex items-center justify-between gap-sm pb-sm">
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          icon="CaretLeft"
         
          aria-label={previousMonthLabel}
          tooltip={false}
          disabled={prevButtonProps.isDisabled}
          onClick={() => state.focusPreviousPage()}
        />
        <span aria-hidden className="text-body font-medium text-primary">
          {title}
        </span>
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          icon="CaretRight"
         
          aria-label={nextMonthLabel}
          tooltip={false}
          disabled={nextButtonProps.isDisabled}
          onClick={() => state.focusNextPage()}
        />
      </div>
      <CalendarMonth state={state} locale={locale} />
    </div>
  );
}

/**
 * A month of days to pick one from, in the page's language. Arrow keys move by day and week,
 * Page Up and Page Down by month. Give it a new `key` to show another month from outside.
 */
export function Calendar(props: CalendarProps): React.ReactElement {
  const locale = useLocale();
  return (
    <I18nProvider locale={locale}>
      <CalendarBody {...props} />
    </I18nProvider>
  );
}

