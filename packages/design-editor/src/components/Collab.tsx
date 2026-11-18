import type { ReactNode } from 'react';
import { Eye, History } from 'lucide-react';
import { useComments } from '../services/comments.ts';
import { toggleHistoryPanel, useCollabAsideKind } from '../services/collab.ts';
import { useHistory } from '../services/history.ts';
import { session } from '../services/session.ts';
import { Card, ChromeButton, ChromeDivider, Tip } from '@open-artifact/editor-kit/react';
import { PresenceAvatars } from './Presence.tsx';
import { HistoryAside } from './HistoryPreview.tsx';

const ICON = { className: 'size-5', strokeWidth: 1.5 } as const;

/** What the viewer's role allows, when it is less than editing. */
function RoleBadge() {
  const comments = useComments((s) => s.available);
  const role = session().viewer.role;
  if (role === 'owner' || role === 'editor') return null;
  const label = role === 'commenter' && comments ? 'Can comment' : 'View only';
  return (
    <Tip label={role === 'commenter' && comments ? 'You can comment on this design but not change it.' : 'You can look at this design but not change it.'}>
      <span className="flex h-7 items-center gap-1 rounded-[8px] px-2 text-[12px] text-chrome-muted">
        <Eye className="size-3.5" strokeWidth={1.5} />
        {label}
      </span>
    </Tip>
  );
}

/** The top card: avatars, role, and the standalone History button. */
export function CollabCard(): ReactNode {
  const historyAvailable = useHistory((s) => s.available);
  const historyOpen = useHistory((s) => s.open);
  const shell = Boolean(session().shell);
  const showHistory = !shell && historyAvailable;
  const role = session().viewer.role;
  return (
    <Card className="h-9 px-1 py-px empty:hidden" data-collab-card="">
      <PresenceAvatars />
      {role !== 'owner' && role !== 'editor' ? <RoleBadge /> : null}
      {showHistory ? (
        <>
          <ChromeDivider />
          <Tip label={historyOpen ? 'Hide version history' : 'Version history'}>
            <ChromeButton square pressed={historyOpen} aria-label="Version history" onClick={() => toggleHistoryPanel()}>
              <History {...ICON} />
            </ChromeButton>
          </Tip>
        </>
      ) : null}
    </Card>
  );
}

/** Which collaboration panel is open on the right, if any. */
export function useCollabAside(): 'history' | null {
  return useCollabAsideKind();
}

/** The open collaboration panel. */
export function CollabAside(): ReactNode {
  const which = useCollabAside();
  return which === 'history' ? <HistoryAside /> : null;
}
