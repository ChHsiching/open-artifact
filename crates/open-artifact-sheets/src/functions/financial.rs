//! The financial functions: loans and annuities at a fixed rate (PV, FV, PMT, NPER, RATE, IPMT, PPMT, CUMIPMT,
//! CUMPRINC), series of values (NPV, IRR, MIRR), values on dates (XNPV, XIRR), and SLN.
//!
//! Every annuity is worked out from one equation, `pv·a + pmt·b + fv·c = 0`, with `a`, `b` and `c` scaled so that
//! none of them overflows ([`Annuity`]). RATE, IRR and XIRR find their rate with one root finder ([`solve`]).

use crate::coerce;
use crate::functions::{number, Answer, Arg, CallContext, Cells};
use crate::locale::Locale;
use crate::value::{CellError, Value};

/// Calls a financial function by name; `None` for one it doesn't have.
pub fn call(name: &str, args: &[Arg], cx: &mut CallContext) -> Option<Answer> {
    let locale = cx.locale;
    Some(match name {
        "CUMIPMT" => cumulative(args, true, locale),
        "CUMPRINC" => cumulative(args, false, locale),
        "FV" => numbers(args, &[0.0, 0.0, 0.0, 0.0, 0.0], locale).and_then(|n| {
            let [rate, periods, payment, present, due] = n[..] else { unreachable!() };
            let t = Annuity::new(rate, periods, due)?;
            number(-(t.b * payment + t.a * present) / t.c)
        }),
        "IPMT" | "PPMT" => numbers(args, &[0.0, 0.0, 0.0, 0.0, 0.0, 0.0], locale).and_then(|n| {
            let [rate, period, periods, present, future, due] = n[..] else { unreachable!() };
            let loan = Loan { rate, periods, present, future, due };
            number(if name == "IPMT" { loan.interest(period)? } else { loan.principal(period)? })
        }),
        "IRR" => irr(args, locale),
        "MIRR" => mirr(args, locale),
        "NPER" => numbers(args, &[0.0, 0.0, 0.0, 0.0, 0.0], locale).and_then(|n| {
            let [rate, payment, present, future, due] = n[..] else { unreachable!() };
            nper(rate, payment, present, future, due)
        }),
        "NPV" => npv(args, locale),
        "PMT" => numbers(args, &[0.0, 0.0, 0.0, 0.0, 0.0], locale).and_then(|n| {
            let [rate, periods, present, future, due] = n[..] else { unreachable!() };
            if periods == 0.0 {
                return Err(CellError::DivideByZero);
            }
            number(Loan { rate, periods, present, future, due }.payment()?)
        }),
        "PV" => numbers(args, &[0.0, 0.0, 0.0, 0.0, 0.0], locale).and_then(|n| {
            let [rate, periods, payment, future, due] = n[..] else { unreachable!() };
            let t = Annuity::new(rate, periods, due)?;
            number(-(t.b * payment + t.c * future) / t.a)
        }),
        "RATE" => numbers(args, &[0.0, 0.0, 0.0, 0.0, 0.0, DEFAULT_GUESS], locale).and_then(|n| {
            let [periods, payment, present, future, due, guess] = n[..] else { unreachable!() };
            rate(periods, payment, present, future, due, guess)
        }),
        "SLN" => numbers(args, &[0.0, 0.0, 0.0], locale).and_then(|n| {
            let [cost, salvage, life] = n[..] else { unreachable!() };
            if life == 0.0 {
                return Err(CellError::DivideByZero);
            }
            number((cost - salvage) / life)
        }),
        "XIRR" => xirr(args, locale),
        "XNPV" => xnpv(args, locale),
        _ => return None,
    })
}

/// The guess RATE, IRR and XIRR start from when it is not given (a guess left out, `RATE(…,)`, is 0).
const DEFAULT_GUESS: f64 = 0.1;

/// The arguments as numbers (text read as typed in the locale, `TRUE` is 1, one left out is 0), and `defaults` for
/// those not given. All are read before anything is worked out.
fn numbers(args: &[Arg], defaults: &[f64], locale: &Locale) -> Result<Vec<f64>, CellError> {
    defaults.iter().enumerate().map(|(i, d)| args.get(i).map_or(Ok(*d), |a| a.number(locale))).collect()
}

/// `ln(1 + x)`, kept exact for a small `x` as `x / ((1 + x) − 1) · ln(1 + x)`.
fn ln_1p(x: f64) -> f64 {
    let u = x + 1.0;
    let d = u - 1.0;
    if d == 0.0 {
        x
    } else {
        x / d * u.ln()
    }
}

