import * as React from 'react';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { cn } from './cn.ts';

export type TabsSize = 'sm';

const LIST_CLASSES =
  'flex items-center font-sans data-[orientation=horizontal]:[&>[role=tab]:first-child]:before:start-0 data-[orientation=horizontal]:[&>[role=tab]:last-child]:before:end-0';
const LIST_SIZE_CLASSES: Readonly<Record<TabsSize, string>> = {
  sm: '[--ui-h-control:var(--ui-h-tab-sm)]',
};
/** Lines the first tab's label up with the content around the list, outside its padding. */
const LIST_FLUSH_CLASSES = '-ms-[var(--ui-pad-md)]';
const TAB_CLASSES =
  'relative isolate inline-flex shrink-0 items-center justify-center gap-1.5 rounded-none h-control px-md ui-reset whitespace-nowrap select-none outline-none focus-visible:outline-hidden bg-transparent text-body font-medium font-control text-muted before:absolute before:inset-y-0 before:inset-x-px before:rounded-control before:-z-[1] before:transition-shadow before:duration-fast [&:not([data-active]):not([data-disabled])]:hover:text-secondary [&:not([data-active]):not([data-disabled])]:hover:before:bg-fill-ghost-hover data-[active]:text-primary data-[active]:before:bg-fill-ghost-hover focus-visible:before:shadow-focus data-[disabled]:opacity-disabled data-[disabled]:pointer-events-none';

export interface TabsRootProps extends Omit<BaseTabs.Root.Props, 'className'> {
  className?: string;
}

const TabsRoot = React.forwardRef<HTMLDivElement, TabsRootProps>(function TabsRoot({ className, ...rest }, ref) {
  return <BaseTabs.Root ref={ref} data-ui="Tabs" {...rest} className={className} />;
});

export interface TabsListProps extends Omit<BaseTabs.List.Props, 'className'> {
  size?: TabsSize;
  /** Lines the first tab's label up with the content around the list. */
  flush?: boolean;
  className?: string;
}

/** The row of tabs; arrow keys move between them and, by default, choose the one reached. */
const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(function TabsList(
  { size, flush = false, activateOnFocus = true, className, ...rest },
  ref,
) {
  return (
    <BaseTabs.List
      ref={ref}
      activateOnFocus={activateOnFocus}
      {...rest}
      data-size={size}
      className={cn(LIST_CLASSES, size !== undefined && LIST_SIZE_CLASSES[size], flush && LIST_FLUSH_CLASSES, className)}
    />
  );
});

export interface TabsTabProps extends Omit<BaseTabs.Tab.Props, 'className'> {
  className?: string;
}

const TabsTab = React.forwardRef<HTMLElement, TabsTabProps>(function TabsTab({ className, onMouseDown, ...rest }, ref) {
  return (
    <BaseTabs.Tab
      ref={ref}
      {...rest}
      onMouseDown={(event) => {
        onMouseDown?.(event);
        // A double press would otherwise select the tab's text.
        if (event.detail > 1) event.preventDefault();
      }}
      className={cn(TAB_CLASSES, className)}
    />
  );
});

export interface TabsPanelProps extends Omit<BaseTabs.Panel.Props, 'className'> {
  className?: string;
}

const TabsPanel = React.forwardRef<HTMLDivElement, TabsPanelProps>(function TabsPanel({ className, ...rest }, ref) {
  return <BaseTabs.Panel ref={ref} {...rest} className={cn('ui-reset outline-none focus-visible:outline-hidden', className)} />;
});

/** Tabs that switch between panels: Root holds the chosen value, List the tabs, Panel each page. */
export const Tabs = {
  Root: TabsRoot,
  List: TabsList,
  Tab: TabsTab,
  Panel: TabsPanel,
} as const;
