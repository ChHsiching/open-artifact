//! The database functions: a range with a header row (the table), a column of it, and a
//! range of conditions (the condition table).
//!
//! DAVERAGE DCOUNT DCOUNTA DGET DMAX DMIN DPRODUCT DSTDEV DSTDEVP DSUM DVAR DVARP
//!
//! - **The column** is a header's text (in any case, as `compare_texts` sees it; a number header is written as the
//!   locale writes it, a boolean as `TRUE` or `FALSE`; blank and error headers never match), the first header that
//!   matches; or a number (or boolean), cut to a whole number, from 1 to the table's width. Anything else is #VALUE!.
//!   DCOUNT and DCOUNTA may leave it out (or give a blank cell): they then count the rows that match.
//! - **The condition table** has a header row and at least one row of conditions (else #VALUE!). A row matches a
//!   table row when every condition in it does; the table row counts when any row matches. A blank cell or empty
//!   text is no condition (a row of none matches every table row). The conditions are read row by row, left to right,
//!   before any table row: an error in one is the answer, and one under a header no table header matches is #VALUE!.
//! - **A condition** is read as COUNTIF reads one (`criteria`), except that text with no operator that is not a
//!   number, a boolean or an error matches texts that start with it (`"App"` matches "Apple"; `"=App"` only "App").
//! - The column's cells in the rows that match are then worked out as the function's plain counterpart does: an
//!   error among them is the answer (not for DCOUNT and DCOUNTA). DGET answers the one cell that is not blank
//!   (none is #VALUE!, more than one #NUM!), bringing that cell's number format; the rest bring none.

use std::cmp::Ordering;

use crate::coerce::{self, compare_texts};
use crate::criteria::Criterion;
use crate::functions::{number, value, Answer, Arg, CallContext, Cells};
use crate::locale::Locale;
use crate::typed_text;
use crate::value::{CellError, Value};

/// Calls one of these functions by name; `None` for a name that is not one.
pub fn call(name: &str, args: &[Arg], cx: &mut CallContext) -> Option<Answer> {
    if !matches!(
        name,
        "DAVERAGE" | "DCOUNT" | "DCOUNTA" | "DGET" | "DMAX" | "DMIN" | "DPRODUCT" | "DSTDEV" | "DSTDEVP" | "DSUM" | "DVAR" | "DVARP"
    ) {
        return None;
    }
    Some(database(name, args, cx))
}

/// None of these reads an argument early.
pub fn early_reads(_name: &str) -> Option<&'static str> {
    None
}

fn database(name: &str, args: &[Arg], cx: &mut CallContext) -> Answer {
    let locale = cx.locale;
    let table = cells_of(&args[0])?;
    let counts = matches!(name, "DCOUNT" | "DCOUNTA");
    let column = column_of(&table, &args[1], counts, locale)?;
    let conditions = conditions_of(&table, &cells_of(&args[2])?, locale)?;
    let rows: Vec<usize> = (1..table.rows())
        .filter(|&r| conditions.iter().any(|row| row.iter().all(|(c, criterion)| criterion.matches(table.get(r, *c)))))
        .collect();
    let Some(column) = column else {
        return number(rows.len() as f64);
    };
    let cells = || rows.iter().map(|&r| table.get(r, column));
    match name {
        "DCOUNT" => number(cells().filter(|v| matches!(v, Value::Number(_))).count() as f64),
        "DCOUNTA" => number(cells().filter(|v| !matches!(v, Value::Blank)).count() as f64),
        "DGET" => {
            let found: Vec<usize> = rows.into_iter().filter(|&r| !matches!(table.get(r, column), Value::Blank)).collect();
            let r = match found[..] {
                [] => return Err(CellError::Value),
                [r] => r,
                _ => return Err(CellError::Number),
            };
            cx.sources = Some(vec![Some((0, r, column))]);
            value(table.get(r, column).clone())
        }
        _ => {
            let mut n = Vec::new();
            for v in cells() {
                match v {
                    Value::Number(x) => n.push(*x),
                    Value::Error(e) => return Err(*e),
                    _ => {}
                }
            }
            match name {
                "DSUM" => number(n.into_iter().fold(0.0, coerce::add)),
                "DAVERAGE" => average(&n),
                "DMAX" => number(n.into_iter().reduce(f64::max).unwrap_or(0.0)),
                "DMIN" => number(n.into_iter().reduce(f64::min).unwrap_or(0.0)),
                "DPRODUCT" => number(if n.is_empty() { 0.0 } else { n.into_iter().product() }),
                "DVAR" => number(variance(&n, true)?),
                "DVARP" => number(variance(&n, false)?),
                "DSTDEV" => number(variance(&n, true)?.sqrt()),
                _ => number(variance(&n, false)?.sqrt()),
            }
        }
    }
}

/// A table or a condition table: a range or an array as it is, one value as a table of one cell; left out, #VALUE!.
fn cells_of(arg: &Arg) -> Result<Cells, CellError> {
    match arg {
        Arg::Missing | Arg::Place(_) => Err(CellError::Value),
        arg => Ok(arg.cells()),
    }
}

