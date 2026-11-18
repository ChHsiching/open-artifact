import * as React from 'react';
import { cn } from './cn.ts';

export type SpinnerSize = 'sm' | 'md' | 'lg';

const SPINNER_METRICS: Readonly<Record<SpinnerSize, { box: number; stroke: number }>> = {
  sm: { box: 12, stroke: 1.5 },
  md: { box: 16, stroke: 1.75 },
  lg: { box: 20, stroke: 2 },
};

const scaled = (px: number): string => `calc(${px}px * var(--ui-rem-scale, 1))`;

export interface SpinnerProps {
  size?: SpinnerSize;
  /** Waits this many milliseconds before showing, so quick work does not flash a spinner. */
  delay?: number;
  /** Draws in the text color around it, for spinners on filled controls. */
  inheritColor?: boolean;
  /** Announced to screen readers while the spinner shows. */
  label?: string;
  className?: string;
}

function useShownAfter(delay: number): boolean {
  const [shown, setShown] = React.useState(delay <= 0);
  const [lastDelay, setLastDelay] = React.useState(delay);
  if (delay !== lastDelay) {
    setLastDelay(delay);
    if (delay > 0 && shown) setShown(false);
  }
  React.useEffect(() => {
    if (delay <= 0) return;
    const timer = window.setTimeout(() => setShown(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);
  return delay <= 0 || shown;
}

function DelayedAnnouncement({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const shown = useShownAfter(100);
  return shown ? <span className="sr-only">{children}</span> : null;
}

/** A ring that turns while something loads. */
export function Spinner({ size = 'sm', delay = 0, inheritColor = false, label, className }: SpinnerProps): React.ReactElement | null {
  const shown = useShownAfter(delay);
  const { box, stroke } = SPINNER_METRICS[size];
  const ink = inheritColor ? 'currentColor' : 'var(--ui-text-muted)';
  const track = inheritColor ? 'color-mix(in srgb, currentColor 25%, transparent)' : 'var(--ui-border)';
  const width = scaled(stroke);
  const inner = `calc(100% - ${width})`;
  const ring = `radial-gradient(farthest-side, transparent ${inner}, #000 calc(${inner} + 0.5px))`;
  const spinner = shown ? (
    <span
      data-ui="Spinner"
      aria-hidden
      className={cn('relative inline-block shrink-0 align-middle forced-colors:[forced-color-adjust:none]', className)}
      style={{ width: scaled(box), height: scaled(box) }}
    >
      <span className="absolute inset-0 rounded-full" style={{ border: `${width} solid ${track}` }} />
      <span
        className="absolute inset-0 animate-[spin_1s_linear_infinite] rounded-full motion-reduce:animate-none"
        style={{ background: `conic-gradient(transparent 40%, ${ink})`, WebkitMask: ring, mask: ring }}
      />
    </span>
  ) : null;
  if (!label) return spinner;
  return (
    <span role="status" className="leading-[0]">
      {spinner}
      {shown && <DelayedAnnouncement>{label}</DelayedAnnouncement>}
    </span>
  );
}
