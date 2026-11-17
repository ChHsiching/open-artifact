//! A zip writer: entries deflated (or stored when deflate does not help, or
//! when asked to), UTF-8 names, no zip64. Office Open XML packages and
//! plain archives both read it.

use std::collections::BTreeSet;

use crate::deflate;

const LOCAL: u32 = 0x0403_4b50;
const CENTRAL: u32 = 0x0201_4b50;
const END: u32 = 0x0605_4b50;
/// General purpose flag: names are UTF-8.
const UTF8: u16 = 0x0800;
const STORED: u16 = 0;
const DEFLATED: u16 = 8;

/// Why an archive cannot be written.
#[derive(Debug, PartialEq, Eq)]
pub enum ZipError {
    /// Over 4 GB or 65,535 entries (would need zip64).
    TooLarge,
}

impl std::fmt::Display for ZipError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ZipError::TooLarge => f.write_str("The archive is too large (over 4 GB or 65,535 files)."),
        }
    }
}

/// CRC-32 (IEEE) of bytes.
pub fn crc32(bytes: &[u8]) -> u32 {
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(bytes);
    hasher.finalize()
}

/// An archive being written: local entries go straight into the output, the
/// central directory is kept until [`Zip::finish`].
pub struct Zip {
    out: Vec<u8>,
    central: Vec<u8>,
    names: BTreeSet<String>,
    count: usize,
    time: u16,
    date: u16,
    too_large: bool,
}

fn u16le(out: &mut Vec<u8>, value: u16) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn u32le(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
}

impl Zip {
    /// A new archive whose entries carry the DOS `time` and `date`.
    pub fn new(time: u16, date: u16) -> Zip {
        Zip { out: Vec::new(), central: Vec::new(), names: BTreeSet::new(), count: 0, time, date, too_large: false }
    }

    /// Adds an entry: deflated at `level` (1–10), or stored for level 0 or
    /// when deflate would not make it smaller. Returns false (and adds
    /// nothing) for a name already in the archive.
    pub fn add(&mut self, name: &str, data: &[u8], level: u8) -> bool {
        if self.names.contains(name) {
            return false;
        }
        self.names.insert(name.to_string());
        let crc = crc32(data);
        let deflated = if level > 0 && !data.is_empty() { Some(deflate::raw(data, level)) } else { None };
        let (method, body): (u16, &[u8]) = match &deflated {
            Some(packed) if packed.len() < data.len() => (DEFLATED, packed),
            _ => (STORED, data),
        };
        let offset = self.out.len();
        if offset > u32::MAX as usize || data.len() > u32::MAX as usize || self.count >= 0xffff {
            self.too_large = true;
        }
        let name_bytes = name.as_bytes();

        let out = &mut self.out;
        out.reserve(30 + name_bytes.len() + body.len());
        u32le(out, LOCAL);
        u16le(out, 20); // version needed
        u16le(out, UTF8);
        u16le(out, method);
        u16le(out, self.time);
        u16le(out, self.date);
        u32le(out, crc);
        u32le(out, body.len() as u32);
        u32le(out, data.len() as u32);
        u16le(out, name_bytes.len() as u16);
        u16le(out, 0); // extra
        out.extend_from_slice(name_bytes);
        out.extend_from_slice(body);

        let c = &mut self.central;
        u32le(c, CENTRAL);
        u16le(c, 20); // made by
        u16le(c, 20); // needed
        u16le(c, UTF8);
        u16le(c, method);
        u16le(c, self.time);
        u16le(c, self.date);
        u32le(c, crc);
        u32le(c, body.len() as u32);
        u32le(c, data.len() as u32);
        u16le(c, name_bytes.len() as u16);
        u16le(c, 0); // extra
        u16le(c, 0); // comment
        u16le(c, 0); // disk
        u16le(c, 0); // internal attributes
        u32le(c, 0); // external attributes
        u32le(c, offset as u32);
        c.extend_from_slice(name_bytes);
        self.count += 1;
        true
    }

    /// Entries added so far.
    pub fn len(&self) -> usize {
        self.count
    }

    /// True when nothing was added.
    pub fn is_empty(&self) -> bool {
        self.count == 0
    }

