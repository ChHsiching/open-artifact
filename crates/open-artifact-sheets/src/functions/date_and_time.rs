//! The date and time functions. A date is a serial number (days since 1899-12-30, `dates.rs`), from 0001-01-01
//! (-693593) to 9999-12-31; a time is the fraction of a day.
//!
//! What they share: every argument is read as a number first (text as typed), in order, and only then checked, so
//! `DAYS(2958466, "x")` is #VALUE! (DATE's year below 0 is the one exception); a date's fraction (its time) is dropped, rounding down (`DAY(-0.5)` is the 29th
//! of December 1899); a date outside the calendar is #NUM!.

use crate::coerce;
use crate::dates::{self, LAST_SERIAL};
use crate::functions::{number, Answer, Arg, CallContext};
use crate::locale::Locale;
use crate::typed_text;
use crate::value::{CellError, Value};

/// 0001-01-01, the first date.
const FIRST_SERIAL: i64 = -693593;

/// Calls a date and time function by name; `None` for one it doesn't have.
pub fn call(name: &str, args: &[Arg], cx: &mut CallContext) -> Option<Answer> {
    let locale = cx.locale;
    Some(match name {
        "DATE" => date(args, locale),
        "DATEDIF" => datedif(args, locale),
        "DATEVALUE" => datevalue(args, locale),
        "DAY" => part_of_date(args, |(_, _, day)| day as f64, locale),
        "DAYS" => days(args, locale),
        "DAYS360" => days360(args, locale),
        "EDATE" => edate(args, false, locale),
        "EOMONTH" => edate(args, true, locale),
        "HOUR" => seconds_of_day(args, locale).and_then(|s| number((s / 3600) as f64)),
        "ISOWEEKNUM" => args[0].number(locale).and_then(serial).and_then(|d| number(iso_week(d) as f64)),
        "MINUTE" => seconds_of_day(args, locale).and_then(|s| number((s / 60 % 60) as f64)),
        "MONTH" => part_of_date(args, |(_, month, _)| month as f64, locale),
        "NETWORKDAYS" => networkdays(args, locale),
        "NOW" => cx.now.ok_or(CellError::NotAvailable).and_then(number),
        "SECOND" => seconds_of_day(args, locale).and_then(|s| number((s % 60) as f64)),
        "TIME" => time(args, locale),
        "TIMEVALUE" => timevalue(args, locale),
        "TODAY" => cx.now.ok_or(CellError::NotAvailable).and_then(|now| number(now.floor())),
        "WEEKDAY" => weekday(args, locale),
        "WEEKNUM" => weeknum(args, locale),
        "WORKDAY" => workday(args, locale),
        "YEAR" => part_of_date(args, |(year, _, _)| year as f64, locale),
        _ => return None,
    })
}

/// A number as a date: its whole days (rounding down), which must be in the calendar.
fn serial(n: f64) -> Result<i64, CellError> {
    let day = n.floor();
    if day < FIRST_SERIAL as f64 || day > LAST_SERIAL as f64 {
        return Err(CellError::Number);
    }
    Ok(day as i64)
}

/// The day of the week, 0 for Sunday to 6 for Saturday (serial 1, 1899-12-31, was a Sunday).
fn day_of_week(serial: i64) -> i64 {
    (serial - 1).rem_euclid(7)
}

fn part_of_date(args: &[Arg], part: fn((i64, u32, u32)) -> f64, locale: &Locale) -> Answer {
    let day = serial(args[0].number(locale)?)?;
    number(part(dates::date_from_serial(day)))
}

/// DATE: a year from 0 to 1899 is that many years after 1900; months and days past the end (or before the start)
/// of the year or month count on into the next (or back into the previous) one. Fractions are dropped.
fn date(args: &[Arg], locale: &Locale) -> Answer {
    let year = args[0].number(locale)?;
    // A year before 0 is #NUM! before the month and day are read.
    if year < 0.0 {
        return Err(CellError::Number);
    }
    let month = args[1].number(locale)?;
    let day = args[2].number(locale)?;
    let mut year = year.trunc();
    if year < 1900.0 {
        year += 1900.0;
    }
    if year > 9999.0 {
        return Err(CellError::Number);
    }
    let months = year * 12.0 + month.trunc() - 1.0;
    let first = first_of_month(months)?;
    let day = first as f64 + day.trunc() - 1.0;
    if day < FIRST_SERIAL as f64 || day > LAST_SERIAL as f64 {
        return Err(CellError::Number);
    }
    number(day)
}

/// The serial of the first day of a month counted from January of year 0 (`year * 12 + month - 1`): #NUM! outside
/// the years 1 to 9999.
fn first_of_month(months: f64) -> Result<i64, CellError> {
    let year = (months / 12.0).floor();
    if !(1.0..=9999.0).contains(&year) {
        return Err(CellError::Number);
    }
    let month = (months - year * 12.0) as u32 + 1;
    Ok(dates::serial_from_date(year as i64, month, 1))
}

