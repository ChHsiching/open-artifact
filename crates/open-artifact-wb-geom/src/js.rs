//! JavaScript number semantics, so results match the TypeScript this crate
//! replaced bit for bit: the geometry is written into board files, and the
//! editor, the CLI and older files must agree on every coordinate.

pub use crate::fdlibm::{atan, atan2, cos, sin};

/// `Math.log2` (`libm`'s FreeBSD `e_log2.c` agrees with V8 bit for bit).
#[inline]
pub fn log2(x: f64) -> f64 {
    libm::log2(x)
}

/// `Math.sign`: -1, 0 (keeping the sign of zero) or 1; NaN stays NaN.
#[inline]
pub fn sign(x: f64) -> f64 {
    if x > 0.0 {
        1.0
    } else if x < 0.0 {
        -1.0
    } else {
        x
    }
}

/// `Math.hypot` as V8 computes it: scaled by the largest magnitude, with a
/// Kahan-compensated sum of squares.
pub fn hypot(values: &[f64]) -> f64 {
    let mut max = 0.0f64;
    let mut nan = false;
    for &value in values {
        let a = value.abs();
        if a.is_nan() {
            nan = true;
        } else if a > max {
            max = a;
        }
    }
    if max == f64::INFINITY {
        return f64::INFINITY;
    }
    if nan {
        return f64::NAN;
    }
    if max == 0.0 {
        return 0.0;
    }
    let mut sum = 0.0f64;
    let mut compensation = 0.0f64;
    for &value in values {
        let n = value.abs() / max;
        let summand = n * n - compensation;
        let preliminary = sum + summand;
        compensation = (preliminary - sum) - summand;
        sum = preliminary;
    }
    sum.sqrt() * max
}

/// `Math.hypot(x, y)`.
#[inline]
pub fn hypot2(x: f64, y: f64) -> f64 {
    hypot(&[x, y])
}

/// `Math.round`: halves round toward +∞, and -0.5 ≤ x < 0 gives -0.
pub fn round(x: f64) -> f64 {
    if !x.is_finite() {
        return x;
    }
    let floor = x.floor();
    let rounded = if x - floor >= 0.5 { floor + 1.0 } else { floor };
    if rounded == 0.0 && x.is_sign_negative() { -0.0 } else { rounded }
}

/// `Math.min(a, b)`: NaN wins, and -0 is less than +0.
#[inline]
pub fn min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == b {
        if a.is_sign_negative() { a } else { b }
    } else if a < b {
        a
    } else {
        b
    }
}

/// `Math.max(a, b)`: NaN wins, and +0 is greater than -0.
#[inline]
pub fn max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == b {
        if a.is_sign_negative() { b } else { a }
    } else if a > b {
        a
    } else {
        b
    }
}

/// `Array.prototype.sort(compare)` as V8 runs it. Below 64 elements V8's
/// TimSort is one natural run plus a binary insertion sort, reproduced here
/// step by step, so even an inconsistent comparator (NaN coordinates) gives
/// the same order. Longer arrays use a stable merge sort, which agrees with
/// TimSort whenever the comparator is consistent. A NaN result counts as 0.
pub fn sort_by<T: Clone>(items: &mut [T], mut compare: impl FnMut(&T, &T) -> f64) {
    let n = items.len();
    if n < 2 {
        return;
    }
    let mut order = |a: &T, b: &T| -> f64 {
        let v = compare(a, b);
        if v.is_nan() { 0.0 } else { v }
    };
    if n < 64 {
        // CountAndMakeRun(0, n).
        let mut run = 2;
        let descending = order(&items[1], &items[0]) < 0.0;
        let mut previous = 1;
        for index in 2..n {
            let o = order(&items[index], &items[previous]);
            if if descending { o >= 0.0 } else { o < 0.0 } {
                break;
            }
            previous = index;
            run += 1;
        }
        if descending {
            items[..run].reverse();
        }
        // BinaryInsertionSort(0, run, n).
        for start in run..n {
            let pivot = items[start].clone();
            let (mut left, mut right) = (0, start);
            while left < right {
                let mid = left + ((right - left) >> 1);
                if order(&pivot, &items[mid]) < 0.0 {
                    right = mid;
                } else {
                    left = mid + 1;
                }
            }
            items[left..=start].rotate_right(1);
        }
        return;
    }
    merge_sort(items, &mut order);
}

