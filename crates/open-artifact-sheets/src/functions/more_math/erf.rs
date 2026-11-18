//! ERF and ERFC: musl's `erf` and `erfc` (from FreeBSD's `s_erf.c`).

use crate::functions::{number, Answer, Arg};
use crate::locale::Locale;

/// ERF(limit, [upper limit]): erf of the limit, or erf(upper) − erf(limit); with both limits 0.5 or more (or
/// both −0.5 or less), the difference of their erfc, which keeps the digits erf rounds away.
pub fn erf_between(args: &[Arg], locale: &Locale) -> Answer {
    let a = args[0].number(locale)?;
    let Some(b) = args.get(1) else {
        return number(erf(a));
    };
    let b = b.number(locale)?;
    number(if a >= 0.5 && b >= 0.5 {
        erfc(a) - erfc(b)
    } else if a <= -0.5 && b <= -0.5 {
        erfc(-b) - erfc(-a)
    } else {
        erf(b) - erf(a)
    })
}

const EFX8: f64 = 1.02703333676410069053e+00;
const PP0: f64 = 1.28379167095512558561e-01;
const PP1: f64 = -3.25042107247001499370e-01;
const PP2: f64 = -2.84817495755985104766e-02;
const PP3: f64 = -5.77027029648944159157e-03;
const PP4: f64 = -2.37630166566501626084e-05;
const QQ1: f64 = 3.97917223959155352819e-01;
const QQ2: f64 = 6.50222499887672944485e-02;
const QQ3: f64 = 5.08130628187576562776e-03;
const QQ4: f64 = 1.32494738004321644526e-04;
const QQ5: f64 = -3.96022827877536812320e-06;
/// 1 − erx, erx being erf(1) to 34 bits (8.45062911510467529297e-01).
const ONE_MINUS_ERX: f64 = 0.15493708848953247;
const PA0: f64 = -2.36211856075265944077e-03;
const PA1: f64 = 4.14856118683748331666e-01;
const PA2: f64 = -3.72207876035701323847e-01;
const PA3: f64 = 3.18346619901161753674e-01;
const PA4: f64 = -1.10894694282396677476e-01;
const PA5: f64 = 3.54783043256182359371e-02;
const PA6: f64 = -2.16637559486879084300e-03;
const QA1: f64 = 1.06420880400844228286e-01;
const QA2: f64 = 5.40397917702171048937e-01;
const QA3: f64 = 7.18286544141962662868e-02;
const QA4: f64 = 1.26171219808761642112e-01;
const QA5: f64 = 1.36370839120290507362e-02;
const QA6: f64 = 1.19844998467991074170e-02;
const RA0: f64 = -9.86494403484714822705e-03;
const RA1: f64 = -6.93858572707181764372e-01;
const RA2: f64 = -1.05586262253232909814e+01;
const RA3: f64 = -6.23753324503260060396e+01;
const RA4: f64 = -1.62396669462573470355e+02;
const RA5: f64 = -1.84605092906711035994e+02;
const RA6: f64 = -8.12874355063065934246e+01;
const RA7: f64 = -9.81432934416914548592e+00;
const SA1: f64 = 1.96512716674392571292e+01;
const SA2: f64 = 1.37657754143519042600e+02;
const SA3: f64 = 4.34565877475229228821e+02;
const SA4: f64 = 6.45387271733267880336e+02;
const SA5: f64 = 4.29008140027567833386e+02;
const SA6: f64 = 1.08635005541779435134e+02;
const SA7: f64 = 6.57024977031928170135e+00;
const SA8: f64 = -6.04244152148580987438e-02;
const RB0: f64 = -9.86494292470009928597e-03;
const RB1: f64 = -7.99283237680523006574e-01;
const RB2: f64 = -1.77579549177547519889e+01;
const RB3: f64 = -1.60636384855821916062e+02;
const RB4: f64 = -6.37566443368389627722e+02;
const RB5: f64 = -1.02509513161107724954e+03;
const RB6: f64 = -4.83519191608651397019e+02;
const SB1: f64 = 3.03380607434824582924e+01;
const SB2: f64 = 3.25792512996573918826e+02;
const SB3: f64 = 1.53672958608443695994e+03;
const SB4: f64 = 3.19985821950859553908e+03;
const SB5: f64 = 2.55305040643316442583e+03;
const SB6: f64 = 4.74528541206955367215e+02;
const SB7: f64 = -2.24409524465858183362e+01;
const TINY: f64 = 2.2250738585072014e-308; // 2⁻¹⁰²²

