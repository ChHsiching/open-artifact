//! Text as a person types it, read as a number: what `"1,000" + 1` and `VALUE("50%")` do, and what a pasted text
//! becomes. Only the en-US way of writing numbers and dates is read here; locales come with number formats.
//!
//! - numbers: `12`, ` 12 `, `+5`, `.5`, `5.`, `1e3`, `1,000,000.5` (groups of three), `(5)` and `-5`;
//! - with a currency sign before or after: `$5`, `-$1,234`, `$-5`, `5$`, `€5`, `£1,000.50`;
//! - percentages: `5%`, `-5%`, `1.5%` (not with a currency sign);
//! - dates: `1/2/2024`, `1/2/24` (00–49 is 20xx, 50–99 is 19xx), `2024-01-02`, `Jan 2, 2024`, `January 2 2024`,
//!   `2 Jan 2024`, `2-Jan-2024`;
//! - times: `12:30`, `12:30:15.5`, `1:30 PM`, `12 PM`; a date and a time: `1/2/2024 12:00`, `2024-01-02T03:04:05`.

use crate::dates;

mod in_locale;

pub use in_locale::{date_and_time_in, number_of_text_in, read_in};

/// What a typed text reads as.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Typed {
    Number(f64),
    Percent(f64),
    Currency(f64),
    Date(f64),
    Time(f64),
    DateTime(f64),
}

impl Typed {
    pub fn value(self) -> f64 {
        match self {
            Typed::Number(n) | Typed::Percent(n) | Typed::Currency(n) | Typed::Date(n) | Typed::Time(n) | Typed::DateTime(n) => n,
        }
    }
}

/// A typed text as a number, when it reads as one.
pub fn number_of_text(text: &str) -> Option<f64> {
    read(text).map(Typed::value)
}

/// What a typed text reads as, when it reads as a number.
pub fn read(text: &str) -> Option<Typed> {
    // A number may have spaces, tabs and line breaks around it; a date or a time only spaces.
    let t = text.trim_matches([' ', '\t', '\n', '\r']);
    if t.is_empty() {
        return None;
    }
    if let Some(typed) = read_number(t) {
        return Some(typed);
    }
    read_date_time(text.trim_matches(' '))
}

const CURRENCY_SIGNS: &[char] = &['$', '€', '£', '¥', '₹', '₩', '₽', '¢', '₪', '₫', '฿', '₺', '₴', '₦', '₱'];

fn read_number(t: &str) -> Option<Typed> {
    let (negative_by_parens, t) = match t.strip_prefix('(').and_then(|s| s.strip_suffix(')')) {
        Some(inner) => (true, inner),
        None => (false, t),
    };
    let mut s = t;
    let mut negative = false;
    let mut currency = false;
    let mut sign_seen = false;
    // A sign and a currency sign, in either order, before the digits.
    for _ in 0..2 {
        if !sign_seen {
            if let Some(rest) = s.strip_prefix('-') {
                negative = true;
                sign_seen = true;
                s = rest;
                continue;
            }
            if let Some(rest) = s.strip_prefix('+') {
                sign_seen = true;
                s = rest;
                continue;
            }
        }
        if !currency {
            if let Some(c) = s.chars().next().filter(|c| CURRENCY_SIGNS.contains(c)) {
                currency = true;
                s = &s[c.len_utf8()..];
                // One space (or no-break space) may follow the sign.
                s = s.strip_prefix([' ', '\u{a0}']).unwrap_or(s);
                continue;
            }
        }
        break;
    }
    let mut percent = false;
    if let Some(rest) = s.strip_suffix('%') {
        percent = true;
        s = rest;
    } else if let Some(c) = s.chars().last().filter(|c| CURRENCY_SIGNS.contains(c)) {
        if currency {
            return None;
        }
        currency = true;
        s = &s[..s.len() - c.len_utf8()];
        s = s.strip_suffix([' ', '\u{a0}']).unwrap_or(s);
    }
    if percent && currency {
        return None;
    }
    if negative_by_parens && negative {
        return None;
    }
    let n = read_digits(s)?;
    let n = if negative || negative_by_parens { -n } else { n };
    if !n.is_finite() {
        return None;
    }
    Some(if percent {
        Typed::Percent(n / 100.0)
    } else if currency {
        Typed::Currency(n)
    } else {
        Typed::Number(n)
    })
}

