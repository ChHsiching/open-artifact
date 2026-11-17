/**
 * Edits the views make: tokens, the index, text files and assets. Text
 * edits go through the files store (undoable, autosaved); binary moves and
 * uploads are written at once.
 */

import { assetKey, serializeTokens, type AssetGroup, type AssetItem, type RawTokens } from '@open-artifact/design-system-core';
import { toast } from '@open-artifact/ui';
import { useFiles } from '../state/files.ts';
import { deriveModel } from '../state/model.ts';
import { session } from './session.ts';
import { moveFile, writeFiles } from './sync.ts';
import { addFontFiles, ensureFamily, guessFontFace } from '../lib/type-edit.ts';

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
  return name.replace(/[/\\]/g, '-').replace(/^\.+/, '').trim().slice(0, 64);
}

/** Adds an empty group. */
export function addAssetGroup(name: string): string | null {
  const group = cleanGroupName(name);
  if (!group) return null;
  editIndex((index) => {
    const groups = groupsOf(index);
    if (groups[group]) return index;
    const order = Array.isArray(index.groups) ? (index.groups as string[]) : [];
    return { ...index, groups: [...order, group], assetGroups: { ...groups, [group]: { name: group, order: [], files: {} } } };
  });
  return group;
}

/** Uploads files into a group as content-addressed uploads recorded by the index. */
export async function uploadAssets(group: string, files: readonly File[]): Promise<void> {
  const { assets } = session();
  if (!assets || useFiles.getState().readOnly) return;
  const names = namesIn(group);
  const records: { name: string; blob: string; size: number; type: string }[] = [];
  for (const file of files) {
    try {
      const record = await assets.upload(file, { name: file.name });
      const name = freeName([...names, ...records.map((r) => r.name)], file.name.replace(/[/\\]/g, '-'));
      records.push({ name, blob: record.id, size: record.sizeBytes, type: record.contentType || file.type });
    } catch (error) {
      toast.add({ title: `Could not upload ${file.name}`, description: error instanceof Error ? error.message : String(error) });
    }
  }
  if (!records.length) return;
  editIndex((index) => {
    const groups = groupsOf(index);
    const current: AssetGroup = groups[group] ?? { name: group, order: [], files: {} };
    const filesByKey = { ...current.files };
    for (const record of records) filesByKey[assetKey(record.name)] = record;
    const order = Array.isArray(index.groups) ? (index.groups as string[]) : [];
    return {
      ...index,
      groups: order.includes(group) ? order : [...order, group],
      // New uploads go last, after everything shown now (file-backed tiles included).
      assetGroups: { ...groups, [group]: { ...current, order: [...names, ...records.map((r) => r.name)], files: filesByKey } },
    };
  });
}

/** Sets the tile order of a group. */
export function reorderAssets(group: string, names: readonly string[]): void {
  editIndex((index) => {
    const groups = groupsOf(index);
    const current: AssetGroup = groups[group] ?? { name: group, order: [], files: {} };
    return { ...index, assetGroups: { ...groups, [group]: { ...current, order: [...names] } } };
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
    const current = groups[item.group];
    if (!current) return index;
    const files = { ...current.files };
    const record = files[assetKey(item.name)];
    if (record) {
      delete files[assetKey(item.name)];
      files[assetKey(name)] = { ...record, name };
    }
    return { ...index, assetGroups: { ...groups, [item.group]: { ...current, files, order: (current.order ?? []).map((n) => (n === item.name ? name : n)) } } };
  });
}

/** Removes an asset: an upload leaves the index; a file moves to `archived/`. */
export async function removeAsset(item: AssetItem): Promise<void> {
  if (item.path) {
    let target = `archived/${item.path}`;
    for (let n = 2; target in useFiles.getState().listing; n++) target = `archived/${item.path}.${n}`;
    if (!(await moveFile(item.path, target))) return;
  }
  editIndex((index) => {
    const groups = groupsOf(index);
    const current = groups[item.group];
    if (!current) return index;
    const files = { ...current.files };
    delete files[assetKey(item.name)];
    return { ...index, assetGroups: { ...groups, [item.group]: { ...current, files, order: (current.order ?? []).filter((n) => n !== item.name) } } };
  });
}

/** Font file extensions. */
const FONT = /\.(woff2?|ttf|otf)$/i;

/**
 * Uploads font files to `fonts/` and lists them in `type.fonts` (family,
 * weight and style read from the file name), adding a family stack for
 * each new family. Returns the families added.
 */
export async function uploadFonts(files: readonly File[]): Promise<string[]> {
  const fonts = files.filter((file) => FONT.test(file.name));
  if (!fonts.length) {
    toast.add({ title: 'Choose .woff2, .woff, .ttf or .otf files' });
    return [];
  }
  const entries = fonts.map((file) => {
    const path = `fonts/${file.name.replace(/[/\\\s]+/g, '-')}`;
    return { path, file, face: guessFontFace(file.name) };
  });
  if (!(await writeFiles(entries.map((entry) => ({ path: entry.path, data: entry.file }))))) return [];
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
 * asset group named after its top folder (or "Brand").
 */
export async function importBrandFiles(files: readonly File[]): Promise<{ fonts: number; assets: number }> {
  const fonts = files.filter((file) => FONT.test(file.name));
  const others = files.filter((file) => !FONT.test(file.name) && !file.name.startsWith('.'));
  if (fonts.length) await writeFiles(fonts.map((file) => ({ path: `fonts/${file.name.replace(/[/\\]/g, '-')}`, data: file })));
  const byGroup = new Map<string, File[]>();
  for (const file of others) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
    const parts = relative.split('/').filter(Boolean);
    const group = cleanGroupName(parts.length > 2 ? parts[1]! : parts.length === 2 ? parts[0]! : 'Brand') || 'Brand';
    byGroup.set(group, [...(byGroup.get(group) ?? []), file]);
  }
  for (const [group, list] of byGroup) await uploadAssets(group, list);
  return { fonts: fonts.length, assets: others.length };
}
