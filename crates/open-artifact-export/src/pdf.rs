//! A PDF writer for picture exports (Design artboards, slides, notes pages).
//!
//! Every page is one JPEG picture filling the page. Over it may lie an
//! invisible text layer (text render mode 3) so the words can be selected,
//! searched and copied, drawn in an embedded glyphless TrueType font (see
//! [`crate::font`]): every character maps to one empty glyph, and a
//! `ToUnicode` map carries the real characters. Each run is stretched (`Tz`)
//! to the width it was measured at, so selections line up with the picture.
//! Links become link annotations, and pages may carry an outline entry.
//!
//! Pages are written as they are added, so a picture is held once: the
//! document's own bytes. Coordinates are in points with the origin at the
//! top left of the page (as measured in the DOM); the writer flips them.
//! Streams other than the pictures are deflated.

use std::collections::BTreeMap;
use std::fmt::Write as _;

use crate::deflate;
use crate::font;

/// Name of the text layer's font.
const FONT_NAME: &str = "OAGlyphless";
/// Deflate level of content streams, maps and the font.
const LEVEL: u8 = 6;
/// The binary comment after the header: marks the file as binary.
const BINARY: [u8; 6] = [0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a];

/// A run of invisible text: one line of words as rendered.
#[derive(Clone, Debug)]
pub struct TextRun {
    pub text: String,
    /// Left edge, pt from the page's left.
    pub x: f64,
    /// Baseline, pt from the page's top.
    pub baseline: f64,
    /// Font size, pt.
    pub size: f64,
    /// Rendered width, pt (the run is stretched to it).
    pub width: f64,
}

/// A clickable area that opens a web address.
#[derive(Clone, Debug)]
pub struct Link {
    pub uri: String,
    /// Top-left corner and size, pt from the page's top left.
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// One page: a JPEG, the page size in points, and what lies over it.
pub struct Page<'a> {
    pub jpeg: &'a [u8],
    /// Pixel size of the JPEG.
    pub pixel_width: u32,
    pub pixel_height: u32,
    /// Page size in points (1/72 inch).
    pub width: f64,
    pub height: f64,
    pub text: Vec<TextRun>,
    pub links: Vec<Link>,
    /// Title of the page's entry in the document outline.
    pub bookmark: Option<String>,
}

/// A number as JavaScript prints `Math.round(value * 100) / 100`.
pub fn num(value: f64) -> String {
    if !value.is_finite() {
        return "0".into();
    }
    let hundredths = (value * 100.0 + 0.5).floor();
    if hundredths == 0.0 {
        return "0".into();
    }
    let negative = hundredths < 0.0;
    let all = hundredths.abs() as u64;
    let (whole, frac) = (all / 100, all % 100);
    let mut out = String::new();
    if negative {
        out.push('-');
    }
    let _ = write!(out, "{whole}");
    if frac != 0 {
        if frac % 10 == 0 {
            let _ = write!(out, ".{}", frac / 10);
        } else {
            let _ = write!(out, ".{frac:02}");
        }
    }
    out
}

/// A PDF text string: UTF-16BE with a byte order mark, as hex.
pub fn text_string(text: &str) -> String {
    let mut hex = String::from("<FEFF");
    for unit in text.encode_utf16() {
        let _ = write!(hex, "{unit:04X}");
    }
    hex.push('>');
    hex
}

/// An ASCII PDF string literal (URIs): `\`, `(` and `)` escaped, anything
/// outside printable ASCII dropped.
pub fn ascii_string(text: &str) -> String {
    let mut out = String::from("(");
    for c in text.chars() {
        match c {
            '\\' | '(' | ')' => {
                out.push('\\');
                out.push(c);
            }
            ' '..='~' => out.push(c),
            _ => {}
        }
    }
    out.push(')');
    out
}

