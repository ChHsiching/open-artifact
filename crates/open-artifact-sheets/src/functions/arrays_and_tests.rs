//! More lookup, text and logical functions: ADDRESS; the array functions ARRAYFORMULA,
//! ARRAY_CONSTRAIN, CHOOSECOLS, CHOOSEROWS, DROP, FLATTEN, SORTBY, TAKE, TOCOL and TOROW (`arrays`); the text
//! functions DOLLAR, ENCODEURL, FIXED, JOIN, REGEXTEST, TEXTAFTER and TEXTBEFORE (`texts`); and the tests
//! ERROR.TYPE, ISBETWEEN, ISEMAIL, ISFORMULA, ISNONTEXT, ISURL and TYPE (`checks`).

mod arrays;
mod checks;
mod texts;

use crate::formula;
use crate::functions::{text, Answer, Arg, CallContext};
use crate::locale::Locale;
use crate::value::{CellError, Value};

/// Calls one of these functions by name; `None` for another.
pub fn call(name: &str, args: &[Arg], cx: &mut CallContext) -> Option<Answer> {
    let locale = cx.locale;
    Some(match name {
        "ADDRESS" => address(args, locale),
        "ARRAYFORMULA" => arrays::array_formula(args, cx),
        "ARRAY_CONSTRAIN" => arrays::array_constrain(args, cx),
        "CHOOSECOLS" => arrays::choose(args, false, cx),
        "CHOOSEROWS" => arrays::choose(args, true, cx),
        "DROP" => arrays::take_or_drop(args, false, cx),
        "TAKE" => arrays::take_or_drop(args, true, cx),
        "FLATTEN" => arrays::flatten(args, cx),
        "SORTBY" => arrays::sort_by(args, cx),
        "TOCOL" => arrays::to_line(args, true, cx),
        "TOROW" => arrays::to_line(args, false, cx),
        "DOLLAR" => texts::dollar(args, cx),
        "ENCODEURL" => texts::encode_url(args, locale),
        "FIXED" => texts::fixed(args, cx),
        "JOIN" => texts::join(args, locale),
        "REGEXTEST" => texts::regex_test(args, cx),
        "TEXTAFTER" => texts::text_around(args, true, locale),
        "TEXTBEFORE" => texts::text_around(args, false, locale),
        "ERROR.TYPE" => checks::error_type(args),
        "ISBETWEEN" => checks::is_between(args),
        "ISEMAIL" => checks::is_email_value(args),
        "ISFORMULA" => checks::is_formula(args),
        "ISNONTEXT" => checks::is_non_text(args),
        "ISURL" => checks::is_url_value(args),
        "TYPE" => checks::type_(args),
        _ => return None,
    })
}

/// How these functions read their arguments early (see `functions::early_reads`). ARRAY_CONSTRAIN reads its rows
/// early as one of 1 or more (else #NUM!); with no letter for that, `y` gives the #NUM! below 0.
pub fn early_reads(name: &str) -> Option<&'static str> {
    Some(match name {
        "ADDRESS" => "nn",
        "DOLLAR" | "FIXED" => "n",
        "DROP" | "TOCOL" | "TOROW" => ".n",
        "ISBETWEEN" => "...b",
        "ARRAY_CONSTRAIN" => ".p",
        _ => return None,
    })
}

/// Whether an optional argument is not given, left out or blank: each takes the argument's default.
fn not_given(arg: Option<&Arg>) -> bool {
    matches!(arg, None | Some(Arg::Missing) | Some(Arg::Value(Value::Blank)))
}

/// An optional argument as a whole number (cut toward zero), `None` when it is not given, left out or blank.
fn whole_or_none(arg: Option<&Arg>, locale: &Locale) -> Result<Option<f64>, CellError> {
    match arg {
        _ if not_given(arg) => Ok(None),
        Some(arg) => Ok(Some(arg.number(locale)?.trunc())),
        None => Ok(None),
    }
}

// ADDRESS

/// The most rows and columns a sheet has.
const ROWS: f64 = 1_048_576.0;
const COLUMNS: f64 = 16_384.0;

/// ADDRESS(row, column, [absolute], [A1], [sheet]): `$C$2`, `C$2`, `$C2`, `C2` for absolute 1 to 4 (R1C1: `R2C3`,
/// `R2C[3]`, `R[2]C3`, `R[2]C[3]`), after the sheet's name when one is given. A row or column off the sheet, or
/// another absolute, is #VALUE!.
fn address(args: &[Arg], locale: &Locale) -> Answer {
    let row = args[0].number(locale)?.trunc();
    let column = args[1].number(locale)?.trunc();
    if !(1.0..=ROWS).contains(&row) || !(1.0..=COLUMNS).contains(&column) {
        return Err(CellError::Value);
    }
    let absolute = whole_or_none(args.get(2), locale)?.unwrap_or(1.0);
    if !(1.0..=4.0).contains(&absolute) {
        return Err(CellError::Value);
    }
    let a1 = if not_given(args.get(3)) { true } else { args[3].boolean()? };
    let sheet = match args.get(4) {
        Some(arg) => arg.text(locale)?,
        None => "".into(),
    };
    let (row_fixed, column_fixed) = match absolute as u8 {
        1 => (true, true),
        2 => (true, false),
        3 => (false, true),
        _ => (false, false),
    };
    let (row, column) = (row as usize, column as usize);
    let cell = if a1 {
        let dollar = |fixed: bool| if fixed { "$" } else { "" };
        format!("{}{}{}{row}", dollar(column_fixed), formula::column_letters(column - 1), dollar(row_fixed))
    } else {
        let part = |n: usize, fixed: bool| if fixed { n.to_string() } else { format!("[{n}]") };
        format!("R{}C{}", part(row, row_fixed), part(column, column_fixed))
    };
    if sheet.is_empty() {
        return text(cell);
    }
    text(format!("{}!{cell}", sheet_name(&sheet)))
}

/// A sheet's name as ADDRESS writes it: as a reference does, and quoted too when it reads as a cell (`'A1'`).
fn sheet_name(name: &str) -> String {
    if reads_as_cell(name) {
        format!("'{}'", name.replace('\'', "''"))
    } else {
        formula::sheet_name_text(name)
    }
}

/// Whether a name reads as a cell in A1 style, in any case: letters up to XFD, then a row from 1 to 1048576
/// written without a leading 0.
fn reads_as_cell(name: &str) -> bool {
    let letters = name.bytes().take_while(u8::is_ascii_alphabetic).count();
    let (letters, digits) = name.split_at(letters);
    let column_fits = matches!(formula::column_index(letters), Some(c) if (c as f64) < COLUMNS);
    let row_fits = !digits.is_empty()
        && digits.len() <= 7
        && digits.bytes().all(|b| b.is_ascii_digit())
        && !digits.starts_with('0')
        && digits.parse::<f64>().is_ok_and(|r| r <= ROWS);
    column_fits && row_fits
}