/// TIME: hours, minutes and seconds (fractions dropped) added up as whole seconds, and what is left of whole days.
/// A total below 0 is #NUM!; so is one past what 64-bit integers hold (`TIME(2.6E15,0,0)`), though a second
/// argument past it is held at the largest one (`TIME(0,0,1E300)` is a time).
fn time(args: &[Arg], locale: &Locale) -> Answer {
    let hour = args[0].number(locale)?;
    let minute = args[1].number(locale)?;
    let second = args[2].number(locale)?;
    let total = (hour as i64)
        .checked_mul(3600)
        .zip((minute as i64).checked_mul(60))
        .and_then(|(h, m)| h.checked_add(m))
        .and_then(|hm| hm.checked_add(second as i64))
        .ok_or(CellError::Number)?;
    if total < 0 {
        return Err(CellError::Number);
    }
    number((total % 86400) as f64 / 86400.0)
}

/// The time of day of a date and time to the nearest second (half a second rounds up, away from zero), as seconds
/// from midnight: HOUR, MINUTE and SECOND. The date must be in the calendar.
fn seconds_of_day(args: &[Arg], locale: &Locale) -> Result<i64, CellError> {
    let n = args[0].number(locale)?;
    serial(n)?;
    // The seconds since 1899-12-30 to 15 significant digits, then to the nearest second.
    let seconds = coerce::compared_number(n * 86400.0).round();
    Ok((seconds as i64).rem_euclid(86400))
}

/// DATEVALUE and TIMEVALUE read text only, as typed in the locale (`typed_text.rs`): its date and its time of day.
fn date_and_time_of(args: &[Arg], locale: &Locale) -> Result<(Option<f64>, Option<f64>), CellError> {
    let Value::Text(text) = args[0].value()? else {
        return Err(CellError::Value);
    };
    typed_text::date_and_time_in(&text, locale).ok_or(CellError::Value)
}

/// DATEVALUE: the date of a text with a date (a time with it is dropped); a time alone is #VALUE!.
fn datevalue(args: &[Arg], locale: &Locale) -> Answer {
    match date_and_time_of(args, locale)? {
        (Some(date), _) => number(date),
        _ => Err(CellError::Value),
    }
}

/// TIMEVALUE: the time of a text with a time (a date with it is dropped); a date alone is #VALUE!.
fn timevalue(args: &[Arg], locale: &Locale) -> Answer {
    match date_and_time_of(args, locale)? {
        (_, Some(time)) => number(time),
        _ => Err(CellError::Value),
    }
}

/// DAYS(end, start): the days from one date to the other.
fn days(args: &[Arg], locale: &Locale) -> Answer {
    let end = args[0].number(locale)?;
    let start = args[1].number(locale)?;
    let (end, start) = (serial(end)?, serial(start)?);
    number((end - start) as f64)
}

/// DAYS360: every month counted as 30 days. The US method (the default): a start on the 31st or on the last day of
/// February counts as the 30th; an end on the 31st counts as the 30th when the start (so counted) is the 30th,
/// else as the 1st of the next month. The European method: a 31st, start or end, counts as the 30th.
fn days360(args: &[Arg], locale: &Locale) -> Answer {
    let start = args[0].number(locale)?;
    let end = args[1].number(locale)?;
    let european = match args.get(2) {
        Some(arg) => arg.boolean()?,
        None => false,
    };
    let (sy, sm, sd) = dates::date_from_serial(serial(start)?);
    let (mut ey, mut em, ed) = dates::date_from_serial(serial(end)?);
    let mut sd = sd as i64;
    let mut ed = ed as i64;
    if european {
        sd = sd.min(30);
        ed = ed.min(30);
    } else {
        if sd == 31 || (sm == 2 && sd == dates::days_in_month(sy, 2) as i64) {
            sd = 30;
        }
        if ed == 31 {
            if sd < 30 {
                ed = 1;
                if em == 12 {
                    em = 1;
                    ey += 1;
                } else {
                    em += 1;
                }
            } else {
                ed = 30;
            }
        }
    }
    number(((ey - sy) * 360 + (em as i64 - sm as i64) * 30 + ed - sd) as f64)
}

/// EDATE and EOMONTH: the date the given number of months (its fraction dropped) after the start; EDATE keeps the
/// day of the month (the month's last day when it has fewer), EOMONTH gives the month's last day.
fn edate(args: &[Arg], end_of_month: bool, locale: &Locale) -> Answer {
    let start = args[0].number(locale)?;
    let months = args[1].number(locale)?;
    let (year, month, day) = dates::date_from_serial(serial(start)?);
    let first = first_of_month(year as f64 * 12.0 + (month - 1) as f64 + months.trunc())?;
    let (year, month, _) = dates::date_from_serial(first);
    let last = dates::days_in_month(year, month);
    let day = if end_of_month { last } else { day.min(last) };
    number((first + day as i64 - 1) as f64)
}

