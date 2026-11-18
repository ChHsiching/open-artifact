//! Day counts, year fractions and coupon dates, by basis.

use super::FIRST_SERIAL;
use crate::dates::{self, LAST_SERIAL};
use crate::value::CellError;

/// The date `months` after the year and month given, on `day` or the month's last day when it is shorter.
fn months_on(year: i64, month: u32, months: i64, day: u32) -> Result<i64, CellError> {
    let total = year * 12 + (month as i64 - 1) + months;
    let (year, month) = (total.div_euclid(12), total.rem_euclid(12) as u32 + 1);
    if !(1..=9999).contains(&year) {
        return Err(CellError::Number);
    }
    let serial = dates::serial_from_date(year, month, day.min(dates::days_in_month(year, month)));
    if (FIRST_SERIAL..=LAST_SERIAL).contains(&serial) {
        Ok(serial)
    } else {
        Err(CellError::Number)
    }
}

fn is_last_of_february((year, month, day): (i64, u32, u32)) -> bool {
    month == 2 && day == dates::days_in_month(year, 2)
}

/// The days from one date to another by the basis: 30-day months for 0 (US: a start on the last of February or
/// the 30th or 31st is the 30th, and then so is an end on the 31st, or on the last of February after one there)
/// and 4 (European: the 31st is the 30th); actual days for the others.
pub fn day_count(basis: u8, from: i64, to: i64) -> f64 {
    if matches!(basis, 1..=3) {
        return (to - from) as f64;
    }
    let (y1, m1, mut d1) = dates::date_from_serial(from);
    let (y2, m2, mut d2) = dates::date_from_serial(to);
    if basis == 4 {
        d1 = d1.min(30);
        d2 = d2.min(30);
    } else if d1 > 29 {
        d1 = 30;
        d2 = d2.min(30);
    } else if is_last_of_february((y1, m1, d1)) {
        d1 = 30;
        if is_last_of_february((y2, m2, d2)) {
            d2 = 30;
        }
    }
    (((y2 - y1) * 12 + (m2 as i64 - m1 as i64)) * 30 + (d2 as i64 - d1 as i64)) as f64
}

/// The years from one date to a later one: the [`day_count`] over 360 (bases 0, 2, 4) or 365 (3); for 1, over 365
/// or 366 (when a 29th of February is in the span) within a year, else over the average length of the years the
/// span touches.
pub fn year_fraction(basis: u8, from: i64, to: i64) -> f64 {
    let days = day_count(basis, from, to);
    let length = match basis {
        3 => 365.0,
        1 => {
            let (y1, m1, d1) = dates::date_from_serial(from);
            let (y2, m2, d2) = dates::date_from_serial(to);
            if y2 - y1 == 1 && (m2 < m1 || m2 == m1 && d2 <= d1) {
                let leap_day = |y: i64| dates::is_date(y, 2, 29).then(|| dates::serial_from_date(y, 2, 29));
                let spanned = [y1, y2].iter().any(|y| leap_day(*y).is_some_and(|d| from <= d && d <= to));
                if spanned {
                    366.0
                } else {
                    365.0
                }
            } else {
                let first = dates::serial_from_date(y1, 1, 1);
                let last = dates::serial_from_date(y2, 12, 31);
                ((last - first) as f64 + 1.0) / ((y2 - y1) as f64 + 1.0)
            }
        }
        _ => 360.0,
    };
    days / length
}

/// A security's coupons around a date: the one before or on it, the one after, and how many are left to maturity.
pub struct Coupons {
    pub date: i64,
    pub previous: i64,
    pub next: i64,
    pub count: f64,
    pub frequency: f64,
    pub basis: u8,
}

impl Coupons {
    /// Coupons paid `frequency` times a year (1, 2 or 4, else #NUM!) on the maturity's day of the month (its last
    /// day when maturity is a month's last day), counted back from maturity.
    pub fn new(date: i64, maturity: i64, frequency: i64, basis: u8) -> Result<Coupons, CellError> {
        let period = match frequency {
            1 => 12,
            2 => 6,
            4 => 3,
            _ => return Err(CellError::Number),
        };
        let (ym, mm, dm) = dates::date_from_serial(maturity);
        let day = if months_on(ym, mm, 0, 31)? == maturity { 31 } else { dm };
        let (yd, md, _) = dates::date_from_serial(date);
        let months = (yd - ym) * 12 + (md as i64 - mm as i64);
        let mut k = months.div_euclid(period);
        if months_on(ym, mm, k * period, day)? > date {
            k -= 1;
        }
        Ok(Coupons {
            date,
            previous: months_on(ym, mm, k * period, day)?,
            next: months_on(ym, mm, (k + 1) * period, day)?,
            count: -(k as f64),
            frequency: frequency as f64,
            basis,
        })
    }

    /// COUPDAYS: the days of the coupon period.
    pub fn days(&self) -> f64 {
        match self.basis {
            1 => day_count(1, self.previous, self.next),
            3 => 365.0 / self.frequency,
            _ => 360.0 / self.frequency,
        }
    }

    /// COUPDAYBS: the days from the coupon before to the date.
    pub fn days_before(&self) -> f64 {
        day_count(self.basis, self.previous, self.date)
    }

    /// COUPDAYSNC: the days from the date to the next coupon (with 30-day months, the period's days less those
    /// before, at least 0).
    pub fn days_after(&self) -> f64 {
        match self.basis {
            1..=3 => day_count(self.basis, self.date, self.next),
            _ => super::math::max(self.days() - self.days_before(), 0.0),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coupons() {
        let c = Coupons::new(43845, 45747, 2, 0).unwrap();
        assert_eq!((c.previous, c.next, c.count), (43738, 43921, 11.0));
        assert_eq!((c.days_before(), c.days(), c.days_after()), (105.0, 180.0, 75.0));
    }

    #[test]
    fn actual_years() {
        let from = dates::serial_from_date(2020, 1, 15);
        let to = dates::serial_from_date(2021, 3, 31);
        assert_eq!(year_fraction(1, from, to), 1.2065663474692203);
    }
}
