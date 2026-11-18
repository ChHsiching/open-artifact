/** The selection toolbar's formatting: text style, marks, colour and highlight, lists, indent and link. */
import { ChromeButton, ChromeMenu, ChromeMenuItem, ChromeMenuLabel, ChromeMenuSeparator, type ChromeSide, ToolButton } from '@open-artifact/editor-kit/react';
import {
  Bold,
  ChevronDown,
  Code,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Strikethrough,
  Underline,
} from 'lucide-react';
import type { Command } from 'prosemirror-state';
import type { ReactNode } from 'react';
import {
  type BlockStyle,
  type ListKind,
  indent,
  outdent,
  setBlockStyle,
  setHighlight,
  setTextColor,
  toggleBold,
  toggleCode,
  toggleItalic,
  toggleList,
  toggleStrike,
  toggleUnderline,
} from '../editor/commands.ts';
import { type FormatState, runOnEditor } from '../editor/format.ts';
import { TEXT_COLORS, type TextColor } from '../editor/schema.ts';
import { formatChord } from './chords.ts';
import { startLinkEdit } from './links.ts';

const ICON = { className: 'size-4', strokeWidth: 1.75 } as const;

const STYLES: ReadonlyArray<{ style: BlockStyle; label: string; short: string; chord: string; className: string }> = [
  { style: 'paragraph', label: 'Text', short: 'Text', chord: 'Mod-Alt-0', className: '' },
  { style: 'h1', label: 'Heading 1', short: 'H1', chord: 'Mod-Alt-1', className: 'text-[17px] font-semibold' },
  { style: 'h2', label: 'Heading 2', short: 'H2', chord: 'Mod-Alt-2', className: 'text-[15px] font-semibold' },
  { style: 'h3', label: 'Heading 3', short: 'H3', chord: 'Mod-Alt-3', className: 'font-semibold' },
];

const MARKS: ReadonlyArray<{ key: 'bold' | 'italic' | 'underline' | 'strike' | 'code'; label: string; chord: string; icon: ReactNode; command: Command }> = [
  { key: 'bold', label: 'Bold', chord: 'Mod-b', icon: <Bold {...ICON} />, command: toggleBold },
  { key: 'italic', label: 'Italic', chord: 'Mod-i', icon: <Italic {...ICON} />, command: toggleItalic },
  { key: 'underline', label: 'Underline', chord: 'Mod-u', icon: <Underline {...ICON} />, command: toggleUnderline },
  { key: 'strike', label: 'Strikethrough', chord: 'Mod-Shift-s', icon: <Strikethrough {...ICON} />, command: toggleStrike },
  { key: 'code', label: 'Code', chord: 'Mod-e', icon: <Code {...ICON} />, command: toggleCode },
];

const COLOR_NAMES: Record<TextColor, string> = { red: 'Red', yellow: 'Yellow', green: 'Green', teal: 'Teal', purple: 'Purple' };

const LISTS: ReadonlyArray<{ kind: ListKind; label: string; chord: string; Icon: typeof List }> = [
  { kind: 'bullet', label: 'Bulleted list', chord: 'Mod-Shift-8', Icon: List },
  { kind: 'ordered', label: 'Numbered list', chord: 'Mod-Shift-7', Icon: ListOrdered },
  { kind: 'check', label: 'Checklist', chord: 'Mod-Shift-9', Icon: ListTodo },
];

/** Which of the bar's menus is open, so the bar stays while the editor has lost the focus to it. */
export interface MenuHold {
  onMenu(name: string, open: boolean): void;
  side: ChromeSide;
}

const run = (command: Command) => () => void runOnEditor(command);

function TextStyleMenu({ format, hold }: { format: FormatState; hold: MenuHold }): ReactNode {
  const current = STYLES.find(item => item.style === format.block);
  const shown = current?.label ?? (format.block?.startsWith('h') ? `Heading ${format.block.slice(1)}` : 'Text');
  return (
    <ChromeMenu
      tip={{ label: 'Text style', side: hold.side }}
      onOpenChange={open => hold.onMenu('style', open)}
      trigger={
        <ChromeButton aria-label={`${shown}, text style`} className="gap-0.5 pl-2 pr-1">
          <span className="min-w-[4.5rem] truncate text-left">{shown}</span>
          <ChevronDown className="size-4 shrink-0 text-chrome-muted" strokeWidth={1.5} />
        </ChromeButton>
      }
    >
      {STYLES.map(item => (
        <ChromeMenuItem key={item.style} checked={item.style === format.block} shortcut={formatChord(item.chord)} onSelect={run(setBlockStyle(item.style))}>
          <span className={item.className}>{item.label}</span>
        </ChromeMenuItem>
      ))}
    </ChromeMenu>
  );
}

function ColorSwatch({ color }: { color: TextColor | null }): ReactNode {
  return (
    <span aria-hidden="true" className="text-[14px] font-semibold leading-none" style={{ color: color ? `var(--doc-text-${color})` : 'var(--doc-text)' }}>
      A
    </span>
  );
}