/// `(D:YYYYMMDDHHmmSSZ)` of a time in milliseconds since 1970 (UTC).
pub fn date_string(ms: f64) -> String {
    let seconds = (ms / 1000.0).floor() as i64;
    let days = seconds.div_euclid(86_400);
    let rest = seconds.rem_euclid(86_400);
    // Civil date from days since 1970-01-01 (H. Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + if month <= 2 { 1 } else { 0 };
    format!("(D:{year:04}{month:02}{day:02}{:02}{:02}{:02}Z)", rest / 3600, rest / 60 % 60, rest % 60)
}

/// True for the addresses a link annotation may open.
fn linkable(uri: &str) -> bool {
    let lower: String = uri.chars().take(7).collect::<String>().to_ascii_lowercase();
    lower.starts_with("http:") || lower.starts_with("https:") || lower.starts_with("mailto:")
}

/// A PDF being written.
pub struct Pdf {
    out: Vec<u8>,
    /// Byte offset of each object (index = id - 1), `None` until written.
    offsets: Vec<Option<usize>>,
    catalog: u32,
    pages_id: u32,
    info: u32,
    pages: Vec<u32>,
    bookmarks: Vec<(String, u32)>,
    /// CID of each character of the text layer (CID n is the n-th character seen).
    cids: BTreeMap<char, u16>,
    characters: Vec<char>,
    /// The Type 0 font, once a page has text.
    font: Option<u32>,
}

impl Default for Pdf {
    fn default() -> Self {
        Pdf::new()
    }
}

impl Pdf {
    pub fn new() -> Pdf {
        let mut pdf = Pdf {
            out: Vec::new(),
            offsets: Vec::new(),
            catalog: 0,
            pages_id: 0,
            info: 0,
            pages: Vec::new(),
            bookmarks: Vec::new(),
            cids: BTreeMap::new(),
            characters: Vec::new(),
            font: None,
        };
        pdf.out.extend_from_slice(b"%PDF-1.7\n");
        pdf.out.extend_from_slice(&BINARY);
        pdf.catalog = pdf.alloc();
        pdf.pages_id = pdf.alloc();
        pdf.info = pdf.alloc();
        pdf
    }

    /// Pages added so far.
    pub fn page_count(&self) -> usize {
        self.pages.len()
    }

    fn alloc(&mut self) -> u32 {
        self.offsets.push(None);
        self.offsets.len() as u32
    }

    fn begin(&mut self, id: u32) {
        self.offsets[id as usize - 1] = Some(self.out.len());
        self.out.extend_from_slice(format!("{id} 0 obj\n").as_bytes());
    }

    fn end(&mut self) {
        self.out.extend_from_slice(b"\nendobj\n");
    }

    fn object(&mut self, id: u32, body: &str) {
        self.begin(id);
        self.out.extend_from_slice(body.as_bytes());
        self.end();
    }

    /// A stream object; `deflate` packs the data with `FlateDecode`.
    fn stream(&mut self, id: u32, dict: &str, data: &[u8], deflate: bool) {
        let packed;
        let (filter, body) = if deflate {
            packed = deflate::zlib(data, LEVEL);
            ("/Filter /FlateDecode ", packed.as_slice())
        } else {
            ("", data)
        };
        self.begin(id);
        let space = if dict.is_empty() { "" } else { " " };
        self.out.extend_from_slice(format!("<< {dict}{space}{filter}/Length {} >>\nstream\n", body.len()).as_bytes());
        self.out.extend_from_slice(body);
        self.out.extend_from_slice(b"\nendstream");
        self.end();
    }

    /// The CID of a character, assigning the next one on first sight;
    /// `None` for control characters (and past 65,535 characters).
    fn cid(&mut self, c: char) -> Option<u16> {
        if (c as u32) < 0x20 {
            return None;
        }
        if let Some(&cid) = self.cids.get(&c) {
            return Some(cid);
        }
        if self.characters.len() >= 0xfffe {
            return None;
        }
        self.characters.push(c);
        let cid = self.characters.len() as u16;
        self.cids.insert(c, cid);
        Some(cid)
    }

