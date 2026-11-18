//! What a typed text is: nothing, a text, a boolean, a formula, or a number written the way the locale writes
//! numbers, money, percentages, dates and times, with the pattern its way of writing brings to the cell.

use crate::column_readings::{self, date_by_whole_template, is_currency_sign, numbers_of_a_date, SPACES};
use crate::dates;
use crate::locale::{DateOrder, GroupSign, Locale, SizesOfGroups};
use crate::typed_day;

/// What a typed text reads as.
#[derive(Clone, Debug, PartialEq)]
pub enum Reading {
    Empty,
    Text(String),
    Boolean(bool),
    /// The formula's text as typed (`=` first).
    Formula(String),
    Number(f64, Shape),
}

/// How a number was written: what kind of value it is, and the pattern it brings.
#[derive(Clone, Debug, PartialEq)]
pub struct Shape {
    pub kind: ShapeKind,
    pub pattern: Option<String>,
    /// A plain or grouped number read as a percentage, its decimal point two places left: what it is typed into a
    /// cell that shows percentages.
    pub hundredth: Option<f64>,
    /// Written negative in parentheses (`(5)`): a cell that shows text keeps it as typed.
    pub in_parentheses: bool,
    /// An amount of money written with no decimals whose pattern shows two all the same (`$5`, `$#,##0.00`): a
    /// text written from a cell takes the pattern without them (`$#,##0`).
    pub cents_given: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShapeKind {
    /// `12`, `-1.5`, `1e3`: brings no pattern.
    Plain,
    /// `1,000`: digits in groups.
    Grouped,
    Percent,
    Currency,
    Date,
    Time,
    /// A time with AM or PM.
    TimeOfHalfDay,
    DateAndTime,
}

impl Shape {
    fn new(kind: ShapeKind, pattern: impl Into<String>) -> Shape {
        Shape { kind, pattern: Some(pattern.into()), hundredth: None, in_parentheses: false, cents_given: false }
    }
}

/// The locales a text is read in: the one it is written in, and the workbook's, whose way of writing a date with its
/// month named such a date brings.
#[derive(Clone, Copy)]
pub struct Locales<'a> {
    pub text: &'a Locale,
    pub workbook: &'a Locale,
}

/// Reads a typed text. A `'` first keeps the rest as text: typed into a cell, always; pasted, only when the rest
/// would be read as something else, starts (spaces aside) with what starts a formula elsewhere (`=`, `+`, `-`, `@`),
/// is a month and day with no year (which this reads as text, but other spreadsheets as a date), or is itself a `'`
/// and more (`''abc` is `'abc`, `''` stays); otherwise the `'` stays in the text.
pub fn read(text: &str, locales: Locales, entered: bool) -> Reading {
    if text.is_empty() {
        return Reading::Empty;
    }
    if text.starts_with('\'') {
        return Reading::Text(unquoted(text, locales, entered).to_owned());
    }
    if text.len() > 1 && text.starts_with('=') {
        return Reading::Formula(text.to_owned());
    }
    if text.eq_ignore_ascii_case("true") {
        return Reading::Boolean(true);
    }
    if text.eq_ignore_ascii_case("false") {
        return Reading::Boolean(false);
    }
    match number(text, locales) {
        Some((n, shape)) => Reading::Number(n, shape),
        None => Reading::Text(text.to_owned()),
    }
}

/// A text without the `'` it starts with, when that `'` keeps the rest as text (see `read`).
pub fn unquoted<'a>(text: &'a str, locales: Locales, entered: bool) -> &'a str {
    match text.strip_prefix('\'') {
        Some(rest)
            if !rest.is_empty()
                && (entered
                    || rest.trim_start().starts_with(['=', '+', '-', '@'])
                    || (rest.len() > 1 && rest.starts_with('\''))
                    || month_and_day(rest.trim_matches(SPACES), locales.text)
                    || matches!(read(rest, locales, false), Reading::Boolean(_) | Reading::Number(..))) =>
        {
            rest
        }
        _ => text,
    }
}

/// Whether a text typed into a cell would read as something else than that text, or is a month and a day with no
/// year.
pub fn is_read_otherwise(text: &str, locales: Locales) -> bool {
    !matches!(read(text, locales, true), Reading::Text(t) if t == text)
        || month_and_day(text.trim_matches(SPACES), locales.text)
        || is_too_large(text, locales.text)
}

