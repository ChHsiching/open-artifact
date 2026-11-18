//! Numbers written in other bases (BASE, DECIMAL, BIN2DEC, DEC2HEX, …), bits (BITAND, BITLSHIFT, …) and Roman
//! numerals (ROMAN, ARABIC).

use crate::functions::{number, text, Answer, Arg};
use crate::locale::Locale;
use crate::value::CellError;

const TWO_TO_48: f64 = 281_474_976_710_656.0;
const TWO_TO_53: f64 = 9_007_199_254_740_992.0;

/// Calls one of these functions by name; `None` for one not theirs.
pub fn call(name: &str, args: &[Arg], locale: &Locale) -> Option<Answer> {
    Some(match name {
        "BASE" => base(args, locale),
        "DECIMAL" => decimal(args, locale),
        "BIN2DEC" => to_decimal(args, locale, 2),
        "OCT2DEC" => to_decimal(args, locale, 8),
        "HEX2DEC" => to_decimal(args, locale, 16),
        "DEC2BIN" => from_decimal(args, locale, 2),
        "DEC2OCT" => from_decimal(args, locale, 8),
        "DEC2HEX" => from_decimal(args, locale, 16),
        "BITAND" => bits(args, locale, |a, b| a & b),
        "BITOR" => bits(args, locale, |a, b| a | b),
        "BITXOR" => bits(args, locale, |a, b| a ^ b),
        "BITLSHIFT" => shift(args, locale, 1.0),
        "BITRSHIFT" => shift(args, locale, -1.0),
        "ROMAN" => roman(args, locale),
        "ARABIC" => arabic(args, locale),
        _ => return None,
    })
}

/// BASE(number, base, [places]): the number (0 or more) cut to a whole number below 2⁵³, in upper-case digits of
/// the base (2 to 36), padded with zeros to the places (0 to 255; more digits are kept).
fn base(args: &[Arg], locale: &Locale) -> Answer {
    let n = args[0].number(locale)?;
    let radix = args[1].number(locale)?.trunc();
    let places = match args.get(2) {
        Some(a) => a.number(locale)?,
        None => 0.0,
    };
    if n < 0.0 || places < 0.0 {
        return Err(CellError::Number);
    }
    let (n, places) = (n.trunc(), places.trunc());
    if n >= TWO_TO_53 || !(2.0..=36.0).contains(&radix) || places > 255.0 {
        return Err(CellError::Number);
    }
    let digits = digits_of(n as u64, radix as u64);
    text(format!("{digits:0>width$}", width = places as usize))
}

fn digits_of(mut n: u64, radix: u64) -> String {
    let mut out = Vec::new();
    loop {
        out.push(std::char::from_digit((n % radix) as u32, radix as u32).unwrap().to_ascii_uppercase());
        n /= radix;
        if n == 0 {
            break;
        }
    }
    out.iter().rev().collect()
}

/// DECIMAL(text, base): the digits (either case) read in the base, 2 to 36; a number or boolean is read as its
/// text. Anything but digits of the base (a sign, a point, a space) is #NUM!; "" is 0.
fn decimal(args: &[Arg], locale: &Locale) -> Answer {
    let s = args[0].text(locale)?;
    let radix = args[1].number(locale)?.trunc();
    if !(2.0..=36.0).contains(&radix) {
        return Err(CellError::Number);
    }
    let mut n = 0.0;
    for c in s.chars() {
        let d = c.to_digit(radix as u32).ok_or(CellError::Number)?;
        n = n * radix + d as f64;
    }
    number(n)
}

/// How many bits a digit of the base holds.
fn bits_per_digit(radix: u32) -> u32 {
    radix.trailing_zeros()
}

/// BIN2DEC, OCT2DEC and HEX2DEC: up to 10 digits (a number is read as its text); ten digits with the top bit set
/// are negative (two's complement). "" is 0.
fn to_decimal(args: &[Arg], locale: &Locale, radix: u32) -> Answer {
    let s = args[0].text(locale)?;
    if s.chars().count() > 10 {
        return Err(CellError::Number);
    }
    let mut n: u64 = 0;
    for c in s.chars() {
        n = n * radix as u64 + c.to_digit(radix).ok_or(CellError::Number)? as u64;
    }
    let width = 10 * bits_per_digit(radix);
    let mut n = n as f64;
    if s.len() == 10 && n >= 2f64.powi(width as i32 - 1) {
        n -= 2f64.powi(width as i32);
    }
    number(n)
}

