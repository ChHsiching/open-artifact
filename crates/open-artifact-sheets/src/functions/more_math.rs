//! More math functions (trigonometry, conversions between bases, bits, matrices, AGGREGATE, CONVERT, …).
//!
//! ACOS ACOSH AGGREGATE ARABIC ASIN ASINH ATAN ATAN2 ATANH BASE BIN2DEC BITAND BITLSHIFT BITOR BITRSHIFT BITXOR
//! CEILING.MATH CEILING.PRECISE COMBIN CONVERT COS COSH DEC2BIN DEC2HEX DEC2OCT DECIMAL DEGREES ERF ERF.PRECISE
//! ERFC ERFC.PRECISE EVEN FACT FLOOR.MATH FLOOR.PRECISE GCD HEX2DEC ISO.CEILING LCM MDETERM MINVERSE MMULT
//! OCT2DEC ODD ROMAN SIN SINH SUMX2MY2 SUMX2PY2 SUMXMY2 TAN TANH
//!
//! A number that is not finite is #NUM! (`functions::number`): `ACOS(2)`, `COSH(711)`, `ATANH(1)`.

mod aggregate;
mod bases;
mod convert;
mod erf;
mod matrix;

use std::cmp::Ordering;

use crate::coerce;
use crate::functions::{number, Answer, Arg, CallContext};
use crate::locale::Locale;
use crate::value::{CellError, Value};

/// Calls one of these functions by name; `None` for one not theirs.
pub fn call(name: &str, args: &[Arg], cx: &mut CallContext) -> Option<Answer> {
    let locale = cx.locale;
    let x = || args[0].number(locale);
    let f = |g: fn(f64) -> f64| x().and_then(|n| number(g(n)));
    Some(match name {
        "ACOS" => f(f64::acos),
        "ACOSH" => f(acosh),
        "ASIN" => f(f64::asin),
        "ASINH" => f(asinh),
        "ATAN" => f(f64::atan),
        "ATANH" => f(atanh),
        "COS" => f(f64::cos),
        "COSH" => f(f64::cosh),
        "SIN" => f(f64::sin),
        "SINH" => f(f64::sinh),
        "TAN" => f(f64::tan),
        "TANH" => f(f64::tanh),
        "DEGREES" => f(|x| x / (std::f64::consts::PI / 180.0)),
        "ATAN2" => atan2(args, locale),
        "EVEN" => x().and_then(|n| number(even_or_odd(n, true))),
        "ODD" => x().and_then(|n| number(even_or_odd(n, false))),
        "FACT" => x().and_then(factorial),
        "COMBIN" => combin(args, locale),
        "GCD" => whole_numbers(args, locale).and_then(|n| number(n.into_iter().fold(0, gcd) as f64)),
        "LCM" => whole_numbers(args, locale).and_then(lcm),
        "CEILING.MATH" => math_multiple(args, locale, true),
        "FLOOR.MATH" => math_multiple(args, locale, false),
        "CEILING.PRECISE" | "ISO.CEILING" => precise_multiple(args, locale, true),
        "FLOOR.PRECISE" => precise_multiple(args, locale, false),
        "ERF" => erf::erf_between(args, locale),
        "ERF.PRECISE" => f(erf::erf),
        "ERFC" | "ERFC.PRECISE" => f(erf::erfc),
        "AGGREGATE" => aggregate::aggregate(args, cx),
        "CONVERT" => convert::convert(args, locale),
        "MDETERM" | "MINVERSE" | "MMULT" | "SUMX2MY2" | "SUMX2PY2" | "SUMXMY2" => matrix::call(name, args)?,
        _ => bases::call(name, args, locale)?,
    })
}

/// How one of these functions reads its arguments early (as `functions::early_reads` writes it), if it does.
pub fn early_reads(name: &str) -> Option<&'static str> {
    Some(match name {
        "AGGREGATE" => "nn.*",
        "ATAN2" | "CEILING.MATH" | "CEILING.PRECISE" | "CONVERT" | "DEC2BIN" | "DEC2HEX" | "DEC2OCT" | "ERF"
        | "FLOOR.MATH" | "FLOOR.PRECISE" | "ISO.CEILING" => "n",
        "GCD" | "LCM" => "n*",
        "BASE" => "yn",
        "BITAND" | "BITLSHIFT" | "BITOR" | "BITRSHIFT" | "BITXOR" | "COMBIN" => "y",
        "ROMAN" => "0",
        _ => return None,
    })
}

