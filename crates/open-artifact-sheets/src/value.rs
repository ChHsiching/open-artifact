//! Values: what a cell holds and what a formula works out.

use std::fmt;
use std::rc::Rc;

use serde::{Deserialize, Serialize};

use crate::locale::Locale;

/// The errors a formula may answer, each spelled as the sheet shows it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CellError {
    #[serde(rename = "#NULL!")]
    Null,
    #[serde(rename = "#DIV/0!")]
    DivideByZero,
    #[serde(rename = "#VALUE!")]
    Value,
    /// A reference to a cell that is gone, or a formula that reads itself.
    #[serde(rename = "#REF!")]
    Reference,
    /// A name the formula does not know: a function, or a reference outside the sheet.
    #[serde(rename = "#NAME?")]
    Name,
    #[serde(rename = "#NUM!")]
    Number,
    #[serde(rename = "#N/A")]
    NotAvailable,
    /// An array that cannot spill: a cell in its way is filled, or it would leave the sheet.
    #[serde(rename = "#SPILL!")]
    Spill,
    /// A formula that cannot be read.
    #[serde(rename = "#ERROR!")]
    Error,
    /// A formula whose working out took too long.
    #[serde(rename = "#TIMEOUT!")]
    Timeout,
}

impl CellError {
    pub const ALL: [CellError; 10] = [
        CellError::Null,
        CellError::DivideByZero,
        CellError::Value,
        CellError::Reference,
        CellError::Name,
        CellError::Number,
        CellError::NotAvailable,
        CellError::Spill,
        CellError::Error,
        CellError::Timeout,
    ];

    pub fn text(self) -> &'static str {
        match self {
            CellError::Null => "#NULL!",
            CellError::DivideByZero => "#DIV/0!",
            CellError::Value => "#VALUE!",
            CellError::Reference => "#REF!",
            CellError::Name => "#NAME?",
            CellError::Number => "#NUM!",
            CellError::NotAvailable => "#N/A",
            CellError::Spill => "#SPILL!",
            CellError::Error => "#ERROR!",
            CellError::Timeout => "#TIMEOUT!",
        }
    }

    /// An error as a formula spells it (`#N/A`), in any case.
    pub fn from_text(text: &str) -> Option<CellError> {
        CellError::ALL.into_iter().find(|e| e.text().eq_ignore_ascii_case(text))
    }
}

impl fmt::Display for CellError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.text())
    }
}

/// One value: a cell's, or one of an array's.
#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    /// An empty cell: 0 to arithmetic, "" to text.
    Blank,
    Number(f64),
    Text(Rc<str>),
    Boolean(bool),
    Error(CellError),
}

impl Value {
    pub fn text(s: impl Into<Rc<str>>) -> Value {
        Value::Text(s.into())
    }

    pub fn is_error(&self) -> bool {
        matches!(self, Value::Error(_))
    }

    pub fn error(&self) -> Option<CellError> {
        match self {
            Value::Error(e) => Some(*e),
            _ => None,
        }
    }

    /// A number as a value: one that is not finite is #NUM!.
    pub fn number(n: f64) -> Value {
        if n.is_finite() {
            Value::Number(if n == 0.0 { 0.0 } else { n })
        } else {
            Value::Error(CellError::Number)
        }
    }
}

impl From<CellError> for Value {
    fn from(e: CellError) -> Value {
        Value::Error(e)
    }
}

impl From<bool> for Value {
    fn from(b: bool) -> Value {
        Value::Boolean(b)
    }
}

/// A rectangle of values, row by row.
#[derive(Clone, Debug, PartialEq)]
pub struct Array {
    rows: usize,
    columns: usize,
    values: Vec<Value>,
}

impl Array {
    pub fn new(rows: usize, columns: usize, values: Vec<Value>) -> Array {
        assert_eq!(rows * columns, values.len(), "an array's values fill it");
        Array { rows, columns, values }
    }

    pub fn from_rows(rows: Vec<Vec<Value>>) -> Array {
        let columns = rows.first().map_or(0, Vec::len);
        let n = rows.len();
        Array::new(n, columns, rows.into_iter().flatten().collect())
    }

    pub fn single(value: Value) -> Array {
        Array::new(1, 1, vec![value])
    }

    pub fn rows(&self) -> usize {
        self.rows
    }

    pub fn columns(&self) -> usize {
        self.columns
    }

    pub fn get(&self, row: usize, column: usize) -> &Value {
        &self.values[row * self.columns + column]
    }