/// `1,000.5`, `.5`, `5.`, `1e3`: digits with groups of three, a point and an exponent.
fn read_digits(s: &str) -> Option<f64> {
    let (mantissa, exponent) = match s.find(['e', 'E']) {
        Some(i) => (&s[..i], Some(&s[i + 1..])),
        None => (s, None),
    };
    let (int, frac) = match mantissa.split_once('.') {
        Some((i, f)) => (i, Some(f)),
        None => (mantissa, None),
    };
    if int.is_empty() && frac.is_none_or(str::is_empty) {
        return None;
    }
    let mut digits = String::new();
    if int.contains(',') {
        let mut groups = int.split(',');
        let first = groups.next()?;
        if first.is_empty() || first.len() > 3 || !first.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        digits.push_str(first);
        for g in groups {
            if g.len() != 3 || !g.bytes().all(|b| b.is_ascii_digit()) {
                return None;
            }
            digits.push_str(g);
        }
    } else {
        if !int.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        digits.push_str(int);
    }
    if let Some(f) = frac {
        if !f.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        digits.push('.');
        digits.push_str(f);
    }
    if let Some(e) = exponent {
        let body = e.strip_prefix(['+', '-']).unwrap_or(e);
        if body.is_empty() || !body.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        digits.push('e');
        digits.push_str(e);
    }
    if digits.starts_with('.') {
        digits.insert(0, '0');
    }
    digits.parse().ok()
}

const MONTHS: [&str; 12] = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

fn month_of_name(name: &str) -> Option<u32> {
    let lower = name.to_ascii_lowercase();
    if lower == "sept" {
        return Some(9);
    }
    MONTHS.iter().position(|m| *m == lower || (lower.len() == 3 && m.starts_with(&lower))).map(|i| i as u32 + 1)
}

fn read_date_time(t: &str) -> Option<Typed> {
    if let Some(time) = read_time(t) {
        return Some(Typed::Time(time));
    }
    if let Some(date) = read_date(t) {
        return Some(Typed::Date(date));
    }
    // A date, then a time: split at the last space (or an ISO `T`) that leaves a time after it.
    for (i, c) in t.char_indices().rev() {
        if c == ' ' || c == 'T' {
            let (d, rest) = (&t[..i], &t[i + 1..]);
            if let (Some(date), Some(time)) = (read_date(d.trim_end()), read_time(rest.trim_start())) {
                return Some(Typed::DateTime(date + time));
            }
            // `1:30 PM` keeps its space: keep looking further left.
        }
    }
    None
}

fn number_part(s: &str, min: usize, max: usize) -> Option<u32> {
    if s.len() < min || s.len() > max || !s.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    s.parse().ok()
}

fn date_serial(year: i64, month: u32, day: u32) -> Option<f64> {
    if !(1..=9999).contains(&year) || !dates::is_date(year, month, day) {
        return None;
    }
    Some(dates::serial_from_date(year, month, day) as f64)
}

fn year_of(s: &str) -> Option<i64> {
    match s.len() {
        2 => {
            let y: i64 = s.parse().ok()?;
            Some(if y < 50 { 2000 + y } else { 1900 + y })
        }
        4 => number_part(s, 4, 4).map(i64::from),
        _ => None,
    }
}

fn read_date(t: &str) -> Option<f64> {
    // 1/2/2024, 1/2/24
    let slash: Vec<&str> = t.split('/').collect();
    if slash.len() == 3 {
        let month = number_part(slash[0], 1, 2)?;
        let day = number_part(slash[1], 1, 2)?;
        return date_serial(year_of(slash[2])?, month, day);
    }
    // 2024-01-02, 2-Jan-2024
    let dash: Vec<&str> = t.split('-').collect();
    if dash.len() == 3 {
        if dash[0].len() == 4 {
            let year = number_part(dash[0], 4, 4)? as i64;
            return date_serial(year, number_part(dash[1], 1, 2)?, number_part(dash[2], 1, 2)?);
        }
        let day = number_part(dash[0], 1, 2)?;
        let month = month_of_name(dash[1])?;
        return date_serial(year_of(dash[2])?, month, day);
    }
    // Jan 2, 2024; January 2 2024; 2 Jan 2024
    let words: Vec<&str> = t.split(|c: char| c == ' ' || c == ',').filter(|w| !w.is_empty()).collect();
    if words.len() == 3 {
        if let Some(month) = month_of_name(words[0]) {
            return date_serial(year_of(words[2])?, month, number_part(words[1], 1, 2)?);
        }
        if t.contains(',') {
            return None;
        }
        let day = number_part(words[0], 1, 2)?;
        let month = month_of_name(words[1])?;
        return date_serial(year_of(words[2])?, month, day);
    }
    None
}

