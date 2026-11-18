//! Text that no cell shows: a pasted formula with more than a few words of its own (words the person may not have
//! seen, as no cell shows a formula's text) is shown to the person before it is pasted.
//!
//! A formula's text between its references is cut into words: runs of ASCII letters and digits, `.`, `_` and
//! anything not ASCII (quotes, operators and the other ASCII characters part them; a text in quotes is cut the same).
//! A word weighs nothing when it is a number of digits and points (`1.5`, `...`), a cell (`A1`, `xfd1048576`), `TRUE`
//! or `FALSE` in any capitals, or a function the engine has with `(` after it (spaces, tabs and newlines aside).
//! Any other word weighs its characters: 3 for each from U+2E80 on (CJK, kana, Hangul, full-width forms, emoji), 1
//! for each other. A formula weighing more than 40 is shown first.
//!
//! A formula's text has been seen when a cell of the workbook has a formula with the same text between references,
//! whatever its references, on any sheet (a deleted one too); the formulas of one paste are shown once for each text
//! between references.

use hashbrown::HashSet;

use crate::formula::column_index;
use crate::functions;
use crate::workbook::{Input, Workbook};

/// The most a formula may weigh before it is shown first.
pub const MOST_WEIGHT: usize = 40;
/// The most texts a paste may show first; with more it is refused.
pub const MOST_TEXTS: usize = 50;

/// The texts between references of the workbook's formulas, which the person has seen (on deleted sheets too).
pub fn seen(workbook: &Workbook) -> HashSet<&[String]> {
    let cells = workbook.sheets.iter().chain(&workbook.deleted_sheets).flat_map(|sheet| sheet.cells.values());
    cells
        .filter_map(|cell| match &cell.input {
            Input::Formula { formula } => Some(formula.text_between_references.as_slice()),
            _ => None,
        })
        .collect()
}

/// What a formula's text between its references weighs.
pub fn weight(pieces: &[String]) -> usize {
    pieces.iter().map(|piece| weight_of(piece)).sum()
}

fn in_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '.' || c == '_' || !c.is_ascii()
}

fn weight_of(piece: &str) -> usize {
    let chars: Vec<char> = piece.chars().collect();
    let mut total = 0;
    let mut i = 0;
    while i < chars.len() {
        if !in_word(chars[i]) {
            i += 1;
            continue;
        }
        let start = i;
        while i < chars.len() && in_word(chars[i]) {
            i += 1;
        }
        let word: String = chars[start..i].iter().collect();
        let mut j = i;
        while j < chars.len() && matches!(chars[j], ' ' | '\t' | '\n' | '\r') {
            j += 1;
        }
        let called = chars.get(j) == Some(&'(');
        if !weightless(&word, called) {
            total += chars[start..i].iter().map(|&c| if c as u32 >= 0x2E80 { 3 } else { 1 }).sum::<usize>();
        }
    }
    total
}

fn weightless(word: &str, called: bool) -> bool {
    word.bytes().all(|b| b.is_ascii_digit() || b == b'.')
        || is_cell(word)
        || word.eq_ignore_ascii_case("true")
        || word.eq_ignore_ascii_case("false")
        || (called && functions::find(word).is_some())
}

/// `A1` to `XFD1048576`, capitals aside.
fn is_cell(word: &str) -> bool {
    let letters = word.bytes().take_while(u8::is_ascii_alphabetic).count();
    let (column, row) = word.split_at(letters);
    (1..=3).contains(&letters)
        && column_index(column).is_some_and(|c| c < 16384)
        && !row.is_empty()
        && !row.starts_with('0')
        && row.len() <= 7
        && row.bytes().all(|b| b.is_ascii_digit())
        && row.parse::<u32>().is_ok_and(|r| r <= 1_048_576)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn w(text: &str) -> usize {
        weight(&[text.to_owned()])
    }

    #[test]
    fn words() {
        assert_eq!(w("1e5"), 3);
        assert_eq!(w("1e+5"), 2);
        assert_eq!(w("#N/A"), 2);
        assert_eq!(w("#REF!"), 3);
        assert_eq!(w("Nope!A1"), 4);
        assert_eq!(w("Nope!A:A"), 6);
        assert_eq!(w("My Sheet!A1"), 7);
        assert_eq!(w("=SUM (1)+sum\n(2)+SUM"), 3);
        assert_eq!(w("XYZ(1)+R1C1(1)+_xlfn.SUM(1)"), 3 + 4 + 9);
        assert_eq!(w("\"A1\"&XFD1048576&XFE1&A1048577&A0&tRuE"), 4 + 8 + 2);
        assert_eq!(w("中文 é"), 7);
    }
}
