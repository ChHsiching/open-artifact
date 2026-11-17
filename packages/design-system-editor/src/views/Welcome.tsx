/**
 * The welcome page of an empty design system: ways to start (from code,
 * from a design file, from uploaded brand files, from scratch), each sent
 * to the agent as a prepared request with optional extra words, and a
 * page-wide drop zone for brand files.
 */

import { Code2, FolderUp, PenTool, Send, Sparkles, Upload } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Button, cn, toast } from '@open-artifact/ui';
import { useFiles } from '../state/files.ts';
import { useModel } from '../state/model.ts';
import { REQUESTS, sendPrepared } from '../services/agent.ts';
import { importBrandFiles } from '../services/edit.ts';

interface Route {
  id: keyof typeof REQUESTS;
  icon: ReactNode;
  title: string;
  description: string;
}

const ROUTES: Route[] = [
  { id: 'fromCode', icon: <Code2 className="size-5" />, title: 'From code', description: 'Read variables, text styles, fonts and components from a repository.' },
  { id: 'fromDesignTool', icon: <PenTool className="size-5" />, title: 'From a design file', description: 'Turn a design file’s variables and components into this system.' },
  { id: 'fromScratch', icon: <Sparkles className="size-5" />, title: 'From scratch', description: 'A small starter set of colors, type, spacing and radius, with usage rules.' },
];

function RouteCard({ route, disabled }: { route: Route; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState('');
  const [sending, setSending] = useState(false);
  const send = async (): Promise<void> => {
    setSending(true);
    const result = await sendPrepared(REQUESTS[route.id], extra);
    setSending(false);
    if (result && result.status !== 'failed') {
      setOpen(false);
      setExtra('');
    }
  };
  return (
    <div className={cn('flex flex-col rounded-xl border border-line bg-surface p-4', open && 'border-accent')}>
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)} className="flex items-start gap-3 text-left disabled:opacity-50">
        <span className="mt-0.5 text-accent">{route.icon}</span>
        <span>
          <span className="block text-[14px] font-semibold text-fg">{route.title}</span>
          <span className="block text-[12px] text-fg-muted">{route.description}</span>
        </span>
      </button>
      {open ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            autoFocus
            value={extra}
            onChange={(event) => setExtra(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void send();
            }}
            placeholder="Anything to add? (optional: a repository, a file link, a brand name…)"
            rows={3}
            className="w-full resize-none rounded-control border border-line bg-canvas p-2 text-[13px] text-fg outline-none focus:border-accent"
          />
          <div className="flex justify-end">
            <Button variant="primary" size="sm" icon={<Send className="size-3.5" />} disabled={sending} onClick={() => void send()}>
              Send to agent
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Welcome() {
  const { index } = useModel();
  const readOnly = useFiles((s) => s.readOnly);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [dropping, setDropping] = useState(false);
  const [uploaded, setUploaded] = useState<{ fonts: number; assets: number } | null>(null);

  const take = async (files: File[]): Promise<void> => {
    if (!files.length || readOnly) return;
    const result = await importBrandFiles(files);
    setUploaded(result);
    toast.add({ title: `Added ${result.fonts} fonts and ${result.assets} files` });
  };

  return (
    <div
      className={cn('min-h-[70vh] rounded-xl', dropping && 'outline-2 outline-dashed outline-accent')}
      onDragOver={(event) => {
        if (!readOnly && event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(event) => {
        setDropping(false);
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        void take([...event.dataTransfer.files]);
      }}
    >
      <div className="mx-auto max-w-2xl pt-12">
        <h1 className="text-[28px] font-semibold tracking-tight text-fg">{index.title || 'New design system'}</h1>
        <p className="mt-2 text-[14px] text-fg-muted">
          A design system holds the colors, type, spacing, components and brand files that designs and pages are built with. It is empty. Pick how to start and your agent will build it here.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          {ROUTES.map((route) => (
            <RouteCard key={route.id} route={route} disabled={readOnly} />
          ))}
          <div className="flex flex-col rounded-xl border border-dashed border-line-strong p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-accent">
                <Upload className="size-5" />
              </span>
              <div className="flex-1">
                <span className="block text-[14px] font-semibold text-fg">Upload brand files</span>
                <span className="block text-[12px] text-fg-muted">Drop logos, fonts and imagery anywhere on this page, or pick them. Fonts go to fonts/, the rest to asset groups.</span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <input ref={filesInput} type="file" multiple hidden onChange={(event) => void take([...(event.target.files ?? [])]).finally(() => (event.target.value = ''))} />
              <input
                ref={folderInput}
                type="file"
                multiple
                hidden
                {...({ webkitdirectory: '' } as Record<string, string>)}
                onChange={(event) => void take([...(event.target.files ?? [])]).finally(() => (event.target.value = ''))}
              />
              <Button size="sm" disabled={readOnly} icon={<Upload className="size-3.5" />} onClick={() => filesInput.current?.click()}>
                Choose files
              </Button>
              <Button size="sm" disabled={readOnly} icon={<FolderUp className="size-3.5" />} onClick={() => folderInput.current?.click()}>
                Choose a folder
              </Button>
              {uploaded ? (
                <Button size="sm" variant="primary" icon={<Send className="size-3.5" />} onClick={() => void sendPrepared(REQUESTS.fromUploads)}>
                  Build from these files
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
