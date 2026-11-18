/** Small dots on a tab in the tab list, one per person (and the agent) on it, named in a tooltip. */
import { Tip } from '@open-artifact/editor-kit/react';
import { cn } from '@open-artifact/ui';
import { type ReactNode } from 'react';
import { usePeersOnTab } from './hooks.ts';

/** Most dots drawn on one tab. */
const MAX_DOTS = 3;

export function PeerDots({ tabId, className }: { tabId: string; className?: string }): ReactNode {
  const here = usePeersOnTab(tabId);
  if (here.length === 0) return null;
  const names = here.map(person => person.name).join(', ');
  return (
    <Tip label={names}>
      <span role="img" aria-label={`Here: ${names}`} className={cn('flex shrink-0 items-center', className)}>
        {here.slice(0, MAX_DOTS).map((person, index) => (
          <span key={person.id} className={cn('size-1.5 rounded-full ring-1 ring-chrome', index > 0 && '-ml-0.5')} style={{ backgroundColor: person.color }} />
        ))}
      </span>
    </Tip>
  );
}
