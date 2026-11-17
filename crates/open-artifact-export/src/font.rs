//! The "glyphless" TrueType font of the PDF text layer: two empty glyphs
//! (`.notdef` and a blank), enough for viewers to have a real embedded font
//! to load while nothing is ever drawn.

/// Default advance of a glyph, 1/1000 em.
pub const NARROW: u16 = 500;
/// Advance of wide (East Asian, emoji) glyphs.
pub const WIDE: u16 = 1000;

/// East Asian wide characters and emoji take a full em.
pub fn is_wide(c: char) -> bool {
    let cp = c as u32;
    (0x1100..=0x115f).contains(&cp)
        || (0x2e80..=0xa4cf).contains(&cp)
        || (0xac00..=0xd7a3).contains(&cp)
        || (0xf900..=0xfaff).contains(&cp)
        || (0xfe30..=0xfe4f).contains(&cp)
        || (0xff00..=0xff60).contains(&cp)
        || (0xffe0..=0xffe6).contains(&cp)
        || cp >= 0x1f000
}

/// The advance of a character in the text layer, 1/1000 em.
pub fn advance(c: char) -> u16 {
    if is_wide(c) { WIDE } else { NARROW }
}

struct Table {
    bytes: Vec<u8>,
}

impl Table {
    fn new(size: usize) -> Table {
        Table { bytes: vec![0; size] }
    }
    fn u16(mut self, at: usize, value: u16) -> Table {
        self.bytes[at..at + 2].copy_from_slice(&value.to_be_bytes());
        self
    }
    fn i16(self, at: usize, value: i16) -> Table {
        self.u16(at, value as u16)
    }
    fn u32(mut self, at: usize, value: u32) -> Table {
        self.bytes[at..at + 4].copy_from_slice(&value.to_be_bytes());
        self
    }
}

/// The OpenType checksum of bytes (padded to 4).
fn checksum(bytes: &[u8]) -> u32 {
    let mut sum = 0u32;
    for chunk in bytes.chunks(4) {
        let mut word = [0u8; 4];
        word[..chunk.len()].copy_from_slice(chunk);
        sum = sum.wrapping_add(u32::from_be_bytes(word));
    }
    sum
}

/// The font's bytes.
pub fn glyphless() -> Vec<u8> {
    let tables: [(&[u8; 4], Vec<u8>); 7] = [
        (b"glyf", Vec::new()),
        (
            b"head",
            Table::new(54)
                .u32(0, 0x0001_0000)
                .u32(4, 0x0001_0000)
                .u32(12, 0x5f0f_3cf5)
                .u16(16, 0x000b)
                .u16(18, 1000)
                .i16(36, 0)
                .i16(38, -207)
                .i16(40, 1000)
                .i16(42, 718)
                .u16(46, 3)
                .i16(48, 2)
                .bytes,
        ),
        (b"hhea", Table::new(36).u32(0, 0x0001_0000).i16(4, 718).i16(6, -207).u16(10, WIDE).i16(18, 1).u16(34, 2).bytes),
        (b"hmtx", Table::new(8).u16(0, NARROW).u16(4, NARROW).bytes),
        (b"loca", vec![0; 6]),
        (b"maxp", Table::new(32).u32(0, 0x0001_0000).u16(4, 2).u16(14, 2).bytes),
        (b"post", Table::new(32).u32(0, 0x0003_0000).i16(8, -100).i16(10, 50).bytes),
    ];
    let count = tables.len();
    let power = 1usize << (usize::BITS - 1 - count.leading_zeros());
    let mut font = Table::new(12 + count * 16)
        .u32(0, 0x0001_0000)
        .u16(4, count as u16)
        .u16(6, (power * 16) as u16)
        .u16(8, power.trailing_zeros() as u16)
        .u16(10, (count * 16 - power * 16) as u16)
        .bytes;
    let mut head_at = 0;
    for (i, (tag, data)) in tables.iter().enumerate() {
        let record = 12 + i * 16;
        let offset = font.len();
        font[record..record + 4].copy_from_slice(&tag[..]);
        font[record + 4..record + 8].copy_from_slice(&checksum(data).to_be_bytes());
        font[record + 8..record + 12].copy_from_slice(&(offset as u32).to_be_bytes());
        font[record + 12..record + 16].copy_from_slice(&(data.len() as u32).to_be_bytes());
        if &tag[..] == b"head" {
            head_at = offset;
        }
        font.extend_from_slice(data);
        while font.len() % 4 != 0 {
            font.push(0);
        }
    }
    let adjustment = 0xb1b0_afbau32.wrapping_sub(checksum(&font));
    font[head_at + 8..head_at + 12].copy_from_slice(&adjustment.to_be_bytes());
    font
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_a_sorted_truetype_font() {
        let font = glyphless();
        assert_eq!(&font[0..4], &[0, 1, 0, 0]);
        let count = u16::from_be_bytes([font[4], font[5]]) as usize;
        assert_eq!(count, 7);
        let tags: Vec<&[u8]> = (0..count).map(|i| &font[12 + i * 16..16 + i * 16]).collect();
        let mut sorted = tags.clone();
        sorted.sort();
        assert_eq!(tags, sorted);
        assert_eq!(font.len() % 4, 0);
        // The whole font sums to the magic number once adjusted.
        assert_eq!(checksum(&font), 0xb1b0_afba);
    }

    #[test]
    fn wide_characters() {
        assert!(is_wide('世'));
        assert!(is_wide('😀'));
        assert!(!is_wide('a'));
        assert!(!is_wide('é'));
    }
}
