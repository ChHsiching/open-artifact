//! Writing XML as the file's parts have it: texts escaped as Excel reads them back, numbers as their shortest
//! digits, and the strings the cells share.

use hashbrown::HashMap;
use std::fmt::Write;

/// Every part starts with this.
pub const DECLARATION: &str = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n";

/// A text as an element holds it. `&`, `<`, `>` and `"` are entities, and so are a tab and a line break; a carriage
/// return, the other control characters and the two characters that are not characters (U+FFFE, U+FFFF) are
/// written as Excel writes them, `_x000D_` (the control characters of Latin-1, U+007F to U+009F, are kept as they
/// are); and an `_` that would read as the start of such a code is itself written as one, `_x005F_`.
pub fn text(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    for (i, &c) in chars.iter().enumerate() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\t' => out.push_str("&#9;"),
            '\n' => out.push_str("&#10;"),
            '_' if is_code_at(&chars, i) => out.push_str("_x005F_"),
            c if (c as u32) < 0x20 || c == '\u{fffe}' || c == '\u{ffff}' => {
                let _ = write!(out, "_x{:04X}_", c as u32);
            }
            c => out.push(c),
        }
    }
    out
}

/// Whether `_xHHHH_` starts at `i`.
fn is_code_at(chars: &[char], i: usize) -> bool {
    chars.len() >= i + 7
        && chars[i + 1] == 'x'
        && chars[i + 2..i + 6].iter().all(char::is_ascii_hexdigit)
        && chars[i + 6] == '_'
}

/// An attribute's value: `&`, `<`, `>` and `"` as entities.
pub fn attribute(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            c => out.push(c),
        }
    }
    out
}

/// An element holding a text, told to keep its spaces when it starts or ends with one: `<t>…</t>`.
pub fn text_element(name: &str, s: &str) -> String {
    let keeps_spaces = s.starts_with(char::is_whitespace) || s.ends_with(char::is_whitespace);
    let space = if keeps_spaces { " xml:space=\"preserve\"" } else { "" };
    format!("<{name}{space}>{}</{name}>", text(s))
}

/// A number as a value holds it: its shortest digits that read back as it, written out while it has at most 16
/// digits before the point and no more than three zeros after it (`1000000000000000`, `0.0001`), else with an
/// exponent (`1e16`, `1e-5`, `1.2345678901234568e20`).
pub fn number(n: f64) -> String {
    if n == 0.0 {
        return if n.is_sign_negative() { "-0".into() } else { "0".into() };
    }
    let text = format!("{:e}", n.abs());
    let (mantissa, exponent) = text.split_once('e').expect("an exponent");
    let digits: String = mantissa.chars().filter(char::is_ascii_digit).collect();
    let exponent: i32 = exponent.parse().expect("an exponent");
    let sign = if n < 0.0 { "-" } else { "" };
    let length = digits.len() as i32;
    // The power of ten just above the number: 10^(kk-1) <= n < 10^kk.
    let kk = exponent + 1;
    let k = kk - length;
    let body = if 0 <= k && kk <= 16 {
        format!("{digits}{}", "0".repeat(k as usize))
    } else if 0 < kk && kk <= 16 {
        let (int, frac) = digits.split_at(kk as usize);
        format!("{int}.{frac}")
    } else if -4 < kk && kk <= 0 {
        format!("0.{}{digits}", "0".repeat((-kk) as usize))
    } else if length == 1 {
        format!("{digits}e{}", kk - 1)
    } else {
        let (first, rest) = digits.split_at(1);
        format!("{first}.{rest}e{}", kk - 1)
    };
    format!("{sign}{body}")
}

/// The texts the cells share (`sharedStrings.xml`), each once, in the order the cells first hold them: a plain text
/// as one `<t>`, a text with looks as its runs (`<r>`), each written once as it is (a plain one and one with looks
/// are two even when they read the same).
#[derive(Default)]
pub struct SharedStrings {
    plain: HashMap<String, usize>,
    rich: HashMap<String, usize>,
    /// What each `<si>` holds.
    items: Vec<String>,
}

impl SharedStrings {
    /// The text's place among them, added when it is new.
    pub fn place(&mut self, text: &str) -> usize {
        if let Some(&i) = self.plain.get(text) {
            return i;
        }
        self.items.push(text_element("t", text));
        self.plain.insert(text.to_owned(), self.items.len() - 1);
        self.items.len() - 1
    }

    /// The place of a text with looks, given as its runs written.
    pub fn place_runs(&mut self, runs: &str) -> usize {
        if let Some(&i) = self.rich.get(runs) {
            return i;
        }
        self.items.push(runs.to_owned());
        self.rich.insert(runs.to_owned(), self.items.len() - 1);
        self.items.len() - 1
    }

    pub fn part(&self) -> String {
        let mut out = String::from(DECLARATION);
        let _ = write!(
            out,
            "<sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" uniqueCount=\"{}\">",
            self.items.len()
        );
        for item in &self.items {
            out.push_str("<si>");
            out.push_str(item);
            out.push_str("</si>");
        }
        out.push_str("</sst>");
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers() {
        assert_eq!(number(1.0), "1");
        assert_eq!(number(1e15), "1000000000000000");
        assert_eq!(number(1e16), "1e16");
        assert_eq!(number(123456789012345680000.0), "1.2345678901234568e20");
        assert_eq!(number(0.1), "0.1");
        assert_eq!(number(1e-6), "1e-6");
        assert_eq!(number(0.0001), "0.0001");
        assert_eq!(number(0.00012), "0.00012");
        assert_eq!(number(0.00001), "1e-5");
        assert_eq!(number(3.0000000000000004e-5), "3.0000000000000004e-5");
        assert_eq!(number(-1e-300), "-1e-300");
        assert_eq!(number(1234567.5), "1234567.5");
        assert_eq!(number(1.0 / 3.0), "0.3333333333333333");
    }

    #[test]
    fn texts() {
        assert_eq!(text("a\"b'<&>"), "a&quot;b'&lt;&amp;&gt;");
        assert_eq!(text("a\r\n\tb\u{1}"), "a_x000D_&#10;&#9;b_x0001_");
        assert_eq!(text("_x005F_x0041_"), "_x005F_x005F_x005F_x0041_");
        assert_eq!(text("_X0041_ x_x00_ _x004g_"), "_X0041_ x_x00_ _x004g_");
        assert_eq!(text("a\u{7f}\u{85}b\u{ffff}"), "a\u{7f}\u{85}b_xFFFF_");
        assert_eq!(text_element("t", "\u{85}"), "<t xml:space=\"preserve\">\u{85}</t>");
    }
}
