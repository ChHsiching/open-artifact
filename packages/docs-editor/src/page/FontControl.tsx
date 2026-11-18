/** The page bar's font menu: serif or sans for the headings, and for the text. */
import { ChromeButton, ChromeMenu, ChromeMenuItem, ChromeMenuLabel, ChromeMenuSeparator } from '@open-artifact/editor-kit/react';
import { Type } from 'lucide-react';
import type { ReactNode } from 'react';
import { type DocDisplay, useDisplay, useDocs } from '../app/store.ts';
import { writeDisplay } from './display.ts';

type FontKey = 'headingFont' | 'textFont';
type Font = DocDisplay[FontKey];

const GROUPS: ReadonlyArray<{ key: FontKey; label: string }> = [
  { key: 'headingFont', label: 'Headings' },
  { key: 'textFont', label: 'Text' },
];

const FONTS: ReadonlyArray<{ value: Font; label: string; className: string }> = [
  { value: 'serif', label: 'Serif', className: 'font-[family-name:var(--doc-serif)]' },
  { value: 'sans', label: 'Sans', className: 'font-[family-name:var(--doc-sans)]' },
];

export function FontControl(): ReactNode {
  const writable = useDocs(state => state.writable);
  const display = useDisplay();
  if (!writable) return null;
  const trigger = (
    <ChromeButton square aria-label="Font" className="data-[popup-open]:bg-chrome-hover">
      <Type className="size-4" strokeWidth={1.75} />
    </ChromeButton>
  );
  return (
    <ChromeMenu trigger={trigger} tip={{ label: 'Font' }} align="start">
      {GROUPS.map(({ key, label }, index) => (
        <div key={key} role="group" aria-label={label}>
          {index > 0 ? <ChromeMenuSeparator /> : null}
          <ChromeMenuLabel>{label}</ChromeMenuLabel>
          {FONTS.map(font => (
            <ChromeMenuItem key={font.value} checked={display[key] === font.value} closeOnClick={false} onSelect={() => void writeDisplay(key, font.value)}>
              <span className={font.className}>{font.label}</span>
            </ChromeMenuItem>
          ))}
        </div>
      ))}
    </ChromeMenu>
  );
}