fn merge_sort<T: Clone>(items: &mut [T], order: &mut impl FnMut(&T, &T) -> f64) {
    let n = items.len();
    if n < 2 {
        return;
    }
    let mid = n / 2;
    merge_sort(&mut items[..mid], order);
    merge_sort(&mut items[mid..], order);
    let left = items[..mid].to_vec();
    let right = items[mid..].to_vec();
    let (mut i, mut j, mut k) = (0, 0, 0);
    while i < left.len() && j < right.len() {
        if order(&right[j], &left[i]) < 0.0 {
            items[k] = right[j].clone();
            j += 1;
        } else {
            items[k] = left[i].clone();
            i += 1;
        }
        k += 1;
    }
    while i < left.len() {
        items[k] = left[i].clone();
        i += 1;
        k += 1;
    }
    while j < right.len() {
        items[k] = right[j].clone();
        j += 1;
        k += 1;
    }
}

/// `Math.max(...values)` (-Infinity for none).
pub fn max_of(values: impl IntoIterator<Item = f64>) -> f64 {
    values.into_iter().fold(f64::NEG_INFINITY, max)
}

/// `Math.min(...values)` (Infinity for none).
pub fn min_of(values: impl IntoIterator<Item = f64>) -> f64 {
    values.into_iter().fold(f64::INFINITY, min)
}

/// JavaScript truthiness of a number (`0`, `-0` and NaN are falsy).
#[inline]
pub fn truthy(x: f64) -> bool {
    x != 0.0 && !x.is_nan()
}

/// `String(x)` for a number (ECMAScript Number::toString, radix 10).
pub fn number_to_string(x: f64) -> String {
    let mut out = String::new();
    push_number(&mut out, x);
    out
}

/// Appends `String(x)` to `out`.
pub fn push_number(out: &mut String, x: f64) {
    if push_short_number(out, x) {
        return;
    }
    if x.is_nan() {
        out.push_str("NaN");
        return;
    }
    if x.is_infinite() {
        out.push_str(if x > 0.0 { "Infinity" } else { "-Infinity" });
        return;
    }
    let a = x.abs();
    let (buffer, len, n) = shortest_digits(a);
    let shortest = core::str::from_utf8(&buffer[..len]).unwrap_or("0");
    if len >= 15 && tie_possible(a) {
        let mut digits = shortest.to_string();
        break_tie_to_even(a, &mut digits, n);
        push_digits(out, &digits, n, x < 0.0);
    } else {
        push_digits(out, shortest, n, x < 0.0);
    }
}

/// Writes `0.d₁d₂… × 10^n` the way Number::toString lays it out.
fn push_digits(out: &mut String, digits: &str, n: i32, negative: bool) {
    let k = digits.len() as i32;
    if negative {
        out.push('-');
    }
    if k <= n && n <= 21 {
        out.push_str(digits);
        for _ in 0..(n - k) {
            out.push('0');
        }
    } else if 0 < n && n <= 21 {
        out.push_str(&digits[..n as usize]);
        out.push('.');
        out.push_str(&digits[n as usize..]);
    } else if -6 < n && n <= 0 {
        out.push_str("0.");
        for _ in 0..(-n) {
            out.push('0');
        }
        out.push_str(digits);
    } else {
        out.push_str(&digits[..1]);
        if k > 1 {
            out.push('.');
            out.push_str(&digits[1..]);
        }
        out.push('e');
        out.push(if n - 1 >= 0 { '+' } else { '-' });
        push_u64(out, (n - 1).unsigned_abs() as u64);
    }
}

/// The shortest round-trip digits of a positive finite `x` (no leading or
/// trailing zeros) and the decimal exponent `n` with x ≈ 0.d₁d₂… × 10^n,
/// read off Ryū's output (`123.4`, `0.001`, `1.5e300`, `1e-7`).
fn shortest_digits(x: f64) -> ([u8; 32], usize, i32) {
    let mut ryu_buffer = ryu::Buffer::new();
    let formatted = ryu_buffer.format_finite(x);
    let (mantissa, exponent) = formatted.split_once(['e', 'E']).unwrap_or((formatted, "0"));
    let mut digits = [0u8; 32];
    let mut len = 0;
    let mut point = mantissa.len() as i32;
    let mut leading = 0;
    for (index, byte) in mantissa.bytes().enumerate() {
        if byte == b'.' {
            point = index as i32;
        } else if len == 0 && byte == b'0' {
            leading += 1;
        } else if len < digits.len() {
            digits[len] = byte;
            len += 1;
        }
    }
    while len > 1 && digits[len - 1] == b'0' {
        len -= 1;
    }
    (digits, len, point - leading + exponent.parse::<i32>().unwrap_or(0))
}

/// Whether [`break_tie_to_even`] can find a tie for `x`: its exact value
/// `m / 2^q` (m odd) has `q ≤ 32`.
fn tie_possible(x: f64) -> bool {
    let bits = x.to_bits();
    let exponent = ((bits >> 52) & 0x7ff) as i32;
    let mut mantissa = bits & ((1u64 << 52) - 1);
    let mut e2 = if exponent == 0 { -1074 } else { exponent - 1075 };
    if exponent != 0 {
        mantissa |= 1u64 << 52;
    }
    if mantissa == 0 {
        return false;
    }
    e2 += mantissa.trailing_zeros() as i32;
    e2 < 0 && -e2 <= 32
}

