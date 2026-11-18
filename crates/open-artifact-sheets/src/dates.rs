//! Dates as a workbook counts them: days since 1899-12-30 (so 1900-01-01 is 2, and 1900 has no 29 February), the
//! time of day as the fraction of a day.

/// Days from 1970-01-01 to a date of the proleptic Gregorian calendar.
pub fn days_from_civil(year: i64, month: u32, day: u32) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let m = month as i64;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + day as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// The date `days` after 1970-01-01.
pub fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// Days from 1970-01-01 to 1899-12-30, the day before serial 1.
const EPOCH: i64 = -25569;

/// A date's serial number.
pub fn serial_from_date(year: i64, month: u32, day: u32) -> i64 {
    days_from_civil(year, month, day) - EPOCH
}

/// The date of a serial number (its whole days).
pub fn date_from_serial(serial: i64) -> (i64, u32, u32) {
    civil_from_days(serial + EPOCH)
}

pub fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

pub fn days_in_month(year: i64, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ if is_leap_year(year) => 29,
        _ => 28,
    }
}

/// Whether a day of a month exists.
pub fn is_date(year: i64, month: u32, day: u32) -> bool {
    (1..=12).contains(&month) && day >= 1 && day <= days_in_month(year, month)
}

/// The latest date a workbook holds: 9999-12-31.
pub const LAST_SERIAL: i64 = 2958465;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serials() {
        assert_eq!(serial_from_date(2024, 1, 2), 45293);
        assert_eq!(serial_from_date(1900, 1, 1), 2);
        assert_eq!(serial_from_date(1900, 3, 1), 61);
        assert_eq!(serial_from_date(9999, 12, 31), LAST_SERIAL);
        assert_eq!(date_from_serial(45293), (2024, 1, 2));
        assert_eq!(date_from_serial(0), (1899, 12, 30));
        assert_eq!(date_from_serial(-1), (1899, 12, 29));
    }
}