fn high_word(x: f64) -> u32 {
    (x.to_bits() >> 32) as u32
}

/// The rational part for |x| below 0.84375.
fn small(x: f64) -> f64 {
    let z = x * x;
    let r = PP0 + z * (PP1 + z * (PP2 + z * (PP3 + z * PP4)));
    let s = 1.0 + z * (QQ1 + z * (QQ2 + z * (QQ3 + z * (QQ4 + z * QQ5))));
    r / s
}

/// erfc for 0.84375 ≤ |x| < 1.25.
fn erfc1(x: f64) -> f64 {
    let s = x.abs() - 1.0;
    let p = PA0 + s * (PA1 + s * (PA2 + s * (PA3 + s * (PA4 + s * (PA5 + s * PA6)))));
    let q = 1.0 + s * (QA1 + s * (QA2 + s * (QA3 + s * (QA4 + s * (QA5 + s * QA6)))));
    ONE_MINUS_ERX - p / q
}

/// erfc of |x| for 0.84375 ≤ |x| < 28.
fn erfc2(ix: u32, x: f64) -> f64 {
    if ix < 0x3ff40000 {
        return erfc1(x);
    }
    let x = x.abs();
    let s = 1.0 / (x * x);
    let (r, big_s) = if ix < 0x4006db6d {
        (
            RA0 + s * (RA1 + s * (RA2 + s * (RA3 + s * (RA4 + s * (RA5 + s * (RA6 + s * RA7)))))),
            1.0 + s * (SA1 + s * (SA2 + s * (SA3 + s * (SA4 + s * (SA5 + s * (SA6 + s * (SA7 + s * SA8))))))),
        )
    } else {
        (
            RB0 + s * (RB1 + s * (RB2 + s * (RB3 + s * (RB4 + s * (RB5 + s * RB6))))),
            1.0 + s * (SB1 + s * (SB2 + s * (SB3 + s * (SB4 + s * (SB5 + s * (SB6 + s * SB7)))))),
        )
    };
    let z = f64::from_bits(x.to_bits() & 0xffff_ffff_0000_0000);
    (-z * z - 0.5625).exp() * ((z - x) * (z + x) + r / big_s).exp() / x
}

pub fn erf(x: f64) -> f64 {
    let hx = high_word(x);
    let negative = hx >> 31 == 1;
    let ix = hx & 0x7fffffff;
    if ix >= 0x7ff00000 {
        return 1.0 - 2.0 * (negative as u8 as f64) + 1.0 / x;
    }
    if ix < 0x3feb0000 {
        if ix < 0x3e300000 {
            return 0.125 * (8.0 * x + EFX8 * x);
        }
        return x + x * small(x);
    }
    let y = if ix < 0x40180000 { 1.0 - erfc2(ix, x) } else { 1.0 - TINY };
    if negative {
        -y
    } else {
        y
    }
}

pub fn erfc(x: f64) -> f64 {
    let hx = high_word(x);
    let negative = hx >> 31 == 1;
    let ix = hx & 0x7fffffff;
    if ix >= 0x7ff00000 {
        return 2.0 * (negative as u8 as f64) + 1.0 / x;
    }
    if ix < 0x3feb0000 {
        if ix < 0x3c700000 {
            return 1.0 - x;
        }
        let y = small(x);
        if negative || ix < 0x3fd00000 {
            return 1.0 - (x + x * y);
        }
        return 0.5 - (x - 0.5 + x * y);
    }
    if ix < 0x403c0000 {
        return if negative { 2.0 - erfc2(ix, x) } else { erfc2(ix, x) };
    }
    if negative {
        2.0 - TINY
    } else {
        TINY * TINY
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_reference() {
        assert_eq!(erf(0.5), 0.5204998778130465);
        assert_eq!(erf(1.0), 0.8427007929497149);
        assert_eq!(erf(1e-10), 1.1283791670955126e-10);
        assert_eq!(erf(6.0), 1.0);
        assert_eq!(erfc(30.0), 0.0);
    }
}
