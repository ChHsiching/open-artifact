//! Lossless PNG re-compression.
//!
//! Browsers encode canvas pictures for speed: always 8-bit RGBA, light
//! deflate. Exports are flat UI colors more often than photos, so this
//! decodes the picture and writes it again as small as it losslessly can:
//! drops an alpha channel nobody uses, turns gray pictures gray, pictures of
//! at most 256 colors into a palette (packed to 1, 2 or 4 bits when few),
//! picks a filter per row and deflates at the best level.
//!
//! Only non-interlaced pictures of 8-bit channels (and low-depth gray and
//! palette pictures) are read: what canvases and this module write;
//! anything else, or a result that is not smaller, comes back unchanged.
//! Color chunks (`gAMA`, `cHRM`, `sRGB`, `iCCP`) and `pHYs` are kept; text
//! and time chunks are dropped.

use crate::deflate;
use crate::zip::crc32;

const SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
/// Largest picture read, in pixels (a 16k × 16k canvas).
const MAX_PIXELS: u64 = 16_384 * 16_384;
/// Chunks kept as they are, in the order they are written.
const KEPT: [&[u8; 4]; 5] = [b"iCCP", b"sRGB", b"gAMA", b"cHRM", b"pHYs"];

/// A decoded picture: RGBA, 8 bits per channel.
pub struct Picture {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    /// Ancillary chunks to keep: (type, data).
    pub chunks: Vec<([u8; 4], Vec<u8>)>,
    /// The source's color type (0 gray, 2 RGB, 3 palette, 4 gray + alpha, 6 RGBA).
    pub color_type: u8,
}

fn be32(bytes: &[u8]) -> u32 {
    u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
}

fn paeth(a: u8, b: u8, c: u8) -> u8 {
    let p = a as i16 + b as i16 - c as i16;
    let pa = (p - a as i16).abs();
    let pb = (p - b as i16).abs();
    let pc = (p - c as i16).abs();
    if pa <= pb && pa <= pc {
        a
    } else if pb <= pc {
        b
    } else {
        c
    }
}