    /// Writes a page (its picture, links, text layer and the page itself).
    pub fn add_page(&mut self, page: &Page) {
        let page_id = self.alloc();
        let image_id = self.alloc();
        let content_id = self.alloc();
        self.pages.push(page_id);
        let width = num(page.width);
        let height_value = (page.height * 100.0 + 0.5).floor() / 100.0;
        let height = num(page.height);

        let mut annots = Vec::new();
        for link in &page.links {
            if !linkable(&link.uri) {
                continue;
            }
            let id = self.alloc();
            let body = format!(
                "<< /Type /Annot /Subtype /Link /Rect [{} {} {} {}] /Border [0 0 0] /F 4 /A << /Type /Action /S /URI /URI {} >> >>",
                num(link.x),
                num(height_value - link.y - link.height),
                num(link.x + link.width),
                num(height_value - link.y),
                ascii_string(&link.uri)
            );
            self.object(id, &body);
            annots.push(id);
        }

        self.stream(
            image_id,
            &format!(
                "/Type /XObject /Subtype /Image /Width {} /Height {} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode",
                page.pixel_width, page.pixel_height
            ),
            page.jpeg,
            false,
        );

        let mut ops = format!("q {width} 0 0 {height} 0 0 cm /Im0 Do Q");
        let mut has_text = false;
        for run in &page.text {
            if run.text.trim().is_empty() || !(run.size > 0.0) || !(run.width > 0.0) {
                continue;
            }
            let mut natural = 0.0;
            let mut hex = String::new();
            for c in run.text.chars() {
                let Some(cid) = self.cid(c) else { continue };
                natural += f64::from(font::advance(c)) / 1000.0;
                let _ = write!(hex, "{cid:04x}");
            }
            if hex.is_empty() || natural <= 0.0 {
                continue;
            }
            if !has_text {
                ops.push_str("\nBT 3 Tr");
                has_text = true;
            }
            let scale = (100.0 * run.width / (natural * run.size)).clamp(1.0, 2000.0);
            let _ = write!(
                ops,
                "\n/F1 {} Tf {} Tz 1 0 0 1 {} {} Tm <{hex}> Tj",
                num(run.size),
                num(scale),
                num(run.x),
                num(height_value - run.baseline)
            );
        }
        if has_text {
            ops.push_str("\nET");
        }
        self.stream(content_id, "", ops.as_bytes(), true);

        let font = if has_text {
            let id = match self.font {
                Some(id) => id,
                None => {
                    let id = self.alloc();
                    self.font = Some(id);
                    id
                }
            };
            format!(" /Font << /F1 {id} 0 R >>")
        } else {
            String::new()
        };
        let annots = if annots.is_empty() {
            String::new()
        } else {
            format!(" /Annots [{}]", annots.iter().map(|id| format!("{id} 0 R")).collect::<Vec<_>>().join(" "))
        };
        let body = format!(
            "<< /Type /Page /Parent {} 0 R /MediaBox [0 0 {width} {height}] /Resources << /XObject << /Im0 {image_id} 0 R >>{font} >> /Contents {content_id} 0 R{annots} >>",
            self.pages_id
        );
        self.object(page_id, &body);
        if let Some(title) = page.bookmark.as_ref().filter(|t| !t.is_empty()) {
            self.bookmarks.push((title.clone(), page_id));
        }
    }

