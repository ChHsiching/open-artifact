//! The text functions.
//!
//! Text is counted in characters (Unicode scalar values): `LEN("😀")` is 1, and positions in FIND, MID and the
//! like count the same way. A text a function answers holds at most 32,767 bytes of UTF-8; a longer one is
//! #VALUE!.

use std::rc::Rc;

use regex::{Captures, Regex, RegexBuilder};

use crate::coerce;
use crate::functions::{array, boolean, number, text, Answer, Arg, CallContext};
use crate::locale::{self, Locale};
use crate::number_format::{NumberFormat, Room};
use crate::typed_text;
use crate::value::{Array, CellError, Value};

/// The most bytes (of UTF-8) a text may hold.
pub const LONGEST_TEXT_IN_BYTES: usize = 32_767;

/// Calls a text function by name; `None` for one it doesn't have.
pub fn call(name: &str, args: &[Arg], cx: &mut CallContext) -> Option<Answer> {
    let locale = cx.locale;
    Some(match name {
        "CHAR" => char_(&args[0], locale),
        "CLEAN" => args[0].text(locale).and_then(|t| text_answer(t.chars().filter(|c| !c.is_control()).collect())),
        "CODE" | "UNICODE" => args[0].text(locale).and_then(|t| match t.chars().next() {
            Some(c) => number(c as u32 as f64),
            None => Err(CellError::Value),
        }),
        "CONCAT" => concat(args, locale),
        "CONCATENATE" => concatenate(args, locale),
        "EXACT" => args[0].text(locale).and_then(|a| boolean(a == args[1].text(locale)?)),
        "FIND" => find(args, false, locale),
        "LEFT" => left_or_right(args, true, locale),
        "LEN" => args[0].text(locale).and_then(|t| number(t.chars().count() as f64)),
        "LOWER" => args[0].text(locale).and_then(|t| text_answer(t.to_lowercase())),
        "MID" => mid(args, locale),
        "PROPER" => args[0].text(locale).and_then(|t| text_answer(proper(&t))),
        "REGEXEXTRACT" => regex_extract(args, locale),
        "REGEXMATCH" => regex_match(args, locale),
        "REGEXREPLACE" => regex_replace(args, locale),
        "REPLACE" => replace(args, locale),
        "REPT" => rept(args, locale),
        "RIGHT" => left_or_right(args, false, locale),
        "SEARCH" => find(args, true, locale),
        "SPLIT" => split(args, locale),
        "SUBSTITUTE" => substitute(args, locale),
        "T" => args[0].value().and_then(|v| match v {
            Value::Text(t) => text(t),
            _ => text(""),
        }),
        "TEXT" => text_of_number(args, locale),
        "TEXTJOIN" => text_join(args, locale),
        "TRIM" => args[0].text(locale).and_then(|t| {
            text_answer(t.split(' ').filter(|w| !w.is_empty()).collect::<Vec<_>>().join(" "))
        }),
        "UNICHAR" => unichar(&args[0], locale),
        "UPPER" => args[0].text(locale).and_then(|t| text_answer(t.to_uppercase())),
        "VALUE" => args[0].number(locale).and_then(number),
        _ => return None,
    })
}

/// A text answer: one longer than [`LONGEST_TEXT_IN_BYTES`] is #VALUE!.
pub fn text_answer(s: String) -> Answer {
    if s.len() > LONGEST_TEXT_IN_BYTES {
        return Err(CellError::Value);
    }
    text(s)
}

/// A count of characters (LEFT, MID, REPT, …): below 0 is #VALUE!, a fraction is cut off.
fn count_of(arg: &Arg, locale: &Locale) -> Result<usize, CellError> {
    let n = arg.number(locale)?;
    if n < 0.0 {
        return Err(CellError::Value);
    }
    Ok(n.trunc() as usize)
}

/// A position, from 1 (MID, FIND, …): a fraction is cut off, and below 1 is #VALUE!.
fn position_of(arg: &Arg, locale: &Locale) -> Result<usize, CellError> {
    let n = arg.number(locale)?.trunc();
    if n < 1.0 {
        return Err(CellError::Value);
    }
    Ok(n as usize)
}

/// CHAR: the character of a code from 1 to 255 (Latin-1).
fn char_(arg: &Arg, locale: &Locale) -> Answer {
    let n = arg.number(locale)?.trunc();
    if !(1.0..=255.0).contains(&n) {
        return Err(CellError::Value);
    }
    text(char::from(n as u8).to_string())
}