/// A header as text: blank and error headers have none.
fn header_text(v: &Value, locale: &Locale) -> Option<std::rc::Rc<str>> {
    match v {
        Value::Blank | Value::Error(_) => None,
        v => coerce::to_text(v, locale).ok(),
    }
}

/// The table column a header names: the first whose header is the same text, in any case.
fn column_named(table: &Cells, name: &str, locale: &Locale) -> Option<usize> {
    (0..table.columns())
        .find(|&c| header_text(table.get(0, c), locale).is_some_and(|h| compare_texts(&h, name) == Ordering::Equal))
}

/// The column argument: a header's text or a column's number from 1. `None` when DCOUNT or DCOUNTA (`counts`) leave
/// it out or give a blank cell.
fn column_of(table: &Cells, arg: &Arg, counts: bool, locale: &Locale) -> Result<Option<usize>, CellError> {
    let n = match arg.value()? {
        Value::Blank if counts => return Ok(None),
        Value::Blank => return Err(CellError::Value),
        Value::Error(e) => return Err(e),
        Value::Text(t) => return column_named(table, &t, locale).map(Some).ok_or(CellError::Value),
        Value::Number(n) => n.trunc(),
        Value::Boolean(b) => f64::from(u8::from(b)),
    };
    if n >= 1.0 && n <= table.columns() as f64 {
        Ok(Some(n as usize - 1))
    } else {
        Err(CellError::Value)
    }
}

/// The condition table's rows, each a list of (table column, condition), read row by row.
fn conditions_of(table: &Cells, conditions: &Cells, locale: &Locale) -> Result<Vec<Vec<(usize, Criterion)>>, CellError> {
    if conditions.rows() < 2 {
        return Err(CellError::Value);
    }
    let mut rows = Vec::with_capacity(conditions.rows() - 1);
    for r in 1..conditions.rows() {
        let mut row = Vec::new();
        for c in 0..conditions.columns() {
            let v = conditions.get(r, c);
            match v {
                Value::Blank => continue,
                Value::Text(t) if t.is_empty() => continue,
                Value::Error(e) => return Err(*e),
                _ => {}
            }
            let column = header_text(conditions.get(0, c), locale)
                .and_then(|h| column_named(table, &h, locale))
                .ok_or(CellError::Value)?;
            row.push((column, criterion(v, locale)));
        }
        rows.push(row);
    }
    Ok(rows)
}

/// A condition: as COUNTIF's, but text with no operator that is not a number, a boolean or an error matches texts
/// that start with it (a `*` after it; after a last `~` that takes nothing, `~~*`, so the `~` is still itself).
fn criterion(v: &Value, locale: &Locale) -> Criterion {
    if let Value::Text(t) = v {
        let plain = !t.starts_with(['<', '>', '='])
            && typed_text::number_of_text_in(t, locale).is_none()
            && !t.eq_ignore_ascii_case("TRUE")
            && !t.eq_ignore_ascii_case("FALSE")
            && CellError::from_text(t).is_none();
        if plain {
            let mut chars = t.chars();
            let mut lone_tilde = false;
            while let Some(c) = chars.next() {
                if c == '~' && chars.next().is_none() {
                    lone_tilde = true;
                }
            }
            let tail = if lone_tilde { "~*" } else { "*" };
            return Criterion::new(&Value::text(format!("{t}{tail}")), locale);
        }
    }
    Criterion::new(v, locale)
}

/// The sum (adding as `+` does) over the count; none at all is #DIV/0! (as AVERAGE).
fn average(n: &[f64]) -> Answer {
    if n.is_empty() {
        return Err(CellError::DivideByZero);
    }
    number(n.iter().copied().fold(0.0, coerce::add) / n.len() as f64)
}

/// The variance of a sample (`sample`, over n − 1) or of a whole population (over n), as VAR and VARP work it out:
/// the numbers are taken from the first one, then their squared differences from their mean are added up. Too few
/// numbers are #DIV/0!.
fn variance(n: &[f64], sample: bool) -> Result<f64, CellError> {
    let count = n.len();
    let over = if sample { count.saturating_sub(1) } else { count };
    if over == 0 {
        return Err(CellError::DivideByZero);
    }
    let first = n[0];
    let mean = n.iter().map(|x| x - first).sum::<f64>() / count as f64;
    let squares = n.iter().map(|x| {
        let d = (x - first) - mean;
        d * d
    });
    Ok(squares.sum::<f64>() / over as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn matches(condition: &str, cell: &str) -> bool {
        criterion(&Value::text(condition), crate::locale::en_us()).matches(&Value::text(cell))
    }

    #[test]
    fn plain_text_matches_the_start() {
        assert!(matches("App", "apple pie"));
        assert!(!matches("pple", "apple"));
        assert!(!matches("=App", "Apple"));
        assert!(matches("a~", "a~b"));
        assert!(!matches("a~", "a*"));
        assert!(matches("a~~", "a~b"));
        assert!(!matches("a~b", "a~b"));
        assert!(matches("a?", "a*"));
        assert!(!matches("105", "1050x"));
    }
}
