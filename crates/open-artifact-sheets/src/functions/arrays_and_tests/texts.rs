//! DOLLAR, ENCODEURL, FIXED, JOIN, REGEXTEST, TEXTAFTER and TEXTBEFORE.

use std::rc::Rc;

use super::whole_or_none;
use crate::coerce;
use crate::evaluate::Operand;
use crate::functions::{math, text as text_fns, value, Answer, Arg, CallContext};
use crate::locale::Locale;
use crate::number_format::{NumberFormat, Room};
use crate::value::{CellError, Value};

use text_fns::{text_answer, LONGEST_TEXT_IN_BYTES};

/// Places of decimals past which DOLLAR and FIXED are #VALUE!.
const MOST_PLACES: f64 = 128.0;

/// The locales whose money DOLLAR shows with no decimals unless told otherwise.
const MONEY_WITH_NO_DECIMALS: &[&str] =
    &["es-CL", "es-CO", "es-PY", "hu-HU", "id-ID", "is-IS", "ja-JP", "ko-KR", "lo-LA", "sq-AL", "ur-PK", "vi-VN"];

/// A number rounded to `places` (tens, hundreds… when negative) half away from zero, as ROUND does; never -0.
fn rounded(n: f64, places: f64, cx: &mut CallContext) -> Result<f64, CellError> {
    let args = [Arg::Value(Value::Number(n)), Arg::Value(Value::Number(places))];
    match math::call("ROUND", &args, cx) {
        Some(Ok(Operand::Value(Value::Number(r)))) => Ok(if r == 0.0 { 0.0 } else { r }),
        Some(Err(e)) => Err(e),
        _ => Err(CellError::Value),
    }
}

/// `.00…` for `places` decimals; nothing for none.
fn decimals(places: f64) -> String {
    if places > 0.0 {
        format!(".{}", "0".repeat(places as usize))
    } else {
        String::new()
    }
}

/// A number shown as text with a number format pattern, the way the locale shows it; one it can't show is #VALUE!.
fn shown(n: f64, pattern: &str, locale: &Locale) -> Answer {
    let format = NumberFormat::parse(pattern).map_err(|_| CellError::Value)?;
    let shown = format.show_number_in(n, locale, Room::AsText).map_err(|_| CellError::Value)?;
    text_answer(shown.text)
}

/// DOLLAR(number, [places]): the number rounded and shown as the locale's money, with 2 decimals unless the
/// locale's money has none (0 too when places is left out).
pub fn dollar(args: &[Arg], cx: &mut CallContext) -> Answer {
    let locale = cx.locale;
    let n = args[0].number(locale)?;
    let places = match args.get(1) {
        None if MONEY_WITH_NO_DECIMALS.contains(&locale.tag) => 0.0,
        None => 2.0,
        arg => whole_or_none(arg, locale)?.unwrap_or(0.0),
    };
    if places >= MOST_PLACES {
        return Err(CellError::Value);
    }
    let r = rounded(n, places, cx)?;
    let pattern = locale.patterns_of_money.with_two_decimals.replacen("0.00", &format!("0{}", decimals(places)), 1);
    shown(r, &pattern, locale)
}

/// FIXED(number, [places], [no thousands separators]): the number rounded to 2 places (or as many as given) and
/// shown with the locale's signs, its thousands grouped unless told not to.
pub fn fixed(args: &[Arg], cx: &mut CallContext) -> Answer {
    let locale = cx.locale;
    let n = args[0].number(locale)?;
    let places = whole_or_none(args.get(1), locale)?.unwrap_or(2.0);
    if places >= MOST_PLACES {
        return Err(CellError::Value);
    }
    let plain = match args.get(2) {
        None => false,
        Some(arg) => arg.boolean()?,
    };
    let r = rounded(n, places, cx)?;
    let pattern = format!("{}{}", if plain { "0" } else { "#,##0" }, decimals(places));
    shown(r, &pattern, locale)
}

/// ENCODEURL(text): the text's UTF-8 with every byte but letters, digits and `-_.~` written as `%XX`.
pub fn encode_url(args: &[Arg], locale: &Locale) -> Answer {
    let t = args[0].text(locale)?;
    let mut out = String::with_capacity(t.len());
    for b in t.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    text_answer(out)
}