/// Whether a text is an amount too large for a number (`1e400`, `$1e309`, `(1,000e400)`): it is kept as text, but
/// written after a `'` to be edited.
fn is_too_large(text: &str, locale: &Locale) -> bool {
    trimmed(text).and_then(|t| amount(t, locale, locale)).is_some_and(|(n, _)| !n.is_finite())
}

/// A month and a day with no year: in numbers in the locale's order of the two, with `/` or the separator of its
/// short date between (`1/2`, `1-2` where dates are `1-2-2020`, `1.2.` or `1. 2` where they are `1.2.2020`); a day
/// and a month named (`2 Jan`, `2-Jan`); or as the locale's own pattern for the two (`Jan 2` in en-US).
fn month_and_day(t: &str, locale: &Locale) -> bool {
    // Every way has the day in digits.
    if !t.bytes().any(|b| b.is_ascii_digit()) {
        return false;
    }
    if typed_day::day_and_month_named(t, locale) || column_readings::month_and_day_by_template(t, locale) {
        return true;
    }
    let Some(separator) = t.chars().find(|c| !c.is_ascii_digit()) else { return false };
    if separator != '/' && separator != locale.short_date.separator {
        return false;
    }
    let pointed = separator == '.';
    let t = if pointed { t.strip_suffix('.').unwrap_or(t) } else { t };
    let Some((a, b)) = t.split_once(separator) else { return false };
    let b = if pointed { b.trim_start_matches(SPACES) } else { b };
    let (Some(a), Some(b)) = (column_readings::digits(a, 1, 2), column_readings::digits(b, 1, 2)) else { return false };
    let (m, d) = if locale.month_and_day.day_first { (b, a) } else { (a, b) };
    column_readings::day(2000, m, d).is_some()
}

pub(crate) fn number(text: &str, locales: Locales) -> Option<(f64, Shape)> {
    let t = trimmed(text)?;
    amount(t, locales.text, locales.workbook).filter(|(n, _)| n.is_finite()).or_else(|| date_time(t, locales))
}

/// A text without the spaces around it, if it has no other blanks there.
fn trimmed(text: &str) -> Option<&str> {
    let t = text.trim_matches(' ');
    (!t.is_empty() && !t.starts_with(SPACES) && !t.ends_with(SPACES)).then_some(t)
}

/// The currency sign a pattern shows: `€` in `[$€]#,##0` (or `[$€-407]`), `Bs.S` in `[$Bs.S] #,##0.00`, `$` in
/// `$#,##0`.
pub fn currency_of(pattern: &str) -> Option<&str> {
    let mut rest = pattern;
    while let Some(c) = rest.chars().next() {
        if c == '[' {
            let end = rest.find(']')?;
            if let Some(symbol) = rest[1..end].strip_prefix('$').map(|s| s.split('-').next().unwrap_or("")) {
                if !symbol.is_empty() {
                    return Some(symbol);
                }
            }
            rest = &rest[end + 1..];
            continue;
        }
        if is_currency_sign(c) {
            return Some(&rest[..c.len_utf8()]);
        }
        rest = &rest[c.len_utf8()..];
    }
    None
}

/// A currency sign a typed number may have: any but `¢`, `￠` and `¤`.
fn is_sign_of_money(c: char) -> bool {
    is_currency_sign(c) && !matches!(c, '\u{a2}' | '\u{a4}' | '\u{ffe0}')
}

/// The sign of the same currency written wide or narrow: `＄` and `$`, `￡` and `£`, `￥` and `¥`, `￦` and `₩`.
fn other_width(sign: &str) -> Option<&'static str> {
    Some(match sign {
        "$" => "\u{ff04}",
        "\u{ff04}" => "$",
        "\u{a3}" => "\u{ffe1}",
        "\u{ffe1}" => "\u{a3}",
        "\u{a5}" => "\u{ffe5}",
        "\u{ffe5}" => "\u{a5}",
        "\u{20a9}" => "\u{ffe6}",
        "\u{ffe6}" => "\u{20a9}",
        _ => return None,
    })
}

/// The spaces one of which may be between a currency sign and its number, and which group digits where a space
/// does.
const SPACES_OF_NUMBERS: [char; 3] = [' ', '\u{a0}', '\u{202f}'];

