//! Text read as a number the way a workbook's locale writes numbers and dates: what `VALUE`, arithmetic on text, a
//! function's number argument, a criterion and SPLIT's pieces read. In de-DE `VALUE("1,5")` is 1.5 and
//! `VALUE("1.5")` #VALUE!; in en-US the other way round.
//!
//! - numbers: the locale's decimal sign (`1,5`, `,5`, `5,`), its group signs between groups of three
//!   (`1.234.567,5`; a space, a no-break space or a narrow one where the locale groups with a space; `'` or `’`
//!   where it groups with an apostrophe) or, where it groups in twos after the first three, of two (`12,34,567`),
//!   an exponent (`1,5e3`), `(5)` and `-5`;
//! - money: a currency sign (Unicode's, but `¤`) or the locale's own symbol (`CHF` in de-CH, `kr` and `kr.` in
//!   sv-SE and da-DK), before or after the number, with one space or no-break space (narrow too) between: `$5`,
//!   `CHF 5`, `5 kr.`, `-CHF 5`, `CHF -5`, `(CHF 5)`;
//! - percentages: `5%`, `1,5%` (not with money), the number the digits write moved two places (`-123456789,1%` is
//!   exactly `-1234567,891`);
//! - times: `12:30`, `12:30:15.5` (or with the locale's decimal sign), `1:30 PM`, `12 PM`;
//! - dates as a typed day reads them in the locale (`typed_day.rs`: `1.2.2020` and `1/2/2020` in de-DE are
//!   1 February), and a date with a time of day after a space, a `, ` or a `T` (`1.2.2020 12:30`).
//!
//! A number may have spaces, tabs and line breaks around it; a date or a time only spaces. DATEVALUE and TIMEVALUE
//! also take tabs and no-break spaces as spaces in a time, or a date with a time (`date_and_time_in`).

use super::Typed;
use crate::column_readings::is_currency_sign;
use crate::dates;
use crate::locale::{GroupSign, Locale, SizesOfGroups};
use crate::typed_day;

/// What a text reads as in a locale, when it reads as a number.
pub fn read_in(text: &str, locale: &Locale) -> Option<Typed> {
    let t = text.trim_matches([' ', '\t', '\n', '\r']);
    if t.is_empty() {
        return None;
    }
    if let Some(typed) = number(t, locale) {
        return Some(typed);
    }
    let t = text.trim_matches(' ');
    if let Some(time) = time(t, locale) {
        return Some(Typed::Time(time));
    }
    if let Some(date) = date(t, locale) {
        return Some(Typed::Date(date));
    }
    date_and_time(t, locale).map(|(date, time)| Typed::DateTime(date + time))
}

/// A text as a number in a locale, when it reads as one.
pub fn number_of_text_in(text: &str, locale: &Locale) -> Option<f64> {
    read_in(text, locale).map(Typed::value)
}

/// A text with a date and a time of day, apart (DATEVALUE and TIMEVALUE take one of them): `(date, None)`,
/// `(None, time)` or both; `None` when the text is not a date or a time. A text that doesn't read so may still be a
/// time, or a date with a time, with tabs and no-break spaces (narrow too) for spaces (`\t12:30\tPM`,
/// `1.2.2020\t12:30`), but not a date alone.
pub fn date_and_time_in(text: &str, locale: &Locale) -> Option<(Option<f64>, Option<f64>)> {
    let apart = |text: &str, typed| match typed {
        Typed::Date(date) => Some((Some(date), None)),
        Typed::Time(time) => Some((None, Some(time))),
        Typed::DateTime(_) => {
            let (date, time) = date_and_time(text.trim_matches(' '), locale)?;
            Some((Some(date), Some(time)))
        }
        _ => None,
    };
    if let Some(typed) = read_in(text, locale) {
        return apart(text, typed);
    }
    let spaced: String =
        text.chars().map(|c| if matches!(c, '\t' | '\u{a0}' | '\u{202f}') { ' ' } else { c }).collect();
    match read_in(&spaced, locale)? {
        Typed::Date(_) => None,
        typed => apart(&spaced, typed),
    }
}

