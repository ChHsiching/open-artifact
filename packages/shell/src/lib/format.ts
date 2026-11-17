/** Small pure formatters: relative times, sizes, initials and colors. */

import { locale, t } from './i18n.ts';

/** "just now", "5 minutes ago", "yesterday", or a date for anything older than 30 days. */
export function ago(iso: string | null | undefined, now: number = Date.now(), lang: string = locale): string {
  if (!iso) return '';
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const s = Math.max(0, (now - at) / 1000);
  if (s < 60) return t('justNow');
  const relative = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (s < 3600) return relative.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return relative.format(-Math.round(s / 3600), 'hour');
  if (s < 86400 * 30) return relative.format(-Math.round(s / 86400), 'day');
  return new Date(at).toLocaleDateString(lang);
}

/** `1.5 KB`, `12 MB`…; empty for a value that is not a finite number. */
export function bytesText(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** One CJK character, or the first letters of the first two words. */
export function initials(name: string | null | undefined): string {
  const clean = String(name ?? '').trim();
  if (!clean) return '?';
  if (/^[぀-ヿ㐀-鿿가-힯]/.test(clean)) return [...clean][0]!;
  const words = clean.split(/\s+/);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}

const AVATAR_COLORS = ['#0f766e', '#4f46e5', '#b45309', '#7c3aed', '#be185d', '#0369a1', '#4d7c0f', '#9f1239'];

/** A stable avatar background for a key. */
export function avatarColor(key: string): string {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

/** What an export row's icon shows, by its label (the page names the format there). */
export type FormatKind = 'folder' | 'pdf' | 'document' | 'slides' | 'image' | 'html' | 'video' | 'text' | 'file';

/** The {@link FormatKind} of an export label (a `.zip` of images is still images: only "folder" is the folder). */
export function formatKind(label: string): FormatKind {
  if (/folder/i.test(label)) return 'folder';
  if (/pdf/i.test(label)) return 'pdf';
  if (/word|docx/i.test(label)) return 'document';
  if (/powerpoint|pptx|slides/i.test(label)) return 'slides';
  if (/png|jpe?g|image|svg/i.test(label)) return 'image';
  if (/html|web page/i.test(label)) return 'html';
  if (/video|mp4|gif/i.test(label)) return 'video';
  if (/markdown|text|\.md\b/i.test(label)) return 'text';
  return 'file';
}

/** Copies text, falling back to a hidden textarea where the async clipboard is refused. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

/** The file name a `Content-Disposition` header gives (`filename*` first), or `''`. */
export function fileNameOf(header: string | null | undefined): string {
  if (!header) return '';
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1]!.trim());
    } catch {
      // Fall back to the plain name.
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/.exec(header);
  return (plain?.[1] ?? plain?.[2] ?? '').trim();
}