/// The currency sign a text starts with (`first`) or ends with: the locale's own (`Bs.S`, `kr`), with a point after
/// it or not (`kr.` and `kr` alike), or any one sign.
fn currency_at<'a>(s: &'a str, locale: &Locale, first: bool) -> Option<&'a str> {
    if let Some(own) = currency_of(locale.patterns_of_money.with_two_decimals) {
        // With a point after it first, then without.
        let bare = own.strip_suffix('.').unwrap_or(own);
        if first {
            if let Some(rest) = s.strip_prefix(bare) {
                return Some(&s[..bare.len() + usize::from(rest.starts_with('.'))]);
            }
        } else {
            if s.strip_suffix('.').is_some_and(|rest| rest.ends_with(bare)) {
                return Some(&s[s.len() - bare.len() - 1..]);
            }
            if s.ends_with(bare) {
                return Some(&s[s.len() - bare.len()..]);
            }
        }
    }
    let c = if first { s.chars().next() } else { s.chars().next_back() }?;
    if !is_sign_of_money(c) {
        return None;
    }
    Some(if first { &s[..c.len_utf8()] } else { &s[s.len() - c.len_utf8()..] })
}

/// The signs of money typed without decimals that show none: yen and yuan, won, dong, kip, guaraní, afghani. The
/// workbook locale's own sign goes by `LOCALES_OF_MONEY_WITHOUT_CENTS` instead.
const ZERO_DECIMAL_SIGNS: [&str; 8] = ["¥", "؋", "₩", "₫", "₭", "₲", "￥", "￦"];

/// The locales whose own money, typed without decimals, shows none: the workbook's own sign there
/// takes `#,##0` (`1 Ft` in hu-HU, `$1` in es-CL), and elsewhere `#,##0.00` (`¥1` in zh-CN).
const LOCALES_OF_MONEY_WITHOUT_CENTS: [&str; 12] =
    ["es-CL", "es-CO", "es-PY", "hu-HU", "id-ID", "is-IS", "ja-JP", "ko-KR", "lo-LA", "sq-AL", "ur-PK", "vi-VN"];

