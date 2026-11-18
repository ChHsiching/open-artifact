/**
 * The panel beside the page: Sources, Design or History. Its left edge
 * resizes it (drag, or the arrow keys on the separator).
 */

import { X } from 'lucide-react';
import { useMemo, useRef, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import type { DashboardFile, Dataset } from '@open-artifact/data-core';
import { IconButton } from '@open-artifact/ui';
import { DesignPanel } from '../design/DesignPanel.tsx';
import { HistoryPanel } from '../history/HistoryPanel.tsx';
import type { PageSnapshot } from '../page/runtime.ts';
import { SourcesPanel, type SourcesUsage } from '../sources/SourcesPanel.tsx';
import { useDatasets } from '../state/datasets.ts';
import { useShownContent } from '../state/shown.ts';
import { closePanel, PANEL_MAX_WIDTH, PANEL_MIN_WIDTH, setPanelWidth, usePanel, usePanels, type PanelId } from './panels.ts';
import { CLOSE_PANEL_LABEL, DESIGN_PANEL_NAME, HISTORY_PANEL_NAME, RESIZE_PANEL_LABEL, SOURCES_PANEL_NAME } from './words.ts';

const KEY_STEP = 16;
const NAMES: Record<PanelId, string> = { sources: SOURCES_PANEL_NAME, design: DESIGN_PANEL_NAME, history: HISTORY_PANEL_NAME };

/** How the page uses each source, from the page's snapshot. */
export function sourcesUsage(
  usage: PageSnapshot['usage'],
  datasets: readonly Dataset[] = [],
  files: readonly DashboardFile[] = [],
): SourcesUsage | undefined {
  if (usage === null) return undefined;
  const read = new Set(usage.datasets);
  const unused = datasets.filter(
    (dataset) => !read.has(dataset.id) && dataset.source.kind !== 'calc' && !files.some((file) => file.text.includes(dataset.id)),
  );
  return {
    read: usage.datasets,
    unmarked: new Set(usage.unmarked),
    unread: new Set(usage.unread),
    unused: new Set(unused.map((dataset) => dataset.id)),
  };
}

function Resizer(): ReactElement {
  const width = usePanels((state) => state.width);
  const start = useRef<{ x: number; width: number } | null>(null);
  const down = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, width };
  };
  const move = (event: PointerEvent<HTMLDivElement>): void => {
    if (start.current === null) return;
    setPanelWidth(start.current.width + (start.current.x - event.clientX));
  };
  const up = (): void => {
    start.current = null;
  };
  const key = (event: KeyboardEvent<HTMLDivElement>): void => {
    const delta = event.key === 'ArrowLeft' ? KEY_STEP : event.key === 'ArrowRight' ? -KEY_STEP : 0;
    if (event.key === 'Home') setPanelWidth(PANEL_MAX_WIDTH);
    else if (event.key === 'End') setPanelWidth(PANEL_MIN_WIDTH);
    else if (delta !== 0) setPanelWidth(width + delta);
    else return;
    event.preventDefault();
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={RESIZE_PANEL_LABEL}
      aria-valuemin={PANEL_MIN_WIDTH}
      aria-valuemax={PANEL_MAX_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      className="dash-panel-resizer"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
    />
  );
}

function Titled({ id, children }: { id: PanelId; children: ReactElement }): ReactElement {
  return (
    <>
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg">{NAMES[id]}</h2>
        <IconButton size="sm" label={CLOSE_PANEL_LABEL} icon={<X className="size-4" />} onClick={() => closePanel(id)} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </>
  );
}

export interface SidePanelProps {
  usage: PageSnapshot['usage'];
  onAskWhy?: (datasets: Dataset[]) => void;
}

export function SidePanel({ usage, onAskWhy }: SidePanelProps): ReactElement | null {
  const panel = usePanel();
  const width = usePanels((state) => state.width);
  const datasets = useDatasets((state) => state.datasets);
  const files = useShownContent().content.files;
  const used = useMemo(() => sourcesUsage(usage, datasets, files), [usage, datasets, files]);
  if (panel === null) return null;
  return (
    <aside className="dash-side" aria-label={NAMES[panel]} style={{ width }} data-uncommentable="" data-panel={panel}>
      <Resizer />
      {panel === 'sources' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <SourcesPanel usage={used} onClose={() => closePanel('sources')} {...(onAskWhy === undefined ? {} : { onAskWhy })} />
        </div>
      ) : panel === 'design' ? (
        <Titled id="design">
          <DesignPanel />
        </Titled>
      ) : (
        <Titled id="history">
          <HistoryPanel />
        </Titled>
      )}
    </aside>
  );
}
