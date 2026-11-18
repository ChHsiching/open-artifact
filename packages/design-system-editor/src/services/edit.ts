/**
 * Edits the views make: tokens, the index, text files and assets. Text
 * edits go through the files store (undoable, autosaved); binary moves and
 * uploads are written at once.
 */

import { assetGroupKey, assetGroupOf, assetKey, isAssetGroupName, pathProblem, serializeTokens, type AssetGroup, type AssetItem, type RawTokens } from '@open-artifact/design-system-core';
import { toast } from '@open-artifact/ui';
import { isDirty, useFiles } from '../state/files.ts';
import { deriveModel } from '../state/model.ts';
import { session } from './session.ts';
import { deleteFiles, flush, moveFile, publishAssetMove, writeFiles } from './sync.ts';
import { addFontFiles, ensureFamily, guessFontFace, removeFontFile } from '../lib/type-edit.ts';

const INDEX = 'design-system.json';

/** Edits `tokens.json`. Same-key edits in quick succession are one undo step. */
export function editTokens(update: (raw: RawTokens) => RawTokens, key?: string): void {
  const model = deriveModel(useFiles.getState());
  if (model.tokensError) {
    toast.add({ title: 'tokens.json cannot be edited here', description: model.tokensError });
    return;
  }
  const next = update(model.raw);
  if (next === model.raw) return;
  useFiles.getState().edit({ 'tokens.json': serializeTokens(next) }, key);
}

/** Edits the index as raw JSON (unknown keys kept). */
export function editIndex(update: (index: Record<string, unknown>) => Record<string, unknown>, key?: string): void {
  const text = useFiles.getState().texts[INDEX];
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text ?? '{}') as Record<string, unknown>;
  } catch {
    toast.add({ title: 'design-system.json cannot be edited here', description: 'It is not valid JSON. Fix it in Files first.' });
    return;
  }
  useFiles.getState().edit({ [INDEX]: `${JSON.stringify(update(raw), null, 2)}\n` }, key);
}

/** Writes a text file (`null` deletes it). */
export function editText(path: string, text: string | null, key?: string): void {
  useFiles.getState().edit({ [path]: text }, key);
}

/* -------------------------------------------------------------------------- */
/* Assets                                                                      */
/* -------------------------------------------------------------------------- */

type Groups = Record<string, AssetGroup>;

function groupsOf(index: Record<string, unknown>): Groups {
  return (index.assetGroups && typeof index.assetGroups === 'object' ? index.assetGroups : {}) as Groups;
}

/** A name not taken in the group. */
function freeName(names: readonly string[], name: string): string {
  if (!names.includes(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; ; n++) if (!names.includes(`${stem}-${n}${ext}`)) return `${stem}-${n}${ext}`;
}

/** Names in a group, uploads and files together. */
function namesIn(group: string): string[] {
  const model = deriveModel(useFiles.getState());
  return model.assets.find((g) => (g.items[0]?.group ?? g.name) === group)?.items.map((item) => item.name) ?? [];
}

/** A clean group name (a folder under `assets/`). */
export function cleanGroupName(name: string): string {
  const group = name.trim().replace(/[/\\]/g, '-').replace(/^\.+/, '').slice(0, 80);
  return isAssetGroupName(group) ? group : '';
}

/** Adds an empty group. */
export function addAssetGroup(name: string): string | null {
  const group = cleanGroupName(name);
  if (!group) return null;
  editIndex((index) => {
    const groups = groupsOf(index);
    const key = assetGroupKey(groups, group);
    if (Object.hasOwn(groups, key)) return index;
    const order = Array.isArray(index.groups) ? (index.groups as string[]) : [];
    return { ...index, groups: [...new Set([...order, key])], assetGroups: { ...groups, [key]: { name: group, order: [], files: {} } } };
  });
  return group;
}

export type ImportedFile = { file: File; asset: AssetItem } | { file: File; fontPath: string };

/** Media uploads use the index, while supporting files stay readable under assets/<group>/. */
export async function uploadAssets(group: string, files: readonly File[], keepFolderPaths = false, added?: ImportedFile[]): Promise<number> {
  const { assets } = session();
  if (useFiles.getState().readOnly || !isAssetGroupName(group)) return 0;
  let written = 0;
  const records: { file: File; name: string; blob: string; size: number; type: string }[] = [];
  for (const file of files) {
    try {
      const subpath = keepFolderPaths && file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(1).join('/') : '';
      const name = subpath || file.name;
      if (pathProblem(`assets/${group}/${name}`)) throw new Error('Choose a project file name without reserved names or characters.');
      if (!assets || !/\.(?:avif|gif|jpe?g|png|svg|webp|mp4|webm|pdf)$/i.test(name)) {
        const prefix = `assets/${group}/`;
        const taken = [...namesIn(group), ...Object.keys(useFiles.getState().listing).filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length))];
        const dest = freeName(taken, name);
        const path = prefix + dest;
        if (await writeFiles([{ path, data: file }])) {
          added?.push({ file, asset: { group, path, name: dest } });
          written++;
        }
        continue;
      }
      const record = await assets.upload(file, { name: file.name });
      records.push({ file, name, blob: record.id, size: record.sizeBytes, type: record.contentType || file.type });
    } catch (error) {
      toast.add({ title: `Could not upload ${file.name}`, description: error instanceof Error ? error.message : String(error) });
    }
  }
  if (!records.length || useFiles.getState().readOnly) return written;
  editIndex((index) => {
    const groups = groupsOf(index);
    const key = assetGroupKey(groups, group);
    const current: AssetGroup = groups[key] ?? { name: group, order: [], files: {} };
    const filesByKey = { ...current.files };
    const names = namesIn(group);
    for (const { file, ...record } of records) {
      const name = freeName(names, record.name);
      filesByKey[assetKey(name)] = { ...record, name };
      added?.push({ file, asset: { ...record, name, group } });
      names.push(name);
    }
    const order = Array.isArray(index.groups) ? (index.groups as string[]) : [];
    return {
      ...index,
      groups: order.includes(key) ? order : [...order, key],
      // New uploads go last, after everything shown now (file-backed tiles included).
      assetGroups: { ...groups, [key]: { ...current, order: names, files: filesByKey } },
    };
  });
  return written + records.length;
}

