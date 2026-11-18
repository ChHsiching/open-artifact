import type { ReactNode } from 'react';
import { Card } from '@open-artifact/editor-kit/react';
import { Button } from '@open-artifact/ui';
import { BACK_TO_LATEST_LABEL, viewingVersionMessage } from './describe.ts';
import { openVersion, useVersionHistory } from './store.ts';

/** Over the page while an earlier version is on it; null otherwise. */
export function VersionBar(): ReactNode {
  const shown = useVersionHistory((state) => state.shown);
  if (shown === null) return null;
  return (
    <Card data-uncommentable="" role="status" className="gap-3 py-1.5 pe-1.5 ps-3 text-[13px] text-chrome-fg">
      <span>{viewingVersionMessage(shown.at)}</span>
      <Button onClick={() => openVersion(null)}>{BACK_TO_LATEST_LABEL}</Button>
    </Card>
  );
}