/// `1,000.5`, `-$5`, `(5%)`, `5 €`: a sign, a currency sign before or after, a percent sign, read in `locale` in a
/// workbook of `workbook`'s. One too large for a number comes to an infinity.
fn amount(t: &str, locale: &Locale, workbook: &Locale) -> Option<(f64, Shape)> {
    let (by_parens, t) = match t.strip_prefix('(').and_then(|s| s.strip_suffix(')')) {
        Some(inner) => (true, inner),
        None => (false, t),
    };
    let mut s = t;
    let mut negative = false;
    let mut signed = false;
    // The currency sign, whether it comes first, and whether a space is between it and the number.
    let mut currency: Option<(&str, bool, bool)> = None;
    for _ in 0..2 {
        if !signed {
            if let Some(rest) = s.strip_prefix('-') {
                negative = true;
                signed = true;
                s = rest;
                continue;
            }
            if let Some(rest) = s.strip_prefix('+') {
                signed = true;
                s = rest;
                continue;
            }
        }
        if currency.is_none() {
            if let Some(c) = currency_at(s, locale, true) {
                s = &s[c.len()..];
                let space = s.chars().next().filter(|c| SPACES_OF_NUMBERS.contains(c));
                if let Some(space) = space {
                    s = &s[space.len_utf8()..];
                }
                let spaced = space.is_some();
                currency = Some((c, true, spaced));
                continue;
            }
        }
        break;
    }
    let mut percent = false;
    if let Some(rest) = s.strip_suffix('%') {
        percent = true;
        s = rest;
    } else if let Some(c) = currency_at(s, locale, false) {
        if currency.is_some() {
            return None;
        }
        s = &s[..s.len() - c.len()];
        let space = s.chars().next_back().filter(|c| SPACES_OF_NUMBERS.contains(c));
        if let Some(space) = space {
            s = &s[..s.len() - space.len_utf8()];
        }
        let spaced = space.is_some();
        currency = Some((c, false, spaced));
    }
    if (percent && currency.is_some()) || (by_parens && negative) {
        return None;
    }
    let (text, grouped, decimals) = digits(s, locale)?;
    let signed = |n: f64| if n == 0.0 { 0.0 } else if negative || by_parens { -n } else { n };
    let n = signed(if percent { hundredth(&text) } else { text.parse().ok()? });
    let places = if decimals { ".00" } else { "" };
    let shape = if percent {
        Shape::new(ShapeKind::Percent, format!("0{places}%"))
    } else if let Some((c, before, spaced)) = currency {
        // The locale's own sign written wide or narrow, or with or without a point after it, is the locale's own.
        let own = currency_of(locale.patterns_of_money.with_two_decimals);
        let c = match (own, other_width(c)) {
            (Some(own), Some(other)) if own == other => own,
            (Some(own), _) if own.trim_end_matches('.') == c.trim_end_matches('.') => own,
            _ => c,
        };
        let sign = if c == "$" { "$".to_owned() } else { format!("[${c}]") };
        let space = if spaced { " " } else { "" };
        // Two decimals shown, typed or not, but for money that has no cents: the workbook locale's own if its money
        // has none, any other by its sign (`¥5` takes `[$¥]#,##0` but in zh-CN).
        let workbooks = currency_of(workbook.patterns_of_money.with_two_decimals);
        let no_cents = if workbooks.is_some_and(|w| w == c || other_width(c) == Some(w)) {
            LOCALES_OF_MONEY_WITHOUT_CENTS.contains(&workbook.tag)
        } else {
            ZERO_DECIMAL_SIGNS.contains(&c)
        };
        let places = if decimals || !no_cents { ".00" } else { "" };
        let number = format!("#,##0{places}");
        let pattern = if before { format!("{sign}{space}{number}") } else { format!("{number}{space}{sign}") };
        Shape { cents_given: !decimals && !places.is_empty(), ..Shape::new(ShapeKind::Currency, pattern) }
    } else if grouped {
        Shape { hundredth: Some(signed(hundredth(&text))), ..Shape::new(ShapeKind::Grouped, format!("#,##0{places}")) }
    } else {
        Shape { kind: ShapeKind::Plain, pattern: None, hundredth: Some(signed(hundredth(&text))), in_parentheses: false, cents_given: false }
    };
    Some((n, Shape { in_parentheses: by_parens, ..shape }))
}

/// The pattern a plain number takes when pasted in a column with a grouped one (`1,000`), if it shows the digits as
/// written: up to three before the decimal sign, and none or two after. `7`, `-007` and `7.` take `#,##0`; `7.25`,
/// `.25` and `(7.25)` take `#,##0.00`; `1000`, `0007`, `7.5`, `7.0` and `1e3` take none.
pub fn grouped_alike(text: &str, locale: &Locale) -> Option<&'static str> {
    let t = text.trim_matches(' ');
    let t = t.strip_prefix('(').and_then(|s| s.strip_suffix(')')).unwrap_or(t);
    let t = t.strip_prefix(['-', '+']).unwrap_or(t);
    let (int, frac) = t.split_once(locale.decimal_sign.sign()).unwrap_or((t, ""));
    let digits = |s: &str| s.bytes().all(|b| b.is_ascii_digit());
    if int.len() > 3 || !digits(int) || !digits(frac) {
        return None;
    }
    match frac.len() {
        0 => Some("#,##0"),
        2 => Some("#,##0.00"),
        _ => None,
    }
}

/// A number written the en-US way, read with its decimal point two places left (`5` as `0.05`), so the hundredth
/// is the number nearest the decimal one.
fn hundredth(text: &str) -> f64 {
    let (mantissa, exponent) = match text.split_once('e') {
        Some((m, e)) => (m, e.parse::<i64>().ok()),
        None => (text, Some(0)),
    };
    match exponent {
        Some(e) => format!("{mantissa}e{}", e - 2).parse().unwrap_or(f64::NAN),
        None => text.parse::<f64>().map_or(f64::NAN, |n| n / 100.0),
    }
}