/** Sets the tile order of a group. */
export function reorderAssets(group: string, names: readonly string[]): void {
  editIndex((index) => {
    const groups = groupsOf(index);
    const key = assetGroupKey(groups, group);
    const current: AssetGroup = groups[key] ?? { name: group, order: [], files: {} };
    return { ...index, assetGroups: { ...groups, [key]: { ...current, order: [...names] } } };
  });
}

/** Renames an asset; a file-backed one is moved on disk. */
export async function renameAsset(item: AssetItem, to: string): Promise<void> {
  const name = to.replace(/[/\\]/g, '-').trim();
  if (!name || name === item.name) return;
  if (namesIn(item.group).includes(name)) {
    toast.add({ title: `${name} already exists in ${item.group}` });
    return;
  }
  if (item.path) {
    const target = `${item.path.slice(0, item.path.length - item.name.length)}${name}`;
    if (!(await moveFile(item.path, target))) return;
  }
  editIndex((index) => {
    const groups = groupsOf(index);
    const key = assetGroupKey(groups, item.group);
    const current = groups[key];
    if (!current) return index;
    const files = { ...current.files };
    const record = files[assetKey(item.name)];
    if (record) {
      delete files[assetKey(item.name)];
      files[assetKey(name)] = { ...record, name };
    }
    return { ...index, assetGroups: { ...groups, [key]: { ...current, files, order: (current.order ?? []).map((n) => (n === item.name ? name : n)) } } };
  });
}

/** Removes an asset: an upload leaves the index; a file moves to `archived/`. */
export async function removeAsset(item: AssetItem): Promise<boolean> {
  if (item.path) {
    let target = `archived/${item.path}`;
    for (let n = 2; target in useFiles.getState().listing; n++) target = `archived/${item.path}.${n}`;
    if (!(await moveFile(item.path, target))) return false;
  }
  editIndex((index) => {
    const groups = groupsOf(index);
    const key = assetGroupKey(groups, item.group);
    const current = groups[key];
    if (!current) return index;
    const files = { ...current.files };
    delete files[assetKey(item.name)];
    return { ...index, assetGroups: { ...groups, [key]: { ...current, files, order: (current.order ?? []).filter((n) => n !== item.name) } } };
  });
  return true;
}

