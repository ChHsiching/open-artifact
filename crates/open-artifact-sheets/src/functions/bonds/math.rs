//! The arithmetic for these functions: logarithms and powers kept exact near 1, an annuity, ROUND, and the
//! root finder YIELD uses (copies of `financial.rs`'s, which are private there).

use crate::value::{significant_digits, CellError};

/// `ln(1 + x)`, kept exact for a small `x`: `x / ((1 + x) − 1) · ln(1 + x)`.
pub fn ln_1p(x: f64) -> f64 {
    let u = x + 1.0;
    let d = u - 1.0;
    if d == 0.0 {
        x
    } else {
        x / d * u.ln()
    }
}

/// `eˣ − 1`, kept exact for a small `x`: `(eˣ − 1) · x / ln(eˣ)`.
pub fn exp_m1(x: f64) -> f64 {
    let u = x.exp();
    let d = u - 1.0;
    if d == 0.0 {
        x
    } else if d <= -1.0 {
        -1.0
    } else {
        d * (x / u.ln())
    }
}

/// `ln(b / a)`: through [`ln_1p`] of `(b − a) / a` when that is under ½ in size.
pub fn ln_ratio(a: f64, b: f64) -> f64 {
    let d = (b - a) / a;
    if d.abs() < 0.5 {
        ln_1p(d)
    } else {
        (b / a).ln()
    }
}

/// `n · ln(1 − rate)`, 0 for no periods.
pub fn periods_log(rate: f64, n: f64) -> f64 {
    if n == 0.0 {
        0.0
    } else {
        n * ln_1p(-rate)
    }
}

/// What `x` is worth after `n` periods losing `rate` each: `x · (1 − rate)ⁿ`.
pub fn declined(x: f64, rate: f64, n: f64) -> f64 {
    x * periods_log(rate, n).exp()
}

/// The smaller of two numbers, the first when the second is NaN.
pub fn min(a: f64, b: f64) -> f64 {
    if b.is_nan() {
        a
    } else if a < b {
        a
    } else {
        b
    }
}

/// The larger of two numbers, the second when the first is NaN.
pub fn max(a: f64, b: f64) -> f64 {
    if a.is_nan() {
        b
    } else if a < b {
        b
    } else {
        a
    }
}

/// ROUND: the number's 15-significant-digit decimal rounded half away from zero at `places` decimal places.
pub fn round(n: f64, places: i32) -> f64 {
    if n == 0.0 || !n.is_finite() {
        return n;
    }
    let (negative, digits, exponent) = significant_digits(n, 15);
    let digits = digits.as_bytes();
    let keep = exponent + 1 + places;
    let (mut kept, scale, dropped) = if keep >= digits.len() as i32 {
        (digits.to_vec(), exponent + 1 - digits.len() as i32, None)
    } else if keep <= 0 {
        let first = if keep == 0 { digits[0] } else { b'0' };
        (vec![b'0'], -places, Some(first))
    } else {
        (digits[..keep as usize].to_vec(), -places, Some(digits[keep as usize]))
    };
    if dropped.is_some_and(|d| d >= b'5') {
        let mut carry = true;
        for d in kept.iter_mut().rev() {
            if *d == b'9' {
                *d = b'0';
            } else {
                *d += 1;
                carry = false;
                break;
            }
        }
        if carry {
            kept.insert(0, b'1');
        }
    }
    let text = format!("{}{}e{}", if negative { "-" } else { "" }, String::from_utf8_lossy(&kept), scale);
    text.parse().unwrap_or(f64::NAN)
}

/// An annuity at `rate` over `periods`, paid at the end of each period: `pv·a + pmt·b + fv·c = 0`, scaled so none
/// overflows (`financial.rs`).
pub struct Annuity {
    pub a: f64,
    pub b: f64,
    pub c: f64,
}

