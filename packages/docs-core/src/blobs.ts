export const BLOB_REF = /^blob\/[A-Za-z0-9_-]{1,64}$/;
export const BLOB_ID = /^[0-9a-f]{32}$/;

export const blobRef = (id: string) => `blob/${id}`;

export interface ImageInfo {
  mime: string;
  width?: number;
  height?: number;
}

const latin1 = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));

/** The picture's kind and size in pixels, read from its own header; null when it is not a PNG, GIF, JPEG or WebP. */
export function imageInfo(bytes: Uint8Array): ImageInfo | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && latin1(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') return { mime: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  const gif = bytes.length >= 10 ? latin1(bytes, 0, 6) : '';
  if (gif === 'GIF87a' || gif === 'GIF89a') return { mime: 'image/gif', width: view.getUint16(6, true), height: view.getUint16(8, true) };
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return { mime: 'image/jpeg', ...jpegSize(bytes, view) };
  if (bytes.length >= 16 && latin1(bytes, 0, 4) === 'RIFF' && latin1(bytes, 8, 12) === 'WEBP') return { mime: 'image/webp', ...webpSize(bytes, view) };
  return null;
}

function jpegSize(bytes: Uint8Array, view: DataView): { width?: number; height?: number } {
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) {
      at++;
      continue;
    }
    const marker = bytes[at + 1]!;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
    at += 2 + view.getUint16(at + 2);
  }
  return {};
}

const uint24le = (view: DataView, at: number) => view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getUint8(at + 2) << 16);

function webpSize(bytes: Uint8Array, view: DataView): { width?: number; height?: number } {
  const chunk = latin1(bytes, 12, 16);
  if (chunk === 'VP8X' && bytes.length >= 30) return { width: 1 + uint24le(view, 24), height: 1 + uint24le(view, 27) };
  if (chunk === 'VP8 ' && bytes.length >= 30) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  if (chunk === 'VP8L' && bytes.length >= 25) {
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return {};
}
