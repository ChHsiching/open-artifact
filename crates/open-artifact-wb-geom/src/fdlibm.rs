//! `Math.sin`, `Math.cos`, `Math.atan` and `Math.atan2` exactly as the V8
//! the editor runs on computes them.
//!
//! V8 ships fdlibm 5.3 (`src/base/ieee754.cc`). Its C++ is compiled with
//! clang's default `-ffp-contract=on`, which on arm64 fuses every `a * b + c`
//! inside one expression into a single fused multiply-add. The fused
//! roundings change the last bit of about 1% of results, so the kernels below
//! spell out each contraction as an exact [`fma`]. Validated bit for bit
//! against Node 26 / V8 14.6 on Apple Silicon over millions of inputs.
//!
//! The one path not reproduced is the Payne–Hanek reduction for
//! |x| > 2^19·π/2 (≈ 823 550 radians); it falls back to `libm`.

#[inline(always)]
fn fma(a: f64, b: f64, c: f64) -> f64 {
    libm::fma(a, b, c)
}

#[inline(always)]
fn high(x: f64) -> i32 {
    (x.to_bits() >> 32) as i32
}

const S1: f64 = -1.66666666666666324348e-01;
const S2: f64 = 8.33333333332248946124e-03;
const S3: f64 = -1.98412698298579493134e-04;
const S4: f64 = 2.75573137070700676789e-06;
const S5: f64 = -2.50507602534068634195e-08;
const S6: f64 = 1.58969099521155010221e-10;

fn kernel_sin(x: f64, y: f64, iy: bool) -> f64 {
    let ix = high(x) & 0x7fff_ffff;
    if ix < 0x3e40_0000 && (x as i32) == 0 {
        return x;
    }
    let z = x * x;
    let v = z * x;
    let r = fma(z, fma(z, fma(z, fma(z, S6, S5), S4), S3), S2);
    if !iy {
        fma(v, fma(z, r, S1), x)
    } else {
        x - fma(-v, S1, fma(z, fma(0.5, y, -(v * r)), -y))
    }
}

const C1: f64 = 4.16666666666666019037e-02;
const C2: f64 = -1.38888888888741095749e-03;
const C3: f64 = 2.48015872894767294178e-05;
const C4: f64 = -2.75573143513906633035e-07;
const C5: f64 = 2.08757232129817482790e-09;
const C6: f64 = -1.13596475577881948265e-11;

fn kernel_cos(x: f64, y: f64) -> f64 {
    let ix = high(x) & 0x7fff_ffff;
    if ix < 0x3e40_0000 && (x as i32) == 0 {
        return 1.0;
    }
    let z = x * x;
    let r = z * fma(z, fma(z, fma(z, fma(z, fma(z, C6, C5), C4), C3), C2), C1);
    if ix < 0x3fd3_3333 {
        1.0 - fma(0.5, z, -fma(z, r, -(x * y)))
    } else {
        let qx = if ix > 0x3fe9_0000 { 0.28125 } else { f64::from_bits(((ix - 0x0020_0000) as u32 as u64) << 32) };
        let hz = fma(0.5, z, -qx);
        let a = 1.0 - qx;
        a - (hz - fma(z, r, -(x * y)))
    }
}

const INVPIO2: f64 = 6.36619772367581382433e-01;
const PIO2_1: f64 = 1.57079632673412561417e+00;
const PIO2_1T: f64 = 6.07710050650619224932e-11;
const PIO2_2: f64 = 6.07710050630396597660e-11;
const PIO2_2T: f64 = 2.02226624879595063154e-21;
const PIO2_3: f64 = 2.02226624871116645580e-21;
const PIO2_3T: f64 = 8.47842766036889956997e-32;

