//! The WebAssembly facade: two writers fed one entry or page at a time (so
//! a big export never sits in memory twice) and plain functions over bytes.
//! Text-layer runs and links cross as one `\0`-joined string plus a flat
//! number array each.

use wasm_bindgen::prelude::*;

use crate::{pdf, png, zip};

/// CRC-32 (IEEE) of bytes.
#[wasm_bindgen]
pub fn crc32(bytes: &[u8]) -> u32 {
    zip::crc32(bytes)
}

/// The PNG re-compressed at `level` (1–10); empty when it cannot be read or
/// would not get smaller (the caller keeps its bytes).
#[wasm_bindgen(js_name = optimizePng)]
pub fn optimize_png(bytes: &[u8], level: u8) -> Vec<u8> {
    png::optimize(bytes, level).unwrap_or_default()
}

/// A zip archive being written.
#[wasm_bindgen]
pub struct ZipWriter {
    zip: Option<zip::Zip>,
}

#[wasm_bindgen]
impl ZipWriter {
    /// A new archive whose entries carry the DOS `time` and `date`.
    #[wasm_bindgen(constructor)]
    pub fn new(time: u16, date: u16) -> ZipWriter {
        ZipWriter { zip: Some(zip::Zip::new(time, date)) }
    }

    /// Adds an entry, deflated at `level` (0 stores it). False for a name
    /// already in the archive (the entry is dropped).
    pub fn add(&mut self, name: &str, data: &[u8], level: u8) -> Result<bool, JsError> {
        let zip = self.zip.as_mut().ok_or_else(|| JsError::new("The archive is finished."))?;
        Ok(zip.add(name, data, level))
    }

    /// The archive's bytes.
    pub fn finish(&mut self) -> Result<Vec<u8>, JsError> {
        let zip = self.zip.take().ok_or_else(|| JsError::new("The archive is finished."))?;
        zip.finish().map_err(|error| JsError::new(&error.to_string()))
    }
}

/// A PDF being written.
#[wasm_bindgen]
pub struct PdfWriter {
    pdf: Option<pdf::Pdf>,
}

impl Default for PdfWriter {
    fn default() -> Self {
        PdfWriter::new()
    }
}

#[wasm_bindgen]
impl PdfWriter {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PdfWriter {
        PdfWriter { pdf: Some(pdf::Pdf::new()) }
    }

    /// Adds a page: a JPEG of `pixel_width` × `pixel_height` filling a page
    /// of `width` × `height` pt. `texts` holds the text-layer runs joined by
    /// `\0`, `text_boxes` four numbers per run (x, baseline, size, width);
    /// `uris` and `link_boxes` (x, y, width, height) the same for links.
    #[allow(clippy::too_many_arguments)]
    #[wasm_bindgen(js_name = addPage)]
    pub fn add_page(
        &mut self,
        jpeg: &[u8],
        pixel_width: u32,
        pixel_height: u32,
        width: f64,
        height: f64,
        texts: &str,
        text_boxes: &[f64],
        uris: &str,
        link_boxes: &[f64],
        bookmark: Option<String>,
    ) -> Result<(), JsError> {
        let pdf = self.pdf.as_mut().ok_or_else(|| JsError::new("The PDF is finished."))?;
        let text = split(texts, text_boxes.len() / 4)
            .zip(text_boxes.chunks_exact(4))
            .map(|(text, b)| pdf::TextRun { text: text.to_string(), x: b[0], baseline: b[1], size: b[2], width: b[3] })
            .collect();
        let links = split(uris, link_boxes.len() / 4)
            .zip(link_boxes.chunks_exact(4))
            .map(|(uri, b)| pdf::Link { uri: uri.to_string(), x: b[0], y: b[1], width: b[2], height: b[3] })
            .collect();
        pdf.add_page(&pdf::Page { jpeg, pixel_width, pixel_height, width, height, text, links, bookmark });
        Ok(())
    }

    /// The document's bytes. `date_ms` is the creation time (ms since 1970).
    pub fn finish(&mut self, title: Option<String>, date_ms: f64) -> Result<Vec<u8>, JsError> {
        let pdf = self.pdf.take().ok_or_else(|| JsError::new("The PDF is finished."))?;
        Ok(pdf.finish(title.as_deref(), date_ms))
    }
}

/// `count` strings joined by `\0` (none for an empty count).
fn split(joined: &str, count: usize) -> impl Iterator<Item = &str> {
    joined.split('\0').take(count)
}