fn number(t: &str, locale: &Locale) -> Option<Typed> {
    let (negative_by_parens, t) = match t.strip_prefix('(').and_then(|s| s.strip_suffix(')')) {
        Some(inner) => (true, inner),
        None => (false, t),
    };
    let mut s = t;
    let mut negative = false;
    let mut currency = false;
    let mut sign_seen = false;
    // A sign and money's sign, in either order, before the digits.
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
            if let Some(rest) = money_before(s, locale) {
                currency = true;
                // One space (or no-break space) may follow it.
                s = rest.strip_prefix(MONEY_SPACES).unwrap_or(rest);
                continue;
            }
        }
        break;
    }
    let mut percent = false;
    if let Some(rest) = s.strip_suffix('%') {
        percent = true;
        s = rest;
    } else if let Some(rest) = money_after(s, locale) {
        if currency {
            return None;
        }
        currency = true;
        s = rest.strip_suffix(MONEY_SPACES).unwrap_or(rest);
    }
    if percent && currency {
        return None;
    }
    if negative_by_parens && negative {
        return None;
    }
    let n = digits(s, if percent { 2 } else { 0 }, locale)?;
    let n = if negative || negative_by_parens { -n } else { n };
    if !n.is_finite() {
        return None;
    }
    Some(if percent {
        Typed::Percent(n)
    } else if currency {
        Typed::Currency(n)
    } else {
        Typed::Number(n)
    })
}

/// The spaces one of which may come between money's sign and the number.
const MONEY_SPACES: [char; 3] = [' ', '\u{a0}', '\u{202f}'];

/// A currency sign typed money may have: Unicode's, but the generic `¤`.
fn is_money_sign(c: char) -> bool {
    c != '¤' && is_currency_sign(c)
}

/// The locale's own symbol for money, as its pattern of money writes it (`CHF`, `kr.`, `R$`), without a point
/// at its end: `None` where it is `$` or another currency sign.
fn symbol_of(locale: &Locale) -> Option<&'static str> {
    let pattern = locale.patterns_of_money.with_two_decimals;
    let start = pattern.find("[$")? + 2;
    let end = start + pattern[start..].find(']')?;
    let symbol = pattern[start..end].trim_end_matches('.');
    let mut chars = symbol.chars();
    match (chars.next(), chars.next()) {
        (None, _) => None,
        (Some(c), None) if is_money_sign(c) => None,
        _ => Some(symbol),
    }
}

/// The text after money's sign or symbol at its start.
fn money_before<'a>(s: &'a str, locale: &Locale) -> Option<&'a str> {
    if let Some(c) = s.chars().next().filter(|c| is_money_sign(*c)) {
        return Some(&s[c.len_utf8()..]);
    }
    let rest = s.strip_prefix(symbol_of(locale)?)?;
    Some(rest.strip_prefix('.').unwrap_or(rest))
}

/// The text before money's sign or symbol at its end.
fn money_after<'a>(s: &'a str, locale: &Locale) -> Option<&'a str> {
    if let Some(c) = s.chars().next_back().filter(|c| is_money_sign(*c)) {
        return Some(&s[..s.len() - c.len_utf8()]);
    }
    let symbol = symbol_of(locale)?;
    let s = s.strip_suffix('.').unwrap_or(s);
    s.strip_suffix(symbol)
}

/// The signs a locale groups digits with, as typed.
fn group_signs(locale: &Locale) -> &'static [char] {
    match locale.group_sign {
        GroupSign::Point => &['.'],
        GroupSign::Comma => &[','],
        GroupSign::NoBreakSpace | GroupSign::NarrowNoBreakSpace => &[' ', '\u{a0}', '\u{202f}'],
        GroupSign::Apostrophe => &['\'', '\u{2019}'],
    }
}