/// `eˣ − 1`, kept exact for a small `x` as `(eˣ − 1) · x / ln(eˣ)`.
fn exp_m1(x: f64) -> f64 {
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

/// The larger of two numbers, the other one when one is NaN (and the first of two zeros).
fn max(a: f64, b: f64) -> f64 {
    if a.is_nan() || a < b {
        b
    } else {
        a
    }
}

/// The smaller of two numbers, the other one when one is NaN (and the second of two zeros).
fn min(a: f64, b: f64) -> f64 {
    if b.is_nan() || a < b {
        a
    } else {
        b
    }
}

/// The addition of two values on one date (XNPV, XIRR): the plain sum of two whole numbers; otherwise a sum
/// smaller than 2⁻⁴⁸ of the smaller part is 0.
fn add(a: f64, b: f64) -> f64 {
    let r = a + b;
    let whole = |x: f64| x.abs() < 9_007_199_254_740_992.0 && x - x.trunc() == 0.0;
    if whole(a) && whole(b) {
        return r;
    }
    if r.abs() < min(a.abs(), b.abs()) * (1.0 / 281_474_976_710_656.0) {
        0.0
    } else {
        r
    }
}

/// An annuity at `rate` over `periods`, paid at the end of each period (`due` 0) or at the start (any other
/// `due`): `pv·a + pmt·b + fv·c = 0`. When `(1 + rate)ⁿ` grows, `a` is 1, `b` = `(1 − (1 + rate)⁻ⁿ) / rate` and
/// `c` = `(1 + rate)⁻ⁿ`; when it shrinks, `a` = `(1 + rate)ⁿ`, `b` = `((1 + rate)ⁿ − 1) / rate` and `c` is 1. `b`
/// has a factor `1 + rate` for payments at the start.
struct Annuity {
    a: f64,
    b: f64,
    c: f64,
}

impl Annuity {
    /// A rate of −1 or less is #NUM!.
    fn new(rate: f64, periods: f64, due: f64) -> Result<Annuity, CellError> {
        if rate <= -1.0 {
            return Err(CellError::Number);
        }
        if rate.abs() < f64::MIN_POSITIVE {
            return Ok(Annuity { a: 1.0, b: periods, c: 1.0 });
        }
        let one = rate + 1.0;
        let y = periods * ln_1p(rate);
        let m = -y.abs();
        let e = m.exp();
        let shrinks = y < 0.0;
        let factor = if due == 0.0 { 1.0 } else { one };
        Ok(Annuity {
            a: if shrinks { e } else { 1.0 },
            b: factor * (exp_m1(m).copysign(y) / rate),
            c: if shrinks { 1.0 } else { e },
        })
    }
}

/// A loan, for PMT, IPMT, PPMT, CUMIPMT and CUMPRINC.
struct Loan {
    rate: f64,
    periods: f64,
    present: f64,
    future: f64,
    due: f64,
}

impl Loan {
    /// The factor a period's interest is divided by for payments at the start.
    fn due_factor(&self) -> f64 {
        if self.due == 0.0 {
            1.0
        } else {
            self.rate + 1.0
        }
    }

    /// The payment each period.
    fn payment(&self) -> Result<f64, CellError> {
        let t = Annuity::new(self.rate, self.periods, self.due)?;
        Ok(-(t.a * self.present + t.c * self.future) / t.b)
    }

    /// The interest paid in a period (IPMT): a period before 1 or after the last is #NUM!; none in the first
    /// period of payments at the start.
    fn interest(&self, period: f64) -> Result<f64, CellError> {
        if period < 1.0 || period > self.periods {
            return Err(CellError::Number);
        }
        let t = Annuity::new(self.rate, self.periods, self.due)?;
        let before = period - 1.0;
        if before == 0.0 && self.due != 0.0 {
            return Ok(0.0);
        }
        let past = Annuity::new(self.rate, before, self.due)?;
        let rest = Annuity::new(self.rate, self.periods - before, self.due)?;
        let balance = -(self.present * past.a * rest.b - past.b * (self.future * rest.c)) / t.b;
        Ok(self.rate * balance / self.due_factor())
    }

    /// What a period's payment pays off (PPMT): the payment less its interest.
    fn principal(&self, period: f64) -> Result<f64, CellError> {
        let interest = self.interest(period)?;
        Ok(self.payment()? - interest)
    }

    /// What periods `first` to `last` pay off (CUMPRINC).
    fn principal_between(&self, first: f64, last: f64) -> Result<f64, CellError> {
        let span = last - first;
        if span == 0.0 {
            return self.principal(first);
        }
        if first - 1.0 == 0.0 && self.due != 0.0 {
            let one = self.principal(first)?;
            return Ok(one + self.principal_between(2.0, last)?);
        }
        let all = Annuity::new(self.rate, self.periods, self.due)?;
        let these = Annuity::new(self.rate, span + 1.0, self.due)?;
        let after = Annuity::new(self.rate, self.periods - last, self.due)?;
        Ok(after.c * (these.b / all.b) * -(self.present + self.future) / self.due_factor())
    }

    /// The interest paid in periods `first` to `last` (CUMIPMT): the payments less what they pay off.
    fn interest_between(&self, first: f64, last: f64) -> Result<f64, CellError> {
        let span = last - first;
        if span == 0.0 {
            return self.interest(first);
        }
        let payment = self.payment()?;
        let principal = self.principal_between(first, last)?;
        Ok((span + 1.0) * payment - principal)
    }
}

/// CUMIPMT and CUMPRINC (rate, periods, present value, first period, last period, when due): the rate and the
/// present value must be above 0, the periods (cut to whole ones) 1 ≤ first ≤ last ≤ periods, and when due 0 or 1,
/// else #NUM!.
fn cumulative(args: &[Arg], interest: bool, locale: &Locale) -> Answer {
    let n = numbers(args, &[0.0; 6], locale)?;
    let [rate, periods, present, first, last, due] = n[..] else { unreachable!() };
    let loan = Loan { rate, periods, present, future: 0.0, due };
    let (first, last) = (first.trunc(), last.trunc());
    let fits = first >= 1.0 && first <= last && (due == 0.0 || due == 1.0) && rate > 0.0 && present > 0.0 && last <= periods;
    if !fits {
        return Err(CellError::Number);
    }
    number(if interest { loan.interest_between(first, last)? } else { loan.principal_between(first, last)? })
}

/// NPER: a rate of −1 or less is #NUM!; 0 when the present and future values cancel out.
fn nper(rate: f64, payment: f64, present: f64, future: f64, due: f64) -> Answer {
    if rate <= -1.0 {
        return Err(CellError::Number);
    }
    let both = present + future;
    if both == 0.0 {
        return number(0.0);
    }
    if rate == 0.0 {
        return number(-both / payment);
    }
    let paid = payment * if due == 0.0 { 1.0 } else { rate + 1.0 };
    let over = rate * present + paid;
    let x = rate * -both / over;
    let growth = if x.abs() < 0.5 { ln_1p(x) } else { ((paid - rate * future) / over).ln() };
    number(growth / ln_1p(rate))
}

/// RATE: periods of 0 or fewer are #NUM!, as is a rate not found.
fn rate(periods: f64, payment: f64, present: f64, future: f64, due: f64, guess: f64) -> Answer {
    if periods <= 0.0 {
        return Err(CellError::Number);
    }
    // Payments at the end that the future value takes back: one period fewer, and no future value.
    let fewer = due == 0.0 && payment + future == 0.0;
    let periods = if fewer { periods - 1.0 } else { periods };
    let future = if fewer { 0.0 } else { future };
    let scale = max(max(payment.abs(), present.abs()), future.abs());
    let (payment, present, future) = (payment / scale, present / scale, future / scale);
    let at_start = if due == 0.0 { 0.0 } else { 1.0 };
    let f = |r: f64| -> (f64, f64) {
        let Ok(t) = Annuity::new(r, periods, due) else { return (f64::NAN, f64::NAN) };
        let terms = [present * t.a, payment * t.b, future * t.c];
        let sum = terms.iter().fold(-0.0, |s, x| s + x);
        let size = terms.iter().fold(-0.0, |s, x: &f64| s + x.abs());
        let slope = if (r * periods).abs() < 1e-8 {
            periods * present + periods * payment * ((periods - 1.0) * 0.5 + at_start)
        } else {
            let g = periods * t.a / (r + 1.0);
            let h = if due == 0.0 { 1.0 } else { r + 1.0 };
            present * g + payment * (at_start * t.b / h + (h * g - t.b) / r)
        };
        (sum / size, slope / size)
    };
    match solve(guess, f) {
        Some(r) => number(r),
        None => Err(CellError::Number),
    }
}

/// The numbers of the value arguments of NPV, IRR and MIRR: in a range or an array only numbers count; one value
/// is read as a number; a left-out one is 0.
fn cash_flows(args: &[Arg], locale: &Locale) -> Result<Vec<f64>, CellError> {
    let mut out = Vec::new();
    for arg in args {
        match arg {
            Arg::Missing => out.push(0.0),
            Arg::Value(v) => out.push(coerce::to_number(v, locale)?),
            Arg::Cells(cells) => {
                for v in cells.values() {
                    match v {
                        Value::Number(n) => out.push(*n),
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

/// NPV: each value discounted by one more period than the one before, the first by one.
fn npv(args: &[Arg], locale: &Locale) -> Answer {
    let rate = args[0].number(locale)?;
    let values = cash_flows(&args[1..], locale)?;
    let (mut sum, mut discount) = (0.0, 1.0);
    for v in values {
        discount *= rate + 1.0;
        sum += v / discount;
    }
    number(sum)
}

/// IRR: needs a value above 0 and one below (else #NUM!). Leading zeros are dropped, and the values are scaled
/// to the largest.
fn irr(args: &[Arg], locale: &Locale) -> Answer {
    let values = cash_flows(&args[..1], locale)?;
    let guess = numbers(&args[1..], &[DEFAULT_GUESS], locale)?[0];
    if !values.iter().any(|v| *v > 0.0) || !values.iter().any(|v| *v < 0.0) {
        return Err(CellError::Number);
    }
    let scale = values.iter().fold(0.0, |m, v| max(m, v.abs()));
    let values: Vec<f64> = values.iter().skip_while(|v| **v == 0.0).map(|v| v / scale).collect();
    let size = values.iter().fold(-0.0, |s, v| s + v.abs());
    let f = |r: f64| -> (f64, f64) {
        let d = 1.0 / (r + 1.0);
        let (mut sum, mut slope) = (0.0, 0.0);
        for v in values.iter().rev() {
            let last = sum;
            sum = d * last + v;
            slope = last + d * slope;
        }
        (sum / size, -(d * (d * slope) / size))
    };
    match solve(guess, f) {
        Some(r) => number(r),
        None => Err(CellError::Number),
    }
}

/// MIRR: needs a value above 0 and one below (else #DIV/0!); rates of −1 or less are #NUM!.
fn mirr(args: &[Arg], locale: &Locale) -> Answer {
    let values = cash_flows(&args[..1], locale)?;
    let n = numbers(&args[1..], &[0.0, 0.0], locale)?;
    let [finance, reinvest] = n[..] else { unreachable!() };
    if !values.iter().any(|v| *v > 0.0) || !values.iter().any(|v| *v < 0.0) {
        return Err(CellError::DivideByZero);
    }
    if finance <= -1.0 || reinvest <= -1.0 {
        return Err(CellError::Number);
    }
    let (finance, reinvest) = (finance + 1.0, reinvest + 1.0);
    let (mut paid, mut earned, mut discount, mut count) = (0.0, 0.0, 1.0, 0.0);
    for v in values {
        if v < 0.0 {
            paid += v / discount;
        }
        earned = reinvest * earned + max(v, 0.0);
        count += 1.0;
        discount *= finance;
    }
    number((-earned / paid).powf(1.0 / (count - 1.0)) - 1.0)
}

/// The cells of XNPV's and XIRR's values or dates: one left out is #VALUE!.
fn cells(arg: &Arg) -> Result<Cells, CellError> {
    match arg {
        Arg::Missing | Arg::Place(_) => Err(CellError::Value),
        _ => Ok(arg.cells()),
    }
}

/// The values of XNPV and XIRR with their dates, as (value, days after the first value's date), in the values'
/// order. Only numbers count among the values; each one's date (cut to a whole day) must be a number, else #VALUE!
/// (an error there is the answer). Values and dates of different sizes are #NUM!.
fn dated_values(values: &Cells, dates: &Cells) -> Result<Vec<(f64, f64)>, CellError> {
    if values.rows() != dates.rows() || values.columns() != dates.columns() {
        return Err(CellError::Number);
    }
    let mut out = Vec::new();
    let mut first = 0.0;
    for row in 0..values.rows() {
        for column in 0..values.columns() {
            let value = match values.get(row, column) {
                Value::Number(n) => *n,
                Value::Error(e) => return Err(*e),
                _ => continue,
            };
            let day = match dates.get(row, column) {
                Value::Number(d) => d.floor(),
                Value::Error(e) => return Err(*e),
                _ => return Err(CellError::Value),
            };
            if out.is_empty() {
                first = day;
            }
            out.push((value, day - first));
        }
    }
    Ok(out)
}

/// Values on dates in date order, those on one date added together.
fn by_date(mut values: Vec<(f64, f64)>) -> Vec<(f64, f64)> {
    values.sort_by(|a, b| a.1.total_cmp(&b.1).then(a.0.total_cmp(&b.0)));
    let mut out: Vec<(f64, f64)> = Vec::with_capacity(values.len());
    for (value, day) in values {
        match out.last_mut() {
            Some(last) if last.1.to_bits() == day.to_bits() => last.0 = add(last.0, value),
            _ => out.push((value, day)),
        }
    }
    out
}

/// What dated values are worth at a yearly `rate` (each discounted by its days / 365), with the slope of that and
/// the sum of the discounted values' sizes.
fn worth(values: &[(f64, f64)], rate: f64) -> (f64, f64, f64) {
    let one = rate + 1.0;
    let growth = ln_1p(rate);
    let (mut sum, mut slope, mut size) = (0.0, 0.0, 0.0);
    for &(value, days) in values {
        if value == 0.0 {
            continue;
        }
        let years = days / 365.0;
        let v = (growth * -years).exp() * value;
        slope -= years * v / one;
        sum += v;
        size += v.abs();
    }
    (sum, slope, size)
}

/// XNPV: a rate of −1 or less is #NUM!, and so is a date before the first value's.
fn xnpv(args: &[Arg], locale: &Locale) -> Answer {
    let rate = args[0].number(locale)?;
    let (values, dates) = (cells(&args[1])?, cells(&args[2])?);
    if rate <= -1.0 {
        return Err(CellError::Number);
    }
    let values = dated_values(&values, &dates)?;
    if values.iter().any(|(_, days)| *days < 0.0) {
        return Err(CellError::Number);
    }
    number(worth(&by_date(values), rate).0)
}

/// XIRR: the days are counted from the first value that is not 0; a rate not found is #NUM!.
fn xirr(args: &[Arg], locale: &Locale) -> Answer {
    let (values, dates) = (cells(&args[0])?, cells(&args[1])?);
    let guess = numbers(&args[2..], &[DEFAULT_GUESS], locale)?[0];
    let mut values = dated_values(&values, &dates)?;
    if let Some(&(_, start)) = values.iter().find(|(v, _)| *v != 0.0) {
        for (_, days) in values.iter_mut() {
            *days -= start;
        }
    }
    let values = by_date(values);
    let f = |r: f64| -> (f64, f64) {
        let (sum, slope, size) = worth(&values, r);
        if size.is_finite() {
            (sum / size, slope / size)
        } else {
            (f64::NAN, f64::NAN)
        }
    };
    match solve(guess, f) {
        Some(r) => number(r),
        None => Err(CellError::Number),
    }
}

/// The root finder for RATE, IRR and XIRR, given `f(r)` and its slope: Newton's method from the guess (at
/// most 20 steps, until a step is at most 1E-7), kept when `f` changes sign between `(1 + r)·0.9999999 − 1` and
/// `(1 + r)·1.0000001 − 1`; else a search for a sign change outward from the guess, then from 0. A rate that is
/// not finite is not found.
fn solve(guess: f64, f: impl Fn(f64) -> (f64, f64)) -> Option<f64> {
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
    // The last point on each side (up, down) with the sign at `rate`.
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
    fn annuity_scales() {
        let t = Annuity::new(0.1, 2.0, 0.0).unwrap();
        assert_eq!(t.a, 1.0);
        assert!((t.c - 1.0 / 1.21).abs() < 1e-15);
        assert!((t.b - (1.0 - 1.0 / 1.21) / 0.1).abs() < 1e-14);
        assert!(Annuity::new(-1.0, 2.0, 0.0).is_err());
    }

    #[test]
    fn solves() {
        let r = solve(0.1, |r| ((1.0 + r) * (1.0 + r) - 2.0, 2.0 * (1.0 + r))).unwrap();
        assert!((r - (2f64.sqrt() - 1.0)).abs() < 1e-12);
    }

    #[test]
    fn adds_as_expected() {
        assert_eq!(add(4_503_599_627_370_496.0, -4_503_599_627_370_495.0), 1.0);
        assert_eq!(add(0.1 + 0.2, -0.3), 0.0);
    }
}
