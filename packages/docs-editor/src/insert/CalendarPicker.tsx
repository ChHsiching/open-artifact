/** A date chip's calendar: a month of days, the months around it, and today or tomorrow in one press. */
import { ChromeButton } from '@open-artifact/editor-kit/react';
import { cn } from '@open-artifact/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { EditorView } from 'prosemirror-view';
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { leaveChip, setChipAttrs } from './chips.ts';
import { addDays, addMonths, firstDayOfWeek, isoDate, longDate, monthGrid, parseIsoDate, today } from './dates.ts';
import { PickerShell } from './PickerShell.tsx';

const weekdayName = (day: number) => new Date(Date.UTC(1970, 0, 4 + day)).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' });

export function CalendarPicker({ view, pos }: { view: EditorView; pos: number }): ReactNode {
  const selected = useMemo(() => parseIsoDate(view.state.doc.nodeAt(pos)?.attrs.ts), [view, pos]);
  const [focus, setFocus] = useState<Date>(() => selected ?? today());
  const [keyed, setKeyed] = useState(true);
  const grid = useRef<HTMLDivElement>(null);
  const firstDay = useMemo(() => firstDayOfWeek(), []);
  const todayIso = isoDate(today());
  const selectedIso = selected ? isoDate(selected) : '';
  const focusIso = isoDate(focus);
  const days = monthGrid(focus.getFullYear(), focus.getMonth(), firstDay, todayIso);
  const title = new Date(focus.getFullYear(), focus.getMonth(), 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  useEffect(() => {
    if (keyed) grid.current?.querySelector<HTMLElement>(`[data-iso="${focusIso}"]`)?.focus({ preventScroll: true });
  }, [focusIso, keyed]);

  const pick = (iso: string) => {
    setChipAttrs(view, pos, { ts: iso });
    leaveChip(view, pos);
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, -1),
      PageDown: () => addMonths(focus, 1),
      Home: () => addDays(focus, -((focus.getDay() - firstDay + 7) % 7)),
      End: () => addDays(focus, 6 - ((focus.getDay() - firstDay + 7) % 7)),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setKeyed(true);
      setFocus(move());
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(focusIso);
    }
  };

  const turn = (months: number) => {
    setKeyed(false);
    setFocus(addMonths(focus, months));
  };

  return (
    <PickerShell view={view} pos={pos} onChip label="Pick a date" onEscape={() => leaveChip(view, pos)} className="w-[17rem] p-3">
      <div className="mb-2 flex items-center justify-between">
        <ChromeButton square aria-label="Previous month" onClick={() => turn(-1)}>
          <ChevronLeft className="size-4" />
        </ChromeButton>
        <span className="text-[14px] font-medium" aria-live="polite">
          {title}
        </span>
        <ChromeButton square aria-label="Next month" onClick={() => turn(1)}>
          <ChevronRight className="size-4" />
        </ChromeButton>
      </div>
      <div ref={grid} role="grid" aria-label={title} onKeyDown={onKey}>
        <div role="row" className="grid grid-cols-7" aria-hidden="true">
          {Array.from({ length: 7 }, (_, at) => (
            <div key={at} role="columnheader" className="flex h-7 items-center justify-center text-[12px] text-chrome-muted">
              {weekdayName((firstDay + at) % 7)}
            </div>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, week) => (
          <div key={week} role="row" className="grid grid-cols-7">
            {days.slice(week * 7, week * 7 + 7).map(day => {
              const isSelected = day.iso === selectedIso;
              return (
                <button
                  key={day.iso}
                  type="button"
                  role="gridcell"
                  data-iso={day.iso}
                  tabIndex={day.iso === focusIso ? 0 : -1}
                  aria-selected={isSelected}
                  aria-current={day.isToday ? 'date' : undefined}
                  aria-label={longDate(parseIsoDate(day.iso)!)}
                  onClick={() => pick(day.iso)}
                  className={cn(
                    'mx-auto flex size-8 items-center justify-center rounded-full text-[13px] outline-none transition-colors',
                    'hover:bg-chrome-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-chrome-focus',
                    !day.inMonth && 'text-chrome-muted opacity-60',
                    day.isToday && !isSelected && 'font-semibold text-chrome-accent',
                    isSelected && 'bg-chrome-accent text-white hover:bg-chrome-accent',
                  )}
                >
                  {day.day}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1 border-t border-chrome-line pt-2">
        <ChromeButton onClick={() => pick(todayIso)}>Today</ChromeButton>
        <ChromeButton onClick={() => pick(isoDate(addDays(today(), 1)))}>Tomorrow</ChromeButton>
      </div>
    </PickerShell>
  );
}
