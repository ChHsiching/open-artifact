/** The tab list beside the text, when the doc shows its tabs on the page and has two tabs or two headings. */
import type { ReactNode } from 'react';
import { useDisplay, useDocs } from '../app/store.ts';
import { TabList, useTabsFitOnPage } from './TabList.tsx';
import { NewTabButton, TabsError } from './TabPicker.tsx';

export function TabsAside(): ReactNode {
  const display = useDisplay();
  const fits = useTabsFitOnPage();
  const writable = useDocs(state => state.writable);
  if (display.tabsLocation !== 'left' || !fits) return null;
  return (
    <aside aria-label="Tabs" className="hidden w-60 shrink-0 flex-col overflow-y-auto overscroll-contain bg-ground px-2 pt-6 pb-4 md:flex" data-tabs-aside="">
      <TabList />
      <TabsError />
      {writable ? <NewTabButton /> : null}
    </aside>
  );
}
