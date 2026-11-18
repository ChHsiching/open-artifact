/** Confirms a tab's delete; a tab with subtabs asks whether they go with it or move up a level. */
import { Button, Dialog } from '@open-artifact/ui';
import { type ReactNode, useEffect, useState } from 'react';
import { useDocs } from '../app/store.ts';
import { deleteTab } from './actions.ts';
import { setTabsUi, useTabsUi } from './state.ts';
import { findNode, tabTree } from './tree.ts';

const WORDS = {
  one: { title: 'Delete this tab?', description: 'This tab and all its content will be deleted' },
  all: { title: 'Delete this tab and all subtabs?', description: 'This tab and all its content, including subtabs, will be deleted' },
  keep: { title: 'Delete this tab?', description: 'This tab and its content will be deleted; its subtabs will move up one level and be kept' },
};

export function DeleteTabDialog(): ReactNode {
  const id = useTabsUi(state => state.deleting);
  const files = useDocs(state => state.project?.files);
  const [keep, setKeep] = useState(false);
  useEffect(() => setKeep(false), [id]);
  const tree = tabTree(files ?? []);
  const node = id ? findNode(tree, id) : undefined;
  const closeDialog = () => setTabsUi({ deleting: null });
  if (!id || !node) return null;

  const hasSubtabs = node.children.length > 0;
  // The doc's only top-level tab keeps its subtabs: a doc needs a tab.
  const mustKeep = hasSubtabs && tree.length === 1 && tree[0]!.id === id;
  const keeping = keep || mustKeep;
  const words = !hasSubtabs ? WORDS.one : keeping ? WORDS.keep : WORDS.all;
  const confirm = () => {
    closeDialog();
    void deleteTab(id, hasSubtabs && keeping);
  };

  return (
    <Dialog
      open
      onOpenChange={next => (next ? undefined : closeDialog())}
      title={words.title}
      description={words.description}
      footer={
        <>
          <Button autoFocus onClick={closeDialog}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm}>
            Delete
          </Button>
        </>
      }
    >
      {hasSubtabs ? (
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--doc-accent)]" checked={keeping} disabled={mustKeep} onChange={event => setKeep(event.target.checked)} />
          <span className="flex flex-col gap-0.5">
            <span>Delete this tab but keep all subtabs</span>
            {mustKeep ? <span className="text-[12px] text-fg-muted">A document needs at least one tab — the subtabs will be kept</span> : null}
          </span>
        </label>
      ) : null}
    </Dialog>
  );
}
