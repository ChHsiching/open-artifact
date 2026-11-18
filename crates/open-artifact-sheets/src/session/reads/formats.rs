//! The formats given to cells: the format some cells share (`readSharedCellFormat`, what the toolbar shows for a
//! selection), and the formats conditional formats give (`readFormatsGiven`).

use serde::Deserialize;
use serde_json::{json, Map, Value as Json};

use crate::number_format::NumberFormat;
use crate::workbook::formats::{Leaf, LEAVES};
use crate::workbook::layout::CellIds;
use crate::workbook::objects::{CellCondition, Effect, NumberOperand};
use crate::workbook::{Sheet, Workbook};

mod given;

pub(super) use given::Matching;

pub const KINDS: &[&str] = &["readFormatsGiven", "readSharedCellFormat"];

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum Request {
    #[serde(rename_all = "camelCase")]
    ReadFormatsGiven {
        sheet_id: String,
        #[serde(default)]
        as_if: Vec<given::AsIf>,
    },
    #[serde(rename_all = "camelCase")]
    ReadSharedCellFormat { sheet_id: String, one_corner: CellIds, other_corner: CellIds },
}

pub fn answer(workbook: &Workbook, request: &Json) -> String {
    answer_at(workbook, request, None)
}

/// Whether a request reads the session's clock: the formats given, by tests of days from today.
pub fn reads_the_clock(request: &Json) -> bool {
    request.get("kind").and_then(Json::as_str) == Some("readFormatsGiven")
}

/// A request answered, `now` the session's clock reading in the workbook's time zone (none: no reading counts).
pub fn answer_at(workbook: &Workbook, request: &Json, now: Option<f64>) -> String {
    let Ok(request) = serde_json::from_value::<Request>(request.clone()) else { return super::unreadable() };
    match request {
        Request::ReadFormatsGiven { sheet_id, as_if } => {
            given::formats_given(workbook, &sheet_id, &as_if, now).map(|answer| answer.to_string())
        }
        Request::ReadSharedCellFormat { sheet_id, one_corner, other_corner } => {
            shared_cell_format(workbook, &sheet_id, &one_corner, &other_corner)
        }
    }
    .unwrap_or_else(|refusal| json!({"kind": "refused", "refusal": refusal}).to_string())
}

/// What the cells from one corner to the other all have, property by property (`null` where they differ); a number
/// format with the kind of what it shows.
fn shared_cell_format(workbook: &Workbook, sheet_id: &str, one: &CellIds, other: &CellIds) -> Result<String, &'static str> {
    let sheet = &workbook.sheets[workbook.sheet_index(sheet_id).ok_or("unknownSheet")?];
    let row = |id: &str| workbook.bases.parse(id).and_then(|l| sheet.rows.position(l)).ok_or("unknownRow");
    let column = |id: &str| workbook.bases.parse(id).and_then(|l| sheet.columns.position(l)).ok_or("unknownColumn");
    let (r0, c0) = (row(&one.r)?, column(&one.c)?);
    let (r1, c1) = (row(&other.r)?, column(&other.c)?);
    let mut parts = Map::new();
    for leaf in LEAVES {
        let mut shared: Option<Json> = None;
        let mut differ = false;
        'cells: for r in r0.min(r1)..=r0.max(r1) {
            for c in c0.min(c1)..=c0.max(c1) {
                let at = (sheet.rows.line(r).expect("a position"), sheet.columns.line(c).expect("a position"));
                let value = sheet.formats.value(leaf, at);
                match &shared {
                    None => shared = Some(value),
                    Some(v) if *v != value => {
                        differ = true;
                        break 'cells;
                    }
                    Some(_) => (),
                }
            }
        }
        let mut value = if differ { Json::Null } else { shared.unwrap_or(Json::Null) };
        if leaf == Leaf::NumberFormat {
            if let Some(pattern) = value.get("pattern").and_then(Json::as_str) {
                let kind = NumberFormat::parse(pattern).map_or("general", |f| f.kind().name());
                value = json!({"kind": kind, "pattern": pattern});
            }
        }
        let (part, key) = leaf.keys();
        match key {
            None => {
                parts.insert(part.to_owned(), value);
            }
            Some(key) => {
                let entry = parts.entry(part.to_owned()).or_insert_with(|| Json::Object(Map::new()));
                entry.as_object_mut().expect("a part with keys").insert(key.to_owned(), value);
            }
        }
    }
    Ok(json!({"kind": "sharedCellFormat", "format": Json::Object(parts)}).to_string())
}

/// Whether a conditional format of the sheet counts days from today: another day, it may give other formats.
pub fn reads_today(sheet: &Sheet) -> bool {
    let from_today = |o: &NumberOperand| matches!(o, NumberOperand::DaysFromToday { .. });
    sheet.conditional_formats.values().any(|(_, format)| match &format.effect {
        Effect::FormatWhere { all_of, .. } => all_of.iter().any(|test| match &test.condition {
            CellCondition::NumberIs { operand, .. } => from_today(operand),
            CellCondition::NumberIsBetween { one_end, other_end } | CellCondition::NumberIsNotBetween { one_end, other_end } => {
                from_today(one_end) || from_today(other_end)
            }
            _ => false,
        }),
        Effect::ColorScale { .. } => false,
    })
}
