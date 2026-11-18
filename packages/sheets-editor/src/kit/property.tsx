import * as React from 'react';
import { Field as BaseField } from '@base-ui/react/field';
import { cn } from './cn.ts';
import { TooltipGroup } from './tooltip.tsx';

/**
 * Sections and rows read their inline padding from `--cmp-property-pad-start` and
 * `--cmp-property-pad-end`, the label column from `--cmp-property-label-width` (in px,
 * unitless) and the trailing column from `--cmp-property-trailing`.
 */
const PAD_CLASSES = 'ps-[var(--cmp-property-pad-start,var(--ui-pad-lg))] pe-[var(--cmp-property-pad-end,var(--ui-pad-md))]';

export interface PropertySectionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title' | 'className'> {
  title?: React.ReactNode;
  /** Buttons at the end of the title row. */
  actions?: React.ReactNode;
  className?: string;
}

const isShown = (node: React.ReactNode): boolean => node !== undefined && node !== null && node !== false;

/** A titled group of property rows, divided from the section before it. */
export const PropertySection = React.forwardRef<HTMLElement, PropertySectionProps>(function PropertySection(
  { title, actions, className, children, ...props },
  ref,
) {
  const hasTitle = isShown(title);
  const hasChildren = React.Children.toArray(children).length > 0;
  return (
    <section
      ref={ref}
      data-ui="PropertySection"
      {...props}
      className={cn(
        'flex min-w-0 shrink-0 flex-col border-divider [&:not(:first-child)]:border-t',
        !hasTitle && '[&:not(:first-child)]:pt-2',
        'has-[[data-ui-part=property-row-trailing]]:[--cmp-property-trailing:var(--ui-h-control)]',
        className,
      )}
    >
      {hasTitle && (
        <div className={cn('flex min-h-10 min-w-0 shrink-0 items-center gap-xs py-2 text-body-semibold text-primary select-none', PAD_CLASSES)}>
          <h3 className="min-w-0 flex-1 truncate font-inherit">{title}</h3>
          {isShown(actions) && (
            <span className="-my-1 flex shrink-0 items-center gap-0.5">
              <TooltipGroup>{actions}</TooltipGroup>
            </span>
          )}
        </div>
      )}
      {hasChildren && <div className="flex min-w-0 flex-col pb-2">{children}</div>}
    </section>
  );
});

export interface PropertyRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'className'> {
  /** Names the row; it also labels the control in the row. */
  label?: React.ReactNode;
  /** A small control after the row's control, such as an icon button. */
  trailing?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

/** One labelled property: a label column, the control, and an optional trailing control. */
export const PropertyRow = React.forwardRef<HTMLDivElement, PropertyRowProps>(function PropertyRow(
  { label, trailing, disabled = false, className, children, ...props },
  ref,
) {
  const hasLabel = isShown(label);
  const hasTrailing = isShown(trailing);
  return (
    <BaseField.Root
      ref={ref}
      data-ui="PropertyRow"
      disabled={disabled}
      {...props}
      className={cn(
        'group/property-row grid min-h-[max(2rem,calc(var(--ui-h-control)+0.25rem))] min-w-0 shrink-0 items-center gap-0 gap-x-sm py-px touch:min-h-10',
        PAD_CLASSES,
        hasLabel ? 'grid-cols-[calc(var(--cmp-property-label-width,76)/16*1rem*var(--ui-rem-scale,1))_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)]',
        className,
      )}
    >
      {hasLabel && (
        <div className={cn('flex min-w-0 items-center', disabled && 'opacity-disabled')}>
          <BaseField.Label className="min-w-0 truncate text-footnote font-normal text-secondary select-none">{label}</BaseField.Label>
        </div>
      )}
      <div
        className={cn(
          'flex min-w-0 items-center gap-2',
          !hasTrailing && 'pe-[calc(var(--cmp-property-trailing,-0.25rem)+0.25rem)] touch:pe-[calc(var(--cmp-property-trailing,-0.5rem)+0.5rem)]',
        )}
      >
        {children}
        {hasTrailing && (
          <TooltipGroup>
            <span
              data-ui-part="property-row-trailing"
              className="-ms-1 flex w-[var(--cmp-property-trailing,auto)] shrink-0 items-center justify-center touch:ms-0"
            >
              {trailing}
            </span>
          </TooltipGroup>
        )}
      </div>
    </BaseField.Root>
  );
});
