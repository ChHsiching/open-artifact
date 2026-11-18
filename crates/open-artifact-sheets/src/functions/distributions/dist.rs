//! The densities, the incomplete gamma and beta functions and the inverses the distribution functions are built
//! on, worked out step by step: continued fractions, with set starting points and stopping rules.

use super::special::{erf, erfc, tgamma};
use crate::coerce::compared_number;
use crate::value::CellError;
use std::cmp::Ordering;

pub type Got<T> = Result<T, CellError>;

pub const SQRT_2PI: f64 = 2.5066282746310002;
const FRAC_1_SQRT_2: f64 = 0.7071067811865476;
/// The most steps a continued fraction may take before the answer is #NUM!.
const STEPS: u32 = 20_000;

/// The standard normal distribution's cumulative probability.
pub fn norm_cdf(z: f64) -> f64 {
    erfc(z * -FRAC_1_SQRT_2) * 0.5
}

/// The standard normal density.
pub fn norm_pdf(z: f64) -> f64 {
    ((z * z) * -0.5).exp() / SQRT_2PI
}

/// Abramowitz and Stegun's first guess (26.2.23) at the normal quantile of a probability `q` of at most 0.5.
fn first_guess(q: f64) -> f64 {
    let t = (q.ln() * -2.0).sqrt();
    (((t * ((t * 0.010328) + 0.802853)) + 2.515517) / ((t * ((t * ((t * 0.001308) + 0.189269)) + 1.432788)) + 1.0)) - t
}

/// The standard normal quantile: the first guess, then two Halley steps.
pub fn norm_inv(p: f64) -> Got<f64> {
    if p <= 0.0 || p >= 1.0 {
        return Err(CellError::Number);
    }
    let q = p.min(1.0 - p);
    let half = q - 0.5;
    if half == 0.0 {
        return Ok(0.0);
    }
    let mut x = first_guess(q);
    for _ in 0..2 {
        let (f, target) = if q > 0.25 { (erf(x * FRAC_1_SQRT_2), half) } else { (erfc(x * -FRAC_1_SQRT_2), q) };
        let u = ((f * 0.5) - target) / (((x * -x) * 0.5).exp() / SQRT_2PI);
        x -= u / (((x * u) * 0.5) + 1.0);
    }
    Ok(if p < 0.5 { x } else { -x })
}

/// The Poisson density `λᵃe^-λ/a!` for any `a`, with Loader's saddle-point form from 20 on.
pub fn pois_d(a: f64, lambda: f64) -> f64 {
    if !(a >= 20.0) || !lambda.is_finite() {
        let e = (lambda * -0.5).exp();
        if e == 0.0 {
            return 0.0;
        }
        return e * ((e * lambda.powf(a)) / tgamma(a + 1.0));
    }
    let a2 = a * a;
    let mut s = 0.0;
    for c in [1188.0, -1680.0, 1260.0, -360.0, 12.0] {
        s = (s / a2) + (1.0 / c);
    }
    let stirling = s / a;
    let d = a - lambda;
    let v = d / (a + lambda);
    let bd0 = if v.abs() < 0.2 {
        let s2 = v * v;
        let mut w = s2 * 0.04;
        let mut j = 23.0;
        while j >= 3.0 {
            w = s2 * (w + (1.0 / j));
            j -= 2.0;
        }
        (d * v) + (((a + a) * v) * w)
    } else {
        (lambda + (a * (a / lambda).ln())) - a
    };
    (-(stirling + bd0)).exp() / (a * 6.283185307179586).sqrt()
}

/// `C(a+b, a) xᵃ yᵇ`, the binomial term (`y` is `1 - x`), for any `a` and `b`.
pub fn binom_term(a: f64, b: f64, x: f64, y: f64) -> f64 {
    let n = a + b;
    if n < 20.0 {
        ((tgamma(n + 1.0) / (tgamma(a + 1.0) * tgamma(b + 1.0))) * x.powf(a)) * y.powf(b)
    } else {
        (pois_d(a, n * x) * pois_d(b, n * y)) / pois_d(n, n)
    }
}