/// `__ieee754_rem_pio2` for |x| ≤ 2^19·π/2: `(n, y0, y1)` with
/// x ≈ n·π/2 + y0 + y1. `None` for larger magnitudes.
fn rem_pio2(x: f64) -> Option<(i32, f64, f64)> {
    let hx = high(x);
    let ix = hx & 0x7fff_ffff;
    if ix <= 0x3fe9_21fb {
        return Some((0, x, 0.0));
    }
    if ix < 0x4002_d97c {
        // |x| < 3π/4: n = ±1.
        return Some(if hx > 0 {
            let z = x - PIO2_1;
            if ix != 0x3ff9_21fb {
                let y0 = z - PIO2_1T;
                (1, y0, (z - y0) - PIO2_1T)
            } else {
                let z = z - PIO2_2;
                let y0 = z - PIO2_2T;
                (1, y0, (z - y0) - PIO2_2T)
            }
        } else {
            let z = x + PIO2_1;
            if ix != 0x3ff9_21fb {
                let y0 = z + PIO2_1T;
                (-1, y0, (z - y0) + PIO2_1T)
            } else {
                let z = z + PIO2_2;
                let y0 = z + PIO2_2T;
                (-1, y0, (z - y0) + PIO2_2T)
            }
        });
    }
    if ix > 0x4139_21fb {
        return None;
    }
    let t = x.abs();
    let n = fma(t, INVPIO2, 0.5) as i32;
    let fnn = n as f64;
    let mut r = fma(-fnn, PIO2_1, t);
    let mut w = fnn * PIO2_1T;
    // High word of n·π/2 (fdlibm's `npio2_hw` table).
    let npio2_hw = if (1..=32).contains(&n) { high(fnn * core::f64::consts::FRAC_PI_2) } else { 0 };
    let y0 = if n < 32 && ix != npio2_hw {
        r - w
    } else {
        let j = ix >> 20;
        let mut y0 = r - w;
        let i = j - ((high(y0) >> 20) & 0x7ff);
        if i > 16 {
            let t = r;
            w = fnn * PIO2_2;
            r = t - w;
            w = fma(fnn, PIO2_2T, -((t - r) - w));
            y0 = r - w;
            let i = j - ((high(y0) >> 20) & 0x7ff);
            if i > 49 {
                let t = r;
                w = fnn * PIO2_3;
                r = t - w;
                w = fma(fnn, PIO2_3T, -((t - r) - w));
                y0 = r - w;
            }
        }
        y0
    };
    let y1 = (r - y0) - w;
    Some(if hx < 0 { (-n, -y0, -y1) } else { (n, y0, y1) })
}

/// `Math.sin`.
pub fn sin(x: f64) -> f64 {
    let ix = high(x) & 0x7fff_ffff;
    if ix <= 0x3fe9_21fb {
        return kernel_sin(x, 0.0, false);
    }
    if ix >= 0x7ff0_0000 {
        return f64::NAN;
    }
    match rem_pio2(x) {
        Some((n, a, b)) => match n & 3 {
            0 => kernel_sin(a, b, true),
            1 => kernel_cos(a, b),
            2 => -kernel_sin(a, b, true),
            _ => -kernel_cos(a, b),
        },
        None => libm::sin(x),
    }
}

/// `Math.cos`.
pub fn cos(x: f64) -> f64 {
    let ix = high(x) & 0x7fff_ffff;
    if ix <= 0x3fe9_21fb {
        return kernel_cos(x, 0.0);
    }
    if ix >= 0x7ff0_0000 {
        return f64::NAN;
    }
    match rem_pio2(x) {
        Some((n, a, b)) => match n & 3 {
            0 => kernel_cos(a, b),
            1 => -kernel_sin(a, b, true),
            2 => -kernel_cos(a, b),
            _ => kernel_sin(a, b, true),
        },
        None => libm::cos(x),
    }
}

const ATANHI: [f64; 4] = [
    4.63647609000806093515e-01,
    7.85398163397448278999e-01,
    9.82793723247329054082e-01,
    1.57079632679489655800e+00,
];
const ATANLO: [f64; 4] = [
    2.26987774529616870924e-17,
    3.06161699786838301793e-17,
    1.39033110312309984516e-17,
    6.12323399573676603587e-17,
];
const AT: [f64; 11] = [
    3.33333333333329318027e-01,
    -1.99999999998764832476e-01,
    1.42857142725034663711e-01,
    -1.11111104054623557880e-01,
    9.09088713343650656196e-02,
    -7.69187620504482999495e-02,
    6.66107313738753120669e-02,
    -5.83357013379057348645e-02,
    4.97687799461593236017e-02,
    -3.65315727442169155270e-02,
    1.62858201153657823623e-02,
];

