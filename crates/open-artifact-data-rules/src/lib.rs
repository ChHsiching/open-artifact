//! Rule patterns of the Data type.
//!
//! A dataset rule's `pattern` is written in JavaScript regular expression
//! syntax (the `u` flag) and must match the whole value. Matching it with
//! the JavaScript engine would let a pattern backtrack for seconds on a
//! filter value someone typed, so the pattern is translated to the `regex`
//! crate's syntax with JavaScript's meaning for `.`, `\d`, `\w`, `\s` and
//! `\b`, and matched in linear time. The editor page and the CLI check load
//! this same module, so both always agree on what a rule allows.
//!
//! Syntax JavaScript reads differently, or that cannot run in linear time
//! (backreferences, lookaround, `\c`, `\k`, `\b` in a class, empty classes),
//! is refused.

use regex::{Regex, RegexBuilder};
use std::cell::RefCell;
use std::collections::HashMap;

#[cfg(target_arch = "wasm32")]
mod wasm;

const SIZE_LIMIT: usize = 1 << 20;
const NEST_LIMIT: u32 = 64;
const CACHE_LIMIT: usize = 256;
const MAX_PATTERN_CHARS: usize = 1000;

const JS_SPACE: &str = r"\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}";
const JS_WORD: &str = "0-9A-Za-z_";
const JS_DOT: &str = r"[^\n\r\x{2028}\x{2029}]";

/// Why a pattern cannot be used, or `None` when it can.
pub fn pattern_problem(pattern: &str) -> Option<String> {
    compiled(pattern).err()
}

/// Whether the whole of `value` matches `pattern`; `None` when the pattern cannot be used.
pub fn pattern_matches(pattern: &str, value: &str) -> Option<bool> {
    compiled(pattern).ok().map(|regex| regex.is_match(value))
}

thread_local! {
    static CACHE: RefCell<HashMap<String, Result<Regex, String>>> = RefCell::new(HashMap::new());
}

fn compiled(pattern: &str) -> Result<Regex, String> {
    if let Some(found) = CACHE.with(|cache| cache.borrow().get(pattern).cloned()) {
        return found;
    }
    let result = translate(pattern).and_then(|source| {
        RegexBuilder::new(&format!("^(?:{source})$"))
            .size_limit(SIZE_LIMIT)
            .dfa_size_limit(SIZE_LIMIT)
            .nest_limit(NEST_LIMIT)
            .build()
            .map_err(|error| match error {
                regex::Error::CompiledTooBig(_) => "The pattern repeats too much.".to_string(),
                _ => "The pattern isn't a valid regular expression.".to_string(),
            })
    });
    CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        if cache.len() >= CACHE_LIMIT {
            cache.clear();
        }
        cache.insert(pattern.to_string(), result.clone());
    });
    result
}

fn refuse(what: &str) -> Result<String, String> {
    Err(format!("The pattern uses {what}, which rules don't support."))
}

