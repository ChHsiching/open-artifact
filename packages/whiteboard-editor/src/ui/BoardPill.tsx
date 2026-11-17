/**
 * The pill at the top right of the board: save status (when the Shell does
 * not draw it), the board timer, the zoom menu and, for viewers, a lock.
 *
 * The zoom menu also holds the view options: follow someone, ask everyone
 * to follow you, single-key tool shortcuts, the timer chime and Download.
 */

import { LIVE_MESSAGES } from '@open-artifact/whiteboard-core';
import { ChevronDown, CloudOff, Loader2, Lock, MessageSquare, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { MAX_ZOOM, ZOOM_PRESETS, zoomPercent } from '../lib/camera.ts';
import { modKey } from '../lib/tools.ts';
import { redo, undo } from '../services/commands.ts';
import { downloadBoardPng } from '../services/export.ts';
import { useShellDraws } from '../services/shell.ts';
import { fitBoard, fitSelection } from '../services/navigation.ts';
import { readOnlyLabel } from '@open-artifact/editor-kit';
import { maybeSession } from '../services/session.ts';
import { zoomStep, zoomTo } from '../services/viewport.ts';
import { useBoard } from '../state/board.ts';
import { useCamera, zoomRange } from '../state/camera.ts';
import { useHistory } from '../state/history.ts';
import { usePreferences } from '../state/preferences.ts';
import { usePresence } from '../state/presence.ts';
import { useSelection } from '../state/selection.ts';
import { avatarColor, avatarInk, initialsOf } from '../lib/avatar.ts';
import { useCollabPeers } from '../collab/peers.ts';
import { BoardTimer } from './Timer.tsx';
import { useVersionHistoryEntry } from './VersionHistory.tsx';
import { toggleVersionHistory } from '../services/version-history.ts';
import { Card, ChromeButton, ChromeMenu, ChromeMenuItem, ChromeMenuLabel, ChromeMenuSeparator, ChromeSubmenu, Tip } from './chrome.tsx';

/** The top-right pill. */
export function BoardPill() {
  const session = maybeSession();
  const readOnly = !(session?.canEdit ?? false);
  const lockLabel = readOnlyLabel(session?.viewer.role ?? 'viewer');
  return (
    <Card role="toolbar" aria-label="Board view" className="wb-pill h-9 px-1">
      {readOnly ? null : <SaveStatus />}
      <BoardTimer />
      <ZoomMenu readOnly={readOnly} />
      {lockLabel ? (
        <Tip label={lockLabel === 'Comment only' ? 'Comment only: you can add and reply to comments, not change the board' : 'View only'}>
          <span role="img" aria-label={lockLabel} className="flex h-7 items-center px-1.5 text-chrome-muted">
            {lockLabel === 'Comment only' ? <MessageSquare className="size-3.5" aria-hidden="true" /> : <Lock className="size-3.5" aria-hidden="true" />}
          </span>
        </Tip>
      ) : null}
    </Card>
  );
}

/** "54% ⌄": the zoom readout and its menu. */
function ZoomMenu({ readOnly }: { readOnly: boolean }) {
  const zoom = useCamera((state) => state.camera.zoom);
  const compact = useCamera((state) => state.compact);
  const range = zoomRange({ compact });
  const hasSelection = useSelection((state) => state.ids.length > 0);
  const empty = useBoard((state) => state.board.content.elements.length === 0);
  const canUndo = useHistory((state) => state.canUndo);
  const canRedo = useHistory((state) => state.canRedo);
  const keysOn = usePreferences((state) => state.letterKeys);
  const chime = usePreferences((state) => state.timerChime);
  const timer = useBoard((state) => state.board.content.timer !== undefined);
  const history = useVersionHistoryEntry();
  const shellFormats = useShellDraws((state) => state.draws.has('formats'));
  const mod = modKey();
  const percent = zoomPercent(zoom);
  const preset = ZOOM_PRESETS.some((value) => Math.abs(value - zoom) < 1e-4);
  return (
    <ChromeMenu
      align="end"
      tip={{ label: 'Zoom and view' }}
      trigger={
        <ChromeButton className="pl-2 pr-1.5 tabular-nums" aria-label={`Zoom ${percent}`}>
          <span className="grid">
            <span className="invisible col-start-1 row-start-1" aria-hidden="true">
              100%
            </span>
            <span className="col-start-1 row-start-1 text-right">{percent}</span>
          </span>
          <ChevronDown className="!size-3 text-chrome-muted" strokeWidth={2} aria-hidden="true" />
        </ChromeButton>
      }
    >
      <ChromeMenuItem shortcut={`${mod}+`} disabled={zoom >= Math.min(MAX_ZOOM, range.max) - 1e-6} onSelect={() => zoomStep(1)} closeOnClick={false}>
        Zoom in
      </ChromeMenuItem>
      <ChromeMenuItem shortcut={`${mod}−`} disabled={zoom <= range.min + 1e-6} onSelect={() => zoomStep(-1)} closeOnClick={false}>
        Zoom out
      </ChromeMenuItem>
      <ChromeMenuItem shortcut={`${mod}0`} disabled={empty} onSelect={fitBoard}>
        Fit the board
      </ChromeMenuItem>
      <ChromeMenuItem shortcut={keysOn ? '⇧2' : undefined} disabled={!hasSelection} onSelect={fitSelection}>
        Zoom to selection
      </ChromeMenuItem>
      <ChromeMenuSeparator />
      {preset ? null : <ChromeMenuLabel>Now {percent}</ChromeMenuLabel>}
      {ZOOM_PRESETS.map((value) => (
        <ChromeMenuItem key={value} checked={Math.abs(value - zoom) < 1e-4} onSelect={() => zoomTo(value)}>
          {Math.round(value * 100)}%
        </ChromeMenuItem>
      ))}
      {readOnly ? null : (
        <>
          <ChromeMenuSeparator />
          <ChromeMenuItem shortcut={`${mod}Z`} disabled={!canUndo} onSelect={undo} closeOnClick={false}>
            Undo
          </ChromeMenuItem>
          <ChromeMenuItem shortcut={`⇧${mod}Z`} disabled={!canRedo} onSelect={redo} closeOnClick={false}>
            Redo
          </ChromeMenuItem>
        </>
      )}
      <ChromeMenuSeparator />
      <FollowItems />
      <ChromeMenuItem checked={keysOn} onSelect={() => usePreferences.getState().setLetterKeys(!keysOn)}>
        Single-key tool shortcuts
      </ChromeMenuItem>
      {timer ? (
        <ChromeMenuItem checked={chime} onSelect={() => usePreferences.getState().setTimerChime(!chime)}>
          Timer chime
        </ChromeMenuItem>
      ) : null}
      <ChromeMenuSeparator />
      {history.shown ? (
        <ChromeMenuItem checked={history.open} onSelect={() => toggleVersionHistory()}>
          Version history
        </ChromeMenuItem>
      ) : null}
      {/* In a Shell the Share panel's Export tab has the board's formats. */}
      {shellFormats ? null : (
        <ChromeMenuItem disabled={empty} title={empty ? 'The board is empty.' : undefined} onSelect={() => void downloadBoardPng()}>
          Download board
        </ChromeMenuItem>
      )}
    </ChromeMenu>
  );
}

/** Follow someone, or ask everyone to follow you. */
function FollowItems() {
  const peers = usePresence((state) => state.peers);
  const following = usePresence((state) => state.following);
  const leading = usePresence((state) => state.leading);
  // Same color as the peer's cursor, which is keyed by user rather than tab.
  const collabPeers = useCollabPeers((state) => state.peers);
  const people = [...peers.values()];
  const session = maybeSession();
  if (!session?.room) return null;
  // Only editors ask everyone to follow them.
  const canLead = session.canEdit;
  return (
    <>
      {people.length > 0 ? (
        <ChromeSubmenu label="Follow">
          {people.map((peer) => (
            <ChromeMenuItem
              key={peer.id}
              checked={following === peer.id}
              icon={<PeerFace color={collabPeers.get(peer.id)?.color ?? avatarColor(peer.id)} name={peer.name} />}
              onSelect={() => usePresence.getState().follow(following === peer.id ? null : peer.id)}
            >
              {peer.name}
            </ChromeMenuItem>
          ))}
        </ChromeSubmenu>
      ) : null}
      {canLead ? (
        <ChromeMenuItem checked={leading} description={leading ? 'Everyone sees what you see' : undefined} onSelect={() => usePresence.getState().setLeading(!leading)}>
          Follow me
        </ChromeMenuItem>
      ) : null}
      {people.length > 0 || canLead ? <ChromeMenuSeparator /> : null}
    </>
  );
}

/** A person's initials on their color, as a menu icon. */
function PeerFace({ color, name }: { color: string; name: string }) {
  return (
    <span className="grid size-4 place-items-center rounded-full text-[8px] font-semibold" style={{ background: color, color: avatarInk(color) }}>
      {initialsOf(name)}
    </span>
  );
}

/** Save status, only when there is something to say and the Shell does not draw it. */
function SaveStatus() {
  const status = useBoard((state) => state.status);
  const pending = useBoard((state) => state.pending);
  const refusal = useBoard((state) => state.refusal);
  const shellDraws = useShellDraws((state) => state.draws.has('saved'));
  // Saving shows only after a moment, so quick saves do not flicker.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (pending === 0) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 800);
    return () => clearTimeout(timer);
  }, [pending]);

  let shown: { label: string; icon: ReactNode } | null = null;
  if (refusal) shown = { label: refusal, icon: <TriangleAlert className="size-3.5 text-danger" aria-hidden="true" /> };
  else if (status === 'cached') shown = { label: pending > 0 ? LIVE_MESSAGES.cachedEdits : LIVE_MESSAGES.cached, icon: <CloudOff className="size-3.5" aria-hidden="true" /> };
  else if (status === 'offline') shown = { label: 'Offline: changes will save when you reconnect', icon: <CloudOff className="size-3.5" aria-hidden="true" /> };
  else if (status === 'error') shown = { label: 'Could not save', icon: <TriangleAlert className="size-3.5 text-danger" aria-hidden="true" /> };
  else if (slow && !shellDraws) shown = { label: 'Saving…', icon: <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> };
  if (!shown) return null;
  return (
    <Tip label={shown.label}>
      <span role="status" aria-label={shown.label} className="flex h-7 items-center gap-1.5 px-1.5 text-[13px] text-chrome-muted">
        {shown.icon}
      </span>
    </Tip>
  );
}

