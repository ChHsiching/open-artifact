//! Conditions, as COUNTIF, SUMIF, AVERAGEIF, the *IFS functions and MAXIFS/MINIFS read them.
//!
//! A condition that is a number, a boolean or a blank cell matches cells equal to it (a blank cell is 0); one that
//! is text may start with an operator (`=`, `<>`, `<`, `<=`, `>`, `>=`, nothing meaning `=`), and what follows is
//! read as text is read as a number in the workbook's locale (`">2,5"` and `"1.2.2020"` in de-DE):
//!
//! - **nothing**: `""` matches blank cells and empty text, `"="` only blank cells, `"<>"` every cell that is not
//!   blank; `">"`, `">="`, `"<"` and `"<="` compare texts with the empty text (so they match texts only);
//! - **a number** (`"1"`, `"50%"`, `"$5"`, `"1/1/2020"`): equality matches numbers equal to it, to 15 significant
//!   digits, and texts equal to it as written (`"01"` matches the number 1 and the text "01"); comparisons match
//!   numbers only;
//! - **TRUE or FALSE**, in any case: booleans, and for equality texts written the same;
//! - **an error** (`"#N/A"`), in any case: equality matches that error and texts written the same; comparisons
//!   match nothing;
//! - **any other text**: equality matches texts, in any case, with wildcards (`*` any run of characters, `?` one
//!   character, `~` before any character takes it as it is; a `~` at the end is itself); comparisons match texts
//!   only, compared character by character in lowercase, wildcards taken as they are.
//!
//! `<>` matches exactly the cells equality doesn't, blanks and errors among them.

use std::cmp::Ordering;

use crate::coerce::{compare_numbers, compare_texts};
use crate::locale::Locale;
use crate::typed_text;
use crate::value::{CellError, Value};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Operator {
    Equal,
    NotEqual,
    Less,
    LessOrEqual,
    Greater,
    GreaterOrEqual,
}

#[derive(Clone, Debug)]
enum Operand {
    /// The text after the operator is empty.
    Nothing,
    Number(f64),
    Boolean(bool),
    Error(CellError),
    Text,
}

/// A condition, read once and matched against many cells.
#[derive(Clone, Debug)]
pub struct Criterion {
    operator: Operator,
    /// Written with no operator (only matters for an empty condition).
    plain: bool,
    operand: Operand,
    /// The text after the operator, as written: what texts are matched or compared against. `None` when the
    /// condition was a number or a boolean, which match only their own kind.
    text: Option<String>,
    /// The text as a wildcard pattern, for equality.
    pattern: Vec<Piece>,
}

#[derive(Clone, Debug, PartialEq)]
enum Piece {
    Char(char),
    AnyChar,
    AnyRun,
}

impl Criterion {
    pub fn new(condition: &Value, locale: &Locale) -> Criterion {
        let plain_value = |operand| Criterion { operator: Operator::Equal, plain: true, operand, text: None, pattern: Vec::new() };
        let written = match condition {
            Value::Blank => return plain_value(Operand::Number(0.0)),
            Value::Number(n) => return plain_value(Operand::Number(*n)),
            Value::Boolean(b) => return plain_value(Operand::Boolean(*b)),
            Value::Error(e) => return plain_value(Operand::Error(*e)),
            Value::Text(t) => t,
        };
        let (operator, rest) = split_operator(written);
        let operand = if rest.is_empty() {
            Operand::Nothing
        } else if let Some(n) = typed_text::number_of_text_in(rest, locale) {
            Operand::Number(n)
        } else if rest.eq_ignore_ascii_case("TRUE") {
            Operand::Boolean(true)
        } else if rest.eq_ignore_ascii_case("FALSE") {
            Operand::Boolean(false)
        } else if let Some(e) = CellError::from_text(rest) {
            Operand::Error(e)
        } else {
            Operand::Text
        };
        Criterion {
            operator: operator.unwrap_or(Operator::Equal),
            plain: operator.is_none(),
            operand,
            text: Some(rest.to_owned()),
            pattern: pattern(rest),
        }
    }

    pub fn matches(&self, value: &Value) -> bool {
        match self.operator {
            Operator::Equal => self.equals(value),
            Operator::NotEqual => !self.equals(value),
            operator => {
                let order = match (&self.operand, value) {
                    (Operand::Number(n), Value::Number(m)) => compare_numbers(*m, *n),
                    (Operand::Boolean(b), Value::Boolean(c)) => c.cmp(b),
                    (Operand::Nothing | Operand::Text, Value::Text(t)) => compare_texts(t, self.text.as_deref().unwrap_or("")),
                    _ => return false,
                };
                match operator {
                    Operator::Less => order == Ordering::Less,
                    Operator::LessOrEqual => order != Ordering::Greater,
                    Operator::Greater => order == Ordering::Greater,
                    _ => order != Ordering::Less,
                }
            }
        }
    }

