/**
 * How the page shows the doc (fonts, page width, where the tabs go), kept in the doc's display record. A choice shows
 * at once; when the server refuses it the page goes back to what the doc holds and says so.
 */
import { toast } from '@open-artifact/ui';
import { docClient } from '../app/doc-client.ts';
import { type DocDisplay, displayOf, getDocs, setDocs } from '../app/store.ts';
import { displayMember } from './display-member.ts';

/** What a failed write of each key says. */
const FAILED: Record<keyof DocDisplay, string> = {
  headingFont: 'Couldn’t save the font choice. The document is back to its saved fonts.',
  textFont: 'Couldn’t save the font choice. The document is back to its saved fonts.',
  pageWidth: 'Couldn’t save the page width. The page is back to its saved width.',
  tabsLocation: 'Couldn’t save where tabs show. Tabs are back to the saved setting.',
};

/** Each key's newest choice still on its way, so an older answer does not undo a newer one. */
const pending = new Map<keyof DocDisplay, number>();
let serial = 0;

function showChoice<K extends keyof DocDisplay>(key: K, value: DocDisplay[K]): void {
  const project = getDocs().project;
  if (!project) return;
  setDocs({ project: { ...project, display: { ...(project.display ?? {}), [key]: value } } });
}

/** Shows `value` for `key` and saves it in the doc. Resolves true once the doc holds it. */
export async function writeDisplay<K extends keyof DocDisplay>(key: K, value: DocDisplay[K]): Promise<boolean> {
  const { project, writable } = getDocs();
  if (!project || !writable) return false;
  const before = displayOf(project.display)[key];
  if (before === value) return true;
  const mine = ++serial;
  pending.set(key, mine);
  showChoice(key, value);
  try {
    await docClient().call({ member: displayMember(key, value) });
    return true;
  } catch {
    if (pending.get(key) !== mine) return false;
    if (displayOf(getDocs().project?.display)[key] === value) showChoice(key, before);
    toast.add({ title: FAILED[key], type: 'error' });
    return false;
  } finally {
    if (pending.get(key) === mine) pending.delete(key);
  }
}