/// The regularized incomplete gamma functions `(P(a, x), Q(a, x))`, from a continued fraction.
pub fn gamma_inc(a: f64, x: f64) -> Got<(f64, f64)> {
    let a1 = a + 1.0;
    let lower = x < a1;
    let pre = a * pois_d(a, x);
    let v = if pre == 0.0 {
        0.0
    } else if lower {
        let b0 = (a - x) + 1.0;
        let mut f = (a * b0) / a1;
        let (mut c, mut d) = (f, 0.0);
        let mut n = 1;
        loop {
            let nf = n as f64;
            let k = a + (2 * n - 1) as f64;
            let bn = (((x * nf) / k) + nf) + (((a + nf) * (b0 + (2 * n) as f64)) / (k + 2.0));
            let r = x / k;
            let an = r * (r * ((a + (nf - 1.0)) * nf));
            c = bn + (an / c);
            d = 1.0 / (bn + (d * an));
            let delta = c * d;
            f *= delta;
            if (delta - 1.0).abs() <= f64::EPSILON {
                break;
            }
            if n == STEPS {
                return Err(CellError::Number);
            }
            n += 1;
        }
        pre / f
    } else {
        let b0 = (x - a) + 1.0;
        let mut f = b0;
        let (mut c, mut d) = (b0, 0.0);
        let mut n = 1;
        loop {
            let nf = n as f64;
            let bn = b0 + (2 * n) as f64;
            let an = (a - nf) * nf;
            c = bn + (an / c);
            d = 1.0 / (bn + (d * an));
            let delta = c * d;
            f *= delta;
            if (delta - 1.0).abs() <= f64::EPSILON {
                break;
            }
            if n == STEPS {
                return Err(CellError::Number);
            }
            n += 1;
        }
        pre / f
    };
    let v = v.min(1.0);
    if !(v >= 0.0) {
        return Err(CellError::Number);
    }
    Ok(if lower { (v, 1.0 - v) } else { (1.0 - v, v) })
}

/// The regularized incomplete beta functions `(I_x(a, b), I_y(b, a))`, `y` being `1 - x`, from a continued
/// fraction on the side that converges.
pub fn beta_inc(a: f64, b: f64, x: f64, y: f64) -> Got<(f64, f64)> {
    if a.to_bits() == b.to_bits() && x.to_bits() == y.to_bits() {
        return Ok((0.5, 0.5));
    }
    let lower = x * (b + 1.0) < y * (a + 1.0);
    let pre = (binom_term(a, b, x, y) * (a / (a + b))) * b;
    let v = if pre == 0.0 {
        0.0
    } else {
        let (p, q, z, w) = if lower { (a, b, x, y) } else { (b, a, y, x) };
        let w1 = w + 1.0;
        let e = ((p * w) - (q * z)) + 1.0;
        let mut f = (p * e) / (p + 1.0);
        let (mut c, mut d) = (f, 0.0);
        let mut n = 1;
        loop {
            let nf = n as f64;
            let k = p + (2 * n - 1) as f64;
            let t = (z * ((q - nf) * nf)) / k;
            let bn = (t + nf) + (((p + nf) * (e + (w1 * nf))) / (k + 2.0));
            let an = t * ((p + (nf - 1.0)) * ((z * ((a + b) + (nf - 1.0))) / k));
            c = bn + (an / c);
            d = 1.0 / (bn + (d * an));
            let delta = c * d;
            f *= delta;
            if (delta - 1.0).abs() <= f64::EPSILON {
                break;
            }
            if n == STEPS {
                return Err(CellError::Number);
            }
            n += 1;
        }
        (pre / f).min(1.0)
    };
    if !(v >= 0.0) {
        return Err(CellError::Number);
    }
    Ok(if lower { (v, 1.0 - v) } else { (1.0 - v, v) })
}

/// The beta density at `x` (`y` being `1 - x`).
pub fn beta_pdf(a: f64, b: f64, x: f64, y: f64) -> f64 {
    if x == 0.0 {
        return b * 0f64.powf(a - 1.0);
    }
    if y == 0.0 {
        return a * 0f64.powf(b - 1.0);
    }
    ((b * (binom_term(a, b, x, y) * (a / (a + b)))) / x) / y
}

/// The gamma density of shape `a` at `x` (scale 1).
pub fn gamma_pdf(a: f64, x: f64) -> f64 {
    if x == 0.0 {
        return 0f64.powf(a - 1.0);
    }
    (a * pois_d(a, x)) / x
}

/// Where a solver starts: the normal quantile of the smaller tail, signed for the side.
fn start(p: f64, q: f64) -> f64 {
    let w = first_guess(p.min(q));
    if p <= q {
        w
    } else {
        -w
    }
}

fn clamp(r: f64) -> f64 {
    let r = if r < 1e-300 { 1e-300 } else { r };
    if r > 1e300 {
        1e300
    } else {
        r
    }
}