/// The pattern in `regex` syntax, with JavaScript's meaning kept.
pub fn translate(pattern: &str) -> Result<String, String> {
    if pattern.chars().count() > MAX_PATTERN_CHARS {
        return Err("The pattern is too long.".to_string());
    }
    let chars: Vec<char> = pattern.chars().collect();
    let mut out = String::with_capacity(pattern.len() * 2);
    let mut index = 0;
    let mut in_class = false;
    let mut class_start = 0usize;
    while index < chars.len() {
        let char = chars[index];
        if char == '\\' {
            let Some(&next) = chars.get(index + 1) else {
                return Err("The pattern ends with a lone backslash.".to_string());
            };
            index += 2;
            match next {
                'd' => out.push_str(if in_class { "0-9" } else { "[0-9]" }),
                'D' => out.push_str("[^0-9]"),
                'w' => {
                    if in_class {
                        out.push_str(JS_WORD)
                    } else {
                        out.push_str(&format!("[{JS_WORD}]"))
                    }
                }
                'W' => out.push_str(&format!("[^{JS_WORD}]")),
                's' => {
                    if in_class {
                        out.push_str(JS_SPACE)
                    } else {
                        out.push_str(&format!("[{JS_SPACE}]"))
                    }
                }
                'S' => out.push_str(&format!("[^{JS_SPACE}]")),
                'b' | 'B' if in_class => return refuse(r"\b inside a class"),
                'b' => out.push_str(r"(?-u:\b)"),
                'B' => out.push_str(r"(?-u:\B)"),
                'n' | 'r' | 't' | 'f' => {
                    out.push('\\');
                    out.push(next);
                }
                'v' => out.push_str(r"\x0B"),
                '0' if !chars.get(index).is_some_and(char::is_ascii_digit) => out.push_str(r"\x00"),
                '0'..='9' => return refuse("a backreference"),
                'c' => return refuse(r"\c"),
                'k' => return refuse(r"\k"),
                'x' => {
                    let hex: String = chars.iter().skip(index).take(2).collect();
                    if hex.len() != 2 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
                        return Err(r"A \x escape needs two hex digits.".to_string());
                    }
                    out.push_str(&format!(r"\x{{{hex}}}"));
                    index += 2;
                }
                'u' => {
                    if chars.get(index) == Some(&'{') {
                        let end = chars[index..].iter().position(|&c| c == '}').ok_or("An unclosed \\u{ escape.")?;
                        let hex: String = chars[index + 1..index + end].iter().collect();
                        if hex.is_empty() || hex.len() > 6 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
                            return Err(r"A \u{…} escape needs hex digits.".to_string());
                        }
                        out.push_str(&format!(r"\x{{{hex}}}"));
                        index += end + 1;
                    } else {
                        let hex: String = chars.iter().skip(index).take(4).collect();
                        if hex.len() != 4 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
                            return Err(r"A \u escape needs four hex digits.".to_string());
                        }
                        let code = u32::from_str_radix(&hex, 16).unwrap_or(0);
                        if (0xD800..=0xDFFF).contains(&code) {
                            return refuse("a surrogate escape");
                        }
                        out.push_str(&format!(r"\x{{{hex}}}"));
                        index += 4;
                    }
                }
                'p' | 'P' => {
                    if chars.get(index) != Some(&'{') {
                        return Err(r"A \p escape needs a {name}.".to_string());
                    }
                    let end = chars[index..].iter().position(|&c| c == '}').ok_or("An unclosed \\p{ escape.")?;
                    let name: String = chars[index + 1..index + end].iter().collect();
                    if name.contains('=') {
                        return refuse(r"\p{name=value}");
                    }
                    out.push('\\');
                    out.push(next);
                    out.push('{');
                    out.push_str(&name);
                    out.push('}');
                    index += end + 1;
                }
                other if other.is_ascii_alphanumeric() => return Err(format!(r"\{other} isn't a valid escape.")),
                other if other.is_ascii() => out.push_str(&format!(r"\x{{{:02x}}}", other as u32)),
                other => out.push(other),
            }
            continue;
        }
        if in_class {
            match char {
                ']' if index == class_start => return refuse("an empty class"),
                ']' => {
                    in_class = false;
                    out.push(']');
                }
                '[' | '&' | '~' => out.push_str(&format!(r"\x{{{:02x}}}", char as u32)),
                '-' if out.ends_with('-') => out.push_str(r"\x2d"),
                _ => out.push(char),
            }
            index += 1;
            continue;
        }
        match char {
            '[' => {
                in_class = true;
                out.push('[');
                if chars.get(index + 1) == Some(&'^') {
                    out.push('^');
                    index += 1;
                }
                class_start = index + 1;
            }
            '.' => out.push_str(JS_DOT),
            '(' => {
                if chars.get(index + 1) == Some(&'?') {
                    match chars.get(index + 2) {
                        Some(':') => {
                            out.push_str("(?:");
                            index += 3;
                            continue;
                        }
                        Some('<') if !matches!(chars.get(index + 3), Some('=') | Some('!')) => {
                            let end = chars[index..].iter().position(|&c| c == '>').ok_or("An unclosed group name.")?;
                            let name: String = chars[index + 3..index + end].iter().collect();
                            out.push_str(&format!("(?P<{name}>"));
                            index += end + 1;
                            continue;
                        }
                        Some('=') | Some('!') | Some('<') => return refuse("lookaround"),
                        _ => return refuse("inline flags"),
                    }
                }
                out.push('(');
            }
            '{' => {
                let end = chars[index..].iter().position(|&c| c == '}');
                let body: Option<String> = end.map(|end| chars[index + 1..index + end].iter().collect());
                let valid = body.as_deref().is_some_and(|body| {
                    let mut parts = body.splitn(2, ',');
                    let low = parts.next().unwrap_or("");
                    let high = parts.next();
                    !low.is_empty() && low.chars().all(|c| c.is_ascii_digit()) && high.is_none_or(|high| high.chars().all(|c| c.is_ascii_digit()))
                });
                let (Some(end), Some(body), true) = (end, body, valid) else {
                    return Err("A lone { has to be escaped.".to_string());
                };
                out.push('{');
                out.push_str(&body);
                out.push('}');
                index += end + 1;
                continue;
            }
            '}' => return Err("A lone } has to be escaped.".to_string()),
            _ => out.push(char),
        }
        index += 1;
    }
    if in_class {
        return Err("The pattern has an unclosed class.".to_string());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn matches(pattern: &str, value: &str) -> bool {
        pattern_matches(pattern, value).unwrap_or_else(|| panic!("{pattern}: {:?}", pattern_problem(pattern)))
    }

    #[test]
    fn matches_the_whole_value() {
        assert!(matches("[A-Z]{2}", "US"));
        assert!(!matches("[A-Z]{2}", "USA"));
        assert!(!matches("a|b", "ab"));
        assert!(matches("a|b", "b"));
    }

    #[test]
    fn keeps_javascript_classes() {
        assert!(matches(r"\d+", "2024"));
        assert!(!matches(r"\d+", "٢٠٢٤"));
        assert!(!matches(r"\w+", "é"));
        assert!(matches(r"a\sb", "a\u{3000}b"));
        assert!(!matches(r"a.b", "a\rb"));
        assert!(matches(r"a.b", "a😀b"));
        assert!(matches(r"[\d-]+", "2024-01"));
        assert!(matches(r"[^\s]+", "abc"));
        assert!(matches(r"\bcat\b", "cat"));
    }

    #[test]
    fn reads_escapes() {
        assert!(matches(r"a\-b", "a-b"));
        assert!(matches(r"\x41\u0042\u{43}", "ABC"));
        assert!(matches(r"[a\]]+", "a]a"));
        assert!(matches(r"\p{L}+", "Ünïcode"));
        assert!(matches(r"\/\.", "/."));
        assert!(matches("[[]", "["));
        assert!(matches("[a&&b]+", "&&a"));
    }

    #[test]
    fn refuses_what_javascript_reads_differently() {
        for pattern in [r"(a)\1", r"(?=a)a", r"(?<!a)b", r"\cA", r"\k<x>", r"[\b]", "[]", "[^]", r"\p{Script=Greek}", "(?i)a", "a{", "}", r"\q"] {
            assert!(pattern_problem(pattern).is_some(), "{pattern}");
        }
    }

    #[test]
    fn named_groups_and_counted_repeats() {
        assert!(matches(r"(?<year>\d{4})-(?:\d{2})", "2024-01"));
        assert!(matches(r"x{2,}", "xxx"));
        assert!(pattern_problem("((a{100}){100}){100}").is_some());
    }

    #[test]
    fn stays_fast_on_backtracking_traps() {
        let value = format!("{}!", "a".repeat(5000));
        assert!(!matches("(a+)+$", &value));
        assert!(!matches("(a|aa)*", &value));
    }
}