#[cfg(test)]
struct StackBuf {
    bytes: [u8; 40],
    len: usize,
}

#[cfg(test)]
impl StackBuf {
    fn as_str(&self) -> &str {
        core::str::from_utf8(&self.bytes[..self.len]).unwrap_or("")
    }
}

#[cfg(test)]
impl core::fmt::Write for StackBuf {
    fn write_str(&mut self, s: &str) -> core::fmt::Result {
        let end = self.len + s.len();
        if end > self.bytes.len() {
            return Err(core::fmt::Error);
        }
        self.bytes[self.len..end].copy_from_slice(s.as_bytes());
        self.len = end;
        Ok(())
    }
}

fn push_u64(out: &mut String, mut value: u64) {
    let mut buf = [0u8; 20];
    let mut at = buf.len();
    loop {
        at -= 1;
        buf[at] = b'0' + (value % 10) as u8;
        value /= 10;
        if value == 0 {
            break;
        }
    }
    out.push_str(core::str::from_utf8(&buf[at..]).unwrap_or(""));
}

/// Decimals tried by the fast path (path data is rounded to one or two).
const POW10: [f64; 4] = [1.0, 1e1, 1e2, 1e3];

/// The exact fast path of [`push_number`]: zero, integers below 2^53, and
/// values in [1e-6, 1e9) with at most three decimals. For those the fewest
/// decimals `d` with `round(x · 10^d) / 10^d == x` give the shortest
/// round-trip form: the division of two exact values is correctly rounded,
/// as parsing the decimal is, and at that magnitude a step of 10^-d is
/// wider than an ulp, so no other decimal with `d` digits round-trips (no
/// tie to break) and `x · 10^d` is within 0.125 of the integer. Returns
/// false for anything else.
fn push_short_number(out: &mut String, x: f64) -> bool {
    if x == 0.0 {
        out.push('0');
        return true;
    }
    let a = x.abs();
    if a < 9007199254740992.0 && a == a.trunc() {
        if x < 0.0 {
            out.push('-');
        }
        push_u64(out, a as u64);
        return true;
    }
    if !(1e-6..1e9).contains(&a) {
        return false;
    }
    for (d, &p) in POW10.iter().enumerate().skip(1) {
        let m = (a * p).round();
        if m / p != a {
            continue;
        }
        let m = m as u64;
        let scale = 10u64.pow(d as u32);
        if x < 0.0 {
            out.push('-');
        }
        push_u64(out, m / scale);
        out.push('.');
        let fraction = m % scale;
        let mut width = 1;
        while width < d && fraction >= 10u64.pow(width as u32) {
            width += 1;
        }
        for _ in width..d {
            out.push('0');
        }
        push_u64(out, fraction);
        return true;
    }
    false
}