/// Digits with the locale's groups, its decimal sign and an exponent (`1.000,5`, `,5`, `1e3`), divided by ten so
/// many times: the number nearest to what they write.
fn digits(s: &str, places: i64, locale: &Locale) -> Option<f64> {
    let (mantissa, exponent) = match s.find(['e', 'E']) {
        Some(i) => (&s[..i], Some(&s[i + 1..])),
        None => (s, None),
    };
    let (int, frac) = match mantissa.split_once(locale.decimal_sign.sign()) {
        Some((i, f)) => (i, Some(f)),
        None => (mantissa, None),
    };
    if int.is_empty() && frac.is_none_or(str::is_empty) {
        return None;
    }
    let all_digits = |p: &str| p.bytes().all(|b| b.is_ascii_digit());
    let mut text = String::new();
    let groups = group_signs(locale);
    if int.contains(groups) {
        let parts: Vec<&str> = int.split(groups).collect();
        if !parts.iter().all(|p| all_digits(p)) || !grouped(&parts, locale.sizes_of_groups) {
            return None;
        }
        parts.iter().for_each(|p| text.push_str(p));
    } else {
        if !all_digits(int) {
            return None;
        }
        text.push_str(int);
    }
    if let Some(f) = frac {
        if !all_digits(f) {
            return None;
        }
        text.push('.');
        text.push_str(f);
    }
    let mut power = -places;
    if let Some(e) = exponent {
        let body = e.strip_prefix(['+', '-']).unwrap_or(e);
        if body.is_empty() || !all_digits(body) {
            return None;
        }
        // An exponent too long to hold makes the number 0 or too big anyway.
        let exponent: i64 = e.parse().unwrap_or(if e.starts_with('-') { i64::MIN } else { i64::MAX });
        power = power.saturating_add(exponent);
    }
    if text.starts_with('.') {
        text.insert(0, '0');
    }
    if power != 0 {
        text.push_str(&format!("e{power}"));
    }
    text.parse().ok()
}

/// Whether groups of digits are as the locale groups them: a first of one to three digits, then threes; or, where
/// it groups in twos after the first three, a first of one or two, twos, and three last.
fn grouped(parts: &[&str], sizes: SizesOfGroups) -> bool {
    let (first, rest) = parts.split_first().expect("a split gives a part");
    let threes = (1..=3).contains(&first.len()) && rest.iter().all(|p| p.len() == 3);
    let twos = || {
        let (last, middle) = rest.split_last().expect("a group sign gives two parts");
        (1..=2).contains(&first.len()) && middle.iter().all(|p| p.len() == 2) && last.len() == 3
    };
    threes || (sizes == SizesOfGroups::ThreeAndThenTwos && twos())
}

/// A date's serial, as a typed day reads it in the locale.
fn date(t: &str, locale: &Locale) -> Option<f64> {
    typed_day::read(t, locale).map(|(y, m, d)| dates::serial_from_date(y, m, d) as f64)
}