/// Digits in the locale's groups, its decimal sign and decimals, an exponent: the number written the en-US way
/// (`1000.5e3`), whether its digits were grouped, and whether it had decimals.
fn digits(s: &str, locale: &Locale) -> Option<(String, bool, bool)> {
    let point = locale.decimal_sign.sign();
    let group = locale.group_sign.sign();
    let (mantissa, exponent) = match s.find(['e', 'E']) {
        Some(i) => (&s[..i], Some(&s[i + 1..])),
        None => (s, None),
    };
    let (int, frac) = match mantissa.split_once(point) {
        Some((i, f)) => (i, Some(f)),
        None => (mantissa, None),
    };
    if int.is_empty() && frac.is_none_or(str::is_empty) {
        return None;
    }
    // Where digits are grouped by a space of some width, a space of any of these widths groups them; where by an
    // apostrophe, a right single quotation mark too (`664’393` in de-CH).
    let spaced = matches!(locale.group_sign, GroupSign::NoBreakSpace | GroupSign::NarrowNoBreakSpace);
    let quoted = locale.group_sign == GroupSign::Apostrophe;
    let groups = |c: char| c == group || (spaced && SPACES_OF_NUMBERS.contains(&c)) || (quoted && c == '\u{2019}');
    let mut text = String::new();
    let grouped = int.contains(groups);
    if grouped {
        let parts: Vec<&str> = int.split(groups).collect();
        let first = parts[0];
        if first.is_empty() || !first.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        // Groups of three after a first of up to three; where the locale groups by three and then twos
        // (`12,34,567`), that way too, after a first of up to two.
        let later = &parts[1..];
        let digits_only = later.iter().all(|p| p.bytes().all(|b| b.is_ascii_digit()));
        let threes = first.len() <= 3 && later.iter().all(|p| p.len() == 3);
        let twos = locale.sizes_of_groups == SizesOfGroups::ThreeAndThenTwos
            && first.len() <= 2
            && later.split_last().is_some_and(|(last, middle)| last.len() == 3 && middle.iter().all(|p| p.len() == 2));
        if !digits_only || !(threes || twos) {
            return None;
        }
        text.push_str(first);
        for part in later {
            text.push_str(part);
        }
    } else {
        if !int.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        text.push_str(int);
    }
    let mut decimals = false;
    if let Some(f) = frac {
        if !f.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        decimals = !f.is_empty();
        text.push('.');
        text.push_str(f);
    }
    if let Some(e) = exponent {
        let body = e.strip_prefix(['+', '-']).unwrap_or(e);
        if body.is_empty() || !body.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        text.push('e');
        text.push_str(e);
    }
    if text.starts_with('.') {
        text.insert(0, '0');
    }
    text.parse::<f64>().ok()?;
    Some((text, grouped, decimals))
}

fn date_time(t: &str, locales: Locales) -> Option<(f64, Shape)> {
    if let Some((time, pattern, half)) = time(t, locales.text) {
        return Some((time, Shape::new(if half { ShapeKind::TimeOfHalfDay } else { ShapeKind::Time }, pattern)));
    }
    if let Some((date, pattern)) = date(t, locales) {
        return Some((date, Shape::new(ShapeKind::Date, pattern)));
    }
    // A date, then a time with minutes: split at the last space (or an ISO `T`) that leaves a time after it. Shown
    // as month, day, hours and minutes, whatever the date and time were written as.
    for (i, c) in t.char_indices().rev() {
        if c == ' ' || c == 'T' {
            let (d, rest) = (&t[..i], t[i + 1..].trim_start());
            if !rest.contains(':') {
                continue;
            }
            if let (Some((date, _)), Some((time, _, _))) = (date(d.trim_end(), locales), time(rest, locales.text)) {
                return Some((date + time, Shape::new(ShapeKind::DateAndTime, "m/d h:mm".to_owned())));
            }
        }
    }
    None
}

/// A day and the pattern it brings: written in numbers, the short date (`m/d/yyyy`), or `yyyy-mm-dd` written so
/// where the locale doesn't write its short date so; with its month named: written as one of the locale's own patterns
/// to its end, the workbook's way of writing such a date for short; else in a form every locale reads, `mmm d, yyyy`
/// or `d mmm yyyy` by which comes first (`1 дек 2049` in bg-BG, whose pattern ends in `г.`); else (the locale's own
/// pattern with its ending left out) the workbook's way again.
fn date(t: &str, locales: Locales) -> Option<(f64, String)> {
    let locale = locales.text;
    let (y, m, d) = typed_day::read(t, locale)?;
    let serial = dates::serial_from_date(y, m, d) as f64;
    let pattern = if let Some(([a, ..], separator)) = numbers_of_a_date(t) {
        let short = locale.short_date;
        let own = short.order == DateOrder::YearMonthDay && short.separator == '-';
        if separator == '-' && a.len() == 4 && !own {
            "yyyy-mm-dd".to_owned()
        } else {
            "m/d/yyyy".to_owned()
        }
    } else if date_by_whole_template(t.trim_matches(SPACES), locale) {
        locales.workbook.patterns_of_dates_with_the_month_named.with_the_month_for_short.to_owned()
    } else if let Some(month_first) = typed_day::month_first_when_named(t, locale) {
        if month_first { "mmm d, yyyy" } else { "d mmm yyyy" }.to_owned()
    } else {
        locales.workbook.patterns_of_dates_with_the_month_named.with_the_month_for_short.to_owned()
    };
    Some((serial, pattern))
}

