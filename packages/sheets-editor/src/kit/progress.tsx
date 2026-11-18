import * as React from 'react';
import { Progress as BaseProgress } from '@base-ui/react/progress';
import { cn } from './cn.ts';
import { useLocale } from './theme.tsx';

export type ProgressSize = 'sm' | 'md';

const SizeContext = React.createContext<ProgressSize>('md');

export interface ProgressRootProps {
  /** How far along the work is, from `min` to `max`; `null` while that is unknown. */
  value: number | null;
  /** @default 0 */
  min?: number;
  /** @default 1, so `value` is a fraction */
  max?: number;
  size?: ProgressSize;
  /** Formats the value shown and announced; a percent by default. */
  format?: Intl.NumberFormatOptions;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
  /** The parts to draw; a bare track and indicator by default. */
  children?: React.ReactNode;
}

function ProgressRoot({ value, min = 0, max = 1, size = 'md', format, className, children, ...aria }: ProgressRootProps): React.ReactElement {
  const locale = useLocale();
  return (
    <SizeContext.Provider value={size}>
      <BaseProgress.Root
        data-ui="Progress"
        data-size={size}
        value={value}
        min={min}
        max={max}
        format={format}
        locale={locale}
        {...aria}
        className={cn('w-full', className)}
      >
        {children ?? (
          <ProgressTrack>
            <ProgressIndicator />
          </ProgressTrack>
        )}
      </BaseProgress.Root>
    </SizeContext.Provider>
  );
}

export interface ProgressPartProps {
  className?: string;
  children?: React.ReactNode;
}

function ProgressTrack({ className, children }: ProgressPartProps): React.ReactElement {
  const size = React.useContext(SizeContext);
  return (
    <BaseProgress.Track
      data-ui="ProgressTrack"
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-neutral shadow-[inset_0_0_0_1px_var(--ui-alpha-1)] forced-colors:border forced-colors:border-solid forced-colors:border-[CanvasText]',
        size === 'sm' ? 'h-1' : 'h-2',
        className,
      )}
    >
      {children}
    </BaseProgress.Track>
  );
}

function ProgressIndicator({ className }: Omit<ProgressPartProps, 'children'>): React.ReactElement {
  return (
    <BaseProgress.Indicator
      data-ui="ProgressIndicator"
      className={cn(
        'block h-full rounded-full bg-fill-accent transition-[width] duration-base motion-reduce:transition-none forced-colors:bg-[Highlight]',
        className,
      )}
    />
  );
}

export interface ProgressValueProps {
  className?: string;
  /** Draws the value; the formatted value by default. */
  children?: (formattedValue: string | null, value: number | null) => React.ReactNode;
}

function ProgressValue({ className, children }: ProgressValueProps): React.ReactElement {
  return (
    <BaseProgress.Value data-ui="ProgressValue" className={cn('whitespace-nowrap text-footnote tabular-nums text-secondary', className)}>
      {children}
    </BaseProgress.Value>
  );
}

/** A bar that fills as work gets done, or sweeps while the amount left is unknown. */
export const Progress = {
  Root: ProgressRoot,
  Track: ProgressTrack,
  Indicator: ProgressIndicator,
  Value: ProgressValue,
} as const;
