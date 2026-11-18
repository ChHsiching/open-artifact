import * as React from 'react';
import { cn } from './cn.ts';

export type SurfaceElevation = 'panel' | 'popover';

const ELEVATION_CLASSES: Readonly<Record<SurfaceElevation, string>> = {
  panel: 'bg-surface-panel shadow-panel-sm',
  popover: 'bg-surface-popover shadow-popover',
};

const ELEVATION_BACKGROUNDS: Readonly<Record<SurfaceElevation, string>> = {
  panel: 'var(--ui-surface-panel)',
  popover: 'var(--ui-surface-popover)',
};

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  /** How far the surface stands off the page: a resting panel, or a floating popover. */
  elevation: SurfaceElevation;
}

/**
 * A raised card of the page. Controls inside it treat its fill as their background,
 * so focus rings and cut-outs match it.
 */
export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { elevation, className, style, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      data-ui="Surface"
      data-surface={elevation}
      {...rest}
      className={cn(
        'rounded-panel forced-colors:border forced-colors:border-solid forced-colors:border-[CanvasText]',
        ELEVATION_CLASSES[elevation],
        className,
      )}
      style={{ '--ui-page-bg': ELEVATION_BACKGROUNDS[elevation], ...style } as React.CSSProperties}
    >
      {children}
    </div>
  );
});
