import type { RoomCapability } from '@open-artifact/runtime';
import type { EditorState } from 'prosemirror-state';
import { docClient } from '../app/doc-client.ts';
import { getDocs, useDocs } from '../app/store.ts';
import { useVersionHistory } from '../history/store.ts';
import { useEditor } from '../editor/format.ts';

/** Stable ids for the caret, an ordinary range or each disjoint range in a table selection. */
export function selectedIds(state: EditorState): string[] {
  const ids = new Set<string>();
  for (const { $from, $to } of state.selection.ranges) {
    if ($from.pos === $to.pos && $from.parent.attrs.bid) ids.add($from.parent.attrs.bid);
    else state.doc.nodesBetween($from.pos, $to.pos, node => {
      if (node.isBlock && (node.isLeaf || node.isTextblock) && node.attrs.bid) ids.add(node.attrs.bid);
      return !node.isTextblock;
    });
  }
  return [...ids].slice(0, 256);
}

/** Publish only the visible tab's addressing information. Text stays in the doc. */
export function publishViewContext(room: RoomCapability): () => void {
  let pending: ReturnType<typeof setTimeout> | undefined;
  let last = '';
  const publish = () => {
    pending = undefined;
    const { activeTab, writable, project } = getDocs();
    if (!activeTab) return;
    const file = project?.files.find(file => file.id === activeTab);
    const sync = docClient().openTabOf(activeTab)?.sync;
    const editor = useEditor.getState();
    if (!file || !sync) return;
    const context = {
      mode: writable && !useVersionHistory.getState().preview ? 'edit' : 'read',
      tab: activeTab, node: file.content.id, rev: sync.serverRev,
      selected: editor.tab === activeTab && editor.state ? selectedIds(editor.state) : [],
      dirty: sync.hasLocalChanges || !!editor.view?.composing, edits: sync.editCount,
    };
    const key = JSON.stringify(context);
    if (key === last) return;
    last = key;
    void room.presence({ viewContext: context }).catch(() => { if (last === key) last = ''; });
  };
  const schedule = () => { pending ??= setTimeout(publish, 100); };
  const stops = [useDocs.subscribe(schedule), useEditor.subscribe(schedule), useVersionHistory.subscribe(schedule), docClient().onShadow(schedule), docClient().onAnswer(schedule)];
  schedule();
  return () => { clearTimeout(pending); for (const stop of stops) stop(); };
}
