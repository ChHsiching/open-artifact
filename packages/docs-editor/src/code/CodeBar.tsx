/** The bar on a code block: its language, Show / Hide source on a live block, and Copy code. */
import { announce } from '@open-artifact/editor-kit';
import { ChromeButton, Tip } from '@open-artifact/editor-kit/react';
import { toast } from '@open-artifact/ui';
import { Check, Copy } from 'lucide-react';
import type { EditorView } from 'prosemirror-view';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { LanguagePicker } from './LanguagePicker.tsx';
import { type LiveKind, findLanguage, languageLabel } from './languages.ts';

/** How long the copy button shows its check. */
const COPIED_MS = 1200;

export interface CodeBarProps {
  view: EditorView;
  getPos(): number | undefined;
  language: string | null;
  detected: string | null;
  live: LiveKind | null;
  /** Whether the source shows (always, for a block that isn't live). */
  sourceShown: boolean;
  /** The source can't be hidden (it is empty, or being edited). */
  sourceLocked: boolean;
  onToggleSource(): void;
  text(): string;
}

function setLanguage(view: EditorView, getPos: () => number | undefined, language: string | null): void {
  const pos = getPos();
  if (pos === undefined) return;
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'codeBlock') return;
  if ((node.attrs.language ?? null) !== language) view.dispatch(view.state.tr.setNodeAttribute(pos, 'language', language));
  announce(`Language set to ${language ? (findLanguage(language)?.label ?? language) : 'auto'}`);
}

export function CodeBar({ view, getPos, language, detected, live, sourceShown, sourceLocked, onToggleSource, text }: CodeBarProps): ReactNode {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const writable = view.editable;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text());
      announce('Code copied');
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      const title = live && !sourceShown ? 'Couldn’t copy — open Source, then select the text and press ⌘C (Ctrl+C)' : 'Couldn’t copy — select the code and press ⌘C (Ctrl+C)';
      toast.add({ title, type: 'error' });
    }
  };

  return (
    <>
      <LanguagePicker
        shown={languageLabel(language, detected)}
        language={language}
        disabled={!writable}
        onPick={next => setLanguage(view, getPos, next)}
        onClose={() => {
          if (writable) requestAnimationFrame(() => !view.isDestroyed && view.focus());
        }}
      />
      <span className="flex-1" />
      {live ? (
        <ChromeButton className="h-6 px-1.5 text-[12px] text-chrome-muted" aria-pressed={sourceShown} disabled={sourceLocked} onClick={onToggleSource}>
          {sourceShown ? 'Hide source' : 'Show source'}
        </ChromeButton>
      ) : null}
      <Tip label={copied ? 'Code copied' : 'Copy code'} side="top">
        <ChromeButton square aria-label="Copy code" className="size-6 text-chrome-muted" onClick={() => void copy()}>
          {copied ? <Check className="size-3.5" strokeWidth={2.25} /> : <Copy className="size-3.5" strokeWidth={1.75} />}
        </ChromeButton>
      </Tip>
    </>
  );
}
