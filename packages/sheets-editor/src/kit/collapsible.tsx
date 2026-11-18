import * as React from 'react';
import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible';
import { cn } from './cn.ts';

/** While it slides, content is clipped at the panel's foot but may still spill sideways, as focus rings do. */
const PANEL_CLASSES =
  'break-words h-[var(--collapsible-panel-height)] transition-[height] duration-base ease-out motion-reduce:transition-none data-[starting-style]:h-0 data-[ending-style]:h-0 data-[starting-style]:[clip-path:inset(-8px_-100vw_0_-100vw)] data-[ending-style]:[clip-path:inset(-8px_-100vw_0_-100vw)]';

export interface CollapsibleRootProps extends Omit<BaseCollapsible.Root.Props, 'className'> {
  className?: string;
}

const CollapsibleRoot = React.forwardRef<HTMLDivElement, CollapsibleRootProps>(function CollapsibleRoot({ className, ...rest }, ref) {
  return <BaseCollapsible.Root ref={ref} data-ui="Collapsible" {...rest} className={className} />;
});

export interface CollapsibleTriggerProps extends Omit<BaseCollapsible.Trigger.Props, 'className'> {
  className?: string;
}

const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(function CollapsibleTrigger(
  { className, ...rest },
  ref,
) {
  return <BaseCollapsible.Trigger ref={ref} {...rest} className={cn('ui-reset', className)} />;
});

export interface CollapsiblePanelProps extends Omit<BaseCollapsible.Panel.Props, 'className'> {
  className?: string;
}

/** Content that slides open and shut with the root's `open`. */
const CollapsiblePanel = React.forwardRef<HTMLDivElement, CollapsiblePanelProps>(function CollapsiblePanel({ className, ...rest }, ref) {
  return <BaseCollapsible.Panel ref={ref} {...rest} className={cn(PANEL_CLASSES, className)} />;
});

/** A section that opens and closes: Root holds `open`, Trigger toggles it, Panel is the content. */
export const Collapsible = {
  Root: CollapsibleRoot,
  Trigger: CollapsibleTrigger,
  Panel: CollapsiblePanel,
} as const;
