/** Opens the page: connects to the host, takes a writing session and shows the tab the address names. */
import { DocClient, setDocClient } from './doc-client.ts';
import { startSession } from './session.ts';
import { getDocs, orderedTabs, setDocs, useDocs } from './store.ts';

const TAB_PARAM = 'tab';

function tabInAddress(): string | null {
  const fromQuery = new URL(location.href).searchParams.get(TAB_PARAM);
  if (fromQuery) return fromQuery;
  const hash = decodeURIComponent(location.hash.slice(1));
  const tab = /^([0-9a-f]{8}-[0-9a-f]{4})(?:\.|$)/.exec(hash);
  return tab?.[1] ?? null;
}

/** Shows a tab, and names it in the address so a reload comes back to it. */
export function showTab(id: string): void {
  if (getDocs().activeTab === id) return;
  setDocs({ activeTab: id });
  const url = new URL(location.href);
  url.searchParams.set(TAB_PARAM, id);
  history.replaceState(history.state, '', url);
}

export async function bootDocsApp(): Promise<void> {
  try {
    const session = await startSession();
    const client = await DocClient.start(session.doc);
    setDocClient(client);
    const files = orderedTabs(getDocs().project?.files ?? []);
    const wanted = tabInAddress();
    const first = files.find(file => file.id === wanted) ?? files[0];
    if (first) setDocs({ activeTab: first.id });
    setDocs({ phase: { kind: 'ready' } });
    useDocs.subscribe((state, before) => {
      if (state.activeTab && state.activeTab !== before.activeTab) {
        const url = new URL(location.href);
        if (url.searchParams.get(TAB_PARAM) !== state.activeTab) {
          url.searchParams.set(TAB_PARAM, state.activeTab);
          history.replaceState(history.state, '', url);
        }
      }
      if (state.project?.name && state.project.name !== before.project?.name) document.title = state.project.name;
    });
    if (getDocs().project?.name) document.title = getDocs().project!.name;
  } catch (error) {
    setDocs({ phase: { kind: 'failed', message: error instanceof Error ? error.message : String(error) } });
  }
}