const LN2: f64 = std::f64::consts::LN_2;
const TWO_TO_26: f64 = 67_108_864.0;

/// The inverse hyperbolic functions as musl works them out (`f64`'s own are not musl's).
fn asinh(x: f64) -> f64 {
    let a = x.abs();
    let y = if a >= TWO_TO_26 || a.is_nan() {
        a.ln() + LN2
    } else if a >= 2.0 {
        (2.0 * a + 1.0 / ((a * a + 1.0).sqrt() + a)).ln()
    } else if a >= 1.0 / TWO_TO_26 {
        (a + a * a / ((a * a + 1.0).sqrt() + 1.0)).ln_1p()
    } else {
        a
    };
    if x.is_sign_negative() {
        -y
    } else {
        y
    }
}

fn acosh(x: f64) -> f64 {
    if x < 2.0 {
        (x - 1.0 + ((x - 1.0) * (x - 1.0) + 2.0 * (x - 1.0)).sqrt()).ln_1p()
    } else if x < TWO_TO_26 {
        (2.0 * x - 1.0 / (x + (x * x - 1.0).sqrt())).ln()
    } else {
        x.ln() + LN2
    }
}

fn atanh(x: f64) -> f64 {
    let a = x.abs();
    let y = if a < 0.5 {
        if a < 1.0 / 4_294_967_296.0 {
            a
        } else {
            0.5 * (2.0 * a + 2.0 * a * a / (1.0 - a)).ln_1p()
        }
    } else {
        0.5 * (2.0 * (a / (1.0 - a))).ln_1p()
    };
    if x.is_sign_negative() {
        -y
    } else {
        y
    }
}

/// ATAN2(x, y): the angle of the point (x, y); at the origin #DIV/0!.
fn atan2(args: &[Arg], locale: &Locale) -> Answer {
    let x = args[0].number(locale)?;
    let y = args[1].number(locale)?;
    if x == 0.0 && y == 0.0 {
        return Err(CellError::DivideByZero);
    }
    number(y.atan2(x))
}

/// EVEN and ODD: the size rounded up (a number all but whole is that whole number) to the next even or odd one,
/// with the number's sign. `ODD(0)` is 1.
fn even_or_odd(n: f64, even: bool) -> f64 {
    let mut m = snapped(n.abs(), f64::ceil);
    let is_even = m % 2.0 == 0.0;
    if is_even != even {
        m += 1.0;
    }
    if n < 0.0 {
        -m
    } else {
        m
    }
}

/// FACT: the factorial of the number cut to a whole number, as the nearest number to the exact product; past 170
/// it is #NUM!.
fn factorial(n: f64) -> Answer {
    if n < 0.0 {
        return Err(CellError::Number);
    }
    let n = n.trunc();
    if n > 170.0 {
        return Err(CellError::Number);
    }
    let mut product = Big::one();
    for i in 2..=n as u64 {
        product.multiply(i);
    }
    number(product.to_f64())
}

/// COMBIN(total, chosen): both cut to whole numbers; the total below 2⁵³; the count is exact, then the nearest
/// number (`COMBIN(1029,514)` is 1.429820686498904E+308, one more is #NUM!).
fn combin(args: &[Arg], locale: &Locale) -> Answer {
    let n = args[0].number(locale)?;
    let k = args[1].number(locale)?;
    if n < 0.0 || k < 0.0 {
        return Err(CellError::Number);
    }
    let (n, k) = (n.trunc(), k.trunc());
    if k > n || n >= 9_007_199_254_740_992.0 {
        return Err(CellError::Number);
    }
    let (n, k) = (n as u64, k as u64);
    let k = k.min(n - k);
    let mut count = Big::one();
    for i in 0..k {
        count.multiply(n - i);
        count.divide(i + 1);
        if count.bits() > 1100 {
            return Err(CellError::Number);
        }
    }
    number(count.to_f64())
}