/// DATEDIF: whole years (Y), months (M) or days (D) from the start to the end; the days apart ignoring months and
/// years (MD), the months ignoring years (YM), the days ignoring years (YD). A start after the end, or another
/// unit, is #NUM!.
fn datedif(args: &[Arg], locale: &Locale) -> Answer {
    let start = args[0].number(locale)?;
    let end = args[1].number(locale)?;
    let unit = args[2].text(locale)?;
    let (start, end) = (serial(start)?, serial(end)?);
    if start > end {
        return Err(CellError::Number);
    }
    let (sy, sm, sd) = dates::date_from_serial(start);
    let (ey, em, ed) = dates::date_from_serial(end);
    let months = (ey - sy) * 12 + em as i64 - sm as i64 - i64::from(ed < sd);
    let answer = match unit.to_ascii_uppercase().as_str() {
        "Y" => months / 12,
        "M" => months,
        "D" => end - start,
        "YM" => months % 12,
        "MD" => {
            if ed >= sd {
                (ed - sd) as i64
            } else {
                // From the start's day in the month before the end's; when that month is too short, from the
                // first of the end's month.
                let (py, pm) = if em == 1 { (ey - 1, 12) } else { (ey, em - 1) };
                let length = dates::days_in_month(py, pm);
                if sd <= length {
                    (length - sd + ed) as i64
                } else {
                    ed as i64 - 1
                }
            }
        }
        "YD" => {
            // From the start's day and month in the end's year, or the year before when that is after the end;
            // 29 February in a year without one is 1 March.
            let mut from = anniversary(ey, sm, sd);
            if from > end {
                from = anniversary(ey - 1, sm, sd);
            }
            end - from
        }
        _ => return Err(CellError::Number),
    };
    number(answer as f64)
}

/// A day and month in a year, a day past the month's end counting on into the next month.
fn anniversary(year: i64, month: u32, day: u32) -> i64 {
    dates::serial_from_date(year, month, 1) + day as i64 - 1
}

/// WEEKDAY: 1 (the default) counts Sunday 1 to Saturday 7; 2 Monday 1 to Sunday 7; 3 Monday 0 to Sunday 6; 11 to 17
/// count from 1 for Monday to Sunday. Another kind is #NUM!.
fn weekday(args: &[Arg], locale: &Locale) -> Answer {
    let date = args[0].number(locale)?;
    // Not given, the kind is 1; left out after a comma (`WEEKDAY(1,)`), it is blank: 0.
    let kind = match args.get(1) {
        Some(arg) => arg.number(locale)?,
        None => 1.0,
    };
    let day = day_of_week(serial(date)?);
    let answer = match kind.trunc() {
        1.0 => day + 1,
        2.0 => (day + 6) % 7 + 1,
        3.0 => (day + 6) % 7,
        k if (11.0..=17.0).contains(&k) => (day - (k as i64 - 10) % 7).rem_euclid(7) + 1,
        _ => return Err(CellError::Number),
    };
    number(answer as f64)
}

/// WEEKNUM: week 1 has January 1, and weeks start on Sunday (1, the default, and 17), Monday (2 and 11), Tuesday
/// (12) … Saturday (16); 21 counts as ISOWEEKNUM does. Another kind is #NUM!.
fn weeknum(args: &[Arg], locale: &Locale) -> Answer {
    let date = args[0].number(locale)?;
    let kind = match args.get(1) {
        Some(arg) => arg.number(locale)?,
        None => 1.0,
    };
    let day = serial(date)?;
    let week_start = match kind.trunc() {
        1.0 => 0,
        2.0 => 1,
        21.0 => return number(iso_week(day) as f64),
        k if (11.0..=17.0).contains(&k) => (k as i64 - 10) % 7,
        _ => return Err(CellError::Number),
    };
    let (year, _, _) = dates::date_from_serial(day);
    let january_1 = dates::serial_from_date(year, 1, 1);
    let offset = (day_of_week(january_1) - week_start).rem_euclid(7);
    number(((day - january_1 + offset) / 7 + 1) as f64)
}

/// The ISO week: weeks start on Monday, and a week belongs to the year its Thursday is in.
fn iso_week(day: i64) -> i64 {
    let monday_based = (day_of_week(day) + 6) % 7;
    let thursday = day - monday_based + 3;
    let (year, _, _) = dates::date_from_serial(thursday);
    (thursday - dates::serial_from_date(year, 1, 1)) / 7 + 1
}

