//! The locales a workbook may be set to, and what each one writes its own way: the decimal and group signs, how
//! digits are grouped, the time of day, the short date (`m/d/yyyy` shown as `06.03.2023` in de-DE), the month and
//! day (`m/d` shown as `6.3`), the patterns for money and for dates with the month named, and the month and day
//! names. All as answered (`readLocales`, `readPatternsOfMoney`, `readPatternsOfDatesWithTheMonthNamed`,
//! a workbook's `decimalSign`, `groupSign`, `sizesOfGroups` and `patternOfATimeOfDay`).
//!
//! ```
//! use open_artifact_sheets::locale::{self, DecimalSign, GroupSign};
//! let de = locale::find("de-DE").unwrap();
//! assert_eq!(de.decimal_sign, DecimalSign::Comma);
//! assert_eq!(de.group_sign, GroupSign::Point);
//! assert_eq!(de.pattern_of_a_time_of_day, "h:mm");
//! assert_eq!(de.short_date.pattern(), "dd.mm.yyyy");
//! assert!(locale::find("de-de").is_none());
//! ```

mod table;

use crate::number_format::names::{self, Names};

/// The sign between a number's whole part and its decimals.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DecimalSign {
    Point,
    Comma,
}

impl DecimalSign {
    /// As the workbook names it (`decimalSign`).
    pub fn name(self) -> &'static str {
        match self {
            DecimalSign::Point => "point",
            DecimalSign::Comma => "comma",
        }
    }

    pub fn sign(self) -> char {
        match self {
            DecimalSign::Point => '.',
            DecimalSign::Comma => ',',
        }
    }
}

/// The sign between groups of digits.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GroupSign {
    Point,
    Comma,
    NoBreakSpace,
    NarrowNoBreakSpace,
    Apostrophe,
}

impl GroupSign {
    /// As the workbook names it (`groupSign`).
    pub fn name(self) -> &'static str {
        match self {
            GroupSign::Point => "point",
            GroupSign::Comma => "comma",
            GroupSign::NoBreakSpace => "noBreakSpace",
            GroupSign::NarrowNoBreakSpace => "narrowNoBreakSpace",
            GroupSign::Apostrophe => "apostrophe",
        }
    }

    pub fn sign(self) -> char {
        match self {
            GroupSign::Point => '.',
            GroupSign::Comma => ',',
            GroupSign::NoBreakSpace => '\u{a0}',
            GroupSign::NarrowNoBreakSpace => '\u{202f}',
            GroupSign::Apostrophe => '\'',
        }
    }
}

/// How digits are grouped: `1,234,567`, or `12,34,567` (three, then twos).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SizesOfGroups {
    Threes,
    ThreeAndThenTwos,
}

impl SizesOfGroups {
    /// As the workbook names it (`sizesOfGroups`).
    pub fn name(self) -> &'static str {
        match self {
            SizesOfGroups::Threes => "threes",
            SizesOfGroups::ThreeAndThenTwos => "threeAndThenTwos",
        }
    }

    /// Whether a group sign follows the digit `place` places from the right of the whole part (0 is the ones).
    pub fn sign_after(self, place: usize) -> bool {
        match self {
            SizesOfGroups::Threes => place > 0 && place % 3 == 0,
            SizesOfGroups::ThreeAndThenTwos => place >= 3 && (place - 3) % 2 == 0,
        }
    }
}

/// The order of a date's parts.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DateOrder {
    DayMonthYear,
    MonthDayYear,
    YearMonthDay,
}

impl DateOrder {
    /// As a column reading names it (`dayMonthYear`).
    pub fn name(self) -> &'static str {
        match self {
            DateOrder::DayMonthYear => "dayMonthYear",
            DateOrder::MonthDayYear => "monthDayYear",
            DateOrder::YearMonthDay => "yearMonthDay",
        }
    }
}

/// How the locale shows a short date (what `m/d/yyyy` shows): the order, one sign between the parts, whether the
/// day and the month take two digits; the year always takes four.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ShortDate {
    pub order: DateOrder,
    pub separator: char,
    pub day_padded: bool,
    pub month_padded: bool,
}

