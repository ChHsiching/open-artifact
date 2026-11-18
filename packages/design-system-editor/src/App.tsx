/**
 * The Design System page: top bar, notices, the left navigation and the
 * section being read, and the composer.
 */

import { Loader2, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { EmptyState, toast } from '@open-artifact/ui';
import { COMMENT_CURSOR } from '@open-artifact/editor-kit/react';
import { useFiles } from './state/files.ts';
import { useModel } from './state/model.ts';
import { useView, type SectionId } from './state/view.ts';
import { startSession } from './services/session.ts';
import { loadSystem } from './services/sync.ts';
import { startPresence } from './services/agent.ts';
import { startShellBridge } from './services/shell.ts';
import { collabAside, startCollab } from './services/collab.ts';
import { openComments, parseAnchor, useComments } from './services/comments.ts';
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
import { droppedBrandFiles } from './lib/drop-files.ts';
import { importBrandFiles } from './services/edit.ts';
import { useAnchor } from './views/common.tsx';
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
  switch (id) {
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
  const { index, tokens, empty } = useModel();
  const [intake, setIntake] = useState(false);
  const intakeDrop = useRef<((files: File[]) => Promise<void>) | null>(null);
  const readOnly = useFiles((s) => s.readOnly);
  useAnchor();
  const sections: SectionId[] = ['overview', 'colors', 'typography', 'spacing', 'radius', 'shadow',
    ...tokens.extras.map((extra): SectionId => `family:${extra.key}`), 'components', 'assets'];
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

  const trackSection = (): void => {
    const port = main.current;
    if (!port || useView.getState().anchor || useView.getState().section === 'files') return;
    const top = port.getBoundingClientRect().top + 48;
    const sheets = Array.from(port.querySelectorAll<HTMLElement>('[data-system-section]'));
    const current = sheets.filter((sheet) => sheet.getBoundingClientRect().top <= top).at(-1) ?? sheets[0];
    if (current) useView.setState({ section: current.dataset.systemSection as SectionId });
  };

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
    <div className="flex h-full flex-col bg-canvas text-fg"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault();
      }}
      onDrop={(event) => {
        if (event.defaultPrevented || !event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        const intakeHandler = section === 'files' ? null : intakeDrop.current;
        if (!readOnly) void droppedBrandFiles(event.dataTransfer).then(async (files) => {
          if (intakeHandler) await intakeHandler(files);
          else await importBrandFiles(files);
        }).catch(() => toast.add({ title: 'Could not read these files' }));
      }}>
      <TopBar />
      <PreviewBar />
      <ReadOnlyBar />
      <PipelineBanner />
      <NoticesBar />
      <ConflictBar />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Nav />
        <main
          onScroll={trackSection}
          ref={main}
          className="min-w-0 flex-1 overflow-y-auto"
          data-commenting={commenting || undefined}
          onClickCapture={commenting ? (event) => {
            const item = event.target instanceof Element && event.target.closest<HTMLElement>('[data-comment-item], [data-comment-badge]');
            if (!item || !event.currentTarget.contains(item)) return;
            const anchor = parseAnchor(item.dataset.commentBadge ?? item.dataset.commentItem ?? '');
            if (!anchor) return;
            event.preventDefault();
            event.stopPropagation();
            useView.getState().setFocus(anchor);
            openComments(anchor);
          } : undefined}
          style={commenting ? ({ '--comment-cursor': COMMENT_CURSOR } as CSSProperties) : undefined}
        >
          <div className="ds-pages mx-auto max-w-[1040px] px-4 pb-32 pt-5 lg:px-10">
            {section === 'files' && <Files />}
            {(section !== 'files' || intake) && sections.map((id) => (
              <div key={id} hidden={section === 'files'} data-system-section={id} id={`ds-page-${id}`} className="ds-sheet mb-5 scroll-mt-5 rounded-xl border border-line bg-surface p-5 lg:p-8">
                {id === 'overview' && (empty || intake) ? <Welcome setIntake={setIntake} intakeDrop={intakeDrop} /> : <Section id={id} />}
              </div>
            ))}
          </div>
        </main>
        {aside === 'history' ? <HistoryAside /> : null}
        <CommentsOverlay />
      </div>
      <Composer />
    </div>
  );
}
