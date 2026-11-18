import * as React from 'react';
import { cn } from './cn.ts';
import { useKitLabel } from './labels.tsx';

const InGroupContext = React.createContext(false);

/** How long a group waits before announcing itself, matching when it shows. */
const ANNOUNCE_DELAY_MS = 500;

type PlaceholderElement = 'div' | 'span';

const toLength = (length: number | string | undefined): string | undefined =>
  typeof length === 'number' ? `${length}px` : length;

export interface SkeletonProps {
  /** A CSS length, or pixels. */
  width?: number | string;
  /** A CSS length, or pixels; one line of the current text size by default. */
  height?: number | string;
  className?: string;
  /** Hides it from assistive tech, for placeholders a nearby label already announces. */
  decorative?: boolean;
  as?: PlaceholderElement;
}

/** A shape standing in for content that is still loading. */
export function Skeleton({ width, height, className, decorative = false, as = 'div' }: SkeletonProps): React.ReactElement {
  const inGroup = React.useContext(InGroupContext);
  const loading = useKitLabel('loading');
  const Element = as;
  const alone = !inGroup;
  return (
    <Element
      data-ui="Skeleton"
      data-alone={alone ? '' : undefined}
      role={alone && !decorative ? 'status' : undefined}
      aria-hidden={alone && decorative ? true : undefined}
      className={cn(
        'h-[1em] max-w-full rounded bg-[var(--ui-skeleton-base)] forced-colors:bg-[GrayText]',
        as === 'span' && 'block',
        alone && 'relative overflow-hidden',
        className,
      )}
      style={{ width: toLength(width), height: toLength(height) }}
    >
      {alone && !decorative ? <span className="sr-only">{loading}</span> : null}
    </Element>
  );
}

export interface SkeletonGroupProps {
  children?: React.ReactNode;
  /** What is loading, announced once the placeholders show; "Loading" by default. */
  label?: string;
  className?: string;
  decorative?: boolean;
  as?: PlaceholderElement;
}

/**
 * Placeholders that load as one: they show and pulse together, after a short wait so a
 * quick load never flashes them, and are announced once as a single status.
 */
export function SkeletonGroup({ children, label, className, decorative = false, as = 'div' }: SkeletonGroupProps): React.ReactElement {
  const loading = useKitLabel('loading');
  const [announced, setAnnounced] = React.useState(false);
  React.useEffect(() => {
    if (decorative) return;
    const timer = setTimeout(() => setAnnounced(true), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [decorative]);
  const Element = as;
  return (
    <Element
      data-ui="SkeletonGroup"
      role={decorative ? undefined : 'status'}
      aria-hidden={decorative ? true : undefined}
      className={cn(as === 'span' && 'block', className)}
    >
      {decorative ? null : <span className="sr-only">{announced ? (label ?? loading) : null}</span>}
      <InGroupContext.Provider value>
        <span aria-hidden className="contents">
          {children}
        </span>
      </InGroupContext.Provider>
    </Element>
  );
}
