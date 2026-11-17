/** The Shell: the bar over the artifact page, and the ask pane beside it. */

import { SHELL_PARAMS } from '@open-artifact/protocol';
import { LoaderCircle, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { EmptyState } from '@open-artifact/ui';
import { t } from '../lib/i18n.ts';
import { loadLibrary, refreshArtifact, restoreSent, startEvents } from './actions.ts';
import { startBridge } from './bridge.ts';
import { AskPane } from './components/AskPane.tsx';
import { Stage } from './components/Stage.tsx';
import { TopBar } from './components/TopBar.tsx';
import { addressWithout, panelOf } from './model.ts';
import { useShell } from './store.ts';

/** The Shell once its boot is known: starts the protocols, the event stream and the first loads. */
function Shell() {
  const barHidden = useShell((state) => state.barHidden);
  const askOpen = useShell((state) => state.askOpen);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const store = useShell.getState();
    if (params.get('toolbar') === '0') store.setBarHidden(true);
    if (params.get('chat') === '1' || params.get('ask') === '1') store.setAskOpen(true);
    // `?panel=share|export` (an agent's open with panel): open it once, and drop it so a reload does not.
    const panel = panelOf(location.href);
    if (panel) {
      if (!useShell.getState().barHidden) store.openShare(panel, { wait: true });
      const rest = addressWithout(location.href, SHELL_PARAMS.panel);
      if (rest) history.replaceState(history.state, '', rest);
    }
    restoreSent();
    const stopBridge = startBridge();
    const stopEvents = startEvents();
    void refreshArtifact();
    void loadLibrary();
    return () => {
      stopBridge();
      stopEvents();
    };
  }, []);
  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-fg">
      {barHidden ? null : <TopBar />}
      <div className="relative flex min-h-0 flex-1">
        <Stage />
        {askOpen && !barHidden ? <AskPane /> : null}
      </div>
    </div>
  );
}

/** The Shell page. */
export function App() {
  const boot = useShell((state) => state.boot);
  const bootError = useShell((state) => state.bootError);
  if (boot) return <Shell />;
  if (bootError) return <EmptyState icon={<TriangleAlert className="size-6" />} title={t('problemTitle')}>{bootError}</EmptyState>;
  return <EmptyState icon={<LoaderCircle className="size-6 animate-spin" />} title={t('loading')} />;
}
