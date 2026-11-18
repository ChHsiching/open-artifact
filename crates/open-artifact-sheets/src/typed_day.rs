//! The day a person means by a date typed in a locale (`readTypedDay`): what a date filter or a date picker takes.
//!
//! - numbers in the locale's order with its separator or `/`: `1/2/2020` in en-US, `1.2.2020` and `1/2/20` in
//!   de-DE; where the locale writes the year first, also in the order of its month and day, with a four-digit year
//!   (`1/2/2020` in sv-SE is 1 February);
//! - `2020-01-02` everywhere;
//! - a month named in English (no point after it) or the locale's language (as the locale writes it, or without its
//!   point: `Jan.` or `Jan` in de-DE): `Jan 2, 2020` (a year of four digits), `2 Jan 2020`, `2-Jan-20`, and the
//!   locale's own ways (`2. März 2020`, `2020年1月2日`, `2020년 1월 2일`, in any capitals), whose ending after the
//!   last number may be left out (`9. sij 2020` in hr-HR for `d. mmm yyyy.`). A locale's name may hold spaces or
//!   marks (`4 tháng 1 2020` in vi-VN) and lose the sign that ends it short (`4 ינו 2020` for `ינו׳` in he-IL).
//!
//! A two-digit year 00–49 is 20xx, 50–99 19xx. Times, and dates with times, are no day.

use crate::column_readings::{
    date_by_template, day, digits, month_named, month_starting, numbers_of_a_date, year, MonthNames, ENGLISH_MONTHS,
    SPACES,
};
use crate::locale::{DateOrder, Locale};

/// The day a text means in a locale, as (year, month, day); spaces around it are left out, but no tab or other space.
pub fn read(text: &str, locale: &Locale) -> Option<(i64, u32, u32)> {
    let t = text.trim_matches(' ');
    // Every way has a day and a year in digits, each a run of its own (a field takes every digit that follows it,
    // and stops where another may start): a text with fewer runs of digits than two is no day.
    let bytes = t.as_bytes();
    let runs = (0..bytes.len()).filter(|&i| bytes[i].is_ascii_digit() && (i == 0 || !bytes[i - 1].is_ascii_digit()));
    if runs.count() < 2 {
        return None;
    }
    if let Some((parts, separator)) = numbers_of_a_date(t) {
        return numbers(parts, separator, t, locale);
    }
    if let Some(d) = date_by_template(t, locale) {
        return Some(d);
    }
    named(t, locale).map(|(d, _)| d).or_else(|| named_in_words(t, locale))
}

/// Whether a text is a date with its month named in the forms every locale reads (`Jan 2, 2020`, `2 Jan 2020`,
/// `2-Jan-20`), and if so whether the month comes first.
pub(crate) fn month_first_when_named(text: &str, locale: &Locale) -> Option<bool> {
    named(text.trim_matches(SPACES), locale).map(|(_, month_first)| month_first)
}

/// Whether a text is a day and a month named with no year, as `2 Jan 2020` and `2-Jan-20` are written without
/// theirs (`2 Jan`, `2 January`, `2-Jan`); the 29th of February too.
pub(crate) fn day_and_month_named(text: &str, locale: &Locale) -> bool {
    let t = text.trim_matches(SPACES);
    // The day first is three parts once the year is put on: one space or two dashes before ` 2000`, one dash before
    // `-2000` (unless a name of the locale's holds a space or a dash, which `named` takes out).
    let spaced = MonthNames::of(locale).any_spaced;
    let (spaces, dashes) = (t.matches(' ').count(), t.matches('-').count());
    [(" 2000", spaces == 1 || dashes == 2), ("-2000", dashes == 1)]
        .into_iter()
        .any(|(y, may)| (spaced || may) && matches!(named(&format!("{t}{y}"), locale), Some((_, false))))
}

fn numbers([a, b, c]: [&str; 3], separator: char, t: &str, locale: &Locale) -> Option<(i64, u32, u32)> {
    // One space at most after a point (`1. 2. 2020`), and no other.
    if t.contains("  ") || t.contains(['\t', '\u{a0}', '\u{202f}']) {
        return None;
    }
    // Only one separator, with nothing after the numbers.
    if t.contains(' ') || t.ends_with('.') {
        let spaced = locale.short_date.separator == '.';
        if !spaced || separator != '.' {
            return None;
        }
    }
    if separator == '-' && a.len() == 4 {
        return day(year(a, false)?, digits(b, 1, 2)?, digits(c, 1, 2)?);
    }
    let short = locale.short_date;
    if separator != short.separator && separator != '/' {
        return None;
    }
    let in_order = |order: DateOrder, two_digits: bool| match order {
        DateOrder::MonthDayYear => day(year(c, two_digits)?, digits(a, 1, 2)?, digits(b, 1, 2)?),
        DateOrder::DayMonthYear => day(year(c, two_digits)?, digits(b, 1, 2)?, digits(a, 1, 2)?),
        DateOrder::YearMonthDay => day(year(a, two_digits)?, digits(b, 1, 2)?, digits(c, 1, 2)?),
    };
    match short.order {
        DateOrder::YearMonthDay => in_order(DateOrder::YearMonthDay, true).or_else(|| {
            let order =
                if locale.month_and_day.day_first { DateOrder::DayMonthYear } else { DateOrder::MonthDayYear };
            in_order(order, false)
        }),
        order => in_order(order, true),
    }
}