/// The numbers of GCD and LCM, cut to whole numbers: in a range only numbers count, one written as one value is
/// read as a number, a left-out one is 0. Below 0 (even −0.5), or 2⁵³ and above, is #NUM!.
fn whole_numbers(args: &[Arg], locale: &Locale) -> Result<Vec<u64>, CellError> {
    let mut out = Vec::new();
    let mut push = |n: f64| {
        if !(0.0..9_007_199_254_740_992.0).contains(&n) {
            return Err(CellError::Number);
        }
        out.push(n.trunc() as u64);
        Ok(())
    };
    for arg in args {
        match arg {
            Arg::Missing => push(0.0)?,
            Arg::Value(v) => push(coerce::to_number(v, locale)?)?,
            Arg::Cells(cells) => {
                for v in cells.values() {
                    match v {
                        Value::Number(n) => push(*n)?,
                        Value::Error(e) => return Err(*e),
                        _ => {}
                    }
                }
            }
            Arg::Place(_) => return Err(CellError::Value),
        }
    }
    Ok(out)
}

fn gcd(a: u64, b: u64) -> u64 {
    if b == 0 {
        a
    } else {
        gcd(b, a % b)
    }
}

/// LCM: 1 for no numbers, 0 when one is 0; past 2⁵³ − 1 it is #NUM!.
fn lcm(n: Vec<u64>) -> Answer {
    let mut m: u128 = 1;
    for x in n {
        if x == 0 {
            return number(0.0);
        }
        m = m / gcd(m as u64, x) as u128 * x as u128;
        if m >= 9_007_199_254_740_992 {
            return Err(CellError::Number);
        }
    }
    number(m as f64)
}

/// CEILING.MATH and FLOOR.MATH(number, [step], [mode]): to a multiple of the step's size (1 when left out); a
/// negative number goes toward +∞ (CEILING) or −∞ (FLOOR) when the mode is 0, else the other way (away from or
/// toward zero).
fn math_multiple(args: &[Arg], locale: &Locale, up: bool) -> Answer {
    let n = args[0].number(locale)?;
    let step = match args.get(1) {
        None | Some(Arg::Missing) => 1.0,
        Some(a) => a.number(locale)?,
    }
    .abs();
    let mode = match args.get(2) {
        Some(a) => a.number_or(0.0, locale)?,
        None => 0.0,
    };
    if n < 0.0 && mode != 0.0 {
        return to_multiple(-n, step, up).map(|m| -m + 0.0).and_then(number);
    }
    to_multiple(n, step, up).and_then(number)
}

/// CEILING.PRECISE, ISO.CEILING and FLOOR.PRECISE(number, [step]): to a multiple of the step's size (1 when left
/// out, 0 when written empty), up or down whatever the signs.
fn precise_multiple(args: &[Arg], locale: &Locale, up: bool) -> Answer {
    let n = args[0].number(locale)?;
    let step = match args.get(1) {
        None => 1.0,
        Some(a) => a.number(locale)?,
    };
    to_multiple(n, step.abs(), up).and_then(number)
}

/// The multiple of a positive `step` above (`up`) or below the number, as [`divide`] counts the steps (so
/// `CEILING.MATH(0.7,0.1)` is 0.7000000000000001). A step of 0 is 0.
fn to_multiple(n: f64, step: f64, up: bool) -> Result<f64, CellError> {
    if n == 0.0 || step == 0.0 {
        return Ok(0.0);
    }
    let Division { mut count, remainder } = divide(n, step);
    let ahead = sign(remainder);
    if ahead > 0.0 && up || ahead < 0.0 && !up {
        count += ahead;
    }
    Ok(count * step + 0.0)
}

fn sign(n: f64) -> f64 {
    if n > 0.0 {
        1.0
    } else if n < 0.0 {
        -1.0
    } else {
        0.0
    }
}

/// Whether two numbers count as the same (as `math.rs` has it): equal to 15 significant digits, or
/// apart by only what is left of rounding.
fn close(a: f64, b: f64) -> bool {
    coerce::compare_numbers(a, b) == Ordering::Equal || coerce::add(a, -b) == 0.0
}

