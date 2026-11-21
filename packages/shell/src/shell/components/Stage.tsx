/**
 * What fills the Shell under its bar: the artifact page in its frame, the
 * empty state (hand the artifact to an agent), or the problem state.
 */

import { SHELL_FRAME_NAME } from '@open-artifact/protocol';
import { Copy, MessageSquare, Play, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@open-artifact/ui';
import { copyText } from '../../lib/format.ts';
import { t } from '../../lib/i18n.ts';
import { attachFrame, embedded, frameLoaded } from '../bridge.ts';
import { ask, newSession } from '../actions.ts';
import { useAgentName } from '../hooks.ts';
import { addressWithoutThread, pageAddress, pageOriginOf } from '../model.ts';
import { useBoot, useShell } from '../store.ts';

/** The artifact page, in the frame named `open-artifact-shell` with `open_artifact_shell` and `open_artifact_id` on its address. */
export function PageFrame() {
  const boot = useBoot();
  // Computed once: the `comment` thread moves from the Shell's address to the page's.
  const src = useMemo(() => pageAddress(boot, location.href, embedded), [boot]);
  useEffect(() => {
    const rest = addressWithoutThread(location.href);
    if (rest) history.replaceState(history.state, '', rest);
  }, []);
  const ref = (element: HTMLIFrameElement | null): void => attachFrame(element, pageOriginOf(boot.page, location.href));
  if (!src) return null;
  return (
    <iframe
      ref={ref}
      name={SHELL_FRAME_NAME}
      src={src}
      title={boot.title}
      allow="clipboard-read; clipboard-write; fullscreen"
      onLoad={frameLoaded}
      className="absolute inset-0 size-full border-0 bg-surface"
    />
  );
}

/** Made but not written yet: hand it to an agent (a new session through the host, or by copying the prompt). */
export function EmptyArtifact() {
  const boot = useBoot();
  const agent = useAgentName();
  const sessions = useShell((state) => !!state.host?.caps.sessions);
  const [status, setStatus] = useState('');
  const prompt = boot.prompt ?? '';
  return (
    <div className="max-w-2xl px-8 py-10">
      <h2 className="mb-2 mt-0 text-base font-semibold">{t('emptyTitle')}</h2>
      <p className="mb-3 mt-0 text-fg-muted">{t('emptyBody', { type: boot.typeTitle, root: boot.root })}</p>
      <textarea
        readOnly
        value={prompt}
        aria-label={t('emptyTitle')}
        className="block min-h-28 w-full resize-y rounded-lg border border-line bg-surface-2 px-3 py-2.5 font-mono text-xs leading-relaxed text-fg outline-none focus:border-accent"
      />
      <div className="mt-2.5 flex flex-wrap gap-2">
        {sessions ? (
          <Button
            size="lg"
            variant="primary"
            icon={<Play className="size-3.5" />}
            onClick={() => {
              newSession(prompt);
              setStatus(t('sentToSession'));
            }}
          >
            {t('startSession', { agent })}
          </Button>
        ) : null}
        <Button
          size="lg"
          icon={<Copy className="size-3.5" />}
          onClick={async () => {
            await copyText(prompt);
            setStatus(t('promptCopied'));
          }}
        >
          {t('copy')}
        </Button>
      </div>
      <p role="status" className="mt-2 text-xs text-fg-muted">
        {status}
      </p>
    </div>
  );
}

/** The page cannot open: why, where its folder is, and a way to ask the agent to look. */
export function ProblemState() {
  const boot = useBoot();
  const agent = useAgentName();
  const status = useShell((state) => state.askStatus);
  const problem = boot.problem || t('noPage');
  return (
    <div className="max-w-2xl px-8 py-10">
      <h2 className="mb-2 mt-0 flex items-center gap-2 text-base font-semibold">
        <TriangleAlert className="size-4 text-warning" />
        {t('problemTitle')}
      </h2>
      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-fg-muted">{problem}</pre>
      <p className="text-xs text-fg-muted">{t('folder', { root: boot.root })}</p>
      <Button size="lg" icon={<MessageSquare className="size-3.5" />} onClick={() => void ask(t('problemAsk', { problem }), agent)}>
        {t('askToLook', { agent })}
      </Button>
      <p role="status" className="mt-2 text-xs text-fg-muted">
        {status}
      </p>
    </div>
  );
}

/** The page, or the empty or problem state. */
export function Stage() {
  const boot = useBoot();
  const content = boot.empty ? <EmptyArtifact /> : boot.problem || !boot.page ? <ProblemState /> : <PageFrame />;
  return <main className="relative min-w-0 flex-1 overflow-auto">{content}</main>;
}
