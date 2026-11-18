//! Securities: accrued interest, coupons, discounted and at-maturity securities, coupon bonds (PRICE, YIELD,
//! DURATION) and Treasury bills.

use super::days::{year_fraction, Coupons};
use super::math::{ln_1p, solve, Annuity};
use super::{answer, basis, day, numbers, span, whole};
use crate::dates;
use crate::functions::{Answer, Arg};
use crate::locale::Locale;
use crate::value::CellError;

pub fn call(name: &str, args: &[Arg], locale: &Locale) -> Option<Answer> {
    Some(match name {
        "ACCRINT" => accrued_interest(args, locale),
        "ACCRINTM" => discounted(args, locale, |rate, par, years| years * (rate * par)),
        "COUPDAYBS" => coupons(args, locale).and_then(|c| answer(c.days_before())),
        "COUPDAYS" => coupons(args, locale).and_then(|c| answer(c.days())),
        "COUPDAYSNC" => coupons(args, locale).and_then(|c| answer(c.days_after())),
        "COUPNCD" => coupons(args, locale).and_then(|c| answer(c.next as f64)),
        "COUPNUM" => coupons(args, locale).and_then(|c| answer(c.count)),
        "COUPPCD" => coupons(args, locale).and_then(|c| answer(c.previous as f64)),
        "DISC" => discounted(args, locale, |price, redemption, years| (redemption - price) / redemption / years),
        "INTRATE" => discounted(args, locale, |investment, redemption, years| (redemption - investment) / investment / years),
        "PRICEDISC" => discounted(args, locale, |discount, redemption, years| redemption * (1.0 - discount * years)),
        "RECEIVED" => received(args, locale),
        "YIELDDISC" => discounted(args, locale, |price, redemption, years| (redemption - price) / price / years),
        "PRICEMAT" | "YIELDMAT" => at_maturity(args, name == "PRICEMAT", locale),
        "PRICE" => price(args, locale),
        "YIELD" => bond_yield(args, locale),
        "DURATION" | "MDURATION" => duration(args, name == "MDURATION", locale),
        "TBILLEQ" | "TBILLPRICE" | "TBILLYIELD" => treasury_bill(args, name, locale),
        _ => return None,
    })
}

/// The coupons of settlement and maturity, as the COUP functions read them.
fn coupons(args: &[Arg], locale: &Locale) -> Result<Coupons, CellError> {
    let n = numbers(args, &[0.0, 0.0, 0.0, 0.0], locale)?;
    settled(n[0], n[1], whole(n[2]), whole(n[3]))
}

/// The coupons of a security settled before its maturity.
fn settled(settlement: f64, maturity: f64, frequency: i64, basis_number: i64) -> Result<Coupons, CellError> {
    let (settlement, maturity) = span(settlement, maturity)?;
    Coupons::new(settlement, maturity, frequency, basis(basis_number)?)
}

/// ACCRINT: interest from issue (or the first interest date before settlement, unless counted from issue) to
/// settlement; for basis 1 counted in coupon periods.
fn accrued_interest(args: &[Arg], locale: &Locale) -> Answer {
    let n = numbers(args, &[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], locale)?;
    let from_issue = args.get(7).map_or(Ok(true), |a| a.boolean())?;
    let [issue, first, settlement, rate, par, frequency, basis_number] = n[..] else { unreachable!() };
    if rate <= 0.0 || par <= 0.0 {
        return Err(CellError::Number);
    }
    let (issue, settlement) = span(issue, settlement)?;
    let first = day(first)?;
    let basis = basis(whole(basis_number))?;
    let frequency = whole(frequency);
    let start = if settlement <= first {
        issue
    } else if from_issue {
        issue
    } else {
        first.max(issue)
    };
    let at_start = Coupons::new(start, first, frequency, basis)?;
    let years = if basis == 1 {
        let at_settlement = Coupons::new(settlement, first, frequency, basis)?;
        ((at_start.count - at_settlement.count) - at_start.days_before() / at_start.days()
            + at_settlement.days_before() / at_settlement.days())
            / at_start.frequency
    } else {
        year_fraction(basis, start, settlement)
    };
    answer(rate * par * years)
}