impl ShortDate {
    /// The date written this way.
    pub fn show(&self, year: i64, month: u32, day: u32) -> String {
        let d = if self.day_padded { format!("{day:02}") } else { day.to_string() };
        let m = if self.month_padded { format!("{month:02}") } else { month.to_string() };
        let y = format!("{year:04}");
        let s = self.separator;
        match self.order {
            DateOrder::DayMonthYear => format!("{d}{s}{m}{s}{y}"),
            DateOrder::MonthDayYear => format!("{m}{s}{d}{s}{y}"),
            DateOrder::YearMonthDay => format!("{y}{s}{m}{s}{d}"),
        }
    }

    /// As a pattern: `dd.mm.yyyy`.
    pub fn pattern(&self) -> String {
        let d = if self.day_padded { "dd" } else { "d" };
        let m = if self.month_padded { "mm" } else { "m" };
        let s = self.separator;
        match self.order {
            DateOrder::DayMonthYear => format!("{d}{s}{m}{s}yyyy"),
            DateOrder::MonthDayYear => format!("{m}{s}{d}{s}yyyy"),
            DateOrder::YearMonthDay => format!("yyyy{s}{m}{s}{d}"),
        }
    }
}

/// How the locale shows a month and a day (what `m/d` shows).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MonthAndDay {
    pub day_first: bool,
    pub separator: char,
    pub day_padded: bool,
    pub month_padded: bool,
}

impl MonthAndDay {
    pub fn show(&self, month: u32, day: u32) -> String {
        let d = if self.day_padded { format!("{day:02}") } else { day.to_string() };
        let m = if self.month_padded { format!("{month:02}") } else { month.to_string() };
        let s = self.separator;
        if self.day_first {
            format!("{d}{s}{m}")
        } else {
            format!("{m}{s}{d}")
        }
    }

    /// As a pattern: `d.m`.
    pub fn pattern(&self) -> String {
        let d = if self.day_padded { "dd" } else { "d" };
        let m = if self.month_padded { "mm" } else { "m" };
        if self.day_first {
            format!("{d}{}{m}", self.separator)
        } else {
            format!("{m}{}{d}", self.separator)
        }
    }
}

/// `readPatternsOfMoney`: the locale's currency with two decimals and with none.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PatternsOfMoney {
    pub with_two_decimals: &'static str,
    pub with_no_decimals: &'static str,
}

/// `readPatternsOfDatesWithTheMonthNamed`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PatternsOfDatesWithTheMonthNamed {
    pub with_the_month_in_full: &'static str,
    pub with_the_month_for_short: &'static str,
    pub month_and_day: &'static str,
    pub month_and_year: &'static str,
}

/// One locale.
#[derive(Debug, PartialEq, Eq)]
pub struct Locale {
    /// `de-DE`.
    pub tag: &'static str,
    pub decimal_sign: DecimalSign,
    pub group_sign: GroupSign,
    pub sizes_of_groups: SizesOfGroups,
    /// `h:mm AM/PM` or `h:mm`.
    pub pattern_of_a_time_of_day: &'static str,
    pub short_date: ShortDate,
    pub month_and_day: MonthAndDay,
    pub patterns_of_money: PatternsOfMoney,
    pub patterns_of_dates_with_the_month_named: PatternsOfDatesWithTheMonthNamed,
}

impl Locale {
    /// The month and day names dates are shown with when a pattern names no language.
    pub(crate) fn names(&self) -> &'static Names {
        names::find(self.tag).unwrap_or(&names::EN_US)
    }

    /// Whether the locale writes numbers the en-US way (point, comma, threes).
    pub fn writes_numbers_as_en_us(&self) -> bool {
        self.decimal_sign == DecimalSign::Point
            && self.group_sign == GroupSign::Comma
            && self.sizes_of_groups == SizesOfGroups::Threes
    }
}

/// What a new workbook is set to.
pub const LOCALE_OF_A_NEW_WORKBOOK: &str = "en-US";

/// Every locale, in order of tag.
pub fn all() -> &'static [Locale] {
    &table::LOCALES
}

/// The locale with this tag, spelled exactly (`de-DE`, not `de-de`).
pub fn find(tag: &str) -> Option<&'static Locale> {
    table::LOCALES.iter().find(|l| l.tag == tag)
}

/// en-US: what requests that name no locale are read in.
pub fn en_us() -> &'static Locale {
    find(LOCALE_OF_A_NEW_WORKBOOK).unwrap_or(&table::LOCALES[0])
}