/// `12:30`, `12:30:15.5` (or with the locale's decimal sign, `12:30:15,5`), `1:30 PM`, `12 PM`: the time, its
/// pattern, and whether it has AM or PM.
fn time(t: &str, locale: &Locale) -> Option<(f64, String, bool)> {
    let lower = t.to_ascii_lowercase();
    let (clock, half) = if let Some(rest) = lower.strip_suffix("am") {
        (rest.trim_end(), Some(false))
    } else if let Some(rest) = lower.strip_suffix("pm") {
        (rest.trim_end(), Some(true))
    } else {
        (lower.as_str(), None)
    };
    let parts: Vec<&str> = clock.split(':').collect();
    if (parts.len() == 1 && half.is_none()) || parts.len() > 3 {
        return None;
    }
    let number = |s: &str, min: usize, max: usize| -> Option<u32> {
        (s.len() >= min && s.len() <= max && s.bytes().all(|b| b.is_ascii_digit())).then(|| s.parse().ok()).flatten()
    };
    let mut hour = number(parts[0], 1, 2)?;
    let minute = match parts.get(1) {
        Some(m) => number(m, 2, 2)?,
        None => 0,
    };
    let mut pattern = "h:mm".to_owned();
    let (second, millisecond) = match parts.get(2) {
        Some(s) => {
            pattern.push_str(":ss");
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
                pattern.push_str(".000");
            }
            (number(whole, 2, 2)?, ms)
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
            // With thousandths of a second it is shown on the 24-hour clock.
            if !pattern.ends_with(".000") {
                pattern.push_str(" AM/PM");
            }
        }
        None if hour > 23 => return None,
        None => {}
    }
    let value = (((hour * 60 + minute) * 60 + second) as f64 * 1000.0 + millisecond as f64) / 86_400_000.0;
    let half = pattern.ends_with(" AM/PM");
    Some((value, pattern, half))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::locale;

    fn en() -> Locales<'static> {
        Locales { text: locale::en_us(), workbook: locale::en_us() }
    }

    fn shaped(text: &str) -> Option<(f64, Option<String>)> {
        match read(text, en(), false) {
            Reading::Number(n, shape) => Some((n, shape.pattern)),
            _ => None,
        }
    }

    #[test]
    fn en_us() {
        assert_eq!(shaped("1"), Some((1.0, None)));
        assert_eq!(shaped("1,000.5"), Some((1000.5, Some("#,##0.00".into()))));
        assert_eq!(shaped("$5"), Some((5.0, Some("$#,##0.00".into()))));
        assert_eq!(shaped("¥5"), Some((5.0, Some("[$¥]#,##0".into()))));
        assert_eq!(shaped("5 €"), Some((5.0, Some("#,##0.00 [$€]".into()))));
        assert_eq!(shaped("5%"), Some((0.05, Some("0%".into()))));
        assert_eq!(shaped("1/2/2024"), Some((45293.0, Some("m/d/yyyy".into()))));
        assert_eq!(shaped("1:30 PM"), Some((0.5625, Some("h:mm AM/PM".into()))));
        assert_eq!(read("'5", en(), false), Reading::Text("5".into()));
        assert_eq!(read("'x", en(), false), Reading::Text("'x".into()));
        assert_eq!(read("'x", en(), true), Reading::Text("x".into()));
        assert_eq!(read("True", en(), false), Reading::Boolean(true));
        assert_eq!(read("1,00", en(), false), Reading::Text("1,00".into()));
    }
}