    /// The text layer's font objects.
    fn write_font(&mut self, font_id: u32) {
        let cid_font = self.alloc();
        let descriptor = self.alloc();
        let file = self.alloc();
        let map = self.alloc();
        let unicode = self.alloc();
        let narrow = font::NARROW;
        self.object(
            font_id,
            &format!("<< /Type /Font /Subtype /Type0 /BaseFont /{FONT_NAME} /Encoding /Identity-H /DescendantFonts [{cid_font} 0 R] /ToUnicode {unicode} 0 R >>"),
        );
        let widths = self.characters.iter().map(|&c| font::advance(c).to_string()).collect::<Vec<_>>().join(" ");
        self.object(
            cid_font,
            &format!(
                "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /{FONT_NAME} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor {descriptor} 0 R /DW {narrow} /W [1 [{widths}]] /CIDToGIDMap {map} 0 R >>"
            ),
        );
        self.object(
            descriptor,
            &format!("<< /Type /FontDescriptor /FontName /{FONT_NAME} /Flags 4 /FontBBox [0 -207 1000 718] /ItalicAngle 0 /Ascent 718 /Descent -207 /CapHeight 718 /StemV 80 /FontFile2 {file} 0 R >>"),
        );
        let glyphless = font::glyphless();
        self.stream(file, &format!("/Length1 {}", glyphless.len()), &glyphless, true);
        // Every CID but 0 draws glyph 1 (blank).
        let count = self.characters.len();
        let mut gids = vec![0u8; (count + 1) * 2];
        for cid in 1..=count {
            gids[cid * 2 + 1] = 1;
        }
        self.stream(map, "", &gids, true);
        let mut cmap = String::from(
            "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange",
        );
        for (start, chunk) in self.characters.chunks(100).enumerate() {
            let _ = write!(cmap, "\n{} beginbfchar", chunk.len());
            for (i, &c) in chunk.iter().enumerate() {
                let cid = start * 100 + i + 1;
                let _ = write!(cmap, "\n<{cid:04X}> <");
                let mut units = [0u16; 2];
                for unit in c.encode_utf16(&mut units) {
                    let _ = write!(cmap, "{unit:04X}");
                }
                cmap.push('>');
            }
            cmap.push_str("\nendbfchar");
        }
        cmap.push_str("\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend");
        self.stream(unicode, "", cmap.as_bytes(), true);
    }

