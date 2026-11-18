/** The open tab's name in the page bar; it opens the tab list, with new tab, import and where the tabs show. */
import { ChromeButton, ChromeDivider, ChromePopover, PanelEdge, usePanelWidth } from '@open-artifact/editor-kit/react';
import { cn, SwitchInput } from '@open-artifact/ui';
import { ChevronDown, FileUp, Plus } from 'lucide-react';
import { type ReactNode, useId, useMemo } from 'react';
import { useDisplay, useDocs } from '../app/store.ts';
import { writeDisplay } from '../page/display.ts';
import { createTab } from './actions.ts';
import { pickFilesToImport } from './import-file.ts';
import { setTabsUi, useTabsUi } from './state.ts';
import { TabList, useTabsFitOnPage } from './TabList.tsx';
import { displayNames, tabTree } from './tree.ts';

const close = () => setTabsUi({ pickerOpen: false });

const PANEL_WIDTH = 288;
const PANEL_MIN = 224;
const PANEL_MAX = 480;

export function TabPicker(): ReactNode {
  const files = useDocs(state => state.project?.files);
  const activeTab = useDocs(state => state.activeTab);
  const writable = useDocs(state => state.writable);
  const open = useTabsUi(state => state.pickerOpen);
  const panel = usePanelWidth('docs.tabs.width', PANEL_WIDTH, PANEL_MIN, PANEL_MAX, typeof window === 'undefined' ? Infinity : window.innerWidth - 32);
  const name = useMemo(() => (activeTab ? displayNames(tabTree(files ?? [])).get(activeTab) : undefined), [files, activeTab]);

  const trigger = (
    <ChromeButton aria-label={name ? `${name}, tabs` : 'Tabs'} title="Document tabs" className="min-w-0 max-w-56 shrink gap-1 px-2 data-[popup-open]:bg-chrome-hover">
      <span className="min-w-0 truncate font-medium">{name ?? 'Tabs'}</span>
      <ChevronDown className="size-3.5 shrink-0 text-chrome-muted" strokeWidth={2} />
    </ChromeButton>
  );

  return (
    <ChromePopover
      trigger={trigger}
      side="bottom"
      align="start"
      gap={6}
      label="Tabs panel"
      open={open}
      onOpenChange={next => {
        setTabsUi(state => ({ pickerOpen: next, ...(next ? { error: null } : { renaming: null }) }));
      }}
      className="relative flex max-h-[min(32rem,calc(100vh-8rem))] max-w-[calc(100vw-2rem)] flex-col"
      style={{ width: panel.width }}
    >
      <TabList onOpened={close} className="min-h-0 overflow-y-auto overscroll-contain" />
      <TabsError />
      {writable ? (
        <>
          <ChromeDivider vertical={false} />
          <ChromeButton className="w-full justify-start gap-2 px-2 text-chrome-muted" onClick={() => void createTab()}>
            <Plus className="size-4" strokeWidth={1.75} />
            New tab…
          </ChromeButton>
          <ChromeButton
            className="w-full justify-start gap-2 px-2 text-chrome-muted"
            onClick={() => {
              close();
              pickFilesToImport();
            }}
          >
            <FileUp className="size-4" strokeWidth={1.75} />
            Import file…
          </ChromeButton>
          <ChromeDivider vertical={false} />
          <ShowOnPageRow />
        </>
      ) : null}
      <PanelEdge label="Resize tabs panel" side="right" width={panel.width} min={PANEL_MIN} max={PANEL_MAX} onResize={panel.resize} onReset={panel.reset} />
    </ChromePopover>
  );
}

/** The last tab write that failed, under the list. */
export function TabsError(): ReactNode {
  const error = useTabsUi(state => state.error);
  if (!error) return null;
  return (
    <div role="alert" className="px-2 pt-1 text-[12px] leading-4 text-danger">
      {error}
    </div>
  );
}

/** "Show on page": the tabs as a list beside the text instead of in this menu. */
function ShowOnPageRow(): ReactNode {
  const display = useDisplay();
  const fits = useTabsFitOnPage();
  const labelId = useId();
  const noteId = useId();
  const on = display.tabsLocation === 'left';
  const note = on && !fits ? 'Tabs show beside the text once this Doc has two tabs or two headings.' : null;
  return (
    <div>
      <label className="flex h-8 cursor-default items-center justify-between gap-3 rounded-[8px] px-2.5 text-[14px] hover:bg-chrome-hover">
        <span id={labelId} className="min-w-0 truncate">
          Show on page
        </span>
        <SwitchInput aria-label="Show on page" checked={on} onChange={next => void writeDisplay('tabsLocation', next ? 'left' : 'menu')} />
      </label>
      {note ? (
        <p id={noteId} className={cn('px-2.5 pb-1 text-[12px] leading-4 text-chrome-muted')}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** The same "New tab…" row under the list beside the text. */
export function NewTabButton(): ReactNode {
  const busy = useTabsUi(state => state.busy);
  return (
    <ChromeButton className="mt-1 w-full justify-start gap-2 px-2 text-chrome-muted" aria-disabled={busy || undefined} onClick={() => void createTab()}>
      <Plus className="size-4" strokeWidth={1.75} />
      New tab…
    </ChromeButton>
  );
}
