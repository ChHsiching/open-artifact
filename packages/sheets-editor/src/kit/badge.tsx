import * as React from 'react';
import { cn } from './cn.ts';

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const VARIANT_CLASSES: Readonly<Record<BadgeVariant, string>> = {
  neutral: 'bg-neutral text-secondary',
  accent: 'bg-[var(--ui-bg-tint-blue)] text-[var(--ui-text-tint-blue)]',
  success: 'bg-[var(--ui-bg-tint-green)] text-[var(--ui-text-tint-green)]',
  warning: 'bg-[var(--ui-bg-tint-yellow)] text-[var(--ui-text-tint-yellow)]',
  danger: 'bg-[var(--ui-bg-tint-red)] text-[var(--ui-text-tint-red)]',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

/** A short status label, tinted by what it says. */
export function Badge({ variant = 'neutral', className, children, ...rest }: BadgeProps): React.ReactElement {
  return (
    <span
      data-ui="Badge"
      data-variant={variant}
      {...rest}
      className={cn(
        'inline-flex h-control-nested items-center gap-1 whitespace-nowrap rounded-chip px-sm align-middle text-footnote font-medium',
        'forced-colors:border forced-colors:border-solid forced-colors:border-[CanvasText]',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