/// Decodes a non-interlaced PNG of 8-bit channels (or 1–8-bit gray and
/// palette pictures); `None` for anything else.
pub fn decode(bytes: &[u8]) -> Option<Picture> {
    if bytes.len() < 8 || bytes[..8] != SIGNATURE {
        return None;
    }
    let mut at = 8;
    let mut header: Option<(u32, u32, u8, u8, u8)> = None;
    let mut palette: &[u8] = &[];
    let mut transparency: &[u8] = &[];
    let mut data = Vec::new();
    let mut chunks = Vec::new();
    while at + 12 <= bytes.len() {
        let length = be32(&bytes[at..]) as usize;
        let kind: [u8; 4] = bytes[at + 4..at + 8].try_into().ok()?;
        let body = bytes.get(at + 8..at + 8 + length)?;
        at += 12 + length;
        match &kind {
            b"IHDR" if body.len() == 13 => header = Some((be32(body), be32(&body[4..]), body[8], body[9], body[12])),
            b"PLTE" => palette = body,
            b"tRNS" => transparency = body,
            b"IDAT" => data.extend_from_slice(body),
            b"IEND" => break,
            _ if KEPT.contains(&&kind) => chunks.push((kind, body.to_vec())),
            _ => {}
        }
    }
    let (width, height, depth, color_type, interlace) = header?;
    let channels = match color_type {
        0 | 3 => 1,
        4 => 2,
        2 => 3,
        6 => 4,
        _ => return None,
    };
    let depth_ok = match color_type {
        0 | 3 => matches!(depth, 1 | 2 | 4 | 8),
        _ => depth == 8,
    };
    if !depth_ok || interlace != 0 || width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_PIXELS {
        return None;
    }
    let (w, h) = (width as usize, height as usize);
    let bits = depth as usize;
    let stride = (w * channels * bits).div_ceil(8);
    // The filter distance: bytes per complete pixel, at least one.
    let distance = (channels * bits / 8).max(1);
    let raw = deflate::inflate_zlib_exact(&data, (stride + 1) * h)?;
    drop(data);

    // Unfilter row by row, converting to RGBA as we go.
    let mut rgba = vec![0u8; w * h * 4];
    let mut previous = vec![0u8; stride];
    let mut current = vec![0u8; stride];
    let mask = ((1u16 << bits) - 1) as u8;
    let sample = |row: &[u8], x: usize| -> u8 {
        if bits == 8 {
            return row[x];
        }
        let bit = x * bits;
        (row[bit / 8] >> (8 - bits - bit % 8)) & mask
    };
    let key: Option<[u8; 3]> = match color_type {
        0 if transparency.len() >= 2 => Some([transparency[1]; 3]),
        2 if transparency.len() >= 6 => Some([transparency[1], transparency[3], transparency[5]]),
        _ => None,
    };
    for y in 0..h {
        let line = &raw[y * (stride + 1)..(y + 1) * (stride + 1)];
        let filter = line[0];
        let line = &line[1..];
        for i in 0..stride {
            let a = if i >= distance { current[i - distance] } else { 0 };
            let b = previous[i];
            let c = if i >= distance { previous[i - distance] } else { 0 };
            current[i] = match filter {
                0 => line[i],
                1 => line[i].wrapping_add(a),
                2 => line[i].wrapping_add(b),
                3 => line[i].wrapping_add(((a as u16 + b as u16) / 2) as u8),
                4 => line[i].wrapping_add(paeth(a, b, c)),
                _ => return None,
            };
        }
        let out = &mut rgba[y * w * 4..(y + 1) * w * 4];
        for x in 0..w {
            let px = &mut out[x * 4..x * 4 + 4];
            match color_type {
                0 => {
                    let value = sample(&current, x);
                    let g = (value as u16 * 255 / mask as u16) as u8;
                    px.copy_from_slice(&[g, g, g, if key == Some([value; 3]) { 0 } else { 255 }]);
                }
                2 => {
                    let rgb = [current[x * 3], current[x * 3 + 1], current[x * 3 + 2]];
                    px.copy_from_slice(&[rgb[0], rgb[1], rgb[2], if key == Some(rgb) { 0 } else { 255 }]);
                }
                3 => {
                    let index = sample(&current, x) as usize;
                    let color = palette.get(index * 3..index * 3 + 3)?;
                    px.copy_from_slice(&[color[0], color[1], color[2], transparency.get(index).copied().unwrap_or(255)]);
                }
                4 => {
                    let g = current[x * 2];
                    px.copy_from_slice(&[g, g, g, current[x * 2 + 1]]);
                }
                _ => px.copy_from_slice(&current[x * 4..x * 4 + 4]),
            }
        }
        std::mem::swap(&mut previous, &mut current);
    }
    Some(Picture { width, height, rgba, chunks, color_type })
}

/// How a picture is stored.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Layout {
    Gray,
    GrayAlpha,
    Rgb,
    Rgba,
    /// A palette at this many bits per pixel.
    Palette(u8),
}

impl Layout {
    fn color_type(self) -> u8 {
        match self {
            Layout::Gray => 0,
            Layout::Rgb => 2,
            Layout::Palette(_) => 3,
            Layout::GrayAlpha => 4,
            Layout::Rgba => 6,
        }
    }
    fn depth(self) -> u8 {
        match self {
            Layout::Palette(bits) => bits,
            _ => 8,
        }
    }
    /// Bytes per complete pixel (the filter distance).
    fn channels(self) -> usize {
        match self {
            Layout::Gray | Layout::Palette(_) => 1,
            Layout::GrayAlpha => 2,
            Layout::Rgb => 3,
            Layout::Rgba => 4,
        }
    }
}

/// Up to 256 distinct colors, by an open-addressed table; `None` past 256.
fn palette_of(rgba: &[u8]) -> Option<Vec<u32>> {
    const SIZE: usize = 1024;
    let mut slots = [u32::MAX; SIZE];
    let mut used = [false; SIZE];
    let mut colors = Vec::new();
    let mut last = None;
    for px in rgba.chunks_exact(4) {
        let color = u32::from_be_bytes([px[0], px[1], px[2], px[3]]);
        if last == Some(color) {
            continue;
        }
        last = Some(color);
        let mut slot = (color.wrapping_mul(2_654_435_761) >> 22) as usize;
        loop {
            if !used[slot] {
                if colors.len() == 256 {
                    return None;
                }
                used[slot] = true;
                slots[slot] = color;
                colors.push(color);
                break;
            }
            if slots[slot] == color {
                break;
            }
            slot = (slot + 1) % SIZE;
        }
    }
    Some(colors)
}

