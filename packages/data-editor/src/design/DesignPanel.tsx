/**
 * The Design panel: the design-system card (with Change, which asks the
 * agent) and the Style section above the remix format cards.
 */

import { LoaderCircle } from 'lucide-react';
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { DashboardLook, LookTheme } from '@open-artifact/data-core';
import { Button } from '@open-artifact/ui';
import { useDraftFlow } from '../drafts/flow.ts';
import { RemixPanel } from '../drafts/RemixPanel.tsx';
import { useCanAskAgent } from '../drafts/request.ts';
import { applyStoredLook, countStyleTweaks, hasOwnLook, previewLook, shownStyleTweaks } from '../page/look.ts';
import { useShownContent } from '../state/shown.ts';
import { changeDesignSystem, useChangeDesignSystem } from './change.ts';
import { useStyleEditor } from './style.ts';
import { StylePanel } from './StylePanel.tsx';
import {
  CHANGE_DESIGN_SYSTEM_LABEL,
  CHANGE_DESIGN_SYSTEM_TEXT,
  DESIGN_SYSTEM_HEADING,
  LOOK_SAMPLE,
  designCardDetail,
  designCardName,
  swatchColor,
} from './look-card.ts';

function subscribeTheme(listener: () => void): () => void {
  const root = document.documentElement;
  const observer = new MutationObserver(listener);
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', listener);
  return () => {
    observer.disconnect();
    media.removeEventListener('change', listener);
  };
}

function readTheme(): LookTheme {
  const pinned = document.documentElement.getAttribute('data-theme');
  if (pinned === 'light' || pinned === 'dark') return pinned;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The chrome's colour mode: a pinned `data-theme`, else the system's. */
function useChromeTheme(): LookTheme {
  return useSyncExternalStore(subscribeTheme, readTheme, () => 'light');
}

export interface DesignSystemCardProps {
  look: DashboardLook | null;
  system: string | null;
  /** The look is the dashboard's own (not the default). */
  own: boolean;
  /** Change asks the agent; without it there is no Change button. */
  onChange?: () => void;
  /** A draft request or save is under way: Change waits. */
  held?: boolean;
  /** Change was just pressed. */
  asked?: boolean;
  /** The Style section changed the look. */
  adjusted?: boolean;
}

/** The look's ground with its display font and first chart color, its name and font, and four chart chips. */
export function DesignSystemCard({ look, system, own, onChange, held = false, asked = false, adjusted = false }: DesignSystemCardProps): ReactNode {
  const theme = useChromeTheme();
  const name = designCardName(system, own);
  const detail = designCardDetail(look, adjusted);
  const color = (slot: Parameters<typeof swatchColor>[2]): string => swatchColor(look, theme, slot);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-chrome-fg">{DESIGN_SYSTEM_HEADING}</h3>
        {onChange !== undefined ? (
          <Button variant="ghost" size="sm" className="-me-2" disabled={held || asked} aria-busy={asked || undefined} aria-label={CHANGE_DESIGN_SYSTEM_LABEL} onClick={onChange}>
            {asked ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            {CHANGE_DESIGN_SYSTEM_TEXT}
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-2.5 rounded-lg border border-chrome-line bg-chrome p-2">
        <span
          aria-hidden="true"
          className="relative flex h-9 w-12 flex-none items-center justify-center rounded-md text-[15px] leading-none shadow-[0_0_0_1px_var(--dec-line)] [forced-color-adjust:none]"
          style={{ background: color('ground') }}
        >
          <span className="font-serif" style={{ color: color('text'), fontFamily: look?.fonts.display }}>
            {LOOK_SAMPLE}
          </span>
          <span className="absolute bottom-1 end-1 size-1.5 rounded-full" style={{ background: color('chart-1') }} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] text-chrome-fg" title={name}>
            {name}
          </span>
          {detail !== undefined ? (
            <span className="truncate text-[12px] text-chrome-muted" title={detail}>
              {detail}
            </span>
          ) : null}
        </span>
        <span aria-hidden="true" className="flex flex-none gap-0.5 [forced-color-adjust:none]">
          {(['chart-1', 'chart-2', 'chart-3', 'chart-4'] as const).map((slot) => (
            <span key={slot} className="size-4 rounded shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]" style={{ background: color(slot) }} />
          ))}
        </span>
      </div>
    </section>
  );
}

/** The Design panel's content; the toolbar or app owner frames it in a side panel. */
export function DesignPanel(): ReactNode {
  const { content } = useShownContent();
  const canAsk = useCanAskAgent();
  const asked = useChangeDesignSystem((state) => state.asked);
  const held = useDraftFlow((state) => state.asked || state.saving || state.view.working);
  const draftOwn = useDraftFlow((state) => state.view.held || state.asked);
  const pending = useStyleEditor((state) => state.pending);
  const applied = useMemo(() => applyStoredLook(previewLook(content.look, pending)), [content.look, pending]);
  const styleOpen = pending !== null;
  return (
    <div className="flex flex-col gap-5 p-3">
      <DesignSystemCard
        look={applied.look}
        system={applied.system}
        own={hasOwnLook(content.look)}
        onChange={canAsk ? changeDesignSystem : undefined}
        held={held || styleOpen}
        asked={asked}
        adjusted={countStyleTweaks(shownStyleTweaks(content.look, pending)) > 0}
      />
      <StylePanel stored={content.look} draftOwn={draftOwn} />
      <RemixPanel titled held={styleOpen} />
    </div>
  );
}