/// ACCRINTM, DISC, INTRATE, PRICEDISC and YIELDDISC: two amounts above 0 and the years from settlement to maturity.
fn discounted(args: &[Arg], locale: &Locale, f: fn(f64, f64, f64) -> f64) -> Answer {
    let n = numbers(args, &[0.0, 0.0, 0.0, 0.0, 0.0], locale)?;
    let [settlement, maturity, a, b, basis_number] = n[..] else { unreachable!() };
    if a <= 0.0 || b <= 0.0 {
        return Err(CellError::Number);
    }
    let years = years_between(settlement, maturity, whole(basis_number))?;
    answer(f(a, b, years))
}

fn years_between(from: f64, to: f64, basis_number: i64) -> Result<f64, CellError> {
    let (from, to) = span(from, to)?;
    Ok(year_fraction(basis(basis_number)?, from, to))
}

/// RECEIVED: the investment over what the discount leaves of it (#NUM! when nothing).
fn received(args: &[Arg], locale: &Locale) -> Answer {
    let n = numbers(args, &[0.0, 0.0, 0.0, 0.0, 0.0], locale)?;
    let [settlement, maturity, investment, discount, basis_number] = n[..] else { unreachable!() };
    if investment <= 0.0 || discount <= 0.0 {
        return Err(CellError::Number);
    }
    let years = years_between(settlement, maturity, whole(basis_number))?;
    let left = 1.0 - discount * years;
    if left <= 0.0 {
        return Err(CellError::Number);
    }
    answer(investment / left)
}

/// PRICEMAT and YIELDMAT: a security paying its interest at maturity, issued on or before settlement.
fn at_maturity(args: &[Arg], is_price: bool, locale: &Locale) -> Answer {
    let n = numbers(args, &[0.0, 0.0, 0.0, 0.0, 0.0, 0.0], locale)?;
    let [settlement, maturity, issue, rate, other, basis_number] = n[..] else { unreachable!() };
    if rate < 0.0 || (is_price && other < 0.0) || (!is_price && other <= 0.0) {
        return Err(CellError::Number);
    }
    let (settlement, maturity) = span(settlement, maturity)?;
    let issue = day(issue)?;
    if issue > settlement {
        return Err(CellError::Number);
    }
    let basis = basis(whole(basis_number))?;
    let before = year_fraction(basis, issue, settlement);
    let whole_term = year_fraction(basis, issue, maturity);
    let after = year_fraction(basis, settlement, maturity);
    let paid = (rate * whole_term + 1.0) * 100.0;
    if is_price {
        let yld = other;
        answer(paid / (yld * after + 1.0) - before * (rate * 100.0))
    } else {
        let cost = other + before * (rate * 100.0);
        answer((paid - cost) / cost / after)
    }
}

/// A coupon bond at settlement: its coupon and redemption per 100, the coupons left, the part of a period to the
/// next coupon, and the interest accrued.
struct Bond {
    coupon: f64,
    redemption: f64,
    count: f64,
    to_next: f64,
    accrued: f64,
}

impl Bond {
    fn new(c: &Coupons, rate: f64, redemption: f64) -> Result<Bond, CellError> {
        if rate < 0.0 || redemption <= 0.0 {
            return Err(CellError::Number);
        }
        let coupon = rate * 100.0 / c.frequency;
        Ok(Bond {
            coupon,
            redemption,
            count: c.count,
            to_next: c.days_after() / c.days(),
            accrued: coupon * c.days_before() / c.days(),
        })
    }

    /// The price (with accrued interest) and the duration in periods at a rate per period.
    fn worth(&self, r: f64) -> Result<(f64, f64), CellError> {
        let t = Annuity::new(r, self.count)?;
        let n = self.count;
        let redeemed = -((t.b * 0.0) - (t.c * self.redemption)) / t.a;
        let paid = -((t.c * 0.0) - (t.b * self.coupon)) / t.a;
        let g = ln_1p(r);
        let (h1, hn) = (inverse_growth(g), inverse_growth(n * g));
        let total = paid + redeemed;
        let w = 1.0 - self.to_next;
        let price = total * (g * w).exp();
        let duration = (n * redeemed + paid * ((h1 + 1.0) - n * hn)) / total - w;
        Ok((price, duration))
    }
}

/// `1/(eˣ − 1) − 1/x`, by its series when `x` is small.
fn inverse_growth(x: f64) -> f64 {
    if x.abs() > 0.25 {
        return 1.0 / (x.exp() - 1.0) + -1.0 / x;
    }
    let mut s = 0.0;
    for c in [47_900_160.0, -1_209_600.0, 30_240.0, -720.0, 12.0] {
        s = x * (x * s) + 1.0 / c;
    }
    x * s - 0.5
}

