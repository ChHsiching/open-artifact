import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { docToDisk } from '@open-artifact/docs-core';
import { BLOBS_DIR } from './blobs.ts';
import { DOC_DIR, MANIFEST_FILE, SESSIONS_FILE, TABS_DIR, type DocStore } from './store.ts';

/** Copy the live tabs under their original ids so internal links, enums and open suggestions still resolve. */
export function duplicateDoc(store: DocStore, name: string): { root: string; name: string } {
  const parent = path.dirname(path.dirname(store.root));
  const base = [...name.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim().replace(/^\.+|[. ]+$/g, '')].slice(0, 60).join('') || 'Document copy';
  let root = path.join(parent, base);
  for (let suffix = 2; ; suffix++) {
    try {
      fs.mkdirSync(root);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      root = path.join(parent, base + ' ' + suffix);
    }
  }
  try {
    const dest = path.join(root, DOC_DIR);
    fs.mkdirSync(path.join(dest, TABS_DIR), { recursive: true });
    for (const id of store.tabIds()) {
      if (path.basename(id) !== id) throw new Error('Invalid tab id');
      fs.writeFileSync(path.join(dest, TABS_DIR, id + '.json'), JSON.stringify(docToDisk(store.doc(id))) + '\n');
    }
    const sessions = path.join(store.root, SESSIONS_FILE);
    if (fs.existsSync(sessions)) fs.copyFileSync(sessions, path.join(dest, SESSIONS_FILE));
    const blobs = path.join(path.dirname(store.root), BLOBS_DIR);
    if (fs.existsSync(blobs)) {
      fs.mkdirSync(path.join(root, BLOBS_DIR));
      for (const entry of fs.readdirSync(blobs, { withFileTypes: true })) {
        if (entry.isFile() && /^[0-9a-f]{32}\.[a-z0-9]+$/.test(entry.name) && !entry.name.endsWith('.tmp')) {
          fs.copyFileSync(path.join(blobs, entry.name), path.join(root, BLOBS_DIR, entry.name));
        }
      }
    }
    const { deleted, locked, ...content } = store.manifest;
    const now = new Date().toISOString();
    fs.writeFileSync(path.join(dest, MANIFEST_FILE), JSON.stringify({ ...content, id: randomUUID(), name, created: now, updated: now }) + '\n');
    return { root, name };
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
