/** Who has the doc open, in the top bar: this person first, then the agent, then everyone else; a click goes to them. */
import { inkOnPeerColor } from '@open-artifact/editor-kit';
import { Tip, initials } from '@open-artifact/editor-kit/react';
import { cn } from '@open-artifact/ui';
import { Bot } from 'lucide-react';
import { type ReactNode } from 'react';
import { useDocs } from '../app/store.ts';
import { usePeople } from './hooks.ts';
import { jumpTo } from './jump.ts';
import type { Person } from './people.ts';
import { usePresence, useSelf } from './presence.ts';

/** Most faces drawn before "+n". */
const MAX_FACES = 5;

const FACE = 'flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-chrome';

function Face({ name, color, agent = false }: { name: string; color: string; agent?: boolean }): ReactNode {
  return (
    <span aria-hidden="true" className={FACE} style={{ background: color, color: inkOnPeerColor(color) }}>
      {agent ? <Bot className="size-3.5" strokeWidth={2} /> : initials(name)}
    </span>
  );
}

function TipText({ name, detail }: { name: string; detail: string | null }): ReactNode {
  return (
    <span className="flex flex-col">
      <span>{name}</span>
      {detail ? <span className="text-tip-fg/70">{detail}</span> : null}
    </span>
  );
}

function useTabName(): (tab: string | null) => string | null {
  const files = useDocs(state => state.project?.files);
  return tab => {
    if (!tab || !files || files.length < 2) return null;
    return files.find(file => file.id === tab)?.name ?? null;
  };
}

function detailOf(person: Person, tabName: string | null): string {
  if (person.kind === 'agent') {
    if (!person.active) return 'idle';
    return tabName ? `writing in ${tabName}` : 'writing';
  }
  return [tabName, 'click to go to them'].filter(Boolean).join(' · ');
}

function PersonFace({ person, tabName }: { person: Person; tabName: string | null }): ReactNode {
  const detail = detailOf(person, tabName);
  const reachable = person.tab !== null && (person.kind === 'person' || person.active);
  return (
    <Tip label={<TipText name={person.name} detail={detail} />}>
      <button
        type="button"
        aria-label={`${person.name}, ${detail}`}
        aria-disabled={!reachable}
        onClick={() => (reachable ? jumpTo(person) : undefined)}
        className={cn(
          'inline-flex rounded-full outline-2 outline-offset-1 outline-transparent transition-[outline-color,opacity] focus-visible:outline-chrome-focus',
          reachable ? 'cursor-pointer hover:outline-chrome-line' : 'cursor-default',
          person.kind === 'agent' && !person.active && 'opacity-50',
        )}
      >
        <Face name={person.name} color={person.color} agent={person.kind === 'agent'} />
      </button>
    </Tip>
  );
}

export function PresenceBar(): ReactNode {
  const inRoom = usePresence(state => state.available);
  const self = useSelf();
  const people = usePeople();
  const tabName = useTabName();
  const ordered = [...people.filter(person => person.kind === 'agent'), ...people.filter(person => person.kind === 'person')];
  const showSelf = inRoom && self.name !== '' && self.color !== '';
  if (!showSelf && ordered.length === 0) return null;
  const room = MAX_FACES - (showSelf ? 1 : 0);
  const shown = ordered.length > room ? ordered.slice(0, room - 1) : ordered;
  const hidden = ordered.slice(shown.length);
  return (
    <div role="group" aria-label="People here" className="flex items-center -space-x-1 px-1">
      {showSelf ? (
        <Tip label={selfLabel(self.name)}>
          <span className="inline-flex rounded-full" tabIndex={0} aria-label={selfLabel(self.name)}>
            <Face name={self.name} color={self.color} />
          </span>
        </Tip>
      ) : null}
      {shown.map(person => (
        <PersonFace key={person.id} person={person} tabName={tabName(person.tab)} />
      ))}
      {hidden.length ? (
        <Tip label={hidden.map(person => person.name).join(', ')}>
          <span tabIndex={0} aria-label={`${hidden.length} more: ${hidden.map(person => person.name).join(', ')}`} className={cn(FACE, 'bg-chrome-line text-chrome-fg')}>
            +{hidden.length}
          </span>
        </Tip>
      ) : null}
    </div>
  );
}

const selfLabel = (name: string): string => (name === 'You' ? name : `${name} (you)`);