/// `Math.atan`.
pub fn atan(x0: f64) -> f64 {
    let mut x = x0;
    let hx = high(x);
    let ix = hx & 0x7fff_ffff;
    if ix >= 0x4410_0000 {
        // |x| ≥ 2^66
        if x.is_nan() {
            return x;
        }
        return if hx > 0 { ATANHI[3] + ATANLO[3] } else { -ATANHI[3] - ATANLO[3] };
    }
    let id: i32 = if ix < 0x3fdc_0000 {
        // |x| < 0.4375
        if ix < 0x3e40_0000 {
            // |x| < 2^-27
            return x;
        }
        -1
    } else {
        x = x.abs();
        if ix < 0x3ff3_0000 {
            if ix < 0x3fe6_0000 {
                x = fma(2.0, x, -1.0) / (2.0 + x);
                0
            } else {
                x = (x - 1.0) / (x + 1.0);
                1
            }
        } else if ix < 0x4003_8000 {
            x = (x - 1.5) / fma(1.5, x, 1.0);
            2
        } else {
            x = -1.0 / x;
            3
        }
    };
    let z = x * x;
    let w = z * z;
    let s1 = z * fma(w, fma(w, fma(w, fma(w, fma(w, AT[10], AT[8]), AT[6]), AT[4]), AT[2]), AT[0]);
    let s2 = w * fma(w, fma(w, fma(w, fma(w, AT[9], AT[7]), AT[5]), AT[3]), AT[1]);
    if id < 0 {
        return fma(-x, s1 + s2, x);
    }
    let id = id as usize;
    let z = ATANHI[id] - (fma(x, s1 + s2, -ATANLO[id]) - x);
    if hx < 0 { -z } else { z }
}

/// `Math.atan2(y, x)`.
pub fn atan2(y: f64, x: f64) -> f64 {
    use core::f64::consts::{FRAC_PI_2, FRAC_PI_4, PI};
    const PI_LO: f64 = 1.2246467991473531772e-16;
    if x.is_nan() || y.is_nan() {
        return f64::NAN;
    }
    if x == 1.0 {
        return atan(y);
    }
    let hx = high(x);
    let hy = high(y);
    let ix = hx & 0x7fff_ffff;
    let iy = hy & 0x7fff_ffff;
    let m = ((hy >> 31) & 1) | ((hx >> 30) & 2);
    if y == 0.0 {
        return match m {
            0 | 1 => y,
            2 => PI,
            _ => -PI,
        };
    }
    if x == 0.0 {
        return if hy < 0 { -FRAC_PI_2 } else { FRAC_PI_2 };
    }
    if x.is_infinite() {
        return if y.is_infinite() {
            match m {
                0 => FRAC_PI_4,
                1 => -FRAC_PI_4,
                2 => 3.0 * FRAC_PI_4,
                _ => -3.0 * FRAC_PI_4,
            }
        } else {
            match m {
                0 => 0.0,
                1 => -0.0,
                2 => PI,
                _ => -PI,
            }
        };
    }
    if y.is_infinite() {
        return if hy < 0 { -FRAC_PI_2 } else { FRAC_PI_2 };
    }
    let k = (iy - ix) >> 20;
    let (z, m) = if k > 60 {
        (fma(0.5, PI_LO, FRAC_PI_2), m & 1)
    } else if hx < 0 && k < -60 {
        (0.0, m)
    } else {
        (atan((y / x).abs()), m)
    };
    match m {
        0 => z,
        1 => -z,
        2 => PI - (z - PI_LO),
        _ => (z - PI_LO) - PI,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bits(a: f64, b: f64) -> bool {
        a.to_bits() == b.to_bits()
    }

    // Expected values printed by Node 26 (V8 14.6, arm64).
    #[test]
    fn sin_cos_match_v8() {
        assert!(bits(sin(5.252491032363073), -0.8576562083024599));
        assert!(bits(sin(0.7211657139609634), 0.660260614192128));
        assert!(bits(sin(-0.8377580409572781), -0.7431448254773942));
        assert!(bits(cos(0.4327114126014834), 0.9078321010667487));
        assert!(bits(cos(-2.537473868223221), -0.823002979679499));
        assert!(bits(cos(-1.2012386322021484), 0.361203023179968));
        assert!(bits(sin(-0.0), -0.0));
        assert!(bits(cos(-0.0), 1.0));
        assert!(sin(f64::INFINITY).is_nan() && cos(f64::NAN).is_nan());
    }

    #[test]
    fn atan2_matches_v8() {
        assert!(bits(atan2(48.989295959472656, 133.09612274169922), 0.3526852653383972));
        assert!(bits(atan2(-0.0, -1.0), -core::f64::consts::PI));
        assert!(bits(atan2(0.0, -0.0), core::f64::consts::PI));
        assert!(bits(atan2(-0.0, 0.0), -0.0));
        assert!(bits(atan2(1.0, 0.0), core::f64::consts::FRAC_PI_2));
        assert!(bits(atan2(f64::INFINITY, f64::NEG_INFINITY), 2.356194490192345));
        assert!(atan2(f64::NAN, 1.0).is_nan());
    }
}
