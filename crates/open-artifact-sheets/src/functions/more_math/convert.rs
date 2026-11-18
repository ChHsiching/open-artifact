//! CONVERT(number, from unit, to unit).

use crate::coerce::add;
use crate::functions::{number, Answer, Arg};
use crate::locale::Locale;
use crate::value::{CellError, Value};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Mass,
    Distance,
    Time,
    Pressure,
    Force,
    Energy,
    Power,
    Magnetism,
    Temperature,
    Volume,
    Area,
    Information,
    Speed,
}

use Kind::*;

/// The units by name: kind, size in the kind's base unit (g, m, s, Pa, N, J, W, T, m³, m², bit, m/s), and
/// whether a prefix (k, m, …) may go before the name.
const UNITS: &[(&str, Kind, f64, bool)] = &[
    ("g", Mass, 1.0, true),
    ("sg", Mass, 14593.902937206361, false),
    ("lbm", Mass, 453.59237, false),
    ("u", Mass, 1.66053906892e-24, true),
    ("ozm", Mass, 28.349523125, false),
    ("grain", Mass, 0.06479891, false),
    ("cwt", Mass, 45359.237, false),
    ("shweight", Mass, 45359.237, false),
    ("uk_cwt", Mass, 50802.345440000005, false),
    ("lcwt", Mass, 50802.345440000005, false),
    ("stone", Mass, 6350.293180000001, false),
    ("ton", Mass, 907184.74, false),
    ("uk_ton", Mass, 1016046.9088000001, false),
    ("LTON", Mass, 1016046.9088000001, false),
    ("brton", Mass, 1016046.9088000001, false),
    ("m", Distance, 1.0, true),
    ("mi", Distance, 1609.344, false),
    ("Nmi", Distance, 1852.0, false),
    ("in", Distance, 0.0254, false),
    ("ft", Distance, 0.3048, false),
    ("yd", Distance, 0.9144, false),
    ("ang", Distance, 1e-10, true),
    ("ell", Distance, 1.143, false),
    ("ly", Distance, 9460730472580800.0, true),
    ("parsec", Distance, 30856775814913670.0, true),
    ("pc", Distance, 30856775814913670.0, true),
    ("Picapt", Distance, 0.00035277777777777776, false),
    ("Pica", Distance, 0.00035277777777777776, false),
    ("pica", Distance, 0.004233333333333333, false),
    ("survey_mi", Distance, 1609.3472186944373, false),
    ("sec", Time, 1.0, true),
    ("s", Time, 1.0, true),
    ("yr", Time, 31557600.0, false),
    ("day", Time, 86400.0, false),
    ("d", Time, 86400.0, false),
    ("hr", Time, 3600.0, false),
    ("mn", Time, 60.0, false),
    ("min", Time, 60.0, false),
    ("Pa", Pressure, 1.0, true),
    ("p", Pressure, 1.0, true),
    ("atm", Pressure, 101325.0, true),
    ("at", Pressure, 101325.0, true),
    ("mmHg", Pressure, 133.322387415, true),
    ("psi", Pressure, 6894.757293168361, false),
    ("Torr", Pressure, 133.32236842105263, false),
    ("N", Force, 1.0, true),
    ("dyn", Force, 1e-5, true),
    ("dy", Force, 1e-5, true),
    ("lbf", Force, 4.4482216152605, false),
    ("pond", Force, 0.00980665, true),
    ("J", Energy, 1.0, true),
    ("e", Energy, 1e-7, true),
    ("c", Energy, 4.184, true),
    ("cal", Energy, 4.1868, true),
    ("eV", Energy, 1.602176634e-19, true),
    ("ev", Energy, 1.602176634e-19, true),
    ("HPh", Energy, 2684519.537696173, false),
    ("hh", Energy, 2684519.537696173, false),
    ("Wh", Energy, 3600.0, true),
    ("wh", Energy, 3600.0, true),
    ("flb", Energy, 1.3558179483314003, false),
    ("BTU", Energy, 1055.05585262, false),
    ("btu", Energy, 1055.05585262, false),
    ("W", Power, 1.0, true),
    ("w", Power, 1.0, true),
    ("HP", Power, 745.6998715822702, false),
    ("h", Power, 745.6998715822702, false),
    ("PS", Power, 735.49875, false),
    ("T", Magnetism, 1.0, true),
    ("ga", Magnetism, 1e-4, true),
    ("l", Volume, 0.001, true),
    ("L", Volume, 0.001, true),
    ("lt", Volume, 0.001, true),
    ("tsp", Volume, 0.0000049289215937500005, false),
    ("tspm", Volume, 0.000005, false),
    ("tbs", Volume, 0.00001478676478125, false),
    ("oz", Volume, 0.0000295735295625, false),
    ("cup", Volume, 0.0002365882365, false),
    ("pt", Volume, 0.000473176473, false),
    ("us_pt", Volume, 0.000473176473, false),
    ("uk_pt", Volume, 0.00056826125, false),
    ("qt", Volume, 0.000946352946, false),
    ("uk_qt", Volume, 0.0011365225, false),
    ("gal", Volume, 0.003785411784, false),
    ("uk_gal", Volume, 0.00454609, false),
    ("barrel", Volume, 0.158987294928, false),
    ("bushel", Volume, 0.03523907016688, false),
    ("GRT", Volume, 2.8316846592000005, false),
    ("regton", Volume, 2.8316846592000005, false),
    ("MTON", Volume, 1.13267386368, false),
    ("uk_acre", Area, 4046.8564224000006, false),
    ("us_acre", Area, 4046.8726098742513, false),
    ("ar", Area, 100.0, true),
    ("ha", Area, 10000.0, false),
    ("Morgen", Area, 2500.0, false),
    ("bit", Information, 1.0, true),
    ("byte", Information, 8.0, true),
    ("m/s", Speed, 1.0, true),
    ("m/sec", Speed, 1.0, true),
    ("m/h", Speed, 0.0002777777777777778, true),
    ("m/hr", Speed, 0.0002777777777777778, true),
    ("mph", Speed, 0.44704, false),
    ("kn", Speed, 0.5144444444444445, false),
    ("admkn", Speed, 0.5147733333333334, false),
];