/// `12:30`, `12:30:15.5`, `1:30 PM`, `12 PM`.
fn read_time(t: &str) -> Option<f64> {
    let lower = t.to_ascii_lowercase();
    let (clock, half) = if let Some(rest) = lower.strip_suffix("am") {
        (rest.trim_end(), Some(false))
    } else if let Some(rest) = lower.strip_suffix("pm") {
        (rest.trim_end(), Some(true))
    } else {
        (lower.as_str(), None)
    };
    let parts: Vec<&str> = clock.split(':').collect();
    if parts.len() == 1 && half.is_none() {
        return None;
    }
    if parts.len() > 3 {
        return None;
    }
    let mut hour = number_part(parts[0], 1, 2)?;
    let minute = match parts.get(1) {
        Some(m) => number_part(m, 2, 2)?,
        None => 0,
    };
    // Seconds and milliseconds: digits past the third after the point are dropped.
    let (second, millisecond) = match parts.get(2) {
        Some(s) => {
            let (whole, frac) = match s.split_once('.') {
                Some((w, f)) => (w, Some(f)),
                None => (*s, None),
            };
            let w = number_part(whole, 2, 2)?;
            let mut ms = 0;
            if let Some(f) = frac {
                if f.is_empty() || !f.bytes().all(|b| b.is_ascii_digit()) {
                    return None;
                }
                ms = format!("{:0<3}", &f[..f.len().min(3)]).parse::<u32>().ok()?;
            }
            (w, ms)
        }
        None => (0, 0),
    };
    if minute > 59 || second > 59 {
        return None;
    }
    match half {
        Some(pm) => {
            if !(1..=12).contains(&hour) {
                return None;
            }
            hour %= 12;
            if pm {
                hour += 12;
            }
        }
        None => {
            if hour > 23 {
                return None;
            }
        }
    }
    Some((((hour * 60 + minute) * 60 + second) as f64 * 1000.0 + millisecond as f64) / 86_400_000.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers() {
        for (text, n) in [
            ("12", 12.0),
            (" 12 ", 12.0),
            ("1,000.5", 1000.5),
            ("(5)", -5.0),
            ("-$1,234", -1234.0),
            ("$-5", -5.0),
            ("5%", 0.05),
            ("1e3", 1000.0),
            (".5", 0.5),
            ("5.", 5.0),
            ("+5", 5.0),
            ("€5", 5.0),
            ("5$", 5.0),
            ("1,000e3", 1e6),
            ("(5%)", -0.05),
        ] {
            assert_eq!(number_of_text(text), Some(n), "{text}");
        }
        for text in ["1,00", "TRUE", "", "  ", "12 %", "1 000", "0x10", "--5", "5%%", "$5%", "1.2.3", "1e400", "1/2"] {
            assert_eq!(number_of_text(text), None, "{text}");
        }
    }

    #[test]
    fn dates_and_times() {
        for (text, n) in [
            ("1/2/2024", 45293.0),
            ("2024-01-02", 45293.0),
            ("Jan 2, 2024", 45293.0),
            ("2 Jan 2024", 45293.0),
            ("2-Jan-2024", 45293.0),
            ("jan 2 2024", 45293.0),
            ("Sept 2, 2024", 45537.0),
            ("1/2/24", 45293.0),
            ("1/2/49", dates::serial_from_date(2049, 1, 2) as f64),
            ("1/2/50", 18265.0),
            ("1/1/1900", 2.0),
            ("12:30", 0.5208333333333334),
            ("1:30 PM", 0.5625),
            ("12:30 AM", 0.020833333333333332),
            ("12 PM", 0.5),
            ("0:00", 0.0),
            ("1/2/2024 12:00", 45293.5),
            ("1/2/2024 1:30 PM", 45293.5625),
            ("2024-01-02T03:04:05", 45293.12783564815),
        ] {
            assert_eq!(number_of_text(text), Some(n), "{text}");
        }
        for text in ["2024/01/02", "1-2-2024", "25:00", "1:2", "Jan 2024", "Jan 2", "13/1/2024", "2/29/2023", "24:00", "12:60", "1/2/024"] {
            assert_eq!(number_of_text(text), None, "{text}");
        }
    }
}