/// `n` as the nearest whole number when it is [`close`] to it; else `whole` of it.
fn snapped(n: f64, whole: fn(f64) -> f64) -> f64 {
    let nearest = n.round();
    if close(n, nearest) {
        nearest
    } else {
        whole(n)
    }
}

struct Division {
    count: f64,
    remainder: f64,
}

/// Divides as `math.rs` does for CEILING and FLOOR: exactly for whole numbers below 2⁵³; otherwise a remainder
/// lost in `x` is none.
fn divide(x: f64, y: f64) -> Division {
    let remainder = x % y;
    let count = (x / y - remainder / y).round();
    if is_safe_whole(x) && is_safe_whole(y) {
        return Division { count, remainder };
    }
    let (nearer_count, nearer) = if 2.0 * remainder.abs() >= y.abs() {
        (count + sign(x) * sign(y), x - remainder + sign(x) * y.abs())
    } else {
        (count, x - remainder)
    };
    if close(x, nearer) {
        Division { count: nearer_count, remainder: 0.0 }
    } else {
        Division { count, remainder }
    }
}

fn is_safe_whole(n: f64) -> bool {
    n.fract() == 0.0 && n.abs() < 9_007_199_254_740_992.0
}

/// A whole number of any size, for counts that must be exact before they are rounded: 32-bit limbs, low first.
struct Big(Vec<u32>);

impl Big {
    fn one() -> Big {
        Big(vec![1])
    }

    fn multiply(&mut self, m: u64) {
        let mut carry: u128 = 0;
        for limb in &mut self.0 {
            let t = *limb as u128 * m as u128 + carry;
            *limb = t as u32;
            carry = t >> 32;
        }
        while carry > 0 {
            self.0.push(carry as u32);
            carry >>= 32;
        }
    }

    /// Divides by `d`, which divides it exactly.
    fn divide(&mut self, d: u64) {
        let mut rest: u128 = 0;
        for limb in self.0.iter_mut().rev() {
            let t = (rest << 32) | *limb as u128;
            *limb = (t / d as u128) as u32;
            rest = t % d as u128;
        }
        while self.0.len() > 1 && *self.0.last().unwrap() == 0 {
            self.0.pop();
        }
    }

    fn bits(&self) -> usize {
        let top = *self.0.last().unwrap();
        (self.0.len() - 1) * 32 + (32 - top.leading_zeros() as usize)
    }

    fn bit(&self, i: usize) -> bool {
        self.0[i / 32] >> (i % 32) & 1 == 1
    }

    /// The nearest number, halves to even (infinite past the largest).
    fn to_f64(&self) -> f64 {
        let bits = self.bits();
        if bits <= 64 {
            let mut v: u64 = 0;
            for (i, limb) in self.0.iter().enumerate() {
                v |= (*limb as u64) << (32 * i);
            }
            return v as f64;
        }
        // The top 64 bits, the lowest of them set when any bit below is (so it rounds the same).
        let shift = bits - 64;
        let mut top: u64 = 0;
        for i in 0..64 {
            if self.bit(shift + i) {
                top |= 1 << i;
            }
        }
        if (0..shift).any(|i| self.bit(i)) {
            top |= 1;
        }
        let mut v = top as f64;
        let mut shift = shift as i32;
        while shift > 0 {
            let step = shift.min(512);
            v *= 2f64.powi(step);
            shift -= step;
        }
        v
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn big_rounds_to_nearest() {
        let mut f = Big::one();
        for i in 2..=25u64 {
            f.multiply(i);
        }
        assert_eq!(f.to_f64(), 15511210043330985984000000.0);
        let mut c = Big::one();
        c.multiply(10);
        c.divide(2);
        assert_eq!(c.to_f64(), 5.0);
    }

    #[test]
    fn even_and_odd() {
        assert_eq!(even_or_odd(-0.1, true), -2.0);
        assert_eq!(even_or_odd(0.0, false), 1.0);
        assert_eq!(even_or_odd(2.0000000000000004, true), 2.0);
    }
}
