//! The date functions: EPOCHTODATE, TO_DATE, YEARFRAC, and NETWORKDAYS.INTL and WORKDAY.INTL with a weekend of
//! one's choosing.

use super::days::year_fraction;
use super::{answer, basis, day, numbers, whole, FIRST_SERIAL};
use crate::coerce;
use crate::dates::LAST_SERIAL;
use crate::functions::{number, value, Answer, Arg};
use crate::locale::Locale;
use crate::value::{CellError, Value};

pub fn call(name: &str, args: &[Arg], locale: &Locale) -> Option<Answer> {
    Some(match name {
        "EPOCHTODATE" => numbers(args, &[0.0, 1.0], locale).and_then(|n| {
            let per_day = match whole(n[1]) {
                1 => 86_400.0,
                2 => 86_400_000.0,
                3 => 86_400_000_000.0,
                _ => return Err(CellError::Number),
            };
            if n[0] < 0.0 {
                return Err(CellError::Number);
            }
            let serial = n[0] / per_day + 25569.0;
            day(serial)?;
            answer(serial)
        }),
        "TO_DATE" => match args[0].value() {
            Ok(Value::Blank) => number(0.0),
            Ok(v) => value(v),
            Err(e) => Err(e),
        },
        "YEARFRAC" => numbers(args, &[0.0, 0.0, 0.0], locale).and_then(|n| {
            let (a, b) = (day(n[0])?, day(n[1])?);
            answer(year_fraction(basis(whole(n[2]))?, a.min(b), a.max(b)))
        }),
        "NETWORKDAYS.INTL" => working_days(args, locale),
        "WORKDAY.INTL" => workday(args, locale),
        _ => return None,
    })
}

/// The days of the week (Monday first) that are the weekend: a number 1 to 7 for two days (1 Saturday and
/// Sunday, 2 Sunday and Monday, …), 11 to 17 for one (11 Sunday, 12 Monday, …), or seven 0s and 1s from Monday,
/// 1 for the weekend. Left out or blank, 1.
fn weekend(arg: Option<&Arg>) -> Result<[bool; 7], CellError> {
    let code = match arg.map(Arg::value).transpose()? {
        None | Some(Value::Blank) => 1,
        Some(Value::Number(n)) => whole(n),
        Some(Value::Boolean(b)) => b as i64,
        Some(Value::Text(t)) => {
            if t.len() != 7 || !t.bytes().all(|b| b == b'0' || b == b'1') {
                return Err(CellError::Value);
            }
            let bytes = t.as_bytes();
            return Ok(std::array::from_fn(|d| bytes[d] == b'1'));
        }
        Some(Value::Error(e)) => return Err(e),
    };
    let (first, last) = match code {
        1..=7 => (code + 4, code + 5),
        11..=17 => (code - 5, code - 5),
        _ => return Err(CellError::Number),
    };
    Ok(std::array::from_fn(|d| {
        let d = d as i64;
        (first <= d && d <= last) || (first <= d + 7 && d + 7 <= last)
    }))
}

/// The day of the week, 0 for Monday to 6 for Sunday (serial 2, 1900-01-01, was a Monday).
fn weekday(serial: i64) -> usize {
    (serial - 2).rem_euclid(7) as usize
}

/// The holidays, as dates: in a range or an array numbers are dates (out of the calendar #NUM!), blanks are passed
/// over, and text, booleans and errors are the answer; one value written as itself is read as a number.
fn holidays(arg: Option<&Arg>, locale: &Locale) -> Result<Vec<i64>, CellError> {
    let mut out = Vec::new();
    match arg {
        None | Some(Arg::Missing) => {}
        Some(Arg::Value(v)) => out.push(day(coerce::to_number(v, locale)?)?),
        Some(Arg::Cells(cells)) => {
            for v in cells.values() {
                match v {
                    Value::Number(n) => out.push(day(*n)?),
                    Value::Blank => {}
                    Value::Text(_) | Value::Boolean(_) => return Err(CellError::Value),
                    Value::Error(e) => return Err(*e),
                }
            }
        }
        Some(Arg::Place(_)) => return Err(CellError::Value),
    }
    Ok(out)
}

/// The holidays that fall on working days, each once, in order.
fn working_holidays(holidays: Vec<i64>, weekend: &[bool; 7]) -> Vec<i64> {
    let mut out: Vec<i64> = holidays.into_iter().filter(|d| !weekend[weekday(*d)]).collect();
    out.sort_unstable();
    out.dedup();
    out
}

/// The working days from `from` to `to`, both included (`from <= to`).
fn working_days_between(from: i64, to: i64, weekend: &[bool; 7]) -> i64 {
    let per_week = weekend.iter().filter(|w| !**w).count() as i64;
    let total = to - from + 1;
    let rest = (from + total / 7 * 7..=to).filter(|d| !weekend[weekday(*d)]).count() as i64;
    total / 7 * per_week + rest
}

/// NETWORKDAYS.INTL: the working days from the start to the end, both included, less the holidays among them;
/// negative when the end is before the start.
fn working_days(args: &[Arg], locale: &Locale) -> Answer {
    let n = numbers(args, &[0.0, 0.0], locale)?;
    let holidays = holidays(args.get(3), locale)?;
    let weekend = weekend(args.get(2))?;
    let (start, end) = (day(n[0])?, day(n[1])?);
    let (from, to) = (start.min(end), start.max(end));
    let off = working_holidays(holidays, &weekend).into_iter().filter(|d| (from..=to).contains(d)).count() as i64;
    let count = working_days_between(from, to, &weekend) - off;
    number(if start <= end { count } else { -count } as f64)
}

/// The day `days` working days after (before, when negative) `at`, with no holidays.
fn add_working_days(at: i64, days: i64, weekend: &[bool; 7], per_week: i64) -> i64 {
    let step = days.signum();
    let mut left = days.abs();
    let weeks = (left - 1) / per_week;
    let mut at = at + step * 7 * weeks;
    left -= weeks * per_week;
    while left > 0 {
        at += step;
        if !weekend[weekday(at)] {
            left -= 1;
        }
    }
    at
}

/// WORKDAY.INTL: the date the given number of working days (its fraction dropped) after or before the start,
/// passing over the weekend and holidays; 0 days is the start itself. A week all weekend is #VALUE!.
fn workday(args: &[Arg], locale: &Locale) -> Answer {
    let n = numbers(args, &[0.0, 0.0], locale)?;
    let holidays = holidays(args.get(3), locale)?;
    let weekend = weekend(args.get(2))?;
    let start = day(n[0])?;
    let per_week = weekend.iter().filter(|w| !**w).count() as i64;
    if per_week == 0 {
        return Err(CellError::Value);
    }
    let mut days = whole(n[1]);
    if days.unsigned_abs() > (LAST_SERIAL - FIRST_SERIAL) as u64 {
        return Err(CellError::Number);
    }
    let holidays = working_holidays(holidays, &weekend);
    let mut at = start;
    while days != 0 {
        let next = add_working_days(at, days, &weekend, per_week);
        // Holidays passed on the way put the date off by as many working days.
        let passed = if days > 0 {
            holidays.iter().filter(|d| **d > at && **d <= next).count() as i64
        } else {
            -(holidays.iter().filter(|d| **d < at && **d >= next).count() as i64)
        };
        at = next;
        days = passed;
        if !(FIRST_SERIAL..=LAST_SERIAL).contains(&at) {
            return Err(CellError::Number);
        }
    }
    number(at as f64)
}