/// JOIN(separator, values, …): every value of the arguments as text, the separator between them (blank cells and
/// left-out arguments too, as empty text).
pub fn join(args: &[Arg], locale: &Locale) -> Answer {
    let separator = args[0].text(locale)?;
    let mut pieces: Vec<Rc<str>> = Vec::new();
    for arg in &args[1..] {
        match arg {
            Arg::Missing => pieces.push("".into()),
            Arg::Value(v) => pieces.push(coerce::to_text(v, locale)?),
            Arg::Cells(cells) => {
                for v in cells.values() {
                    pieces.push(coerce::to_text(v, locale)?);
                }
            }
            Arg::Place(_) => return Err(CellError::Value),
        }
    }
    let mut out = String::new();
    for (i, piece) in pieces.iter().enumerate() {
        if i > 0 {
            out.push_str(&separator);
        }
        out.push_str(piece);
        if out.len() > LONGEST_TEXT_IN_BYTES {
            return Err(CellError::Value);
        }
    }
    text_answer(out)
}

/// REGEXTEST(text, expression, [ignore case]): REGEXMATCH, in any case when asked.
pub fn regex_test(args: &[Arg], cx: &mut CallContext) -> Answer {
    let ignore_case = match args.get(2) {
        None => false,
        Some(arg) => arg.boolean()?,
    };
    let mut args = args[..2].to_vec();
    if ignore_case {
        let pattern = args[1].text(cx.locale)?;
        args[1] = Arg::Value(Value::Text(format!("(?i){pattern}").into()));
    }
    text_fns::call("REGEXMATCH", &args, cx).unwrap_or(Err(CellError::Name))
}

/// A character as compared in any case: its lowercase when that is one character.
fn folded(c: char) -> char {
    let mut lower = c.to_lowercase();
    match (lower.next(), lower.next()) {
        (Some(l), None) => l,
        _ => c,
    }
}

/// TEXTAFTER(text, separator, [which match], [ignore case], [end as separator], [if not found]) and TEXTBEFORE: the
/// text after (before) a match of the separator, the nth from the start or, when negative, from the end; matches do
/// not overlap, and an empty separator matches at every position. With the end as a separator, the end (the start,
/// counting from the end) is one more match. No such match is `if not found`, else #N/A; match 0 is #VALUE!.
pub fn text_around(args: &[Arg], after: bool, locale: &Locale) -> Answer {
    let t: Vec<char> = args[0].text(locale)?.chars().collect();
    let separator: Vec<char> = args[1].text(locale)?.chars().collect();
    let which = whole_or_none(args.get(2), locale)?.unwrap_or(1.0);
    let flag = |i: usize| -> Result<bool, CellError> {
        match args.get(i) {
            None => Ok(false),
            Some(arg) => arg.boolean(),
        }
    };
    let ignore_case = flag(3)?;
    let end_matches = flag(4)?;
    if which == 0.0 {
        return Err(CellError::Value);
    }
    let same = |a: char, b: char| if ignore_case { folded(a) == folded(b) } else { a == b };
    let matches_at =
        |i: usize| i + separator.len() <= t.len() && (0..separator.len()).all(|j| same(t[i + j], separator[j]));
    let wanted = which.abs().min(usize::MAX as f64) as usize;
    let mut found = None;
    let mut count = 0;
    if which > 0.0 {
        let mut i = 0;
        while i <= t.len() {
            if matches_at(i) {
                count += 1;
                if count == wanted {
                    found = Some((i, separator.len()));
                    break;
                }
                i += separator.len().max(1);
            } else {
                i += 1;
            }
        }
        if found.is_none() && end_matches && count + 1 == wanted {
            found = Some((t.len(), 0));
        }
    } else {
        let mut limit = t.len() as isize;
        let mut i = limit - separator.len() as isize;
        while i >= 0 {
            let at = i as usize;
            if at as isize + separator.len() as isize <= limit && matches_at(at) {
                count += 1;
                if count == wanted {
                    found = Some((at, separator.len()));
                    break;
                }
                limit = if separator.is_empty() { i - 1 } else { i };
                i = limit - separator.len() as isize;
            } else {
                i -= 1;
            }
        }
        if found.is_none() && end_matches && count + 1 == wanted {
            found = Some((0, 0));
        }
    }
    match found {
        Some((i, len)) => {
            let part: String = if after { t[i + len..].iter().collect() } else { t[..i].iter().collect() };
            text_answer(part)
        }
        None => match args.get(5) {
            Some(arg) => value(arg.value()?),
            None => Err(CellError::NotAvailable),
        },
    }
}