/// `Jan 2, 2020`, `January 2 2020`, `Jan 2,2020` (a year of four digits), `2 Jan 2020`, `2-Jan-20`. A month's name
/// with a space or a dash in it (`tháng 5`, `1-р сар`) is one word.
fn named(t: &str, locale: &Locale) -> Option<((i64, u32, u32), bool)> {
    // A name matched holds a space or a dash only when it is written with one (cases turn no letter into either).
    let any_spaced = MonthNames::of(locale).any_spaced;
    let spaced = t.char_indices().filter(|_| any_spaced).find_map(|(at, _)| {
        let (month, n) = month_starting(&t[at..], locale)?;
        t[at..at + n].contains([' ', '-']).then(|| format!("{}{}{}", &t[..at], ENGLISH_MONTHS[month as usize - 1], &t[at + n..]))
    });
    let t = spaced.as_deref().unwrap_or(t);
    let dashed: Vec<&str> = t.split('-').collect();
    if let [d, m, y] = dashed[..] {
        return Some((day(year(y, true)?, month_named(m, locale, true)?, digits(d, 1, 2)?)?, false));
    }
    let words: Vec<&str> = t.split(' ').collect();
    if let [m, rest @ ..] = &words[..] {
        if let Some(month) = month_named(m, locale, true) {
            let (d, y) = match rest {
                [d, y] => (d.strip_suffix(',').unwrap_or(d), *y),
                [dy] => dy.split_once(',')?,
                _ => return None,
            };
            return Some((day(year(y, false)?, month, digits(d, 1, 2)?)?, true));
        }
    }
    let [d, m, y] = words[..] else { return None };
    Some((day(year(y, true)?, month_named(m, locale, true)?, digits(d, 1, 2)?)?, false))
}

/// The same with a name of the locale's that holds spaces or a mark, or ends in a sign left out: `Meán Fómhair 8,
/// 2020` in ga-IE, `4 tháng 1 2020` in vi-VN, `4 ינו 2020` and `4-ינו-20` in he-IL (`ינו׳`).
fn named_in_words(t: &str, locale: &Locale) -> Option<(i64, u32, u32)> {
    let month_first = || {
        let (month, n) = month_starting(t, locale)?;
        let rest: Vec<&str> = t[n..].strip_prefix(' ')?.split(' ').collect();
        let (d, y) = match rest[..] {
            [d, y] => (d.strip_suffix(',').unwrap_or(d), y),
            [dy] => dy.split_once(',')?,
            _ => return None,
        };
        day(year(y, false)?, month, digits(d, 1, 2)?)
    };
    let month_between = |separator: char| {
        let (d, rest) = t.split_once(separator)?;
        let (month, n) = month_starting(rest, locale)?;
        day(year(rest[n..].strip_prefix(separator)?, true)?, month, digits(d, 1, 2)?)
    };
    month_first().or_else(|| month_between(' ')).or_else(|| month_between('-'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::locale;

    #[test]
    fn days() {
        let en = locale::en_us();
        let de = locale::find("de-DE").unwrap();
        let sv = locale::find("sv-SE").unwrap();
        assert_eq!(read("1/2/2020", en), Some((2020, 1, 2)));
        assert_eq!(read("1.2.2020", en), None);
        assert_eq!(read("1.2.2020", de), Some((2020, 2, 1)));
        assert_eq!(read("02.01.20", de), Some((2020, 1, 2)));
        assert_eq!(read("1/2/2020", sv), Some((2020, 2, 1)));
        assert_eq!(read("Jan 2, 2020", de), Some((2020, 1, 2)));
        assert_eq!(read("2. März 2020", de), Some((2020, 3, 2)));
        assert_eq!(read("2/29/2023", en), None);
        assert_eq!(read("1/2/2020 12:00", en), None);
        assert_eq!(read(" 1.2.2020 ", de), Some((2020, 2, 1)));
        assert_eq!(read("\t1.2.2020", de), None);
        assert_eq!(read("1.  2. 2020", de), None);
        assert_eq!(read("Jan  2, 2020", de), None);
        let he = locale::find("he-IL").unwrap();
        let vi = locale::find("vi-VN").unwrap();
        let es = locale::find("es-ES").unwrap();
        assert_eq!(read("4 בינו׳ 2020", he), Some((2020, 1, 4)));
        assert_eq!(read("4 ינו 2020", he), Some((2020, 1, 4)));
        assert_eq!(read("4-ינו-20", he), Some((2020, 1, 4)));
        assert_eq!(read("4 tháng 12, 2020", vi), Some((2020, 12, 4)));
        assert_eq!(read("tháng 1 4, 2020", vi), Some((2020, 1, 4)));
        assert_eq!(read("4 DE ENERO DE 2020", es), Some((2020, 1, 4)));
        assert_eq!(read("4 tháng  1 2020", vi), None);
    }
}