    /// The document's bytes. `title` names it; `date_ms` is its creation time.
    pub fn finish(mut self, title: Option<&str>, date_ms: f64) -> Vec<u8> {
        if let Some(font_id) = self.font {
            self.write_font(font_id);
        }
        let kids = self.pages.iter().map(|id| format!("{id} 0 R")).collect::<Vec<_>>().join(" ");
        let body = format!("<< /Type /Pages /Kids [{kids}] /Count {} >>", self.pages.len());
        self.object(self.pages_id, &body);

        let mut outline = 0;
        if !self.bookmarks.is_empty() {
            outline = self.alloc();
            let n = self.bookmarks.len();
            let items: Vec<u32> = (0..n).map(|_| self.alloc()).collect();
            let marks = std::mem::take(&mut self.bookmarks);
            for (i, (title, page)) in marks.iter().enumerate() {
                let mut links = vec![format!("/Parent {outline} 0 R")];
                if i > 0 {
                    links.push(format!("/Prev {} 0 R", items[i - 1]));
                }
                if i + 1 < items.len() {
                    links.push(format!("/Next {} 0 R", items[i + 1]));
                }
                let body = format!("<< /Title {} {} /Dest [{page} 0 R /Fit] >>", text_string(title), links.join(" "));
                self.object(items[i], &body);
            }
            let body = format!("<< /Type /Outlines /First {} 0 R /Last {} 0 R /Count {} >>", items[0], items[items.len() - 1], items.len());
            self.object(outline, &body);
        }

        let title = title.filter(|t| !t.is_empty());
        let body = format!(
            "<< /Type /Catalog /Pages {} 0 R{}{} >>",
            self.pages_id,
            if outline != 0 { format!(" /Outlines {outline} 0 R /PageMode /UseOutlines") } else { String::new() },
            if title.is_some() { " /ViewerPreferences << /DisplayDocTitle true >>" } else { "" }
        );
        self.object(self.catalog, &body);
        let body = format!(
            "<< /Producer (Open Artifact) /CreationDate {}{} >>",
            date_string(date_ms),
            title.map(|t| format!(" /Title {}", text_string(t))).unwrap_or_default()
        );
        self.object(self.info, &body);

        let count = self.offsets.len() + 1;
        let xref = self.out.len();
        let mut table = format!("xref\n0 {count}\n0000000000 65535 f \n");
        for offset in &self.offsets {
            let _ = write!(table, "{:010} 00000 n \n", offset.expect("every object is written"));
        }
        let _ = write!(table, "trailer\n<< /Size {count} /Root {} 0 R /Info {} 0 R >>\nstartxref\n{xref}\n%%EOF\n", self.catalog, self.info);
        self.out.extend_from_slice(table.as_bytes());
        self.out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn latin1(bytes: &[u8]) -> String {
        bytes.iter().map(|&b| b as char).collect()
    }

    fn find(haystack: &[u8], needle: &[u8], from: usize) -> Option<usize> {
        haystack[from..].windows(needle.len()).position(|w| w == needle).map(|i| i + from)
    }

    /// A minimal reader: checks the xref table against the objects (byte
    /// offsets exact, every object a balanced dictionary, stream lengths
    /// right) and returns every object's text, streams inflated, by id.
    fn parse(bytes: &[u8]) -> BTreeMap<u32, String> {
        assert!(bytes.starts_with(b"%PDF-1.7\n"));
        assert!(bytes.ends_with(b"%%EOF\n"));
        let tail = latin1(&bytes[bytes.len() - 32..]);
        let start: usize = tail.rsplit("startxref\n").next().unwrap().trim_end_matches("\n%%EOF\n").parse().unwrap();
        let table = latin1(&bytes[start..]);
        assert!(table.starts_with("xref\n0 "));
        let mut lines = table.lines();
        lines.next();
        let count: usize = lines.next().unwrap()[2..].parse().unwrap();
        assert_eq!(lines.next().unwrap(), "0000000000 65535 f ");
        assert!(table.contains(&format!("/Size {count} ")));
        let mut objects = BTreeMap::new();
        for id in 1..count as u32 {
            let line = lines.next().unwrap();
            assert_eq!(line.len(), 19, "xref rows are 20 bytes with the newline");
            assert!(line.ends_with(" 00000 n "));
            let offset: usize = line[..10].parse().unwrap();
            let head = format!("{id} 0 obj\n");
            assert!(bytes[offset..].starts_with(head.as_bytes()), "object {id} at {offset}");
            let body_at = offset + head.len();
            let (dict, text) = match (find(bytes, b">>\nstream\n", body_at), find(bytes, b"\nendobj\n", body_at)) {
                (Some(dict_end), Some(end)) if dict_end < end => {
                    let dict = latin1(&bytes[body_at..dict_end + 2]);
                    let length: usize = dict.rsplit("/Length ").next().unwrap().split(' ').next().unwrap().parse().unwrap();
                    let data_at = dict_end + ">>\nstream\n".len();
                    assert!(bytes[data_at + length..].starts_with(b"\nendstream\nendobj\n"), "stream {id} length");
                    let data = &bytes[data_at..data_at + length];
                    let data = if dict.contains("/FlateDecode") { miniz_oxide::inflate::decompress_to_vec_zlib(data).unwrap() } else { data.to_vec() };
                    let text = format!("{dict}\n{}", latin1(&data));
                    (dict, text)
                }
                (_, Some(end)) => {
                    let text = latin1(&bytes[body_at..end]);
                    (text.clone(), text)
                }
                _ => panic!("object {id} has no end"),
            };
            assert!(dict.starts_with("<<") && dict.ends_with(">>"), "object {id} is a dictionary: {dict}");
            assert_eq!(dict.matches("<<").count(), dict.matches(">>").count(), "object {id} is balanced: {dict}");
            objects.insert(id, text);
        }
        assert!(lines.next().unwrap().starts_with("trailer"));
        objects
    }

    fn sample(text: Vec<TextRun>, links: Vec<Link>, bookmark: Option<&str>) -> Page<'static> {
        Page {
            jpeg: &[0xff, 0xd8, 0xff, 0xd9],
            pixel_width: 1920,
            pixel_height: 1080,
            width: 1440.0,
            height: 810.0,
            text,
            links,
            bookmark: bookmark.map(String::from),
        }
    }

    #[test]
    fn numbers_print_as_javascript_does() {
        assert_eq!(num(75.0), "75");
        assert_eq!(num(37.5), "37.5");
        assert_eq!(num(0.125), "0.13");
        assert_eq!(num(0.1), "0.1");
        assert_eq!(num(-3.25), "-3.25");
        assert_eq!(num(-0.001), "0");
        assert_eq!(num(1e-9), "0");
        assert_eq!(num(f64::NAN), "0");
        assert_eq!(num(1234.05), "1234.05");
    }