/// `12:30`, `12:30:15`, `12:30:15.5` (or with the locale's decimal sign), `1:30 PM`, `1:30pm`, `12 PM`, as a
/// fraction of a day; digits past the third after the decimal sign are dropped.
fn time(t: &str, locale: &Locale) -> Option<f64> {
    const SPACES: &[char] = &[' ', '\u{a0}', '\u{202f}'];
    let lower = t.to_ascii_lowercase();
    let (clock, half) = if let Some(rest) = lower.strip_suffix("am") {
        (rest.trim_end_matches(SPACES), Some(false))
    } else if let Some(rest) = lower.strip_suffix("pm") {
        (rest.trim_end_matches(SPACES), Some(true))
    } else {
        (lower.as_str(), None)
    };
    let parts: Vec<&str> = clock.split(':').collect();
    if (parts.len() == 1 && half.is_none()) || parts.len() > 3 {
        return None;
    }
    let two_digits = |s: &str, min: usize| -> Option<u32> {
        (s.len() >= min && s.len() <= 2 && s.bytes().all(|b| b.is_ascii_digit())).then(|| s.parse().ok())?
    };
    let mut hour = two_digits(parts[0], 1)?;
    let minute = match parts.get(1) {
        Some(m) => two_digits(m, 2)?,
        None => 0,
    };
    let (second, millisecond) = match parts.get(2) {
        Some(s) => {
            let (whole, frac) = match s.split_once(['.', locale.decimal_sign.sign()]) {
                Some((w, f)) => (w, Some(f)),
                None => (*s, None),
            };
            let mut ms = 0;
            if let Some(f) = frac {
                if f.is_empty() || !f.bytes().all(|b| b.is_ascii_digit()) {
                    return None;
                }
                ms = format!("{:0<3}", &f[..f.len().min(3)]).parse::<u32>().ok()?;
            }
            (two_digits(whole, 2)?, ms)
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
        None if hour > 23 => return None,
        None => {}
    }
    Some((((hour * 60 + minute) * 60 + second) as f64 * 1000.0 + millisecond as f64) / 86_400_000.0)
}

/// A date and then a time of day with its minutes (`3:04 PM`, not `3 PM`), with spaces, a `,` and spaces, or a `T`
/// between them: split at the last place that leaves both.
fn date_and_time(t: &str, locale: &Locale) -> Option<(f64, f64)> {
    for (i, c) in t.char_indices().rev() {
        if c == ' ' || c == 'T' {
            let before = t[..i].trim_end_matches(' ');
            let before = before.strip_suffix(',').unwrap_or(before);
            let after = &t[i + 1..];
            let after = if c == 'T' { after } else { after.trim_start_matches(' ') };
            if !after.contains(':') || after.starts_with(' ') {
                continue;
            }
            if let (Some(date), Some(time)) = (date(before, locale), time(after, locale)) {
                return Some((date, time));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::locale;

    #[test]
    fn numbers_in_locales() {
        let de = locale::find("de-DE").unwrap();
        let ch = locale::find("de-CH").unwrap();
        let fr = locale::find("fr-FR").unwrap();
        let hi = locale::find("hi-IN").unwrap();
        let en = locale::en_us();
        for (text, locale, n) in [
            ("1,5", de, Some(1.5)),
            ("1.5", de, None),
            ("1.000,5", de, Some(1000.5)),
            (",5", de, Some(0.5)),
            ("1,5e3", de, Some(1500.0)),
            ("1,5%", de, Some(0.015)),
            ("-123456789,1%", de, Some(-1234567.891)),
            ("1e3%", en, Some(10.0)),
            ("1'000.5", ch, Some(1000.5)),
            ("CHF 1.5", ch, Some(1.5)),
            ("CHF 1.5", en, None),
            ("1 000,5", fr, Some(1000.5)),
            ("12,34,567.5", hi, Some(1234567.5)),
            ("1,234,567.5", hi, Some(1234567.5)),
            ("12,34,567.5", en, None),
            ("₿1", en, Some(1.0)),
            ("¤1", en, None),
        ] {
            assert_eq!(number_of_text_in(text, locale), n, "{text} in {}", locale.tag);
        }
    }

    #[test]
    fn dates_and_times_in_locales() {
        let de = locale::find("de-DE").unwrap();
        let en = locale::en_us();
        assert_eq!(number_of_text_in("1/2/2020", de), Some(43862.0));
        assert_eq!(number_of_text_in("1/2/2020", en), Some(43832.0));
        assert_eq!(number_of_text_in("1.2.2020 12:00", de), Some(43862.5));
        assert_eq!(number_of_text_in("12:30:15,5", de), number_of_text_in("12:30:15.5", en));
        assert_eq!(number_of_text_in("12:30:15,5", en), None);
        assert_eq!(number_of_text_in("1/2/2024 1 PM", en), None);
    }
}
