//! More financial functions (securities, depreciation, rates) and the date functions they lean on.
//!
//! ACCRINT ACCRINTM COUPDAYBS COUPDAYS COUPDAYSNC COUPNCD COUPNUM COUPPCD DB DDB DISC DOLLARDE DOLLARFR
//! DURATION EFFECT FVSCHEDULE INTRATE ISPMT MDURATION NOMINAL PDURATION PRICE PRICEDISC PRICEMAT RECEIVED RRI
//! SYD TBILLEQ TBILLPRICE TBILLYIELD VDB YIELD YIELDDISC YIELDMAT EPOCHTODATE NETWORKDAYS.INTL TO_DATE
//! WORKDAY.INTL YEARFRAC
//!
//! What they share: every argument is read first, in order (text as typed, `TRUE` 1, a left-out one 0); a date's
//! fraction is dropped (rounding down) and a date outside the calendar is #NUM!; a count of payments or a day-count
//! basis drops its fraction (toward zero). An answer of −0 is 0.

mod calendar;
mod days;
mod depreciation;
mod math;
mod securities;

use crate::dates::LAST_SERIAL;
use crate::functions::{number, Answer, Arg, CallContext};
use crate::locale::Locale;
use crate::value::CellError;

/// 0001-01-01, the first date.
const FIRST_SERIAL: i64 = -693593;

/// Calls one of these functions by name; `None` for another.
pub fn call(name: &str, args: &[Arg], cx: &mut CallContext) -> Option<Answer> {
    let locale = cx.locale;
    securities::call(name, args, locale)
        .or_else(|| depreciation::call(name, args, locale))
        .or_else(|| calendar::call(name, args, locale))
}

pub fn early_reads(name: &str) -> Option<&'static str> {
    Some(match name {
        "ACCRINT" | "PRICE" | "VDB" | "YIELD" => "nnnnnn",
        "ACCRINTM" | "DB" | "DDB" | "DISC" | "INTRATE" | "PRICEDISC" | "RECEIVED" | "YIELDDISC" => "nnnn",
        "NETWORKDAYS.INTL" | "PDURATION" | "RRI" | "TBILLEQ" | "TBILLPRICE" | "TBILLYIELD" | "WORKDAY.INTL"
        | "YEARFRAC" => "nn",
        "DOLLARDE" | "DOLLARFR" | "EFFECT" | "EPOCHTODATE" | "FVSCHEDULE" | "NOMINAL" => "n",
        "COUPDAYBS" | "COUPDAYS" | "COUPDAYSNC" | "COUPNCD" | "COUPNUM" | "COUPPCD" | "ISPMT" | "SYD" => "nnn",
        "DURATION" | "MDURATION" | "PRICEMAT" | "YIELDMAT" => "nnnnn",
        _ => return None,
    })
}

/// The arguments as numbers, in order, and `defaults` for those not given.
fn numbers(args: &[Arg], defaults: &[f64], locale: &Locale) -> Result<Vec<f64>, CellError> {
    defaults.iter().enumerate().map(|(i, d)| args.get(i).map_or(Ok(*d), |a| a.number(locale))).collect()
}

/// A whole number of an argument: its fraction dropped toward zero (saturating, NaN 0).
fn whole(n: f64) -> i64 {
    n.trunc() as i64
}

/// A number as a date: its whole days, which must be in the calendar.
fn day(n: f64) -> Result<i64, CellError> {
    let d = n.floor() as i64;
    if (FIRST_SERIAL..=LAST_SERIAL).contains(&d) {
        Ok(d)
    } else {
        Err(CellError::Number)
    }
}

/// Two dates, the first before the second.
fn span(from: f64, to: f64) -> Result<(i64, i64), CellError> {
    let (from, to) = (day(from)?, day(to)?);
    if from < to {
        Ok((from, to))
    } else {
        Err(CellError::Number)
    }
}

/// A day-count basis: 0 (US 30/360), 1 (actual/actual), 2 (actual/360), 3 (actual/365) or 4 (European 30/360).
fn basis(n: i64) -> Result<u8, CellError> {
    if (0..5).contains(&n) {
        Ok(n as u8)
    } else {
        Err(CellError::Number)
    }
}

/// A number answer, −0 as 0.
fn answer(n: f64) -> Answer {
    number(if n == 0.0 { 0.0 } else { n })
}