/// UNICHAR: the character of a code point; a surrogate is #N/A.
fn unichar(arg: &Arg, locale: &Locale) -> Answer {
    let n = arg.number(locale)?.trunc();
    if !(1.0..=1_114_111.0).contains(&n) {
        return Err(CellError::Value);
    }
    match char::from_u32(n as u32) {
        Some(c) => text(c.to_string()),
        None => Err(CellError::NotAvailable),
    }
}

/// CONCAT: every cell of every argument, row by row; blanks are "".
fn concat(args: &[Arg], locale: &Locale) -> Answer {
    let mut out = String::new();
    for arg in args {
        match arg {
            Arg::Missing => {}
            Arg::Value(v) => out.push_str(&coerce::to_text(v, locale)?),
            Arg::Cells(cells) => {
                for v in cells.values() {
                    out.push_str(&coerce::to_text(v, locale)?);
                }
            }
            Arg::Place(_) => return Err(CellError::Value),
        }
        if out.len() > LONGEST_TEXT_IN_BYTES {
            return Err(CellError::Value);
        }
    }
    text_answer(out)
}

/// CONCATENATE: one value each.
fn concatenate(args: &[Arg], locale: &Locale) -> Answer {
    let mut out = String::new();
    for arg in args {
        out.push_str(&arg.text(locale)?);
        if out.len() > LONGEST_TEXT_IN_BYTES {
            return Err(CellError::Value);
        }
    }
    text_answer(out)
}

