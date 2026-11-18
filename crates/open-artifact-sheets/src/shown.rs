//! Values as a cell shows them: a number through its pattern (or General) the way the workbook's locale writes it,
//! a text through the pattern's text section, a boolean as `TRUE` or `FALSE`, an error as its spelling. What
//! `readShownValue` answers, and what a workbook read's `shown` holds.
//!
//! ```
//! use open_artifact_sheets::{locale, number_format::Room, shown::{shown, ShownValue}, value::Value};
//! let de = locale::find("de-DE").unwrap();
//! let s = shown(&Value::Number(1.5), Some("#,##0.00"), Room::AsText, de).unwrap();
//! assert_eq!(s, ShownValue::Text { text: "1,50".into(), color: None });
//! assert_eq!(serde_json::to_string(&s).unwrap(), r#"{"kind":"text","text":"1,50","textColor":null}"#);
//! ```

use serde::ser::{Serialize, SerializeStruct, Serializer};

use crate::locale::Locale;
use crate::number_format::{Color, NotShown, NumberFormat, Refusal, Room};
use crate::value::Value;

/// A value as shown, or why it can't be.
#[derive(Clone, Debug, PartialEq)]
pub enum ShownValue {
    Text { text: String, color: Option<Color> },
    CannotBeShown(NotShown),
}

/// A value shown with a pattern (none is General) in some room, the way a locale shows it; a pattern that can't
/// be read is refused, whatever the value. A blank shows as nothing.
pub fn shown(value: &Value, pattern: Option<&str>, room: Room, locale: &Locale) -> Result<ShownValue, Refusal> {
    let format = pattern.map(NumberFormat::parse).transpose()?;
    let text = |text: &str| ShownValue::Text { text: text.to_owned(), color: None };
    Ok(match value {
        Value::Blank => text(""),
        Value::Boolean(b) => text(if *b { "TRUE" } else { "FALSE" }),
        Value::Error(e) => text(e.text()),
        Value::Text(t) => match &format {
            Some(format) => {
                let s = format.show_text(t);
                ShownValue::Text { text: s.text, color: s.color }
            }
            None => text(t),
        },
        Value::Number(n) => {
            let format = match format {
                Some(format) => format,
                None => NumberFormat::parse("General").expect("General reads"),
            };
            match format.show_number_in(*n, locale, room) {
                Ok(s) => ShownValue::Text { text: s.text, color: s.color },
                Err(why) => ShownValue::CannotBeShown(why),
            }
        }
    })
}

impl Serialize for ShownValue {
    /// `{"kind":"text","text":"1,50","textColor":null}` (a colour is `{"kind":"named","name":"red"}` or
    /// `{"kind":"indexed","index":12}`), or `{"kind":"cannotBeShown","reason":"tooLong"}`.
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            ShownValue::Text { text, color } => {
                let mut s = serializer.serialize_struct("ShownValue", 3)?;
                s.serialize_field("kind", "text")?;
                s.serialize_field("text", text)?;
                s.serialize_field("textColor", color)?;
                s.end()
            }
            ShownValue::CannotBeShown(why) => {
                let mut s = serializer.serialize_struct("ShownValue", 2)?;
                s.serialize_field("kind", "cannotBeShown")?;
                s.serialize_field("reason", why.name())?;
                s.end()
            }
        }
    }
}

impl Serialize for Color {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("Color", 2)?;
        match self {
            Color::Named(name) => {
                s.serialize_field("kind", "named")?;
                s.serialize_field("name", name)?;
            }
            Color::Indexed(index) => {
                s.serialize_field("kind", "indexed")?;
                s.serialize_field("index", index)?;
            }
        }
        s.end()
    }
}