/// The holidays of NETWORKDAYS and WORKDAY, as dates, in order: in a range or an array numbers are dates (out of
/// the calendar #NUM!), blanks are passed over, and text, booleans and errors are the answer; one value written
/// as itself is read as a number.
fn holidays(arg: Option<&Arg>, locale: &Locale) -> Result<Vec<i64>, CellError> {
    let mut out = Vec::new();
    match arg {
        None | Some(Arg::Missing) => {}
        Some(Arg::Value(v)) => out.push(serial(coerce::to_number(v, locale)?)?),
        Some(Arg::Cells(cells)) => {
            for v in cells.values() {
                match v {
                    Value::Number(n) => out.push(serial(*n)?),
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
fn working_holidays(holidays: Vec<i64>) -> Vec<i64> {
    let mut out: Vec<i64> = holidays.into_iter().filter(|d| is_working_day(*d)).collect();
    out.sort_unstable();
    out.dedup();
    out
}

fn is_working_day(day: i64) -> bool {
    (1..=5).contains(&day_of_week(day))
}

/// The working days (Monday to Friday) from `from` to `to`, both included (`from <= to`).
fn working_days_between(from: i64, to: i64) -> i64 {
    // Working days before a day, counted from a Monday far back.
    let before = |day: i64| {
        let since_monday = day - FIRST_SERIAL; // -693593 was a Monday
        since_monday.div_euclid(7) * 5 + since_monday.rem_euclid(7).min(5)
    };
    before(to + 1) - before(from)
}

/// NETWORKDAYS: the working days from the start to the end, both included, less the holidays among them; negative
/// when the end is before the start.
fn networkdays(args: &[Arg], locale: &Locale) -> Answer {
    let start = args[0].number(locale)?;
    let end = args[1].number(locale)?;
    let holidays = holidays(args.get(2), locale)?;
    let (start, end) = (serial(start)?, serial(end)?);
    let (from, to) = if start <= end { (start, end) } else { (end, start) };
    let off = working_holidays(holidays).into_iter().filter(|d| (from..=to).contains(d)).count() as i64;
    let count = working_days_between(from, to) - off;
    number(if start <= end { count } else { -count } as f64)
}

/// The date `days` working days after (before, when negative) `start`, with no holidays.
fn add_working_days(start: i64, days: i64) -> i64 {
    let monday_based = (day_of_week(start) + 6) % 7;
    if days > 0 {
        // A weekend counts as its Friday.
        let (start, weekday) = if monday_based > 4 { (start - (monday_based - 4), 4) } else { (start, monday_based) };
        let total = weekday + days;
        start - weekday + total / 5 * 7 + total % 5
    } else {
        // A weekend counts as its Monday.
        let (start, weekday) = if monday_based > 4 { (start + (7 - monday_based), 0) } else { (start, monday_based) };
        let total = 4 - weekday - days;
        start + (4 - weekday) - total / 5 * 7 - total % 5
    }
}

/// WORKDAY: the date the given number of working days (its fraction dropped) after or before the start, passing
/// over weekends and holidays; 0 days is the start itself.
fn workday(args: &[Arg], locale: &Locale) -> Answer {
    let start = args[0].number(locale)?;
    let days = args[1].number(locale)?;
    let holidays = holidays(args.get(2), locale)?;
    let start = serial(start)?;
    let days = days.trunc();
    if days.abs() > (LAST_SERIAL - FIRST_SERIAL) as f64 {
        return Err(CellError::Number);
    }
    let mut days = days as i64;
    let holidays = working_holidays(holidays);
    let mut at = start;
    while days != 0 {
        let next = add_working_days(at, days);
        // Holidays passed on the way put the date off by as many working days.
        let passed = if days > 0 {
            holidays.iter().filter(|d| **d > at && **d <= next).count() as i64
        } else {
            -(holidays.iter().filter(|d| **d < at && **d >= next).count() as i64)
        };
        at = next;
        days = passed;
    }
    if !(FIRST_SERIAL..=LAST_SERIAL).contains(&at) {
        return Err(CellError::Number);
    }
    number(at as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn working_days() {
        // 2020-01-01 was a Wednesday.
        assert_eq!(working_days_between(43831, 43861), 23);
        assert_eq!(working_days_between(43834, 43835), 0);
        assert_eq!(working_days_between(FIRST_SERIAL, LAST_SERIAL), 2608615);
        assert_eq!(add_working_days(43831, 10), 43845);
        assert_eq!(add_working_days(43831, -10), 43817);
        assert_eq!(add_working_days(43834, 1), 43836);
        assert_eq!(add_working_days(43834, -1), 43833);
        assert_eq!(add_working_days(43835, -1), 43833);
    }

    #[test]
    fn weeks() {
        assert_eq!(iso_week(43831), 1);
        assert_eq!(iso_week(44197), 53);
        assert_eq!(iso_week(FIRST_SERIAL), 1);
        assert_eq!(iso_week(LAST_SERIAL), 52);
    }
}
