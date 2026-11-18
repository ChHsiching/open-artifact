import * as React from 'react';
import { Separator as BaseSeparator } from '@base-ui/react/separator';
import { cn } from './cn.ts';

export interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

/** A thin rule between groups of content, such as sections of a menu. */
export function Separator({ orientation = 'horizontal', className }: SeparatorProps): React.ReactElement {
  return (
    <BaseSeparator
      data-ui="Separator"
      orientation={orientation}
      className={cn(
        'shrink-0 self-stretch bg-[var(--ui-border)] forced-colors:bg-[CanvasText]',
        orientation === 'horizontal' ? 'h-px' : 'w-px',
        className,
      )}
    />
  );
}
