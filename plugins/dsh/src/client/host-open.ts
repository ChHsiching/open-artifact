/**
 * The browser half of `host.open` (src/server/host-open.ts): the agent called `open` on an artifact, or asked for its
 * share or export panel, and the daemon asked DSH to show it. This window follows those requests (the host-opens route)
 * and shows each in a Browser tab of the conversation's right sidebar, switching to the conversation when it is not the
 * one on screen, then says whether it did. A window on another device, or an app without the sidebar's Browser, says no:
 * the agent then gives the person the link.
 */
import { PATHS, type HostOpenRequest } from '../shared/routes.ts';
import { routeUrl } from './api.ts';
import { linkState, openInSidebar, service, sidebarBrowser, type ClientContext, type SessionsSnapshot, type UiWorkspace, type WorkspacesSnapshot } from './host.ts';
import { onAnotherDevice } from './remote.ts';

/** A store's current value, or undefined. */
function snapshot<T>(ctx: Pick<ClientContext, 'get'>, name: string): T | undefined {
  const list = service<{ list?: { getSnapshot?(): T } }>(ctx, name)?.list;
  return typeof list?.getSnapshot === 'function' ? list.getSnapshot() : undefined;
}

/** Shows one request; true when the Browser tab is there. */
export async function showRequest(ctx: Pick<ClientContext, 'get'>, request: HostOpenRequest): Promise<boolean> {
  if (onAnotherDevice()) return false;
  const sidebar = sidebarBrowser(ctx);
  if (!sidebar) return false;
  // The conversation on screen takes the tab at once.
  if (await openInSidebar(sidebar, request.session, request.url, 0)) return true;
  const workspace = service<UiWorkspace>(ctx, 'uiWorkspace');
  if (typeof workspace?.openSession !== 'function') return false;
  const state = linkState(request.session, snapshot<SessionsSnapshot>(ctx, 'sessions'), snapshot<WorkspacesSnapshot>(ctx, 'workspaces'));
  if (state !== 'available') return false;
  workspace.openSession(request.session);
  return openInSidebar(sidebar, request.session, request.url);
}

/** Follows the server half's `host.open` requests while the plugin is on; the returned function stops. */
export function followHostOpens(ctx: Pick<ClientContext, 'get'>): () => void {
  if (typeof EventSource === 'undefined') return () => {};
  const source = new EventSource(routeUrl(PATHS.hostOpens));
  const answer = (id: string, opened: boolean) =>
    void fetch(routeUrl(PATHS.hostOpened, { id, opened: opened ? '1' : '0' }), { method: 'POST' }).catch(() => {});
  source.onmessage = (event: MessageEvent<string>) => {
    let request: HostOpenRequest;
    try {
      request = JSON.parse(event.data) as HostOpenRequest;
    } catch {
      return;
    }
    if (!request?.id) return;
    void showRequest(ctx, request).then(
      (opened) => answer(request.id, opened),
      () => answer(request.id, false),
    );
  };
  return () => source.close();
}