/// Newton's method on the log of the tail ratio, kept inside a shrinking bracket (`lo`, `hi`): `at(r)` gives the
/// two tails at `r` and the density there times the step's scale; `middle` is the next try when Newton's leaves
/// the bracket. Gives up (#NUM!) after 100 brackets.
fn solve(mut r: f64, p: f64, q: f64, middle: f64, at: impl Fn(f64) -> Got<(f64, f64, f64)>) -> Got<f64> {
    let lower = p <= q;
    let (mut lo, mut hi) = (f64::MIN_POSITIVE, f64::MAX);
    let mut tries = 0;
    loop {
        let (pl, pu, density) = at(r)?;
        let (ratio, tail) = if lower { (pl / p, pl) } else { (q / pu, pu) };
        let l = ratio.ln();
        let next = r * (-l / (density / tail)).exp();
        if l.abs() < 1e-8 || next.to_bits() == r.to_bits() {
            return Ok(next);
        }
        if l > 0.0 {
            hi = r;
        } else {
            lo = r;
        }
        if hi <= 1e-300 {
            return Ok(0.0);
        }
        if lo >= 1e300 {
            return Ok(f64::INFINITY);
        }
        tries += 1;
        match [next, middle, hi.sqrt() * lo.sqrt()].into_iter().find(|&c| lo < c && c < hi) {
            Some(c) => r = c,
            None => return Ok(r),
        }
        if tries == 100 {
            return Err(CellError::Number);
        }
    }
}

/// The odds `x / (1 - x)` where the beta distribution `(a, b)` has lower tail `p` and upper tail `q`.
pub fn beta_inv(a: f64, b: f64, p: f64, q: f64) -> Got<f64> {
    if p == 0.0 {
        return Ok(0.0);
    }
    if q == 0.0 {
        return Ok(f64::INFINITY);
    }
    let ab = a / b;
    let r = clamp(ab * (((1.0 / a) + (1.0 / b)).sqrt() * start(p, q)).exp());
    let share = a / (a + b);
    solve(r, p, q, ab, |r| {
        let x = 1.0 / ((1.0 / r) + 1.0);
        let y = 1.0 / (r + 1.0);
        let (pl, pu) = beta_inc(a, b, x, y)?;
        Ok((pl, pu, b * (share * binom_term(a, b, x, y))))
    })
}

/// Where the gamma distribution of shape `a` (scale 1) has lower tail `p` and upper tail `q`.
pub fn gamma_inv(a: f64, p: f64, q: f64) -> Got<f64> {
    if p == 0.0 {
        return Ok(0.0);
    }
    if q == 0.0 {
        return Ok(f64::INFINITY);
    }
    let x = clamp(a * ((1.0 / a.sqrt()) * start(p, q)).exp());
    solve(x, p, q, a, |x| {
        let (pl, pu) = gamma_inc(a, x)?;
        Ok((pl, pu, a * pois_d(a, x)))
    })
}

/// Student's t two-tailed probability of `t` with `df` degrees of freedom.
pub fn t_2t(df: f64, t: f64) -> Got<f64> {
    let r = (t * t) / df;
    Ok(beta_inc(0.5, df * 0.5, 1.0 / ((1.0 / r) + 1.0), 1.0 / (r + 1.0))?.1)
}

/// Student's t cumulative probability, given `-t`.
pub fn t_cdf_of_negated(df: f64, minus_t: f64) -> Got<f64> {
    let half = t_2t(df, minus_t)? * 0.5;
    Ok(if minus_t > 0.0 { half } else { 1.0 - half })
}

/// Student's t density.
pub fn t_pdf(df: f64, t: f64) -> f64 {
    let h = df * 0.5;
    let t = t.abs().max(1e-100);
    let r = (t * t) / df;
    (h * (binom_term(0.5, h, 1.0 / ((1.0 / r) + 1.0), 1.0 / (r + 1.0)) * (0.5 / (h + 0.5)))) / t
}

/// The t value whose two-tailed probability is `p`.
pub fn t_inv(df: f64, p: f64) -> Got<f64> {
    if !(p >= 0.0) || p > 1.0 {
        return Err(CellError::Number);
    }
    let r = beta_inv(0.5, df * 0.5, 1.0 - p, p)?;
    Ok((df * r).sqrt())
}

/// TDIST's one- or two-tailed probability.
pub fn t_tails(df: f64, t: f64, tails: f64) -> Got<f64> {
    if tails == 1.0 {
        Ok(t_2t(df, t)? * 0.5)
    } else if tails == 2.0 {
        t_2t(df, t)
    } else {
        Err(CellError::Number)
    }
}

/// The F distribution's tails at `x`, for halved degrees of freedom `a` and `b`.
pub fn f_cdf(a: f64, b: f64, x: f64) -> Got<(f64, f64)> {
    if x < 0.0 {
        return Err(CellError::Number);
    }
    let r = x * (a / b);
    beta_inc(a, b, 1.0 / ((1.0 / r) + 1.0), 1.0 / (r + 1.0))
}

