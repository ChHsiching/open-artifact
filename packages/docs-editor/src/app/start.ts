/** Opens the page: connects to the host, takes a writing session and shows the tab the address names. */
import { DocClient, setDocClient } from './doc-client.ts';
import { startDocShell } from './shell.ts';
import { followDocLink } from '../selbar/navigate.ts';
import { parseDocHref } from '../selbar/fragments.ts';
import { startSession } from './session.ts';
import { getDocs, orderedTabs, setDocs, useDocs } from './store.ts';

const TAB_PARAM = 'tab';

function tabInAddress(): string | null {
  const linked = parseDocHref(location.hash)?.tab;
  if (linked) return linked;
  const fromQuery = new URL(location.href).searchParams.get(TAB_PARAM);
  if (fromQuery) return fromQuery;
  return null;
}

/** Shows a tab, and names it in the address so a reload comes back to it. */
export function showTab(id: string): void {
  if (getDocs().activeTab === id) return;
  setDocs({ activeTab: id });
}

export async function bootDocsApp(): Promise<void> {
  try {
    const session = await startSession();
    const client = await DocClient.start(session.doc);
    setDocClient(client);
    const files = orderedTabs(getDocs().project?.files ?? []);
    const wanted = tabInAddress();
    const first = files.find(file => file.id === wanted) ?? files[0];
    if (first) {
      setDocs({ activeTab: first.id });
      const hash = location.hash;
      const linked = parseDocHref(hash);
      const hashInTab = linked?.tab ? (linked.tab === first.id && (linked.block || linked.slug) ? hash : '#' + first.id)
        : '#' + first.id + (hash ? '.' + hash.slice(1) : '');
      session.shell?.currentDocPlace(hashInTab);
    }
    window.addEventListener('hashchange', () => followDocLink(location.hash));
    startDocShell();
    setDocs({ phase: { kind: 'ready' } });
    useDocs.subscribe((state, before) => {
      if (state.activeTab && state.activeTab !== before.activeTab) {
        const url = new URL(location.href);
        session.shell?.currentDocPlace('#' + state.activeTab);
        url.hash = '';
        url.searchParams.set(TAB_PARAM, state.activeTab);
        history.replaceState(history.state, '', url);
      }
      if (state.project?.name && state.project.name !== before.project?.name) document.title = state.project.name;
    });
    if (getDocs().project?.name) document.title = getDocs().project!.name;
  } catch (error) {
    setDocs({ phase: { kind: 'failed', message: error instanceof Error ? error.message : String(error) } });
  }
}