    /// The archive's bytes.
    pub fn finish(mut self) -> Result<Vec<u8>, ZipError> {
        let directory_at = self.out.len();
        if self.too_large || directory_at + self.central.len() > u32::MAX as usize {
            return Err(ZipError::TooLarge);
        }
        let directory_size = self.central.len();
        self.out.reserve(directory_size + 22);
        self.out.extend_from_slice(&self.central);
        let out = &mut self.out;
        u32le(out, END);
        u16le(out, 0); // this disk
        u16le(out, 0); // directory disk
        u16le(out, self.count as u16);
        u16le(out, self.count as u16);
        u32le(out, directory_size as u32);
        u32le(out, directory_at as u32);
        u16le(out, 0); // comment
        Ok(self.out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u16_at(bytes: &[u8], at: usize) -> u16 {
        u16::from_le_bytes([bytes[at], bytes[at + 1]])
    }
    fn u32_at(bytes: &[u8], at: usize) -> u32 {
        u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap())
    }

    /// Reads every entry back through the central directory: (name, method, data as inflated).
    pub(crate) fn read(bytes: &[u8]) -> Vec<(String, u16, Vec<u8>)> {
        let end = bytes.len() - 22;
        assert_eq!(u32_at(bytes, end), END);
        let count = u16_at(bytes, end + 10) as usize;
        let size = u32_at(bytes, end + 12) as usize;
        let mut at = u32_at(bytes, end + 16) as usize;
        assert_eq!(at + size, end, "directory ends at the end record");
        let mut out = Vec::new();
        for _ in 0..count {
            assert_eq!(u32_at(bytes, at), CENTRAL);
            let method = u16_at(bytes, at + 10);
            let crc = u32_at(bytes, at + 16);
            let packed = u32_at(bytes, at + 20) as usize;
            let raw = u32_at(bytes, at + 24) as usize;
            let name_len = u16_at(bytes, at + 28) as usize;
            let local = u32_at(bytes, at + 42) as usize;
            let name = String::from_utf8(bytes[at + 46..at + 46 + name_len].to_vec()).unwrap();
            assert_eq!(u32_at(bytes, local), LOCAL);
            assert_eq!(u16_at(bytes, local + 8), method);
            assert_eq!(u32_at(bytes, local + 14), crc);
            assert_eq!(u32_at(bytes, local + 18) as usize, packed);
            let local_name = u16_at(bytes, local + 26) as usize;
            let extra = u16_at(bytes, local + 28) as usize;
            let start = local + 30 + local_name + extra;
            let body = &bytes[start..start + packed];
            let data = match method {
                STORED => body.to_vec(),
                DEFLATED => miniz_oxide::inflate::decompress_to_vec(body).unwrap(),
                _ => panic!("method {method}"),
            };
            assert_eq!(data.len(), raw);
            assert_eq!(crc32(&data), crc, "crc of {name}");
            out.push((name, method, data));
            at += 46 + name_len;
        }
        out
    }

    #[test]
    fn crc_check_value() {
        assert_eq!(crc32(b"123456789"), 0xcbf4_3926);
        assert_eq!(crc32(b""), 0);
    }

    #[test]
    fn round_trips_deflated_and_stored_entries() {
        let text = "<p:sld>hello hello hello hello</p:sld>".repeat(200);
        let mut state = 0x2545_f491_4f6c_dd1du64;
        let noise: Vec<u8> = (0..4000)
            .map(|_| {
                state ^= state << 13;
                state ^= state >> 7;
                state ^= state << 17;
                (state >> 24) as u8
            })
            .collect();
        let mut zip = Zip::new(0x6000, 0x5a21);
        assert!(zip.add("ppt/slides/slide1.xml", text.as_bytes(), 6));
        assert!(zip.add("dir/图.png", &noise, 6));
        assert!(zip.add("stored.txt", b"kept as is", 0));
        assert!(zip.add("empty", b"", 6));
        assert!(!zip.add("stored.txt", b"dropped", 0));
        let bytes = zip.finish().unwrap();
        let entries = read(&bytes);
        let names: Vec<&str> = entries.iter().map(|e| e.0.as_str()).collect();
        assert_eq!(names, ["ppt/slides/slide1.xml", "dir/图.png", "stored.txt", "empty"]);
        assert_eq!(entries[0].1, DEFLATED);
        assert_eq!(entries[0].2, text.as_bytes());
        assert_eq!(entries[1].1, STORED, "incompressible data is stored");
        assert_eq!(entries[1].2, noise);
        assert_eq!(entries[2].1, STORED);
        assert_eq!(entries[2].2, b"kept as is");
        assert_eq!(entries[3].2, b"");
        assert!(bytes.len() < text.len() / 4 + noise.len() + 400, "{}", bytes.len());
    }

    #[test]
    fn empty_archive() {
        let bytes = Zip::new(0, 0).finish().unwrap();
        assert_eq!(bytes.len(), 22);
        assert!(read(&bytes).is_empty());
    }
}