/// Rows of the picture in `layout`, unfiltered (no filter bytes).
/// `palette` maps colors to indexes, sorted by color.
fn pack(picture: &Picture, layout: Layout, palette: &[(u32, u8)]) -> (Vec<u8>, usize) {
    let w = picture.width as usize;
    let h = picture.height as usize;
    let stride = match layout {
        Layout::Palette(bits) => (w * bits as usize).div_ceil(8),
        other => w * other.channels(),
    };
    let mut out = vec![0u8; stride * h];
    let index_of = |color: u32| palette.binary_search_by_key(&color, |&(c, _)| c).map_or(0, |at| palette[at].1);
    for y in 0..h {
        let row = &picture.rgba[y * w * 4..(y + 1) * w * 4];
        let line = &mut out[y * stride..(y + 1) * stride];
        match layout {
            Layout::Gray => row.chunks_exact(4).zip(line.iter_mut()).for_each(|(px, o)| *o = px[0]),
            Layout::GrayAlpha => row.chunks_exact(4).zip(line.chunks_exact_mut(2)).for_each(|(px, o)| o.copy_from_slice(&[px[0], px[3]])),
            Layout::Rgb => row.chunks_exact(4).zip(line.chunks_exact_mut(3)).for_each(|(px, o)| o.copy_from_slice(&px[..3])),
            Layout::Rgba => line.copy_from_slice(row),
            Layout::Palette(bits) => {
                let per_byte = 8 / bits as usize;
                let mut last: Option<(u32, u8)> = None;
                for (x, px) in row.chunks_exact(4).enumerate() {
                    let color = u32::from_be_bytes([px[0], px[1], px[2], px[3]]);
                    let index = match last {
                        Some((seen, index)) if seen == color => index,
                        _ => index_of(color),
                    };
                    last = Some((color, index));
                    let shift = 8 - bits as usize * (x % per_byte + 1);
                    line[x / per_byte] |= index << shift;
                }
            }
        }
    }
    (out, stride)
}

/// Filters rows: none for palettes, else the filter with the smallest sum of
/// absolute values per row (the usual heuristic).
fn filter(rows: &[u8], stride: usize, channels: usize, adaptive: bool) -> Vec<u8> {
    let h = rows.len() / stride.max(1);
    let mut out = Vec::with_capacity((stride + 1) * h);
    let zero = vec![0u8; stride];
    let mut candidates: [Vec<u8>; 5] = std::array::from_fn(|_| vec![0u8; stride]);
    for y in 0..h {
        let row = &rows[y * stride..(y + 1) * stride];
        if !adaptive {
            out.push(0);
            out.extend_from_slice(row);
            continue;
        }
        let up = if y > 0 { &rows[(y - 1) * stride..y * stride] } else { &zero[..] };
        let mut best = (u64::MAX, 0usize);
        for (kind, candidate) in candidates.iter_mut().enumerate() {
            let mut sum = 0u64;
            for i in 0..stride {
                let a = if i >= channels { row[i - channels] } else { 0 };
                let b = up[i];
                let c = if i >= channels { up[i - channels] } else { 0 };
                let value = match kind {
                    0 => row[i],
                    1 => row[i].wrapping_sub(a),
                    2 => row[i].wrapping_sub(b),
                    3 => row[i].wrapping_sub(((a as u16 + b as u16) / 2) as u8),
                    _ => row[i].wrapping_sub(paeth(a, b, c)),
                };
                candidate[i] = value;
                sum += (value as i8).unsigned_abs() as u64;
            }
            if sum < best.0 {
                best = (sum, kind);
            }
        }
        out.push(best.1 as u8);
        out.extend_from_slice(&candidates[best.1]);
    }
    out
}

fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    let start = out.len();
    out.extend_from_slice(kind);
    out.extend_from_slice(data);
    let crc = crc32(&out[start..]);
    out.extend_from_slice(&crc.to_be_bytes());
}

/// Encodes a decoded picture as small as it losslessly can at `level` (1–10).
pub fn encode(picture: &Picture, level: u8) -> Vec<u8> {
    let opaque = picture.rgba.chunks_exact(4).all(|px| px[3] == 255);
    let gray = picture.rgba.chunks_exact(4).all(|px| px[0] == px[1] && px[1] == px[2]);
    let source_gray = matches!(picture.color_type, 0 | 4);
    // An ICC profile is for gray or for color pictures: stay on its side.
    let has_profile = picture.chunks.iter().any(|(kind, _)| kind == b"iCCP");
    let may_gray = !has_profile || source_gray;
    let may_color = !has_profile || !source_gray;
    let mut palette = if may_color { palette_of(&picture.rgba) } else { None };
    if let Some(colors) = palette.as_mut() {
        // Sorted for the index lookup; transparent entries first keep tRNS short.
        colors.sort_by_key(|&c| ((c & 0xff) as u8, c));
    }
    let layout = match &palette {
        Some(colors) if colors.len() <= 16 || !(gray && opaque && may_gray) => Layout::Palette(match colors.len() {
            0..=2 => 1,
            3..=4 => 2,
            5..=16 => 4,
            _ => 8,
        }),
        _ if gray && may_gray => {
            if opaque {
                Layout::Gray
            } else {
                Layout::GrayAlpha
            }
        }
        _ if opaque => Layout::Rgb,
        _ => Layout::Rgba,
    };
    let colors = palette.unwrap_or_default();
    // The table is in (alpha, color) order; look indexes up by color.
    let mut lookup: Vec<(u32, u8)> = colors.iter().enumerate().map(|(i, &c)| (c, i as u8)).collect();
    lookup.sort_unstable();
    let (rows, stride) = pack(picture, layout, &lookup);
    let filtered = filter(&rows, stride, layout.channels(), !matches!(layout, Layout::Palette(_)));
    drop(rows);
    let compressed = deflate::zlib(&filtered, level);
    drop(filtered);

    let mut out = Vec::with_capacity(compressed.len() + 1024);
    out.extend_from_slice(&SIGNATURE);
    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&picture.width.to_be_bytes());
    ihdr.extend_from_slice(&picture.height.to_be_bytes());
    ihdr.extend_from_slice(&[layout.depth(), layout.color_type(), 0, 0, 0]);
    chunk(&mut out, b"IHDR", &ihdr);
    for kind in KEPT {
        for (_, data) in picture.chunks.iter().filter(|(k, _)| k == kind) {
            chunk(&mut out, kind, data);
        }
    }
    if let Layout::Palette(_) = layout {
        let mut plte = Vec::with_capacity(colors.len() * 3);
        let mut trns = Vec::with_capacity(colors.len());
        for color in &colors {
            let [r, g, b, a] = color.to_be_bytes();
            plte.extend_from_slice(&[r, g, b]);
            trns.push(a);
        }
        while trns.last() == Some(&255) {
            trns.pop();
        }
        chunk(&mut out, b"PLTE", &plte);
        if !trns.is_empty() {
            chunk(&mut out, b"tRNS", &trns);
        }
    }
    for part in compressed.chunks(1 << 20) {
        chunk(&mut out, b"IDAT", part);
    }
    chunk(&mut out, b"IEND", &[]);
    out
}