/// Temperatures: the size of a degree (in Fahrenheit degrees), the reading at the scale's zero point shared by
/// all (0 °C), and whether a prefix may go before the name.
const TEMPERATURES: &[(&str, f64, f64, bool)] = &[
    ("C", 1.8, 0.0, false),
    ("cel", 1.8, 0.0, false),
    ("K", 1.8, 273.15, true),
    ("kel", 1.8, 273.15, true),
    ("F", 1.0, 32.0, false),
    ("fah", 1.0, 32.0, false),
    ("Rank", 1.0, 491.67, false),
    ("Reau", 2.25, 0.0, false),
];

const PREFIXES: &[(&str, f64)] = &[
    ("Y", 1e24),
    ("Z", 1e21),
    ("E", 1e18),
    ("P", 1e15),
    ("T", 1e12),
    ("G", 1e9),
    ("M", 1e6),
    ("k", 1e3),
    ("h", 1e2),
    ("da", 1e1),
    ("e", 1e1),
    ("d", 1e-1),
    ("c", 1e-2),
    ("m", 1e-3),
    ("u", 1e-6),
    ("n", 1e-9),
    ("p", 1e-12),
    ("f", 1e-15),
    ("a", 1e-18),
    ("z", 1e-21),
    ("y", 1e-24),
];

/// Binary prefixes, for bits and bytes only.
const BINARY_PREFIXES: &[(&str, i32)] =
    &[("ki", 10), ("Mi", 20), ("Gi", 30), ("Ti", 40), ("Pi", 50), ("Ei", 60), ("Zi", 70), ("Yi", 80)];

/// A unit: its kind, size and offset (0 but for temperatures).
type Unit = (Kind, f64, f64);

/// A unit by name (case matters): a name as it is, else a prefix and a name; a distance with 2 or 3 after it
/// (`m2`, `ft^3`) is an area or volume.
fn unit(name: &str) -> Option<Unit> {
    if let Some(power) = name.strip_suffix('2').map(|s| (s, 2)).or_else(|| name.strip_suffix('3').map(|s| (s, 3))) {
        let (stem, p) = power;
        let stem = stem.strip_suffix('^').unwrap_or(stem);
        if let Some((Distance, f, _)) = plain_unit(stem) {
            return Some(if p == 2 { (Area, f * f, 0.0) } else { (Volume, f * (f * f), 0.0) });
        }
    }
    plain_unit(name)
}

fn plain_unit(name: &str) -> Option<Unit> {
    if let Some(&(_, kind, f, _)) = UNITS.iter().find(|u| u.0 == name) {
        return Some((kind, f, 0.0));
    }
    if let Some(&(_, s, p, _)) = TEMPERATURES.iter().find(|u| u.0 == name) {
        return Some((Temperature, s, p));
    }
    for &(prefix, power) in BINARY_PREFIXES {
        if let Some(rest) = name.strip_prefix(prefix) {
            if let Some(&(_, kind, f, _)) = UNITS.iter().find(|u| u.0 == rest && u.1 == Information) {
                return Some((kind, 2f64.powi(power) * f, 0.0));
            }
        }
    }
    for &(prefix, size) in PREFIXES {
        let Some(rest) = name.strip_prefix(prefix) else { continue };
        if let Some(&(_, kind, f, _)) = UNITS.iter().find(|u| u.0 == rest && u.3) {
            return Some((kind, size * f, 0.0));
        }
        if let Some(&(_, s, p, _)) = TEMPERATURES.iter().find(|u| u.0 == rest && u.3) {
            return Some((Temperature, s * size, p / size));
        }
    }
    None
}

/// The units must be text naming units of one kind, else #N/A. The number is moved by the ratio of the sizes and
/// the offsets ([`add`]ed, so what is left of rounding is 0).
pub fn convert(args: &[Arg], locale: &Locale) -> Answer {
    let x = args[0].number(locale)?;
    let name = |a: &Arg| match a.value()? {
        Value::Text(s) => unit(&s).ok_or(CellError::NotAvailable),
        _ => Err(CellError::NotAvailable),
    };
    let (from_kind, sa, pa) = name(&args[1])?;
    let (to_kind, sb, pb) = name(&args[2])?;
    if from_kind != to_kind {
        return Err(CellError::NotAvailable);
    }
    let r = sa / sb;
    number(add(x * r, add(pb, r * -pa)) + 0.0)
}
