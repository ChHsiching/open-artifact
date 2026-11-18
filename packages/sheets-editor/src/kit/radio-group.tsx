import * as React from 'react';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group';
import { cn } from './cn.ts';

export interface RadioGroupRootProps<Value extends string> extends Omit<BaseRadioGroup.Props<Value>, 'className' | 'onValueChange'> {
  className?: string;
  onValueChange?: (value: Value) => void;
}

function RadioGroupRoot<Value extends string>({ className, onValueChange, ...props }: RadioGroupRootProps<Value>): React.ReactElement {
  return (
    <BaseRadioGroup<Value>
      data-ui="RadioGroup"
      {...props}
      onValueChange={(value) => onValueChange?.(value)}
      className={cn('flex flex-col gap-sm', className)}
    />
  );
}

export interface RadioGroupItemProps<Value extends string> extends Omit<Radio.Root.Props<Value>, 'className' | 'children'> {
  label?: React.ReactNode;
  className?: string;
}

function RadioGroupItem<Value extends string>({ label, className, ...props }: RadioGroupItemProps<Value>): React.ReactElement {
  const labelId = React.useId();
  const hasLabel = label !== undefined && label !== null && label !== false && label !== '';
  return (
    <Radio.Root<Value>
      data-ui="Radio"
      aria-labelledby={hasLabel ? labelId : undefined}
      {...props}
      className={cn(
        'ui-reset group/rd inline-flex w-fit items-start gap-xs border-0 text-start font-sans text-body text-primary outline-none select-none focus-visible:outline-hidden data-[disabled]:opacity-disabled',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-[calc((1lh-var(--ui-checkbox))/2)] flex size-[var(--ui-checkbox)] shrink-0 items-center justify-center rounded-full border border-[color:var(--ui-checkbox-edge)] bg-transparent',
          'transition-colors duration-fast ease-out motion-reduce:transition-none',
          'group-hover/rd:border-[color:var(--ui-checkbox-edge-hover)] group-data-[checked]/rd:border-transparent group-data-[checked]/rd:bg-fill-accent group-focus-visible/rd:shadow-focus',
        )}
      >
        <Radio.Indicator className="size-[calc(var(--ui-checkbox)*0.375)] rounded-full bg-[var(--ui-on-accent)]" />
      </span>
      {hasLabel && (
        <span id={labelId} className="min-w-0">
          {label}
        </span>
      )}
    </Radio.Root>
  );
}

/** Radio buttons, one of which is chosen. Arrow keys move between them. */
export const RadioGroup = {
  Root: RadioGroupRoot,
  Item: RadioGroupItem,
};