/// The F density, for halved degrees of freedom `a` and `b`.
pub fn f_pdf(a: f64, b: f64, x: f64) -> Got<f64> {
    if x == 0.0 {
        return Ok(0f64.powf(a - 1.0));
    }
    if x < 0.0 {
        return Err(CellError::Number);
    }
    let r = x * (a / b);
    Ok((b * (binom_term(a, b, 1.0 / ((1.0 / r) + 1.0), 1.0 / (r + 1.0)) * (a / (a + b)))) / x)
}

/// The F quantile with lower tail `p` and upper tail `q`, for halved degrees of freedom `a` and `b`.
pub fn f_inv(a: f64, b: f64, p: f64, q: f64) -> Got<f64> {
    Ok(beta_inv(a, b, p, q)? * (b / a))
}

/// The binomial distribution's tails `(P(X ≤ k), P(X > k))` for `n` trials of probability `p` (`q` = 1 - p).
pub fn binom_cdf(n: f64, p: f64, q: f64, k: f64) -> Got<(f64, f64)> {
    if k < 0.0 {
        return Ok((0.0, 1.0));
    }
    if k >= n {
        return Ok((1.0, 0.0));
    }
    let (lower, upper) = beta_inc(k + 1.0, n - k, p, q)?;
    Ok((upper, lower))
}

/// How two numbers compare, taking ones within 2e-14 of each other that agree to 15 significant digits as equal.
pub fn nearly_compare(a: f64, b: f64) -> Ordering {
    let key = |x: f64| {
        let bits = x.to_bits() as i64;
        bits ^ (((bits >> 63) as u64) >> 1) as i64
    };
    let order = key(a).cmp(&key(b));
    if order != Ordering::Equal
        && (a - b).abs() <= a.abs().max(b.abs()) * 2e-14
        && key(compared_number(a)) == key(compared_number(b))
    {
        return Ordering::Equal;
    }
    order
}

/// The hypergeometric table of a draw: `[k, n - k, K - k, (N - K) - (n - k)]`, or #NUM! when a count is out of range.
pub fn hypgeom_table(k: f64, n: f64, big_k: f64, big_n: f64) -> Got<[f64; 4]> {
    for v in [k, n, big_k, big_n] {
        if !(v.abs() < 9_007_199_254_740_992.0) {
            return Err(CellError::Number);
        }
    }
    let b = n - k;
    let t = [k, b, big_k - k, (big_n - big_k) - b];
    if t.iter().any(|&v| v < 0.0) {
        return Err(CellError::Number);
    }
    Ok(t)
}

/// The probability of a hypergeometric table.
pub fn hypgeom_pdf(t: [f64; 4]) -> f64 {
    let [a, b, c, d] = t;
    let s = a + b;
    let u = c + d;
    let total = s + u;
    let x = s / total;
    let y = u / total;
    (binom_term(a, c, x, y) * binom_term(b, d, x, y)) / binom_term(s, u, x, y)
}

/// The probability of a table and the more extreme ones on its side.
fn hypgeom_series(t: [f64; 4]) -> Got<f64> {
    let [a, b, c, d] = t;
    let mut term = hypgeom_pdf(t);
    let mut sum = 0.0;
    let mut i = 0u32;
    loop {
        if i == 100_000 {
            return Err(CellError::Number);
        }
        let fi = i as f64;
        sum += term;
        i += 1;
        term *= ((a - fi) / ((c + fi) + 1.0)) * ((d - fi) / ((b + fi) + 1.0));
        if term <= sum * 1e-20 {
            return Ok(sum);
        }
    }
}

/// The hypergeometric cumulative probability of a table.
pub fn hypgeom_cdf(t: [f64; 4]) -> Got<f64> {
    let [a, b, c, d] = t;
    if a * d < b * c {
        return hypgeom_series(t);
    }
    if b == 0.0 || c == 0.0 {
        return Ok(1.0);
    }
    Ok(1.0 - hypgeom_series([b - 1.0, a + 1.0, d + 1.0, c - 1.0])?)
}

/// What a list of numbers gives the tests: `(count, mean, sum of squared deviations)`, or #DIV/0! for none.
pub fn stats(numbers: &[f64]) -> Got<(f64, f64, f64)> {
    let Some(&first) = numbers.first() else {
        return Err(CellError::DivideByZero);
    };
    let mut n = 0.0;
    let mut sum = 0.0;
    for &x in numbers {
        n += 1.0;
        sum += x - first;
    }
    let m = sum / n;
    let mut ss = -0.0;
    for &x in numbers {
        let d = (x - first) - m;
        ss += d * d;
    }
    Ok((n, m + first, ss))
}
