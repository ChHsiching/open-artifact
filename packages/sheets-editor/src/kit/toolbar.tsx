import * as React from 'react';
import { cn } from './cn.ts';
import { useRovingToolbar } from './roving-toolbar.ts';
import { TooltipGroup } from './tooltip.tsx';

type RefCleanup = () => void;
type RefTarget<T> = React.Ref<T> | ((instance: T | null) => void | RefCleanup) | undefined;

/** One ref that feeds two, keeping the cleanups that callback refs return. */
function useMergedRef<T>(first: RefTarget<T>, second: RefTarget<T>): (instance: T | null) => RefCleanup {
  return React.useCallback(
    (instance: T | null): RefCleanup => {
      const cleanups = [first, second].map((target): RefCleanup | undefined => {
        if (typeof target === 'function') {
          const cleanup = target(instance);
          return typeof cleanup === 'function' ? cleanup : () => target(null);
        }
        if (target !== null && target !== undefined) {
          (target as React.RefObject<T | null>).current = instance;
          return () => {
            (target as React.RefObject<T | null>).current = null;
          };
        }
        return undefined;
      });
      return () => {
        for (const cleanup of cleanups) cleanup?.();
      };
    },
    [first, second],
  );
}

export interface ToolbarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'role' | 'aria-label'> {
  /** Names the toolbar for assistive tech. */
  label: string;
  /** Controls kept at the far end, after the tools. */
  actions?: React.ReactNode;
  /** Draws a rule under the bar. */
  divider?: boolean;
  /** Drops the inline padding, for bars set inside a padded container. */
  flush?: boolean;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * A row of tools with one tab stop: Tab enters it, the arrow keys move between its tools.
 * The tools sit in the bar's first child, the end actions after it.
 */
export function Toolbar({
  label,
  actions,
  divider = true,
  flush = false,
  className,
  children,
  onKeyDown,
  onFocus,
  ref,
  ...rest
}: ToolbarProps): React.ReactElement {
  const roving = useRovingToolbar();
  const mergedRef = useMergedRef<HTMLDivElement>(ref, roving.ref);
  return (
    <div
      data-ui="Toolbar"
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      {...rest}
      ref={mergedRef}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        roving.onKeyDown(event);
      }}
      onFocus={(event) => {
        onFocus?.(event);
        roving.onFocus(event);
      }}
      className={cn('flex shrink-0 items-center gap-1 py-1', !flush && 'px-xs', divider && 'border-b border-divider', className)}
    >
      <TooltipGroup>
        <div className="flex min-w-0 flex-1 items-center gap-1 self-stretch">{children}</div>
        {actions}
      </TooltipGroup>
    </div>
  );
}
