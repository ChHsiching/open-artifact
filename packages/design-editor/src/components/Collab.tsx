/**
 * Collaboration chrome of the canvas: the top card (who is here, the
 * viewer's role, and, outside a Shell, the Comments and History buttons),
 * the Comment tool of the foot toolbar, and the right-hand panel (comments
 * or version history). Styled with the Design chrome (`chrome.tsx`); the
 * shared pieces come from `@open-artifact/editor-kit`.
 */

import type { ReactNode } from 'react';
import { Eye, History, MessageCircle } from 'lucide-react';
import { useComments, canComment, designComments } from '../services/comments.ts';
import { toggleHistoryPanel, useCollabAsideKind } from '../services/collab.ts';
import { useHistory } from '../services/history.ts';
import { session } from '../services/session.ts';
import { Card, ChromeButton, ChromeDivider, CommentsButton, Tip } from '@open-artifact/editor-kit/react';
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

/** The top card: avatars, role, and the Comments / History buttons a Shell would otherwise draw. */
export function CollabCard(): ReactNode {
  const commentsAvailable = useComments((s) => s.available);
  const historyAvailable = useHistory((s) => s.available);
  const historyOpen = useHistory((s) => s.open);
  const shell = Boolean(session().shell);
  const ownButtons = !shell && (commentsAvailable || historyAvailable);
  const role = session().viewer.role;
  return (
    <Card className="h-9 px-1 py-px empty:hidden" data-collab-card="">
      <PresenceAvatars />
      {role !== 'owner' && role !== 'editor' ? <RoleBadge /> : null}
      {ownButtons ? (
        <>
          <ChromeDivider />
          {commentsAvailable ? <CommentsButton comments={designComments} /> : null}
          {historyAvailable ? (
            <Tip label={historyOpen ? 'Hide version history' : 'Version history'}>
              <ChromeButton square pressed={historyOpen} aria-label="Version history" onClick={() => toggleHistoryPanel()}>
                <History {...ICON} />
              </ChromeButton>
            </Tip>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

/** The Comment tool (C) in the foot toolbar; shown to commenters too. */
export function CommentToolButton(): ReactNode {
  const available = useComments((s) => s.available);
  const on = useComments((s) => s.on);
  if (!available || !canComment()) return null;
  return (
    <Tip label={on ? 'Leave comment mode' : 'Comment'} shortcut="C" side="top">
      <ChromeButton size="lg" square pressed={on} aria-label="Comment" onClick={() => useComments.getState().setOn(!on)}>
        <MessageCircle {...ICON} />
      </ChromeButton>
    </Tip>
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