/// Rust's shortest digits break an exact tie between two shortest
/// candidates upward; ECMAScript picks the even one. A tie needs the exact
/// value of `x` to have one digit more than the shortest form, ending in 5,
/// so it is checked exactly on the integer `m · 5^q` (x = m / 2^q).
fn break_tie_to_even(x: f64, digits: &mut String, n: i32) {
    let k = digits.len();
    if k < 15 {
        return;
    }
    let bits = x.to_bits();
    let exponent = ((bits >> 52) & 0x7ff) as i32;
    let mut mantissa = bits & ((1u64 << 52) - 1);
    let mut e2 = if exponent == 0 { -1074 } else { exponent - 1075 };
    if exponent != 0 {
        mantissa |= 1u64 << 52;
    }
    if mantissa == 0 || e2 >= 0 {
        return;
    }
    let tz = mantissa.trailing_zeros() as i32;
    mantissa >>= tz;
    e2 += tz;
    if e2 >= 0 {
        return;
    }
    let q = -e2;
    if q > 32 {
        return; // m · 5^q has more than 18 digits: no tie at 17 or fewer
    }
    let exact = (mantissa as u128 * 5u128.pow(q as u32)).to_string();
    if exact.len() != k + 1 || !exact.ends_with('5') {
        return;
    }
    let lower = &exact[..k];
    let mut upper: Vec<u8> = lower.as_bytes().to_vec();
    let mut i = k;
    loop {
        if i == 0 {
            return; // carries into a new digit; leave it
        }
        i -= 1;
        if upper[i] == b'9' {
            upper[i] = b'0';
        } else {
            upper[i] += 1;
            break;
        }
    }
    let upper = String::from_utf8(upper).unwrap_or_default();
    let round_trips = |d: &str| format!("{}.{}e{}", &d[..1], &d[1..], n - 1).parse::<f64>().ok() == Some(x);
    let lower_even = (lower.as_bytes()[k - 1] - b'0') % 2 == 0;
    let (even, odd) = if lower_even { (lower, upper.as_str()) } else { (upper.as_str(), lower) };
    if round_trips(even) {
        *digits = even.to_string();
    } else if round_trips(odd) {
        *digits = odd.to_string();
    }
    // A shortest form never has trailing zeros.
    while digits.len() > 1 && digits.ends_with('0') {
        digits.pop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The general path alone (no fast path), for comparison.
    fn general(x: f64) -> String {
        let mut buf = StackBuf { bytes: [0; 40], len: 0 };
        let _ = core::fmt::Write::write_fmt(&mut buf, format_args!("{:e}", x.abs()));
        let formatted = buf.as_str().to_string();
        let (mantissa, exponent) = formatted.split_once('e').unwrap();
        let mut digits: String = mantissa.chars().filter(|c| *c != '.').collect();
        let n = exponent.parse::<i32>().unwrap() + 1;
        break_tie_to_even(x.abs(), &mut digits, n);
        let k = digits.len() as i32;
        let sign = if x < 0.0 { "-" } else { "" };
        if k <= n && n <= 21 {
            format!("{sign}{digits}{}", "0".repeat((n - k) as usize))
        } else if 0 < n && n <= 21 {
            format!("{sign}{}.{}", &digits[..n as usize], &digits[n as usize..])
        } else if -6 < n && n <= 0 {
            format!("{sign}0.{}{digits}", "0".repeat((-n) as usize))
        } else {
            let rest = if k > 1 { format!(".{}", &digits[1..]) } else { String::new() };
            format!("{sign}{}{rest}e{}{}", &digits[..1], if n - 1 >= 0 { "+" } else { "-" }, (n - 1).abs())
        }
    }

    #[test]
    fn ryu_digits_match_core_formatting() {
        let mut seed = 0x9E3779B97F4A7C15u64;
        for index in 0..400_000u64 {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            let x = match index % 4 {
                0 => f64::from_bits(seed),
                1 => (seed >> 11) as f64 / (1u64 << 53) as f64 * 1000.0,
                2 => ((seed >> 11) as f64 / (1u64 << 40) as f64).round() / 10.0 / 2.0 + 0.05,
                _ => (seed >> 11) as f64 * 1e-30,
            };
            if !x.is_finite() || x == 0.0 {
                continue;
            }
            assert_eq!(number_to_string(x), general(x), "{x:e}");
        }
    }

    #[test]
    fn fast_path_matches_general_path() {
        let mut seed = 0x2545F4914F6CDD1Du64;
        let mut next = || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed
        };
        for _ in 0..200_000 {
            let r = next();
            let unit = (r >> 11) as f64 / (1u64 << 53) as f64;
            let x = match r % 6 {
                0 => (unit * 2e6 - 1e6).round() / 100.0,
                1 => (unit * 2e4 - 1e4).round() / 10.0,
                2 => unit * 1e9,
                3 => (unit - 0.5) * 2e-3,
                4 => ((unit * 1e7).round() / 1e6) * if r & 64 == 0 { 1.0 } else { -1.0 },
                _ => f64::from_bits(next()),
            };
            if !x.is_finite() || x == 0.0 || x.abs() >= 1e21 || x.abs() < 1e-6 {
                continue;
            }
            let mut fast = String::new();
            if push_short_number(&mut fast, x) {
                assert_eq!(fast, general(x), "{x:e}");
            }
        }
    }

    #[test]
    fn formats_numbers_like_javascript() {
        assert_eq!(number_to_string(0.1), "0.1");
        assert_eq!(number_to_string(-0.0), "0");
        assert_eq!(number_to_string(123.4), "123.4");
        assert_eq!(number_to_string(100.0), "100");
        assert_eq!(number_to_string(1e21), "1e+21");
        assert_eq!(number_to_string(1e-7), "1e-7");
        assert_eq!(number_to_string(0.000001), "0.000001");
        assert_eq!(number_to_string(-12.5), "-12.5");
        assert_eq!(number_to_string(1.5e300), "1.5e+300");
        // An exact tie between two shortest forms goes to the even digit.
        assert_eq!(number_to_string(22.0996856689453125), "22.099685668945312");
    }

    #[test]
    fn rounds_like_javascript() {
        assert_eq!(round(2.5), 3.0);
        assert_eq!(round(-2.5), -2.0);
        assert!(round(-0.4).is_sign_negative());
        assert_eq!(round(0.49999999999999994), 0.0);
    }

    #[test]
    fn hypot_matches_v8() {
        assert_eq!(hypot2(3.0, 4.0), 5.0);
        assert_eq!(hypot2(0.0, 0.0), 0.0);
    }
}