/// PRICE: the price per 100 at a yield (0 or more), less accrued interest.
fn price(args: &[Arg], locale: &Locale) -> Answer {
    let n = numbers(args, &[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], locale)?;
    let [settlement, maturity, rate, yld, redemption, frequency, basis_number] = n[..] else { unreachable!() };
    if yld < 0.0 {
        return Err(CellError::Number);
    }
    let c = settled(settlement, maturity, whole(frequency), whole(basis_number))?;
    let bond = Bond::new(&c, rate, redemption)?;
    let r = yld / c.frequency;
    let price = if bond.count < 2.0 {
        (bond.coupon + bond.redemption) / (r * bond.to_next + 1.0)
    } else {
        bond.worth(r)?.0
    };
    answer(price - bond.accrued)
}

/// YIELD: the yield at which the bond is worth the price (above 0) plus accrued interest.
fn bond_yield(args: &[Arg], locale: &Locale) -> Answer {
    let n = numbers(args, &[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], locale)?;
    let [settlement, maturity, rate, price, redemption, frequency, basis_number] = n[..] else { unreachable!() };
    if price <= 0.0 {
        return Err(CellError::Number);
    }
    let c = settled(settlement, maturity, whole(frequency), whole(basis_number))?;
    let bond = Bond::new(&c, rate, redemption)?;
    let target = price + bond.accrued;
    if bond.count < 2.0 {
        return answer(c.frequency * ((bond.coupon + bond.redemption - target) / target / bond.to_next));
    }
    let guess = (bond.coupon + (redemption - price) / bond.count) / ((price + redemption) * 0.5);
    let f = |r: f64| match bond.worth(r) {
        Ok((p, duration)) => ((p - target) / (p + target), -(((duration * p) / (r + 1.0)) / (p + target))),
        Err(_) => (f64::NAN, f64::NAN),
    };
    match solve(guess, f) {
        Some(r) => answer(c.frequency * r),
        None => Err(CellError::Number),
    }
}

/// DURATION and MDURATION: Macaulay duration in years at a yield (0 or more); modified, over 1 + yield per period.
fn duration(args: &[Arg], modified: bool, locale: &Locale) -> Answer {
    let n = numbers(args, &[0.0, 0.0, 0.0, 0.0, 0.0, 0.0], locale)?;
    let [settlement, maturity, rate, yld, frequency, basis_number] = n[..] else { unreachable!() };
    if yld < 0.0 {
        return Err(CellError::Number);
    }
    let c = settled(settlement, maturity, whole(frequency), whole(basis_number))?;
    let bond = Bond::new(&c, rate, 100.0)?;
    let r = yld / c.frequency;
    let years = bond.worth(r)?.1 / c.frequency;
    answer(if modified { years / (r + 1.0) } else { years })
}

/// TBILLEQ, TBILLPRICE and TBILLYIELD: a bill maturing after settlement, within a year of it.
fn treasury_bill(args: &[Arg], name: &str, locale: &Locale) -> Answer {
    let n = numbers(args, &[0.0, 0.0, 0.0], locale)?;
    let [settlement, maturity, x] = n[..] else { unreachable!() };
    if x <= 0.0 {
        return Err(CellError::Number);
    }
    let (settlement, maturity) = span(settlement, maturity)?;
    let (ys, ms, ds) = dates::date_from_serial(settlement);
    let (ym, mm, dm) = dates::date_from_serial(maturity);
    if (ym, mm, dm) > (ys + 1, ms, ds) {
        return Err(CellError::Number);
    }
    let days = (maturity - settlement) as f64;
    match name {
        "TBILLPRICE" => answer((x * days / -360.0 + 1.0) * 100.0),
        "TBILLYIELD" => answer((100.0 - x) / x * 360.0 / days),
        _ => {
            let part = x * days / 360.0;
            let left = 1.0 - part;
            if left <= 0.0 {
                return Err(CellError::Number);
            }
            let q = part / left;
            let t = days / 365.0;
            if t <= 0.5 {
                answer(q / t)
            } else {
                answer((q + q) / (t + (t * t + ((t + t) - 1.0) * q).sqrt()))
            }
        }
    }
}