impl Annuity {
    pub fn new(rate: f64, periods: f64) -> Result<Annuity, CellError> {
        if rate <= -1.0 {
            return Err(CellError::Number);
        }
        if rate.abs() < f64::MIN_POSITIVE {
            return Ok(Annuity { a: 1.0, b: periods, c: 1.0 });
        }
        let y = periods * ln_1p(rate);
        let m = -y.abs();
        let e = m.exp();
        let shrinks = y < 0.0;
        Ok(Annuity { a: if shrinks { e } else { 1.0 }, b: exp_m1(m).copysign(y) / rate, c: if shrinks { 1.0 } else { e } })
    }
}

/// The root finder, given `f(r)` and its slope: Newton's method from the guess (at most 20 steps, until a
/// step is at most 1E-7), kept when `f` changes sign close around it; else a search for a sign change outward from
/// the guess, then from 0. A rate that is not finite is not found.
pub fn solve(guess: f64, f: impl Fn(f64) -> (f64, f64)) -> Option<f64> {
    let found = newton(guess, &f).or_else(|| bracket(guess, &f)).or_else(|| if guess > -1.0 { bracket(0.0, &f) } else { None });
    found.filter(|r| r.is_finite())
}

fn newton(guess: f64, f: &impl Fn(f64) -> (f64, f64)) -> Option<f64> {
    // 0.9999999 and 1.0000001, to the bit.
    const BELOW: f64 = f64::from_bits(4_607_182_417_899_297_483);
    const ABOVE: f64 = f64::from_bits(4_607_182_419_250_377_371);
    let mut r = guess;
    let mut settled = false;
    for _ in 0..20 {
        if r <= -1.0 || r.is_nan() {
            return None;
        }
        let (value, slope) = f(r);
        if value == 0.0 {
            return Some(r);
        }
        let next = r - value / slope;
        let step = next - r;
        r = next;
        if step.abs() <= 1e-7 {
            settled = true;
            break;
        }
    }
    if !settled {
        return None;
    }
    let low = (r + 1.0) * BELOW - 1.0;
    let high = (r + 1.0) * ABOVE - 1.0;
    if low <= -1.0 {
        return None;
    }
    let (below, above) = (f(low).0, f(high).0);
    ((below < 0.0 && above > 0.0) || (below > 0.0 && above < 0.0)).then_some(r)
}

/// Looks for a sign change of `f` at `(1 + rate)·2ᵏ − 1` and `(1 + rate)/2ᵏ − 1`, k = 1 to 30, then halves the
/// last step 53 times.
fn bracket(rate: f64, f: &impl Fn(f64) -> (f64, f64)) -> Option<f64> {
    if rate <= -1.0 || rate.is_nan() {
        return None;
    }
    let at_rate = f(rate).0;
    if at_rate == 0.0 {
        return Some(rate);
    }
    if at_rate.is_nan() {
        return None;
    }
    let positive = at_rate > 0.0;
    let one = rate + 1.0;
    let mut last = [one - 1.0; 2];
    let mut m = 1.0_f64;
    for _ in 0..30 {
        m += m;
        let points = [one * m - 1.0, one / m - 1.0];
        for side in 0..2 {
            let x = points[side];
            if !(x > -1.0) {
                continue;
            }
            let at_x = f(x).0;
            if (at_x > 0.0 || at_x < 0.0) && (at_x > 0.0) != positive {
                let (mut low, mut high) = (last[side], x);
                for _ in 0..53 {
                    let middle = low + (high - low) * 0.5;
                    let at_middle = f(middle).0;
                    if at_middle.is_nan() {
                        return None;
                    }
                    if (at_middle > 0.0) != positive {
                        high = middle;
                    } else {
                        low = middle;
                    }
                }
                return Some(high);
            }
            if !at_x.is_nan() {
                last[side] = x;
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rounds_like_round() {
        assert_eq!(round(0.36904265551980675, 3), 0.369);
        assert_eq!(round(1.0005, 3), 1.001);
        assert_eq!(round(-0.0005, 3), -0.001);
    }

    #[test]
    fn logs_near_one() {
        assert_eq!(ln_ratio(1.0, 1.0), 0.0);
        assert_eq!(declined(1000.0, 0.4, 0.0), 1000.0);
        assert_eq!(exp_m1(0.0), 0.0);
    }
}
