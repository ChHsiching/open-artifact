import { useEffect, useState, useSyncExternalStore } from 'react';
import { Users } from 'lucide-react';
import type { PeerOfRoom, SheetsHost } from '../host/sheets-host.ts';
import { Popover } from '../kit/popover.tsx';
import type { FrameChrome } from './frame-chrome.ts';

function following(peer?: PeerOfRoom): string | undefined {
  return (peer?.presence.follow as { of?: string } | null)?.of;
}

export function SheetPeers({ host, chrome }: { host: SheetsHost; chrome: FrameChrome }) {
  const [peers, setPeers] = useState<PeerOfRoom[]>([]);
  const [open, setOpen] = useState(false);
  const follow = useSyncExternalStore(chrome.onFollowOfferChanged, chrome.followHandler);
  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    void host.page.use('room').then(room => {
      if (active) stop = room?.onPeers(({ peers }) => setPeers(peers));
    });
    return () => {
      active = false;
      stop?.();
    };
  }, [host]);

  const others = peers.filter(peer => !peer.isMe && peer.kind === 'viewer');
  const me = peers.find(peer => peer.isMe);
  const followed = others.find(peer => peer.peer === following(me));
  useEffect(() => {
    if (!followed || !follow) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') follow(null);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [followed, follow]);

  if (!others.length) return null;
  return (
    <aside className="sheet-peers-overlay" aria-label="Collaborators">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger aria-label={'People here: ' + others.map(p => p.name).join(', ')}>
          <Users size={16} /> {others.length}
        </Popover.Trigger>
        <Popover.Popup align="end" className="sheet-peers-panel">
          {others.map(peer => {
            const selected = followed?.peer === peer.peer;
            const action = selected ? 'Stop following' : 'Follow';
            return (
              <button
                key={peer.peer}
                disabled={!follow || (!selected && !peer.presence.cursor)}
                aria-label={action + ' ' + peer.name}
                onClick={() => {
                  follow?.(selected ? null : peer.peer);
                  setOpen(false);
                }}
              >
                {peer.name} · {action}{me && following(peer) === me.peer ? ' · Following you' : ''}
              </button>
            );
          })}
        </Popover.Popup>
      </Popover.Root>
      {followed && <span role="status">Following {followed.name}. Press Escape to stop.</span>}
    </aside>
  );
}
