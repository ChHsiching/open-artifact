//! A formula as a person in a locale writes it (`readFormulaTextInLocale`). Formulas are kept the en-US way; where
//! the locale writes a decimal comma, numbers take a comma (`1,5`), arguments are split by `;`, and the columns of
//! an array by `\` (`=SUM(1,5;{1\2})`). Texts in quotes and quoted sheet names stay as they are; anything that isn't
//! a formula is treated the same, character by character. In braces `,` and `\` change places, and `;` stays.

use crate::locale::{DecimalSign, Locale};

/// Characters that end a name and are no part of one: operators and the like, and ASCII's other control characters.
fn is_punctuation(c: char) -> bool {
    matches!(
        c,
        '=' | '(' | ')' | ',' | ';' | ':' | '-' | '+' | '*' | '/' | '^' | '&' | '<' | '>' | '@' | '#' | '?' | '\\'
            | '{' | '}' | '[' | ']' | '|' | '~' | '`' | '%' | '!' | '"' | '\''
    ) || (c.is_ascii_control() && !is_space(c))
}

/// ASCII's spaces, which change nothing about what came before. Other spaces (a no-break space) are read as part of
/// a name, though a name of nothing but such spaces is no value either.
fn is_space(c: char) -> bool {
    matches!(c, ' ' | '\t' | '\n' | '\u{b}' | '\u{c}' | '\r')
}

/// The formula text written the locale's way.
pub fn in_locale(text: &str, locale: &Locale) -> String {
    if locale.decimal_sign == DecimalSign::Point {
        return text.to_owned();
    }
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    // Whether in an array's braces (a `}` ends them, however many `{` came before: `{{1,2},3}` is `{{1\2};3}`), and
    // whether the last thing (spaces aside) was a value, after which a point starts no number (`1.5.2`, `A1 .5`).
    let mut in_braces = false;
    let mut after_value = false;
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            '"' | '\'' => {
                out.push(c);
                i += 1;
                while i < chars.len() {
                    let d = chars[i];
                    out.push(d);
                    i += 1;
                    if d == c {
                        if chars.get(i) == Some(&c) {
                            out.push(c);
                            i += 1;
                        } else {
                            break;
                        }
                    }
                }
                after_value = true;
            }
            c if is_space(c) => {
                out.push(c);
                i += 1;
            }
            ',' => {
                out.push(if in_braces { '\\' } else { ';' });
                i += 1;
                after_value = false;
            }
            ';' if !in_braces => {
                out.push(',');
                i += 1;
                after_value = false;
            }
            '\\' if in_braces => {
                out.push(',');
                i += 1;
                after_value = false;
            }
            '{' => {
                in_braces = true;
                out.push(c);
                i += 1;
                after_value = false;
            }
            '}' => {
                in_braces = false;
                out.push(c);
                i += 1;
                after_value = true;
            }
            ')' | '%' | '!' => {
                out.push(c);
                i += 1;
                after_value = true;
            }
            '0'..='9' => {
                i = number(&chars, i, &mut out, ',');
                after_value = true;
            }
            // Right after a value a point and digits are still read as a number, exponent and all, but kept as
            // they are (`1.5.5E+3.5` is `1,5.5E+3.5`).
            '.' if chars.get(i + 1).is_some_and(char::is_ascii_digit) => {
                i = number(&chars, i, &mut out, if after_value { '.' } else { ',' });
                after_value = true;
            }
            c if is_punctuation(c) => {
                out.push(c);
                i += 1;
                after_value = false;
            }
            _ => {
                // A name, a reference or a word: up to the next punctuation or space, points and digits included.
                let start = i;
                while i < chars.len() && !is_punctuation(chars[i]) && !is_space(chars[i]) {
                    out.push(chars[i]);
                    i += 1;
                }
                if !chars[start..i].iter().all(|c| c.is_whitespace()) {
                    after_value = true;
                }
            }
        }
    }
    out
}

/// Copies a number from `i` with its point as `point`: digits, a point, digits, and an exponent with digits.
fn number(chars: &[char], mut i: usize, out: &mut String, point: char) -> usize {
    while i < chars.len() && chars[i].is_ascii_digit() {
        out.push(chars[i]);
        i += 1;
    }
    if chars.get(i) == Some(&'.') {
        out.push(point);
        i += 1;
        while i < chars.len() && chars[i].is_ascii_digit() {
            out.push(chars[i]);
            i += 1;
        }
    }
    if matches!(chars.get(i), Some('e' | 'E')) {
        let mut j = i + 1;
        if matches!(chars.get(j), Some('+' | '-')) {
            j += 1;
        }
        if chars.get(j).is_some_and(char::is_ascii_digit) {
            while j < chars.len() && chars[j].is_ascii_digit() {
                j += 1;
            }
            out.extend(&chars[i..j]);
            i = j;
        }
    }
    i
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::locale;

    #[test]
    fn in_german() {
        let de = locale::find("de-DE").unwrap();
        for (en, local) in [
            ("=SUM(1.5,2)", "=SUM(1,5;2)"),
            ("={1,2;3,4}", "={1\\2;3\\4}"),
            ("={1\\2}", "={1,2}"),
            ("={{1,2},3}", "={{1\\2};3}"),
            ("=IF(A1>1.5,\"x,y\",2.5)", "=IF(A1>1,5;\"x,y\";2,5)"),
            ("=1.5.2", "=1,5.2"),
            ("=x.5", "=x.5"),
            ("=1 .5", "=1 .5"),
            ("=1.5.5E+3.5", "=1,5.5E+3.5"),
            ("x\u{1}.5", "x\u{1},5"),
            ("1\u{b}.5", "1\u{b}.5"),
            ("(\u{a0} .5", "(\u{a0} ,5"),
            ("1\u{a0} .5", "1\u{a0} .5"),
            ("=SUM(1.5;2)", "=SUM(1,5,2)"),
            ("1.5", "1,5"),
        ] {
            assert_eq!(in_locale(en, de), local, "{en}");
        }
        assert_eq!(in_locale("=SUM(1.5,2)", locale::en_us()), "=SUM(1.5,2)");
    }
}
