/** The top bar's history button: opens and closes the version history beside the page. */
import { ToolButton } from '@open-artifact/editor-kit/react';
import { History } from 'lucide-react';
import { type ReactNode } from 'react';
import { setDocs, useDocs } from '../app/store.ts';

export function HistoryButton(): ReactNode {
  const open = useDocs(state => state.history);
  const ready = useDocs(state => state.activeTab !== null);
  return (
    <ToolButton
      size="lg"
      tipSide="bottom"
      label="Version history"
      icon={<History />}
      pressed={open}
      disabled={!ready}
      data-testid="history-toggle"
      onClick={() => setDocs({ history: !open })}
    />
  );
}
