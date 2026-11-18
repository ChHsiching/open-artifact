//! ERROR.TYPE, ISBETWEEN, ISEMAIL, ISFORMULA, ISNONTEXT, ISURL and TYPE.

use std::cmp::Ordering;

use crate::coerce;
use crate::functions::{boolean, number, Answer, Arg, Cells};
use crate::value::{CellError, Value};

/// ERROR.TYPE(value): the number of an error, #NULL! 1 to #N/A 7; another error is #ERROR!, a value that is no
/// error #N/A.
pub fn error_type(args: &[Arg]) -> Answer {
    let n = match args[0].value()? {
        Value::Error(CellError::Null) => 1.0,
        Value::Error(CellError::DivideByZero) => 2.0,
        Value::Error(CellError::Value) => 3.0,
        Value::Error(CellError::Reference) => 4.0,
        Value::Error(CellError::Name) => 5.0,
        Value::Error(CellError::Number) => 6.0,
        Value::Error(CellError::NotAvailable) => 7.0,
        Value::Error(_) => return Err(CellError::Error),
        _ => return Err(CellError::NotAvailable),
    };
    number(n)
}

/// ISBETWEEN(value, lower, upper, [include lower], [include upper]): whether the value lies between the two, as `<`
/// compares; each end is included unless told not to (a left-out or blank flag is false).
pub fn is_between(args: &[Arg]) -> Answer {
    let x = args[0].value()?;
    let lower = args[1].value()?;
    let upper = args[2].value()?;
    let include = |i: usize| args.get(i).map_or(Ok(true), Arg::boolean);
    let (include_lower, include_upper) = (include(3)?, include(4)?);
    let above = match coerce::compare(&x, &lower) {
        Ordering::Greater => true,
        Ordering::Equal => include_lower,
        Ordering::Less => false,
    };
    let below = match coerce::compare(&x, &upper) {
        Ordering::Less => true,
        Ordering::Equal => include_upper,
        Ordering::Greater => false,
    };
    boolean(above && below)
}

/// ISNONTEXT(value): whether the value is not text (blank, a number, a boolean or an error).
pub fn is_non_text(args: &[Arg]) -> Answer {
    boolean(!matches!(args[0].value()?, Value::Text(_)))
}

/// Whether cells are a range of one cell (not an array).
fn is_one_cell(cells: &Cells) -> bool {
    cells.place.is_some_and(|p| p.top == p.bottom && p.left == p.right)
}

/// ISFORMULA(cell): whether one cell holds a formula; more than one cell, or a value, is #VALUE!.
///
/// The call is not told what a cell holds, only its value, so a cell answers false here.
pub fn is_formula(args: &[Arg]) -> Answer {
    match &args[0] {
        Arg::Cells(cells) if is_one_cell(cells) => boolean(false),
        _ => Err(CellError::Value),
    }
}

/// TYPE(value): 1 for a number (or blank), 2 text, 4 a boolean, 16 an error, 64 an array or a range of more than one
/// cell.
pub fn type_(args: &[Arg]) -> Answer {
    let v = match &args[0] {
        Arg::Cells(cells) if is_one_cell(cells) => cells.get(0, 0).clone(),
        Arg::Cells(_) => return number(64.0),
        arg => arg.value()?,
    };
    number(match v {
        Value::Blank | Value::Number(_) => 1.0,
        Value::Text(_) => 2.0,
        Value::Boolean(_) => 4.0,
        Value::Error(_) => 16.0,
    })
}

/// ISEMAIL(value): whether the value is text that reads as an email address.
pub fn is_email_value(args: &[Arg]) -> Answer {
    boolean(matches!(args[0].value()?, Value::Text(t) if is_email(&t)))
}

/// ISURL(value): whether the value is text that reads as a link.
pub fn is_url_value(args: &[Arg]) -> Answer {
    boolean(matches!(args[0].value()?, Value::Text(t) if is_url(&t)))
}

/// An address `local@domain`: the local part dot-separated words of ASCII letters, digits and ``!#$%&'*+/=?^_`{|}~-``;
/// the domain as [`is_domain`] reads it.
fn is_email(t: &str) -> bool {
    let mut parts = t.split('@');
    let (Some(local), Some(domain), None) = (parts.next(), parts.next(), parts.next()) else { return false };
    let word_char = |c: char| c.is_ascii_alphanumeric() || "!#$%&'*+/=?^_`{|}~-".contains(c);
    local.split('.').all(|w| !w.is_empty() && w.chars().all(word_char)) && is_domain(domain)
}

/// A character a domain's names may hold beside ASCII letters and digits: any but ASCII and white space.
fn is_international(c: char) -> bool {
    !c.is_ascii() && !c.is_whitespace()
}

/// A domain: two or more names joined by dots, each of letters and digits with `-` inside; the last, of two or more
/// letters.
fn is_domain(domain: &str) -> bool {
    let labels: Vec<&str> = domain.split('.').collect();
    if labels.len() < 2 {
        return false;
    }
    let label_ok = |l: &str| {
        !l.is_empty()
            && !l.starts_with('-')
            && !l.ends_with('-')
            && l.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || is_international(c))
    };
    let last = labels[labels.len() - 1];
    labels.iter().all(|l| label_ok(l))
        && last.chars().count() >= 2
        && last.chars().all(|c| c.is_ascii_alphabetic() || is_international(c))
}

/// An IPv4 address: four numbers from 0 to 255, without leading zeros.
fn is_ipv4(host: &str) -> bool {
    let parts: Vec<&str> = host.split('.').collect();
    parts.len() == 4
        && parts.iter().all(|p| {
            !p.is_empty()
                && p.len() <= 3
                && p.bytes().all(|b| b.is_ascii_digit())
                && !(p.len() > 1 && p.starts_with('0'))
                && p.parse::<u16>().is_ok_and(|n| n <= 255)
        })
}

/// Text that strips an ASCII prefix in any case.
fn strip_prefix_in_any_case<'a>(t: &'a str, prefix: &str) -> Option<&'a str> {
    let head = t.get(..prefix.len())?;
    head.eq_ignore_ascii_case(prefix).then(|| &t[prefix.len()..])
}

/// A link: `mailto:` and an email address; or, after `http://`, `https://` or `ftp://` if any, a domain (or, after
/// one of those, an IPv4 address), a port up to 65535 if any, and a path, query or fragment with no white space.
fn is_url(t: &str) -> bool {
    if let Some(address) = strip_prefix_in_any_case(t, "mailto:") {
        return is_email(address);
    }
    let after_scheme =
        ["http://", "https://", "ftp://"].iter().find_map(|scheme| strip_prefix_in_any_case(t, scheme));
    let rest = after_scheme.unwrap_or(t);
    let host_end = rest.find([':', '/', '?', '#']).unwrap_or(rest.len());
    let (host, mut rest) = rest.split_at(host_end);
    if !(is_domain(host) || (after_scheme.is_some() && is_ipv4(host))) {
        return false;
    }
    if let Some(after_colon) = rest.strip_prefix(':') {
        let digits = after_colon.bytes().take_while(u8::is_ascii_digit).count();
        let port = after_colon[..digits].trim_start_matches('0');
        if digits == 0 || port.len() > 5 || port.parse::<u32>().unwrap_or(0) > 65_535 {
            return false;
        }
        rest = &after_colon[digits..];
    }
    rest.is_empty() || (rest.starts_with(['/', '?', '#']) && !rest.chars().any(char::is_whitespace))
}
