/** The page bar's width toggle: the page at its default width, or wide. */
import { announce } from '@open-artifact/editor-kit';
import { TipButton } from '@open-artifact/editor-kit/react';
import { FoldHorizontal, UnfoldHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { useDisplay, useDocs } from '../app/store.ts';
import { writeDisplay } from './display.ts';

export function WidthControl(): ReactNode {
  const writable = useDocs(state => state.writable);
  const { pageWidth } = useDisplay();
  if (!writable) return null;
  const wide = pageWidth === 'wide';
  const label = wide ? 'Back to default width' : 'Make page wide';
  return (
    <TipButton
      square
      tip={label}
      aria-label={label}
      // The editor keeps its selection and focus.
      onMouseDown={event => event.preventDefault()}
      onClick={() => {
        announce(wide ? 'Page is at default width' : 'Page is wide');
        void writeDisplay('pageWidth', wide ? 'default' : 'wide');
      }}
    >
      {wide ? <FoldHorizontal className="size-4" strokeWidth={1.75} /> : <UnfoldHorizontal className="size-4" strokeWidth={1.75} />}
    </TipButton>
  );
}
