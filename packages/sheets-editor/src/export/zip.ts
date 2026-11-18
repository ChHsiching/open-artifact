import type { Dynamic } from '../dynamic.ts';
export function crc32Of(bytes?: Dynamic) {
  let crc: Dynamic = 4294967295;
  for (let index: Dynamic = 0; index < bytes.length; index += 1) crc = (CRC32_TABLE[(crc ^ (bytes[index] ?? 0)) & 255] ?? 0) ^ (crc >>> 8);
  return (crc ^ 4294967295) >>> 0;
}
export function writeZipEntryHeader(view?: Dynamic, offset?: Dynamic, entry?: Dynamic) {
  view.setUint16(offset, ZIP_VERSION_NEEDED, true);
  view.setUint16(offset + 2, ZIP_UTF8_FLAG, true);
  view.setUint16(offset + 4, entry.method, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, ZIP_DOS_DATE, true);
  view.setUint32(offset + 10, entry.crc32, true);
  view.setUint32(offset + 14, entry.data.length, true);
  view.setUint32(offset + 18, entry.sizeUnpacked, true);
  view.setUint16(offset + 22, entry.path.length, true);
  view.setUint16(offset + 24, 0, true);
}
export async function writeZipArchive(files?: Dynamic, compress?: Dynamic): Promise<Dynamic> {
  let encoder = new (TextEncoder as Dynamic)();
  let entries = await Promise.all(
    files.map(async ({ path: path, text: text }: Dynamic): Promise<Dynamic> => {
      let unpacked = encoder.encode(text);
      let packed = compress === null ? null : await compress(unpacked);
      return {
        path: encoder.encode(path),
        data: packed ?? unpacked,
        method: packed === null ? ZIP_METHOD_STORED : ZIP_METHOD_DEFLATE,
        crc32: crc32Of(unpacked),
        sizeUnpacked: unpacked.length,
      };
    }),
  );
  let sumOfRecords = (headerSize?: Dynamic, withData?: Dynamic) =>
    entries.reduce(
      (total: Dynamic, { path: path, data: data }: Dynamic) => total + headerSize + path.length + (withData ? data.length : 0),
      0,
    );
  let localSectionSize = sumOfRecords(ZIP_LOCAL_HEADER_SIZE, true);
  let centralSectionSize = sumOfRecords(ZIP_CENTRAL_HEADER_SIZE, false);
  let endRecordOffset = localSectionSize + centralSectionSize;
  if (endRecordOffset + ZIP_END_RECORD_SIZE > ZIP32_MAX_SIZE || entries.some((input?: Dynamic) => input.sizeUnpacked > ZIP32_MAX_SIZE))
    throw Error('the archive is too large for the records that are written');
  let bytes = new (Uint8Array as Dynamic)(endRecordOffset + ZIP_END_RECORD_SIZE);
  let view = new (DataView as Dynamic)(bytes.buffer);
  let localOffset: Dynamic = 0;
  let centralOffset: Dynamic = localSectionSize;
  for (let entry of entries as Dynamic) {
    view.setUint32(centralOffset, 33639248, true);
    view.setUint16(centralOffset + 4, ZIP_VERSION_NEEDED, true);
    writeZipEntryHeader(view, centralOffset + 6, entry);
    view.setUint32(centralOffset + 42, localOffset, true);
    bytes.set(entry.path, centralOffset + ZIP_CENTRAL_HEADER_SIZE);
    centralOffset += ZIP_CENTRAL_HEADER_SIZE + entry.path.length;
    view.setUint32(localOffset, 67324752, true);
    writeZipEntryHeader(view, localOffset + 4, entry);
    bytes.set(entry.path, localOffset + ZIP_LOCAL_HEADER_SIZE);
    bytes.set(entry.data, localOffset + ZIP_LOCAL_HEADER_SIZE + entry.path.length);
    localOffset += ZIP_LOCAL_HEADER_SIZE + entry.path.length + entry.data.length;
  }
  view.setUint32(endRecordOffset, 101010256, true);
  view.setUint16(endRecordOffset + 8, entries.length, true);
  view.setUint16(endRecordOffset + 10, entries.length, true);
  view.setUint32(endRecordOffset + 12, centralSectionSize, true);
  view.setUint32(endRecordOffset + 16, localSectionSize, true);
  return bytes.buffer;
}
export function deflateRawCompressor() {
  try {
    new (CompressionStream as Dynamic)('deflate-raw');
  } catch {
    return null;
  }
  return async (bytes?: Dynamic): Promise<Dynamic> => {
    let stream = new (Blob as Dynamic)([bytes]).stream().pipeThrough(new (CompressionStream as Dynamic)('deflate-raw'));
    return new (Uint8Array as Dynamic)(await new (Response as Dynamic)(stream).arrayBuffer());
  };
}
export const CRC32_TABLE = Uint32Array.from(
  {
    length: 256,
  },
  (slot?: Dynamic, index?: Dynamic) => {
    let crc: Dynamic = index;
    for (let bit: Dynamic = 0; bit < 8; bit += 1) crc = (crc & 1) === 1 ? 3988292384 ^ (crc >>> 1) : crc >>> 1;
    return crc;
  },
);
export const ZIP_METHOD_STORED = 0;
export const ZIP_METHOD_DEFLATE = 8;
export const ZIP_VERSION_NEEDED = 20;
export const ZIP_UTF8_FLAG = 2048;
export const ZIP_DOS_DATE = 33;
export const ZIP32_MAX_SIZE = 4294967295;
export const ZIP_LOCAL_HEADER_SIZE = 30;
export const ZIP_CENTRAL_HEADER_SIZE = 46;
export const ZIP_END_RECORD_SIZE = 22;
export const zipXlsxParts = ({ parts: parts }: Dynamic, compress?: Dynamic) =>
  writeZipArchive(
    parts.map(
      ({ path: path, xml: xml }: Dynamic) => ({
        path: path,
        text: xml,
      }),
    ),
    compress,
  );