    pub fn values(&self) -> &[Value] {
        &self.values
    }

    pub fn into_values(self) -> Vec<Value> {
        self.values
    }

    pub fn row(&self, row: usize) -> &[Value] {
        &self.values[row * self.columns..(row + 1) * self.columns]
    }

    pub fn is_single(&self) -> bool {
        self.rows == 1 && self.columns == 1
    }

    pub fn transposed(&self) -> Array {
        let mut values = Vec::with_capacity(self.values.len());
        for c in 0..self.columns {
            for r in 0..self.rows {
                values.push(self.get(r, c).clone());
            }
        }
        Array::new(self.columns, self.rows, values)
    }

    pub fn map(&self, f: impl FnMut(&Value) -> Value) -> Array {
        Array::new(self.rows, self.columns, self.values.iter().map(f).collect())
    }
}

/// The most significant digits a number keeps when it becomes text.
pub const SIGNIFICANT_DIGITS: usize = 15;

/// A number as text, as `&` and the text functions make it: 15 significant digits, written out in full while that
/// takes at most 20 characters (`0.000000000000001`, `10000000000000000000`), else as `1.5E-20`, `1E+20`.
pub fn number_text(n: f64) -> String {
    if n == 0.0 || !n.is_finite() {
        return "0".into();
    }
    let (negative, digits, exponent) = significant_digits(n, SIGNIFICANT_DIGITS);
    let sign = if negative { "-" } else { "" };
    let fixed = fixed_text(&digits, exponent);
    if fixed.len() <= 20 {
        return format!("{sign}{fixed}");
    }
    let (first, rest) = digits.split_at(1);
    let mantissa = if rest.is_empty() { first.to_owned() } else { format!("{first}.{rest}") };
    // The exponent has at least two digits: 1.23456789012345E-05.
    format!("{sign}{mantissa}E{}{:02}", if exponent >= 0 { "+" } else { "-" }, exponent.abs())
}

/// A number as text in a locale, as `&` and the text functions make it there: as [`number_text`] writes it, with
/// the locale's decimal sign (`1,5` and `1,5E-20` in de-DE) and no group signs.
pub fn number_text_in(n: f64, locale: &Locale) -> String {
    let text = number_text(n);
    match locale.decimal_sign.sign() {
        '.' => text,
        sign => text.replace('.', sign.encode_utf8(&mut [0; 4])),
    }
}

/// A number rounded to `count` significant digits: its sign, its digits (no trailing zeros) and the power of ten of
/// the first digit.
pub fn significant_digits(n: f64, count: usize) -> (bool, String, i32) {
    let text = format!("{:.*e}", count - 1, n.abs());
    let (mantissa, exponent) = text.split_once('e').expect("an exponent");
    let mut digits: String = mantissa.chars().filter(char::is_ascii_digit).collect();
    while digits.len() > 1 && digits.ends_with('0') {
        digits.pop();
    }
    (n < 0.0, digits, exponent.parse().expect("an exponent"))
}

/// Digits written out with their point: `digits` × 10^(exponent - digits + 1).
pub(crate) fn fixed_text(digits: &str, exponent: i32) -> String {
    let len = digits.len() as i32;
    if exponent < 0 {
        format!("0.{}{}", "0".repeat((-exponent - 1) as usize), digits)
    } else if exponent + 1 >= len {
        format!("{}{}", digits, "0".repeat((exponent + 1 - len) as usize))
    } else {
        let (int, frac) = digits.split_at((exponent + 1) as usize);
        format!("{int}.{frac}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn number_texts() {
        assert_eq!(number_text(1.5), "1.5");
        assert_eq!(number_text(100.0), "100");
        assert_eq!(number_text(0.1 + 0.2), "0.3");
        assert_eq!(number_text(1e19), "10000000000000000000");
        assert_eq!(number_text(1e20), "1E+20");
        assert_eq!(number_text(1e-15), "0.000000000000001");
        assert_eq!(number_text(1.5e-20), "1.5E-20");
        assert_eq!(number_text(1.23456789012345e-5), "1.23456789012345E-05");
        assert_eq!(number_text(1.23456789e-12), "1.23456789E-12");
        assert_eq!(number_text(123456789012345678.0), "123456789012346000");
        assert_eq!(number_text(2f64.powi(70)), "1.18059162071741E+21");
        assert_eq!(number_text(1.0 / 3.0), "0.333333333333333");
        assert_eq!(number_text(-1e25), "-1E+25");
        assert_eq!(number_text(999999999999999.9), "1000000000000000");
    }
}
