import * as React from 'react';
import { cn } from './cn.ts';
import { Icon, isIconName, type IconName } from './icon.tsx';

export type BannerVariant = 'neutral' | 'warning' | 'danger';

const VARIANT_CLASSES: Readonly<Record<BannerVariant, string>> = {
  neutral: 'bg-surface-1 text-primary shadow-[inset_0_0_0_1px_var(--ui-border)]',
  warning: 'bg-warning-soft text-[var(--ui-text-warning)]',
  danger: 'bg-danger-soft text-[var(--ui-text-danger)]',
};

const ICON_NAMES: Readonly<Record<BannerVariant, IconName>> = {
  neutral: 'Info',
  warning: 'Warning',
  danger: 'Warning',
};

export interface BannerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'role'> {
  variant?: BannerVariant;
  /** An icon name or element in place of the variant's icon; `null` shows none. */
  icon?: IconName | React.ReactNode | null;
  /** `status` by default, so the message is announced; `none` leaves the role off. */
  role?: React.AriaRole | 'none';
}

/** A message set into the page, such as a warning above a form. */
export const Banner = React.forwardRef<HTMLDivElement, BannerProps>(function Banner(
  { variant = 'neutral', icon, role = 'status', className, children, ...rest },
  ref,
) {
  const shownIcon =
    icon === null ? null : icon === undefined || isIconName(icon) ? <Icon name={icon ?? ICON_NAMES[variant]} size="md" /> : icon;
  return (
    <div
      ref={ref}
      data-ui="Banner"
      role={role === 'none' ? undefined : role}
      {...rest}
      className={cn('flex items-start gap-xs py-md px-lg rounded-panel text-body', VARIANT_CLASSES[variant], className)}
    >
      {shownIcon !== null && <span className={cn('flex h-[1lh] shrink-0 items-center', variant === 'neutral' && 'text-secondary')}>{shownIcon}</span>}
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
});