    fn equals(&self, value: &Value) -> bool {
        if let Operand::Nothing = self.operand {
            return match value {
                Value::Blank => true,
                Value::Text(t) => self.plain && t.is_empty(),
                _ => false,
            };
        }
        let same_kind = match (&self.operand, value) {
            (Operand::Number(n), Value::Number(m)) => compare_numbers(*m, *n) == Ordering::Equal,
            (Operand::Boolean(b), Value::Boolean(c)) => b == c,
            (Operand::Error(e), Value::Error(f)) => e == f,
            _ => false,
        };
        same_kind
            || match (value, &self.text) {
                (Value::Text(t), Some(_)) => matches_pattern(&self.pattern, t),
                _ => false,
            }
    }
}

/// A wildcard pattern (`*`, `?`, `~`), as conditions and lookups read it; it matches texts in any case.
#[derive(Clone, Debug)]
pub struct Wildcard(Vec<Piece>);

impl Wildcard {
    pub fn new(pattern_text: &str) -> Wildcard {
        Wildcard(pattern(pattern_text))
    }

    pub fn matches(&self, text: &str) -> bool {
        matches_pattern(&self.0, text)
    }
}

fn split_operator(text: &str) -> (Option<Operator>, &str) {
    for (prefix, operator) in [
        ("<>", Operator::NotEqual),
        ("<=", Operator::LessOrEqual),
        (">=", Operator::GreaterOrEqual),
        ("<", Operator::Less),
        (">", Operator::Greater),
        ("=", Operator::Equal),
    ] {
        if let Some(rest) = text.strip_prefix(prefix) {
            return (Some(operator), rest);
        }
    }
    (None, text)
}

fn pattern(text: &str) -> Vec<Piece> {
    let mut out = Vec::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '*' => out.push(Piece::AnyRun),
            '?' => out.push(Piece::AnyChar),
            '~' => match chars.next() {
                Some(next) => out.extend(next.to_lowercase().map(Piece::Char)),
                None => out.push(Piece::Char('~')),
            },
            c => out.extend(c.to_lowercase().map(Piece::Char)),
        }
    }
    out
}

/// Whether a text matches a pattern, in any case.
fn matches_pattern(pattern: &[Piece], text: &str) -> bool {
    let text: Vec<char> = text.chars().flat_map(char::to_lowercase).collect();
    // Greedy matching with one point to come back to: the last `*`.
    let (mut p, mut t) = (0, 0);
    let mut back: Option<(usize, usize)> = None;
    while t < text.len() {
        match pattern.get(p) {
            Some(Piece::AnyRun) => {
                back = Some((p, t));
                p += 1;
            }
            Some(Piece::AnyChar) => {
                p += 1;
                t += 1;
            }
            Some(Piece::Char(c)) if *c == text[t] => {
                p += 1;
                t += 1;
            }
            _ => match back {
                Some((bp, bt)) => {
                    back = Some((bp, bt + 1));
                    p = bp + 1;
                    t = bt + 1;
                }
                None => return false,
            },
        }
    }
    pattern[p..].iter().all(|piece| *piece == Piece::AnyRun)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn count(condition: Value, cells: &[Value]) -> usize {
        let c = Criterion::new(&condition, crate::locale::en_us());
        cells.iter().filter(|v| c.matches(v)).count()
    }

    fn t(s: &str) -> Value {
        Value::text(s)
    }

    #[test]
    fn wildcards() {
        let p = |s| pattern(s);
        assert!(matches_pattern(&p("a*"), "ABC"));
        assert!(matches_pattern(&p("a?c"), "abc"));
        assert!(!matches_pattern(&p("a?c"), "ac"));
        assert!(matches_pattern(&p("*"), ""));
        assert!(matches_pattern(&p("a~b"), "ab"));
        assert!(!matches_pattern(&p("a~b"), "a~b"));
        assert!(matches_pattern(&p("a~~b"), "a~b"));
        assert!(matches_pattern(&p("*~"), "a~"));
        assert!(matches_pattern(&p("a~*b"), "a*b"));
        assert!(!matches_pattern(&p("a~*b"), "axb"));
        assert!(matches_pattern(&p("*b*"), "a b"));
        assert!(matches_pattern(&p("é"), "É"));
        assert!(!matches_pattern(&p("ss"), "ß"));
    }

    #[test]
    fn conditions() {
        let cells = [t("1"), Value::Number(0.1 + 0.2), Value::Blank, t(""), Value::Number(1.0), Value::Boolean(true), t("TRUE"), Value::Error(CellError::NotAvailable), t("#N/A"), t("abc")];
        assert_eq!(count(t("1"), &cells), 2);
        assert_eq!(count(Value::Number(1.0), &cells), 1);
        assert_eq!(count(t("0.3"), &cells), 1);
        assert_eq!(count(t(">0.3"), &cells), 1);
        assert_eq!(count(t(""), &cells), 2);
        assert_eq!(count(t("="), &cells), 1);
        assert_eq!(count(t("<>"), &cells), 9);
        assert_eq!(count(t(">="), &cells), 5);
        assert_eq!(count(t("true"), &cells), 2);
        assert_eq!(count(Value::Boolean(true), &cells), 1);
        assert_eq!(count(t("#n/a"), &cells), 2);
        assert_eq!(count(t(">#N/A"), &cells), 0);
        assert_eq!(count(t("<>1"), &cells), 8);
        assert_eq!(count(Value::Blank, &cells), 0);
        assert_eq!(count(t("<b"), &cells), 4);
    }
}