/// TEXTJOIN(separator, skip empty, text, …): a left-out text is an empty piece.
fn text_join(args: &[Arg], locale: &Locale) -> Answer {
    let separator = args[0].text(locale)?;
    let skip_empty = args[1].boolean()?;
    let mut pieces: Vec<Rc<str>> = Vec::new();
    for arg in &args[2..] {
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
    let mut first = true;
    for piece in pieces.iter().filter(|p| !(skip_empty && p.is_empty())) {
        if !first {
            out.push_str(&separator);
        }
        first = false;
        out.push_str(piece);
        if out.len() > LONGEST_TEXT_IN_BYTES {
            return Err(CellError::Value);
        }
    }
    text_answer(out)
}

/// LEFT and RIGHT: the count is 1 when not given, 0 when left out (`LEFT("abc",)`).
fn left_or_right(args: &[Arg], left: bool, locale: &Locale) -> Answer {
    let t = args[0].text(locale)?;
    let count = match args.get(1) {
        None => 1,
        Some(arg) => count_of(arg, locale)?,
    };
    let chars: Vec<char> = t.chars().collect();
    let count = count.min(chars.len());
    let part = if left { &chars[..count] } else { &chars[chars.len() - count..] };
    text(part.iter().collect::<String>())
}

/// MID(text, start, count).
fn mid(args: &[Arg], locale: &Locale) -> Answer {
    let t = args[0].text(locale)?;
    let start = position_of(&args[1], locale)?;
    let count = count_of(&args[2], locale)?;
    text(t.chars().skip(start - 1).take(count).collect::<String>())
}

/// REPLACE(text, start, count, new text).
fn replace(args: &[Arg], locale: &Locale) -> Answer {
    let t = args[0].text(locale)?;
    let start = position_of(&args[1], locale)?;
    let count = count_of(&args[2], locale)?;
    let new = args[3].text(locale)?;
    let chars: Vec<char> = t.chars().collect();
    let from = (start - 1).min(chars.len());
    let to = from.saturating_add(count).min(chars.len());
    let mut out: String = chars[..from].iter().collect();
    out.push_str(&new);
    out.extend(&chars[to..]);
    text_answer(out)
}

/// REPT(text, times).
fn rept(args: &[Arg], locale: &Locale) -> Answer {
    let t = args[0].text(locale)?;
    let times = count_of(&args[1], locale)?;
    if t.is_empty() || times == 0 {
        return text("");
    }
    match t.len().checked_mul(times) {
        Some(n) if n <= LONGEST_TEXT_IN_BYTES => text(t.repeat(times)),
        _ => Err(CellError::Value),
    }
}

/// SUBSTITUTE(text, old, new, [which match]): matches are counted left to right, without overlapping.
fn substitute(args: &[Arg], locale: &Locale) -> Answer {
    let t = args[0].text(locale)?;
    let old = args[1].text(locale)?;
    let new = args[2].text(locale)?;
    let which = match args.get(3) {
        None => None,
        Some(arg) => Some(position_of(arg, locale)?),
    };
    if old.is_empty() {
        return text(t);
    }
    match which {
        None => text_answer(t.replace(&*old, &new)),
        Some(n) => match t.match_indices(&*old).nth(n - 1) {
            Some((at, _)) => text_answer(format!("{}{}{}", &t[..at], new, &t[at + old.len()..])),
            None => text(t),
        },
    }
}

/// PROPER: each run of letters starts with a capital and goes on in lowercase; anything else (digits,
/// apostrophes, marks) starts a new run.
fn proper(t: &str) -> String {
    let mut out = String::with_capacity(t.len());
    let mut word = String::new();
    let flush = |word: &mut String, out: &mut String| {
        let mut chars = word.chars();
        if let Some(first) = chars.next() {
            out.extend(first.to_uppercase());
            // The rest in lowercase, seen as part of the word (a final sigma is ς).
            let lower = word.to_lowercase();
            let skip: usize = first.to_lowercase().map(char::len_utf8).sum();
            out.push_str(&lower[skip..]);
        }
        word.clear();
    };
    for c in t.chars() {
        if c.is_alphabetic() {
            word.push(c);
        } else {
            flush(&mut word, &mut out);
            out.push(c);
        }
    }
    flush(&mut word, &mut out);
    out
}

/// FIND and SEARCH(text to find, text, [start]): SEARCH ignores case and takes `*`, `?` and `~`.
fn find(args: &[Arg], search: bool, locale: &Locale) -> Answer {
    let needle = args[0].text(locale)?;
    let haystack = args[1].text(locale)?;
    let start = match args.get(2) {
        None => 1,
        Some(arg) => position_of(arg, locale)?,
    };
    let text: Vec<char> = haystack.chars().collect();
    if start > text.len().max(1) {
        return Err(CellError::Value);
    }
    let found = if search {
        let pattern = wildcard_pattern(&needle);
        (start - 1..=text.len()).find(|&i| matches_prefix(&pattern, &text[i..]))
    } else {
        let needle: Vec<char> = needle.chars().collect();
        (start - 1..=text.len()).find(|&i| text[i..].starts_with(&needle))
    };
    match found {
        Some(i) => number((i + 1) as f64),
        None => Err(CellError::Value),
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Piece {
    Char(char),
    AnyChar,
    AnyRun,
}

fn wildcard_pattern(text: &str) -> Vec<Piece> {
    let mut out = Vec::new();
    let mut chars = text.chars();
    while let Some(c) = chars.next() {
        out.push(match c {
            '*' => Piece::AnyRun,
            '?' => Piece::AnyChar,
            '~' => Piece::Char(chars.next().unwrap_or('~')),
            c => Piece::Char(c),
        });
    }
    out
}

/// Two characters the same in any case: their lowercase forms match.
fn same_in_any_case(a: char, b: char) -> bool {
    a == b || a.to_lowercase().eq(b.to_lowercase())
}

/// Whether a pattern matches the start of a text.
fn matches_prefix(pattern: &[Piece], text: &[char]) -> bool {
    // Greedy matching with one point to come back to: the last `*`. A pattern that runs out matches.
    let (mut p, mut t) = (0, 0);
    let mut back: Option<(usize, usize)> = None;
    loop {
        match pattern.get(p) {
            None => return true,
            Some(Piece::AnyRun) => {
                back = Some((p, t));
                p += 1;
                continue;
            }
            Some(Piece::AnyChar) if t < text.len() => {
                p += 1;
                t += 1;
                continue;
            }
            Some(Piece::Char(c)) if t < text.len() && same_in_any_case(*c, text[t]) => {
                p += 1;
                t += 1;
                continue;
            }
            _ => {}
        }
        match back {
            Some((bp, bt)) if bt < text.len() => {
                back = Some((bp, bt + 1));
                p = bp + 1;
                t = bt + 1;
            }
            _ => return false,
        }
    }
}

/// SPLIT(text, separator, [split at each character], [skip empty]): a row of pieces; one that reads as a plain
/// number in the locale (`12`, `-1.5`, `1e3`; `-1,5` in de-DE) is that number.
fn split(args: &[Arg], locale: &Locale) -> Answer {
    let t = args[0].text(locale)?;
    let separator = args[1].text(locale)?;
    let each_character = args.get(2).map_or(Ok(true), Arg::boolean)?;
    let skip_empty = args.get(3).map_or(Ok(true), Arg::boolean)?;
    if separator.is_empty() {
        return Err(CellError::Value);
    }
    let pieces: Vec<&str> = if each_character {
        let set: Vec<char> = separator.chars().collect();
        t.split(|c| set.contains(&c)).collect()
    } else {
        t.split(&*separator).collect()
    };
    let mut values: Vec<Value> = pieces
        .into_iter()
        .filter(|p| !(skip_empty && p.is_empty()))
        .map(|p| match plain_number(p, locale) {
            Some(n) => Value::Number(n),
            None => Value::text(p),
        })
        .collect();
    if values.is_empty() {
        values.push(Value::text(""));
    }
    let n = values.len();
    array(Array::new(1, n, values))
}

/// A plain number, with spaces, tabs and line breaks around it: a sign, digits with the locale's decimal sign, an
/// exponent; no groups, signs of currency or percent.
fn plain_number(s: &str, locale: &Locale) -> Option<f64> {
    let s = s.trim_matches([' ', '\t', '\n', '\r']);
    let body = s.strip_prefix(['+', '-']).unwrap_or(s);
    let (mantissa, exponent) = match body.find(['e', 'E']) {
        Some(i) => (&body[..i], Some(&body[i + 1..])),
        None => (body, None),
    };
    let decimal = locale.decimal_sign.sign();
    let (int, frac) = mantissa.split_once(decimal).unwrap_or((mantissa, ""));
    if int.is_empty() && frac.is_empty() {
        return None;
    }
    if !int.bytes().all(|b| b.is_ascii_digit()) || !frac.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    if let Some(e) = exponent {
        let digits = e.strip_prefix(['+', '-']).unwrap_or(e);
        if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
    }
    let n: f64 = s.replace(decimal, ".").parse().ok()?;
    n.is_finite().then_some(n)
}

/// The text a regular expression looks in: text, or blank as ""; a number or a boolean is #VALUE!.
fn regex_subject(arg: &Arg) -> Result<Rc<str>, CellError> {
    match arg.value()? {
        Value::Text(t) => Ok(t),
        Value::Blank => Ok("".into()),
        Value::Error(e) => Err(e),
        Value::Number(_) | Value::Boolean(_) => Err(CellError::Value),
    }
}

/// A regular expression: `\d`, `\w`, `\s` and the word boundaries are ASCII only, while `.`, `\p{…}` and
/// case-insensitive matching are Unicode; a pattern that turns Unicode off, or does not compile, is #VALUE!.
fn regex_of(arg: &Arg, locale: &Locale) -> Result<Regex, CellError> {
    let pattern = arg.text(locale)?;
    let rewritten = ascii_classes(&pattern).ok_or(CellError::Value)?;
    RegexBuilder::new(&rewritten).build().map_err(|_| CellError::Value)
}

/// A pattern with its Perl classes and word boundaries made ASCII: `\w` as `[[:word:]]`, `\b` as `(?-u:\b)`.
/// `None` for a pattern that turns the `u` flag off itself.
fn ascii_classes(pattern: &str) -> Option<String> {
    let chars: Vec<char> = pattern.chars().collect();
    let mut out = String::with_capacity(pattern.len() + 16);
    // How deep in brackets: 0 outside a class.
    let mut depth = 0usize;
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            '\\' if i + 1 < chars.len() => {
                let e = chars[i + 1];
                i += 2;
                let class = match e {
                    'd' => Some(("digit", false)),
                    'D' => Some(("digit", true)),
                    'w' => Some(("word", false)),
                    'W' => Some(("word", true)),
                    's' => Some(("space", false)),
                    'S' => Some(("space", true)),
                    _ => None,
                };
                if let Some((name, negated)) = class {
                    let caret = if negated { "^" } else { "" };
                    if depth == 0 {
                        out.push_str(&format!("[[:{caret}{name}:]]"));
                    } else {
                        out.push_str(&format!("[:{caret}{name}:]"));
                    }
                    continue;
                }
                if depth == 0 && matches!(e, 'b' | 'B' | '<' | '>') {
                    // `\b{start}` and the like keep their braces.
                    let mut end = i;
                    if e == 'b' && chars.get(i) == Some(&'{') {
                        if let Some(close) = chars[i..].iter().position(|&x| x == '}') {
                            end = i + close + 1;
                        }
                    }
                    out.push_str("(?-u:\\");
                    out.push(e);
                    out.extend(&chars[i..end]);
                    out.push(')');
                    i = end;
                    continue;
                }
                out.push('\\');
                out.push(e);
            }
            '[' => {
                out.push('[');
                i += 1;
                if depth > 0 && chars.get(i) == Some(&':') {
                    // A POSIX class, `[:alpha:]`, up to its `:]`.
                    while i < chars.len() {
                        out.push(chars[i]);
                        if chars[i] == ']' {
                            i += 1;
                            break;
                        }
                        i += 1;
                    }
                    continue;
                }
                depth += 1;
                // `]` first in a class is itself.
                if chars.get(i) == Some(&'^') {
                    out.push('^');
                    i += 1;
                }
                if chars.get(i) == Some(&']') {
                    out.push(']');
                    i += 1;
                }
            }
            ']' if depth > 0 => {
                depth -= 1;
                out.push(']');
                i += 1;
            }
            '(' if depth == 0 && chars.get(i + 1) == Some(&'?') => {
                // Flags: `(?i)`, `(?-u:…)`. Turning `u` off is not taken.
                let mut j = i + 2;
                let mut negated = false;
                while j < chars.len() && chars[j] != ')' && chars[j] != ':' {
                    match chars[j] {
                        '-' => negated = true,
                        'u' if negated => return None,
                        _ => {}
                    }
                    if !chars[j].is_ascii_alphabetic() && chars[j] != '-' {
                        break;
                    }
                    j += 1;
                }
                out.push('(');
                i += 1;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    Some(out)
}

fn regex_match(args: &[Arg], locale: &Locale) -> Answer {
    let t = regex_subject(&args[0])?;
    let re = regex_of(&args[1], locale)?;
    boolean(re.is_match(&t))
}

/// REGEXEXTRACT: the first match, or its first group when the expression has groups ("" when that group takes no
/// part); no match is #N/A.
fn regex_extract(args: &[Arg], locale: &Locale) -> Answer {
    let t = regex_subject(&args[0])?;
    let re = regex_of(&args[1], locale)?;
    let Some(caps) = re.captures(&t) else {
        return Err(CellError::NotAvailable);
    };
    let group = if re.captures_len() > 1 { 1 } else { 0 };
    text(caps.get(group).map_or("", |m| m.as_str()).to_owned())
}

/// REGEXREPLACE: every match swapped for the new text, where `$0`…`$99` is a group and `\` takes the next
/// character as it is.
fn regex_replace(args: &[Arg], locale: &Locale) -> Answer {
    let t = regex_subject(&args[0])?;
    let re = regex_of(&args[1], locale)?;
    let new: Vec<char> = args[2].text(locale)?.chars().collect();
    let groups = re.captures_len() - 1;
    let mut out = String::new();
    let mut last = 0;
    for caps in re.captures_iter(&t) {
        let whole = caps.get(0).expect("a match");
        out.push_str(&t[last..whole.start()]);
        expand(&new, &caps, groups, &mut out);
        last = whole.end();
        if out.len() > LONGEST_TEXT_IN_BYTES {
            return Err(CellError::Value);
        }
    }
    out.push_str(&t[last..]);
    text_answer(out)
}

fn expand(new: &[char], caps: &Captures, groups: usize, out: &mut String) {
    let mut i = 0;
    while i < new.len() {
        let c = new[i];
        if c == '\\' && i + 1 < new.len() {
            out.push(new[i + 1]);
            i += 2;
            continue;
        }
        if c == '$' {
            let digit = |k: usize| new.get(k).and_then(|d| d.to_digit(10)).map(|d| d as usize);
            if let Some(first) = digit(i + 1) {
                // Two digits when they name a group, else one.
                let (group, used) = match digit(i + 2) {
                    Some(second) if first * 10 + second <= groups => (first * 10 + second, 3),
                    _ => (first, 2),
                };
                if group <= groups {
                    out.push_str(caps.get(group).map_or("", |m| m.as_str()));
                    i += used;
                    continue;
                }
            }
        }
        out.push(c);
        i += 1;
    }
}

/// TEXT(value, format): a number (or a text that reads as one in the locale) shown with a number format the way the
/// locale shows it (its decimal and group signs, its names of months and days, though `m/d/yyyy` and `m/d` stay as
/// written: `2/1/2020` in de-DE too); another text goes through the format's text section. An empty format gives
/// empty text; one refused, or a number it can't show, is #VALUE!.
fn text_of_number(args: &[Arg], locale: &Locale) -> Answer {
    let value = args[0].value()?;
    let pattern = args[1].text(locale)?;
    if pattern.is_empty() {
        return text("");
    }
    let format = NumberFormat::parse(&pattern).map_err(|_| CellError::Value)?;
    let en_us = locale::en_us();
    let shown_in = Locale { short_date: en_us.short_date, month_and_day: en_us.month_and_day, ..*locale };
    let show = |n: f64| format.show_number_in(n, &shown_in, Room::AsText);
    let shown = match value {
        Value::Number(n) => show(n),
        Value::Boolean(b) => show(if b { 1.0 } else { 0.0 }),
        Value::Text(t) => match typed_text::number_of_text_in(&t, locale) {
            Some(n) => show(n),
            None => Ok(format.show_text(&t)),
        },
        Value::Error(e) => return Err(e),
        _ => show(0.0),
    };
    text_answer(shown.map_err(|_| CellError::Value)?.text)
}