/// DEC2BIN, DEC2OCT and DEC2HEX(number, [places]): the number cut toward zero, within ten digits' two's
/// complement (−512 to 511 in binary); a negative one is its ten-digit complement. The places, when given, are 1
/// to 10 (cut to a whole number) and must hold the digits of a number that is not negative.
fn from_decimal(args: &[Arg], locale: &Locale, radix: u32) -> Answer {
    let n = args[0].number(locale)?.trunc();
    let places = match args.get(1) {
        Some(a) => Some(a.number(locale)?),
        None => None,
    };
    let width = 10 * bits_per_digit(radix) as i32;
    let half = 2f64.powi(width - 1);
    if n < -half || n >= half {
        return Err(CellError::Number);
    }
    let places = places.map(f64::trunc);
    if places.is_some_and(|p| !(1.0..=10.0).contains(&p)) {
        return Err(CellError::Number);
    }
    if n < 0.0 {
        return text(digits_of((n + 2f64.powi(width)) as u64, radix as u64));
    }
    let digits = digits_of(n as u64, radix as u64);
    match places {
        None => text(digits),
        Some(places) if places < digits.len() as f64 => Err(CellError::Number),
        Some(places) => text(format!("{digits:0>width$}", width = places as usize)),
    }
}

/// A number BITAND and its kin read: 0 to below 2⁴⁸, cut to a whole number. Both numbers are read before either
/// is checked.
fn bit_number(n: f64) -> Result<f64, CellError> {
    if !(0.0..TWO_TO_48).contains(&n) {
        return Err(CellError::Number);
    }
    Ok(n.trunc())
}

fn bits(args: &[Arg], locale: &Locale, f: fn(u64, u64) -> u64) -> Answer {
    let a = args[0].number(locale)?;
    let b = args[1].number(locale)?;
    let (a, b) = (bit_number(a)?, bit_number(b)?);
    number(f(a as u64, b as u64) as f64)
}

/// BITLSHIFT and BITRSHIFT(number, places): the number times 2 to the places (cut to a whole number), or divided
/// and rounded down when the shift is to the right. `BITLSHIFT(1,1024)` is #NUM!.
fn shift(args: &[Arg], locale: &Locale, way: f64) -> Answer {
    let n = args[0].number(locale)?;
    let s = args[1].number(locale)?.trunc() * way;
    let n = bit_number(n)?;
    if s >= 0.0 {
        number(n * 2f64.powf(s))
    } else {
        number((n / 2f64.powf(-s)).floor())
    }
}

/// ROMAN(number, [form]): the number cut to a whole number, 0 to 3999 (0 is ""); the form, 0 (classic) to 4
/// (simplest), lets a numeral subtract more than the next smaller one (499 is CDXCIX, LDVLIV, XDIX, VDIV, ID).
fn roman(args: &[Arg], locale: &Locale) -> Answer {
    let n = args[0].number(locale)?.trunc();
    let form = match args.get(1) {
        Some(a) => a.number(locale)?,
        None => 0.0,
    };
    if !(0.0..4000.0).contains(&n) || !(0.0..5.0).contains(&form) {
        return Err(CellError::Value);
    }
    const CHARS: [char; 7] = ['M', 'D', 'C', 'L', 'X', 'V', 'I'];
    const VALUES: [u32; 7] = [1000, 500, 100, 50, 10, 5, 1];
    const LAST: usize = 6;
    let mut n = n as u32;
    let form = form.trunc() as u32;
    let mut out = String::new();
    for i in 0..=LAST / 2 {
        let mut index = 2 * i;
        let digit = n / VALUES[index];
        if digit % 5 == 4 {
            let index2 = if digit == 4 { index - 1 } else { index - 2 };
            let mut steps = 0;
            while steps < form && index < LAST {
                steps += 1;
                if VALUES[index2] - VALUES[index + 1] <= n {
                    index += 1;
                } else {
                    steps = form;
                }
            }
            out.push(CHARS[index]);
            out.push(CHARS[index2]);
            n = n + VALUES[index] - VALUES[index2];
        } else {
            if digit > 4 {
                out.push(CHARS[index - 1]);
            }
            for _ in 0..digit % 5 {
                out.push(CHARS[index]);
            }
            n %= VALUES[index];
        }
    }
    text(out)
}

/// ARABIC(text): a Roman numeral (either case, spaces around it dropped) as a number, read from the right: a
/// numeral smaller than the largest after it subtracts (`IIX` is 8). "" is 0; anything else is #VALUE!.
fn arabic(args: &[Arg], locale: &Locale) -> Answer {
    let s = args[0].text(locale)?;
    let mut total = 0.0;
    let mut largest = 0.0;
    for c in s.trim_matches(' ').chars().rev() {
        let v = match c.to_ascii_uppercase() {
            'I' => 1.0,
            'V' => 5.0,
            'X' => 10.0,
            'L' => 50.0,
            'C' => 100.0,
            'D' => 500.0,
            'M' => 1000.0,
            _ => return Err(CellError::Value),
        };
        if v < largest {
            total -= v;
        } else {
            total += v;
            largest = v;
        }
    }
    number(total)
}