/** Move a selection into another group, or rename/archive an entire group (including its README). */
export async function relocateAssets(from: string, to: string | null, selection?: readonly string[]): Promise<boolean> {
  await flush();
  const state = useFiles.getState();
  if (state.readOnly || isDirty(state)) {
    toast.add({ title: 'Wait for the current edits to save before moving assets.' });
    return false;
  }
  const { assets, index } = deriveModel(state);
  const source = assets.find((entry) => entry.name === from);
  const dest = assets.find((entry) => entry.name === to);
  if (!source || from === to) return false;
  if (to !== null && (!to || cleanGroupName(to) !== to || pathProblem(`assets/${to}/file`))) {
    toast.add({ title: 'Choose a valid group name.' });
    return false;
  }
  const chosen = new Set(selection ?? source.items.map((item) => item.name));
  if (dest && (!selection || dest.items.some((item) => chosen.has(item.name)))) {
    toast.add({ title: 'A group or file with that name already exists.' });
    return false;
  }
  const raw = JSON.parse(state.texts[INDEX]!) as Record<string, unknown>;
  const groups = { ...groupsOf(raw) };
  const srcKey = assetGroupKey(groups, from);
  const src = groups[srcKey] ?? { name: from, order: [], files: {} };
  const srcFiles = { ...src.files };
  const moves = new Map<string, string>();
  for (const path of Object.keys(state.listing)) {
    if (!path.startsWith('assets/')) continue;
    const { group, name } = assetGroupOf(path);
    if (group !== from || (selection && !chosen.has(name))) continue;
    const target = to ? `assets/${to}/${name}` : freeName(Object.keys(state.listing), `archived/${path}`);
    moves.set(path, target);
  }
  let order = [...index.groups];
  if (to !== null) {
    const key = assetGroupKey(groups, to);
    const destGroup = selection ? groups[key] ?? { name: to, files: {}, order: [] } : src;
    const files = { ...destGroup.files };
    for (const [id, record] of Object.entries(srcFiles)) {
      if (!selection || chosen.has(record.name)) {
        files[id] = record;
        delete srcFiles[id];
      }
    }
    const ordered = selection ? [...(dest?.items.map((item) => item.name) ?? []), ...chosen] : src.order;
    groups[key] = { ...destGroup, name: to, files, order: ordered ?? [] };
    if (!selection) order = order.map((id) => id === srcKey ? key : id);
    if (!order.includes(key)) order.push(key);
  }
  if (selection) {
    groups[srcKey] = { ...src, files: srcFiles, order: (src.order ?? []).filter((name) => !chosen.has(name)) };
  } else {
    delete groups[srcKey];
    order = order.filter((id) => id !== srcKey);
  }
  return publishAssetMove(moves, { ...raw, groups: order, assetGroups: groups });
}

/** Font file extensions. */
const FONT = /\.(woff2?|ttf|otf|ttc)$/i;

/**
 * Uploads font files to `fonts/` and lists them in `type.fonts` (family,
 * weight and style read from the file name), adding a family stack for
 * each new family. Returns the families added.
 */
export async function uploadFonts(files: readonly File[], added?: ImportedFile[]): Promise<string[]> {
  const fonts = files.filter((file) => FONT.test(file.name));
  if (useFiles.getState().readOnly) return [];
  if (!fonts.length) {
    toast.add({ title: 'Choose .woff2, .woff, .ttf or .otf files' });
    return [];
  }
  const taken = Object.keys(useFiles.getState().listing);
  const entries = fonts.map((file) => {
    const wanted = `fonts/${file.name.replace(/[/\\\s]+/g, '-')}`;
    const path = freeName(taken, wanted);
    taken.push(path);
    return { path, file, face: guessFontFace(file.name) };
  });
  if (!(await writeFiles(entries.map((entry) => ({ path: entry.path, data: entry.file }))))) return [];
  for (const { file, path } of entries) added?.push({ file, fontPath: path });
  const families = [...new Set(entries.map((entry) => entry.face.family))];
  editTokens((raw) => {
    let next = addFontFiles(
      raw,
      entries.map((entry) => ({ family: entry.face.family, file: entry.path, weight: entry.face.weight, style: entry.face.style })),
    );
    for (const family of families) next = ensureFamily(next, family, `"${family}", sans-serif`).raw;
    return next;
  });
  toast.add({ title: `Added ${fonts.length} font ${fonts.length === 1 ? 'file' : 'files'}`, description: families.join(', ') });
  return families;
}

/**
 * Takes dropped brand files: fonts go to `fonts/`, everything else into an
 * asset group named after its top folder (or "Other").
 */
export async function importBrandFiles(files: readonly File[]): Promise<ImportedFile[]> {
  const fonts = files.filter((file) => FONT.test(file.name));
  const others = files.filter((file) => !FONT.test(file.name) && !file.name.startsWith('.'));
  const added: ImportedFile[] = [];
  if (fonts.length) await uploadFonts(fonts, added);
  const byGroup = new Map<string, File[]>();
  for (const file of others) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
    const parts = relative.split('/').filter(Boolean);
    const group = cleanGroupName(parts.length >= 2 ? parts[0]! : 'Other') || 'Other';
    byGroup.set(group, [...(byGroup.get(group) ?? []), file]);
  }
  for (const [group, list] of byGroup) await uploadAssets(group, list, true, added);
  return added;
}

/** Remove exactly the item that landed, even when a duplicate was given a new name. */
export async function removeImportedFile(item: ImportedFile): Promise<boolean> {
  if ('fontPath' in item) {
    if (!(await deleteFiles([item.fontPath])).length) return false;
    editTokens((raw) => removeFontFile(raw, item.fontPath));
  } else {
    return removeAsset(item.asset);
  }
  return true;
}
