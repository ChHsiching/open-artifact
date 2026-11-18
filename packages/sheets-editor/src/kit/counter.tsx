import * as React from 'react';
import { cn } from './cn.ts';

export type CounterVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
export type CounterSize = 'xxs';

const VARIANT_CLASSES: Readonly<Record<CounterVariant, string>> = {
  neutral: 'bg-neutral text-secondary',
  accent: 'bg-fill-accent text-on-accent',
  success: 'bg-[var(--ui-text-success)] text-on-accent',
  warning: 'bg-[var(--ui-fill-warning)] text-primary',
  danger: 'bg-fill-danger text-on-danger',
};

const DOT_CLASSES: Readonly<Record<CounterVariant, string>> = {
  neutral: 'bg-fill-control',
  accent: 'bg-fill-accent',
  success: 'bg-[var(--ui-text-success)]',
  warning: 'bg-[var(--ui-fill-warning)]',
  danger: 'bg-fill-danger',
};

const SIZE_CLASSES: Readonly<Record<CounterSize, string>> = {
  xxs: '[--ui-h-control-nested:calc(1rem*var(--ui-rem-scale,1))]',
};

export interface CounterProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  value: number;
  /** Larger counts show as this number with a plus. */
  max?: number;
  /** Shows 0 rather than nothing. */
  showZero?: boolean;
  /** Shows a plain dot in place of the number. */
  dot?: boolean;
  variant?: CounterVariant;
  size?: CounterSize;
}

/** A small pill with a count, such as the number of unread items. */
export const Counter = React.forwardRef<HTMLSpanElement, CounterProps>(function Counter(
  { value, max = 99, showZero = false, dot = false, variant = 'danger', size, className, ...rest },
  ref,
) {
  if (dot) {
    return (
      <span
        ref={ref}
        data-ui="Counter"
        aria-hidden="true"
        {...rest}
        className={cn('inline-block size-2 shrink-0 rounded-full align-middle', DOT_CLASSES[variant], className)}
      />
    );
  }
  if (!Number.isFinite(value)) return null;
  const count = Math.max(0, Math.floor(value));
  if (count === 0 && !showZero) return null;
  const text = count > max ? `${max}+` : `${count}`;
  return (
    <span
      ref={ref}
      data-ui="Counter"
      {...rest}
      className={cn(
        'inline-flex shrink-0 items-center justify-center align-middle h-control-nested min-w-[var(--ui-h-control-nested)] rounded-full',
        size !== undefined && SIZE_CLASSES[size],
        text.length === 1 ? 'px-0' : 'px-[calc(var(--ui-h-control-nested)*0.3)]',
        'font-sans text-caption font-medium proportional-nums',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {count > max ? <span dir="ltr">{text}</span> : text}
    </span>
  );
});