/// The PNG re-compressed at `level` (1–10), or `None` when it cannot be read
/// or would not get smaller.
pub fn optimize(bytes: &[u8], level: u8) -> Option<Vec<u8>> {
    let picture = decode(bytes)?;
    let out = encode(&picture, level);
    (out.len() < bytes.len()).then_some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A PNG as a browser writes one: RGBA, filter none, fast deflate.
    fn browser_png(width: u32, height: u32, pixel: impl Fn(u32, u32) -> [u8; 4]) -> Vec<u8> {
        let mut raw = Vec::new();
        for y in 0..height {
            raw.push(0);
            for x in 0..width {
                raw.extend_from_slice(&pixel(x, y));
            }
        }
        let mut out = SIGNATURE.to_vec();
        let mut ihdr = width.to_be_bytes().to_vec();
        ihdr.extend_from_slice(&height.to_be_bytes());
        ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
        chunk(&mut out, b"IHDR", &ihdr);
        chunk(&mut out, b"tEXt", b"Software\0test");
        chunk(&mut out, b"sRGB", &[0]);
        chunk(&mut out, b"IDAT", &deflate::zlib(&raw, 1));
        chunk(&mut out, b"IEND", &[]);
        out
    }

    fn same_pixels(a: &[u8], b: &[u8]) {
        let a = decode(a).unwrap();
        let b = decode(b).unwrap();
        assert_eq!((a.width, a.height), (b.width, b.height));
        if let Some(i) = a.rgba.iter().zip(&b.rgba).position(|(x, y)| x != y) {
            panic!("pixels differ at byte {i}: {:?} vs {:?}", &a.rgba[i / 4 * 4..i / 4 * 4 + 4], &b.rgba[i / 4 * 4..i / 4 * 4 + 4]);
        }
    }

    fn color_type(png: &[u8]) -> (u8, u8) {
        (png[24], png[25])
    }

    #[test]
    fn flat_pictures_become_palettes() {
        let source = browser_png(300, 200, |x, y| if (x / 50 + y / 50) % 2 == 0 { [255, 255, 255, 255] } else { [30, 120, 220, 255] });
        let out = optimize(&source, 9).unwrap();
        assert_eq!(color_type(&out), (1, 3), "two colors: a 1-bit palette");
        assert!(out.len() * 4 < source.len(), "{} → {}", source.len(), out.len());
        same_pixels(&source, &out);
        let text = String::from_utf8_lossy(&out);
        assert!(text.contains("sRGB"));
        assert!(!text.contains("tEXt"));
    }

    #[test]
    fn transparent_palettes_keep_alpha() {
        let source = browser_png(64, 64, |x, y| match (x + y) % 3 {
            0 => [0, 0, 0, 0],
            1 => [255, 0, 0, 128],
            _ => [0, 255, 0, 255],
        });
        let out = optimize(&source, 9).unwrap();
        assert_eq!(color_type(&out), (2, 3));
        assert!(String::from_utf8_lossy(&out).contains("tRNS"));
        same_pixels(&source, &out);
    }

    #[test]
    fn many_colors_stay_truecolor() {
        let source = browser_png(256, 128, |x, y| [x as u8, y as u8, (x ^ y) as u8, 255]);
        let out = optimize(&source, 9).unwrap();
        assert_eq!(color_type(&out), (8, 2), "opaque: alpha dropped");
        same_pixels(&source, &out);
        let gradient = browser_png(256, 64, |x, y| [x as u8, x as u8, x as u8, (y * 4) as u8]);
        let out = optimize(&gradient, 9).unwrap();
        assert_eq!(color_type(&out), (8, 4), "gray with alpha");
        same_pixels(&gradient, &out);
        let rgba = browser_png(256, 64, |x, y| [x as u8, y as u8, 7, (x + y) as u8]);
        let out = optimize(&rgba, 9).unwrap();
        assert_eq!(color_type(&out), (8, 6));
        same_pixels(&rgba, &out);
    }

    #[test]
    fn reads_its_own_output_and_filtered_input() {
        let source = browser_png(97, 41, |x, y| [(x * 3) as u8, (y * 5) as u8, ((x * y) % 251) as u8, 255]);
        let once = encode(&decode(&source).unwrap(), 9);
        let twice = encode(&decode(&once).unwrap(), 9);
        same_pixels(&source, &once);
        same_pixels(&once, &twice);
    }

    #[test]
    fn leaves_what_it_cannot_read() {
        assert!(optimize(b"not a png", 9).is_none());
        let mut sixteen = browser_png(2, 2, |_, _| [0; 4]);
        sixteen[24] = 16;
        assert!(optimize(&sixteen, 9).is_none());
    }
}
