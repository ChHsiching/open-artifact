//! The logical functions: AND, OR, XOR and NOT, TRUE and FALSE, NA, and the IS functions. (IF, IFERROR, IFNA,
//! IFS, SWITCH and LET are worked out by the evaluator: they read only the arguments they need.)

use crate::coerce;
use crate::functions::{boolean, Answer, Arg, CallContext};
use crate::value::{CellError, Value};

/// Calls a logical function by name; `None` for one it doesn't have.
pub fn call(name: &str, args: &[Arg], cx: &mut CallContext) -> Option<Answer> {
    let value = || args[0].value().unwrap_or(Value::Blank);
    Some(match name {
        "AND" => booleans_of(args).and_then(|b| boolean(b.iter().all(|x| *x))),
        "OR" => booleans_of(args).and_then(|b| boolean(b.iter().any(|x| *x))),
        "XOR" => booleans_of(args).and_then(|b| boolean(b.iter().filter(|x| **x).count() % 2 == 1)),
        "NOT" => args[0].boolean().and_then(|b| boolean(!b)),
        "TRUE" => boolean(true),
        "FALSE" => boolean(false),
        "NA" => Err(CellError::NotAvailable),
        "ISBLANK" => boolean(matches!(value(), Value::Blank)),
        "ISERR" => boolean(matches!(value(), Value::Error(e) if e != CellError::NotAvailable)),
        "ISERROR" => boolean(matches!(value(), Value::Error(_))),
        "ISNA" => boolean(matches!(value(), Value::Error(CellError::NotAvailable))),
        "ISNUMBER" => boolean(matches!(value(), Value::Number(_))),
        "ISTEXT" => boolean(matches!(value(), Value::Text(_))),
        "ISLOGICAL" => boolean(matches!(value(), Value::Boolean(_))),
        "ISEVEN" => args[0].number(cx.locale).and_then(|n| boolean(n.trunc() % 2.0 == 0.0)),
        "ISODD" => args[0].number(cx.locale).and_then(|n| boolean(n.trunc() % 2.0 != 0.0)),
        _ => return None,
    })
}

/// The booleans AND, OR and XOR look at: in a range or an array, numbers and booleans (text and blanks are passed
/// over); an argument written as one value read as a boolean; a left-out one is FALSE. None at all is #VALUE!.
fn booleans_of(args: &[Arg]) -> Result<Vec<bool>, CellError> {
    let mut out = Vec::new();
    for arg in args {
        match arg {
            Arg::Missing => out.push(false),
            Arg::Value(v) => out.push(coerce::to_boolean(v)?),
            Arg::Cells(cells) => {
                for v in cells.values() {
                    match v {
                        Value::Number(n) => out.push(*n != 0.0),
                        Value::Boolean(b) => out.push(*b),
                        Value::Error(e) => return Err(*e),
                        Value::Text(_) | Value::Blank => {}
                    }
                }
            }
            Arg::Place(_) => return Err(CellError::Value),
        }
    }
    if out.is_empty() {
        return Err(CellError::Value);
    }
    Ok(out)
}
