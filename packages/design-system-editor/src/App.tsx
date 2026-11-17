/**
 * The Design System page: top bar, notices, the left navigation and the
 * section being read, and the composer.
 */

import { Loader2, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, type CSSProperties } from 'react';
import { EmptyState } from '@open-artifact/ui';
import { COMMENT_CURSOR } from '@open-artifact/editor-kit/react';
import { useFiles } from './state/files.ts';
import { useModel } from './state/model.ts';
import { useView, type SectionId } from './state/view.ts';
import { startSession } from './services/session.ts';
import { loadSystem } from './services/sync.ts';
import { startPresence } from './services/agent.ts';
import { startShellBridge } from './services/shell.ts';
import { collabAside, startCollab } from './services/collab.ts';
import { useComments } from './services/comments.ts';
import { useHistory } from './services/history.ts';
import { syncHostedFonts } from './services/fonts.ts';
import { installKeyboard } from './components/keys.ts';
import { Composer, ConflictBar, PipelineBanner, ReadOnlyBar, TopBar } from './components/Chrome.tsx';
import { CommentsOverlay } from './components/Comments.tsx';
import { HistoryAside, NoticesBar, PreviewBar } from './components/Collab.tsx';
import { Nav } from './components/Nav.tsx';
import { Overview } from './views/Overview.tsx';
import { Colors } from './views/Colors.tsx';
import { Typography } from './views/Typography.tsx';
import { Scale } from './views/Scale.tsx';
import { Components } from './views/Components.tsx';
import { Assets } from './views/Assets.tsx';
import { Files } from './views/Files.tsx';
import { Welcome } from './views/Welcome.tsx';

/** Connects and loads. Runs once. */
async function boot(): Promise<void> {
  try {
    await startSession();
  } catch (error) {
    useFiles.getState().fail(error instanceof Error ? error.message : String(error));
    return;
  }
  await loadSystem();
  if (useFiles.getState().status !== 'ready') return;
  startPresence();
  startCollab();
  startShellBridge();
}

let booted = false;

function Section({ id }: { id: SectionId }) {
  const empty = useModel().empty;
  switch (id) {
    case 'overview':
      return empty ? <Welcome /> : <Overview />;
    case 'colors':
      return <Colors />;
    case 'typography':
      return <Typography />;
    case 'spacing':
    case 'radius':
    case 'shadow':
      return <Scale key={id} family={id} />;
    case 'components':
      return <Components />;
    case 'assets':
      return <Assets />;
    case 'files':
      return <Files />;
    default:
      return id.startsWith('family:') ? <Scale key={id} family={id.slice('family:'.length)} /> : <Overview />;
  }
}

export function App() {
  const status = useFiles((s) => s.status);
  const error = useFiles((s) => s.error);
  const section = useView((s) => s.section);
  const { index, tokens } = useModel();
  const main = useRef<HTMLElement>(null);
  const commentsAvailable = useComments((s) => s.available);
  const listOpen = useComments((s) => s.listOpen);
  const commenting = useComments((s) => s.on);
  const historyAvailable = useHistory((s) => s.available);
  const historyOpen = useHistory((s) => s.open);
  const aside = collabAside({ available: commentsAvailable, listOpen }, { available: historyAvailable, open: historyOpen });

  useEffect(() => {
    if (!booted) {
      booted = true;
      void boot();
    }
    return installKeyboard();
  }, []);

  useEffect(() => {
    if (status === 'ready') document.title = index.title || 'Design system';
  }, [status, index.title]);

  // Hosted (Google) families the tokens name load in this page and the previews.
  useEffect(() => {
    if (status === 'ready') syncHostedFonts(tokens);
  }, [status, tokens]);

  // A new section starts at the top (anchors scroll on their own).
  useEffect(() => {
    if (!useView.getState().anchor) main.current?.scrollTo({ top: 0 });
  }, [section]);

  if (status === 'loading') {
    return (
      <EmptyState icon={<Loader2 className="size-5 animate-spin" />} title="Opening design system…">
        Reading the project files.
      </EmptyState>
    );
  }
  if (status === 'error') {
    return (
      <EmptyState icon={<TriangleAlert className="size-5" />} title="Could not open this design system">
        {error}
      </EmptyState>
    );
  }
  return (
    <div className="flex h-full flex-col bg-canvas text-fg">
      <TopBar />
      <PreviewBar />
      <ReadOnlyBar />
      <PipelineBanner />
      <NoticesBar />
      <ConflictBar />
      <div className="flex min-h-0 flex-1">
        <Nav />
        <main
          ref={main}
          className="min-w-0 flex-1 overflow-y-auto"
          data-commenting={commenting || undefined}
          style={commenting ? ({ '--comment-cursor': COMMENT_CURSOR } as CSSProperties) : undefined}
        >
          <div className="mx-auto max-w-[1040px] px-10 pb-32 pt-8">
            <Section id={section} />
          </div>
        </main>
        {aside === 'history' ? <HistoryAside /> : null}
        <CommentsOverlay />
      </div>
      <Composer />
    </div>
  );
}