    #[test]
    fn strings_and_dates() {
        assert_eq!(text_string("Hi"), "<FEFF00480069>");
        assert_eq!(text_string("é"), "<FEFF00E9>");
        assert_eq!(text_string("😀"), "<FEFFD83DDE00>");
        assert_eq!(ascii_string("a(b)\\c é"), "(a\\(b\\)\\\\c )");
        assert_eq!(date_string(1_767_323_045_000.0), "(D:20260102030405Z)");
        assert_eq!(date_string(951_782_400_000.0), "(D:20000229000000Z)");
    }

    #[test]
    fn writes_pages_with_text_links_outline_and_an_exact_xref() {
        let mut pdf = Pdf::new();
        pdf.add_page(&sample(
            vec![
                TextRun { text: "Hello 世界".into(), x: 72.0, baseline: 100.0, size: 24.0, width: 140.0 },
                TextRun { text: "   ".into(), x: 0.0, baseline: 0.0, size: 24.0, width: 10.0 },
            ],
            vec![
                Link { uri: "https://example.com/a%20b".into(), x: 10.0, y: 10.0, width: 100.0, height: 20.0 },
                Link { uri: "javascript:alert(1)".into(), x: 0.0, y: 0.0, width: 1.0, height: 1.0 },
            ],
            Some("1. Intro"),
        ));
        pdf.add_page(&sample(vec![], vec![], None));
        assert_eq!(pdf.page_count(), 2);
        let bytes = pdf.finish(Some("Deck"), 1_767_323_045_000.0);
        let objects = parse(&bytes);
        let all = objects.values().cloned().collect::<Vec<_>>().join("\n");
        assert!(all.contains("/Type /Pages /Kids [4 0 R 9 0 R] /Count 2"), "{all}");
        assert!(all.contains("BT 3 Tr\n/F1 24 Tf"));
        // 6 narrow + 2 wide advances = 5 em at 24pt = 120pt; stretched to 140.
        assert!(all.contains("/F1 24 Tf 116.67 Tz 1 0 0 1 72 710 Tm <00010002000300030004000500060007> Tj"), "{all}");
        assert!(all.contains("/W [1 [500 500 500 500 500 1000 1000]]"));
        assert!(all.contains("<0007> <754C>"));
        assert!(all.contains("/ToUnicode"));
        assert!(all.contains("/Rect [10 780 110 800]"));
        assert!(all.contains("/URI (https://example.com/a%20b)"));
        assert!(!all.contains("javascript"));
        assert!(all.contains(&format!("/Title {} /Parent", text_string("1. Intro"))));
        assert!(all.contains("/Outlines"));
        assert!(all.contains("/CreationDate (D:20260102030405Z) /Title <FEFF004400650063006B>"));
        assert!(all.contains("/DisplayDocTitle true"));
        // The second page has no text: no font resource.
        let second = &objects[&9];
        assert!(!second.contains("/Font"), "{second}");
        assert!(objects[&4].contains("/Font << /F1 "));
    }

    #[test]
    fn writes_plain_picture_pages() {
        let mut pdf = Pdf::new();
        pdf.add_page(&Page { jpeg: &[1, 2, 3], pixel_width: 200, pixel_height: 100, width: 75.0, height: 37.5, text: vec![], links: vec![], bookmark: None });
        let bytes = pdf.finish(None, 0.0);
        let objects = parse(&bytes);
        let all = objects.values().cloned().collect::<Vec<_>>().join("\n");
        assert!(all.contains("/MediaBox [0 0 75 37.5]"));
        assert!(all.contains("/Width 200 /Height 100"));
        assert!(all.contains("q 75 0 0 37.5 0 0 cm /Im0 Do Q"));
        assert!(!all.contains("/Font"));
        assert!(!all.contains("/Outlines"));
        assert!(!all.contains("/Title"));
        assert_eq!(objects.len(), 6);
    }
}
