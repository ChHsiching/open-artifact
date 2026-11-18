//! Time zones, known by name only. The IANA names are carried (tzdata 2025b or later: it
//! lists `America/Coyhaique` and takes `Asia/Choibalsan` as another name for `Asia/Ulaanbaatar`) but none of their
//! rules, so it never works out a zone's offset. The page does that and sends it along with the time
//! (`receiveClockReading`: `unixMilliseconds`, `utcOffsetInMinutes`, `timeZone`).
//!
//! `NOW()` and `TODAY()` take the offset as sent, and only when the reading's zone is the one the workbook is set to,
//! spelled the same way (`US/Eastern` is not `America/New_York` there, though both name the same zone): see
//! [`local_serial`] and [`reading_applies`].
//!
//! ```
//! use open_artifact_sheets::time_zone;
//! assert_eq!(time_zone::named("US/Eastern"), Some("America/New_York"));
//! assert_eq!(time_zone::named("Etc/GMT+5"), Some("Etc/GMT+5"));
//! assert_eq!(time_zone::named("us/eastern"), None);
//! // 2024-07-01 12:34:56.789 UTC, two hours ahead: 14:00 that day (the hour, not the minute).
//! assert_eq!(time_zone::local_serial(1_719_837_296_789, 120), Some(45474.583333333336));
//! ```

mod table;

/// The zones `readTimeZones` lists, in its order.
pub fn listed() -> &'static [&'static str] {
    &table::LISTED
}

/// The zone a name names: the zone itself (listed, or one of `Etc/GMT+1` … `Etc/GMT-14`, which are known but
/// not listed), or the zone another name stands for (`US/Eastern`, `Asia/Calcutta`, `GMT`, `EST`). Names are
/// spelled exactly; anything else is none.
pub fn named(name: &str) -> Option<&'static str> {
    if let Some(zone) = table::LISTED.iter().chain(table::UNLISTED.iter()).find(|z| **z == name) {
        return Some(zone);
    }
    table::LINKS.binary_search_by(|(link, _)| (*link).cmp(name)).ok().map(|i| table::LINKS[i].1)
}

/// The first and last instants a clock reading may hold: 0001-01-01T00:00:00Z and 9999-12-31T23:59:59.999Z.
pub const FIRST_UNIX_MILLISECOND: i64 = -62_135_596_800_000;
pub const LAST_UNIX_MILLISECOND: i64 = 253_402_300_799_999;

const MILLISECONDS_IN_A_DAY: i64 = 86_400_000;
const MILLISECONDS_IN_AN_HOUR: i64 = 3_600_000;
/// 1970-01-01 as a serial number.
const UNIX_EPOCH_SERIAL: i64 = 25_569;

/// What `NOW()` answers for a clock reading: the local time (`unix_milliseconds` moved by the offset) as a serial
/// number, down to the hour it is in. None outside the readings taken.
pub fn local_serial(unix_milliseconds: i64, utc_offset_in_minutes: i32) -> Option<f64> {
    if !(FIRST_UNIX_MILLISECOND..=LAST_UNIX_MILLISECOND).contains(&unix_milliseconds) {
        return None;
    }
    let local = unix_milliseconds + i64::from(utc_offset_in_minutes) * 60_000;
    let day = local.div_euclid(MILLISECONDS_IN_A_DAY);
    let hour = local.rem_euclid(MILLISECONDS_IN_A_DAY) / MILLISECONDS_IN_AN_HOUR;
    Some((day + UNIX_EPOCH_SERIAL) as f64 + hour as f64 / 24.0)
}

/// What `TODAY()` answers for a clock reading: the local day as a serial number.
pub fn local_day_serial(unix_milliseconds: i64, utc_offset_in_minutes: i32) -> Option<f64> {
    local_serial(unix_milliseconds, utc_offset_in_minutes).map(f64::floor)
}

/// Whether a clock reading counts for a workbook: its zone is the one the workbook is set to, as the same text (or
/// neither names one). Otherwise `NOW()` and `TODAY()` are `#N/A`.
pub fn reading_applies(workbook_time_zone: Option<&str>, reading_time_zone: Option<&str>) -> bool {
    workbook_time_zone == reading_time_zone
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        assert_eq!(listed().len(), 419);
        assert_eq!(named("UTC"), Some("UTC"));
        assert_eq!(named("Etc/UTC"), Some("UTC"));
        assert_eq!(named("EST"), Some("America/Panama"));
        assert_eq!(named("Europe/Kiev"), Some("Europe/Kyiv"));
        assert_eq!(named(""), None);
        assert!(table::LINKS.windows(2).all(|w| w[0].0 < w[1].0));
    }

    #[test]
    fn local_times() {
        assert_eq!(local_serial(-1, 0), Some(25568.958333333332));
        assert_eq!(local_serial(1_719_837_296_789, -330), Some(45474.291666666664));
        assert_eq!(local_serial(LAST_UNIX_MILLISECOND + 1, 0), None);
        assert_eq!(local_day_serial(1_719_837_296_789, 0), Some(45474.0));
    }
}
