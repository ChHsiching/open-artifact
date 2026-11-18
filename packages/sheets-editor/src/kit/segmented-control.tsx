import * as React from 'react';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { cn } from './cn.ts';
import { Icon, type IconName } from './icon.tsx';
import { Tooltip } from './tooltip.tsx';

export interface Segment<Value extends string> {
  value: Value;
  label?: React.ReactNode;
  icon?: IconName;
  disabled?: boolean;
  /** Shown on hover; also names a segment that has only an icon. */
  tooltip?: string;
}

export interface SegmentedControlProps<Value extends string> {
  value: Value;
  onChange: (value: Value) => void;
  segments: ReadonlyArray<Segment<Value>>;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}

const SEGMENT_CLASSES =
  'ui-reset relative inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[calc(var(--ui-radius)-2px)] border-0 px-sm font-sans text-body font-control text-secondary whitespace-nowrap outline-none select-none focus-visible:outline-hidden transition-[background-color,color,box-shadow] duration-fast ease-out motion-reduce:transition-none hover:text-primary data-[checked]:bg-[var(--ui-segmented-thumb)] data-[checked]:text-primary data-[checked]:shadow-[var(--ui-segmented-thumb-shadow)] focus-visible:shadow-focus data-[checked]:focus-visible:shadow-focus data-[disabled]:hover:text-secondary data-[disabled]:opacity-disabled';

/** A row of mutually exclusive choices, read as a radio group. */
export function SegmentedControl<Value extends string>({
  value,
  onChange,
  segments,
  fullWidth = false,
  disabled = false,
  className,
  ...aria
}: SegmentedControlProps<Value>): React.ReactElement {
  return (
    <RadioGroup<Value>
      data-ui="SegmentedControl"
      {...aria}
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange(next)}
      className={cn(
        'inline-flex h-control min-w-0 items-stretch gap-px rounded-control bg-[var(--ui-segmented-track)] p-0.5',
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {segments.map((segment) => {
        const hasLabel = segment.label !== undefined && segment.label !== null && segment.label !== '';
        const radio = (
          <Radio.Root<Value>
            key={segment.value}
            value={segment.value}
            disabled={segment.disabled}
            aria-label={hasLabel ? undefined : (segment.tooltip ?? String(segment.value))}
            className={cn(SEGMENT_CLASSES, fullWidth && 'flex-1 basis-0', !hasLabel && 'px-xs')}
          >
            {segment.icon !== undefined && <Icon name={segment.icon} size="auto-sm" />}
            {hasLabel && <span className="min-w-0 truncate">{segment.label}</span>}
          </Radio.Root>
        );
        return segment.tooltip === undefined ? (
          radio
        ) : (
          <Tooltip key={segment.value} content={segment.tooltip}>
            {radio}
          </Tooltip>
        );
      })}
    </RadioGroup>
  );
}