function HighlightSwatch({ on }: { on: boolean }): ReactNode {
  return <span aria-hidden="true" className="block size-3.5 rounded-[3px] ring-1 ring-inset ring-chrome-line" style={{ background: on ? 'var(--doc-mark)' : 'transparent' }} />;
}

function ColorMenu({ format, hold }: { format: FormatState; hold: MenuHold }): ReactNode {
  const on = format.highlight || format.textColor !== null;
  return (
    <ChromeMenu
      tip={{ label: 'Highlight', side: hold.side }}
      onOpenChange={open => hold.onMenu('color', open)}
      trigger={
        <ChromeButton aria-label="Highlight" pressed={on} className="gap-0 pl-1.5 pr-0.5">
          <Highlighter {...ICON} />
          <ChevronDown className="size-3.5 shrink-0 text-chrome-muted" strokeWidth={1.5} />
        </ChromeButton>
      }
    >
      <ChromeMenuLabel>Text color</ChromeMenuLabel>
      <ChromeMenuItem icon={<ColorSwatch color={null} />} checked={format.textColor === null} onSelect={run(setTextColor(null))}>
        Default
      </ChromeMenuItem>
      {TEXT_COLORS.map(color => (
        <ChromeMenuItem key={color} icon={<ColorSwatch color={color} />} checked={format.textColor === color} onSelect={run(setTextColor(color))}>
          {COLOR_NAMES[color]}
        </ChromeMenuItem>
      ))}
      <ChromeMenuSeparator />
      <ChromeMenuLabel>Highlight</ChromeMenuLabel>
      <ChromeMenuItem icon={<HighlightSwatch on={false} />} checked={!format.highlight} onSelect={run(setHighlight(false))}>
        No highlight
      </ChromeMenuItem>
      <ChromeMenuItem icon={<HighlightSwatch on />} checked={format.highlight} onSelect={run(setHighlight(true))}>
        Yellow
      </ChromeMenuItem>
    </ChromeMenu>
  );
}

function ListMenu({ format, hold }: { format: FormatState; hold: MenuHold }): ReactNode {
  const Icon = LISTS.find(item => item.kind === format.list)?.Icon ?? List;
  return (
    <ChromeMenu
      tip={{ label: 'List', side: hold.side }}
      onOpenChange={open => hold.onMenu('list', open)}
      trigger={
        <ChromeButton aria-label="List" pressed={format.list !== null} className="gap-0 pl-1.5 pr-0.5">
          <Icon {...ICON} />
          <ChevronDown className="size-3.5 shrink-0 text-chrome-muted" strokeWidth={1.5} />
        </ChromeButton>
      }
    >
      {LISTS.map(({ kind, label, chord, Icon: ItemIcon }) => (
        <ChromeMenuItem key={kind} icon={<ItemIcon className="size-4" strokeWidth={1.75} />} checked={format.list === kind} shortcut={formatChord(chord)} onSelect={run(toggleList(kind))}>
          {label}
        </ChromeMenuItem>
      ))}
    </ChromeMenu>
  );
}

export interface FormatControlsProps {
  format: FormatState;
  hold: MenuHold;
  /** The selection touches a list item: indenting applies. */
  inList: boolean;
  canIndent: boolean;
  canOutdent: boolean;
  /** Divider drawn before each group but the first. */
  divider: ReactNode;
}

export function IndentControls({ hold, canIndent, canOutdent }: Pick<FormatControlsProps, 'hold' | 'canIndent' | 'canOutdent'>): ReactNode {
  return (
    <>
      <ToolButton size="md" tipSide={hold.side} label="Decrease indent" shortcut={formatChord('Mod-[')} icon={<IndentDecrease {...ICON} />} disabled={!canOutdent} onClick={run(outdent)} />
      <ToolButton size="md" tipSide={hold.side} label="Increase indent" shortcut={formatChord('Mod-]')} icon={<IndentIncrease {...ICON} />} disabled={!canIndent} onClick={run(indent)} />
    </>
  );
}

/** Text style (not in a table), the marks and colour, the list kind and the link. */
export function FormatControls({ format, hold, inList, canIndent, canOutdent, divider }: FormatControlsProps): ReactNode {
  return (
    <>
      {inList ? <IndentControls hold={hold} canIndent={canIndent} canOutdent={canOutdent} /> : null}
      {!format.inTable ? <TextStyleMenu format={format} hold={hold} /> : null}
      {inList || !format.inTable ? divider : null}
      {MARKS.map(mark => (
        <ToolButton
          key={mark.key}
          size="md"
          tipSide={hold.side}
          label={mark.label}
          shortcut={formatChord(mark.chord)}
          icon={mark.icon}
          pressed={format[mark.key]}
          onClick={run(mark.command)}
        />
      ))}
      <ColorMenu format={format} hold={hold} />
      {divider}
      <ListMenu format={format} hold={hold} />
      {divider}
      <ToolButton size="md" tipSide={hold.side} label="Link" shortcut={formatChord('Mod-k')} icon={<Link2 {...ICON} />} pressed={format.link !== null} onClick={() => void startLinkEdit()} />
    </>
  );
}
