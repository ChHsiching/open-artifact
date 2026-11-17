//! Deflate through `miniz_oxide`.

/// Raw deflate (zip entries) at `level` 1–10.
pub fn raw(data: &[u8], level: u8) -> Vec<u8> {
    miniz_oxide::deflate::compress_to_vec(data, level.min(10))
}

/// Deflate with a zlib header (PDF `FlateDecode`, PNG `IDAT`) at `level` 1–10.
pub fn zlib(data: &[u8], level: u8) -> Vec<u8> {
    miniz_oxide::deflate::compress_to_vec_zlib(data, level.min(10))
}

/// Inflates a zlib stream into exactly `size` bytes; `None` when the stream
/// is broken or does not inflate to that size.
pub fn inflate_zlib_exact(data: &[u8], size: usize) -> Option<Vec<u8>> {
    use miniz_oxide::inflate::TINFLStatus;
    use miniz_oxide::inflate::core::{DecompressorOxide, decompress, inflate_flags};
    let mut out = vec![0u8; size];
    let mut decompressor = Box::<DecompressorOxide>::default();
    let flags = inflate_flags::TINFL_FLAG_PARSE_ZLIB_HEADER | inflate_flags::TINFL_FLAG_USING_NON_WRAPPING_OUTPUT_BUF;
    let (status, _, written) = decompress(&mut decompressor, data, &mut out, 0, flags);
    (status == TINFLStatus::Done && written == size).then_some(out)
}
