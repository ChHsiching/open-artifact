//! A sheet's layout: its rows and columns, their sizes, groups, merges and settings, and what else it holds but its
//! cells: the sheet as `readWorkbook` reads it back, without `cells`. Also the workbook's time zone (readTimeZone), as
//! set or adopted, named as `readWorkbook` names it; null when it has none.

use serde::Deserialize;
use serde_json::{json, Map, Value as Json};

use crate::workbook::Workbook;

pub const KINDS: &[&str] = &["readSheetLayout", "readTimeZone"];

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum Request {
    #[serde(rename_all = "camelCase")]
    ReadSheetLayout { sheet_id: String },
    ReadTimeZone {},
}

pub fn answer(workbook: &Workbook, request: &Json) -> String {
    let sheet_id = match serde_json::from_value(request.clone()) {
        Ok(Request::ReadSheetLayout { sheet_id }) => sheet_id,
        Ok(Request::ReadTimeZone {}) => {
            let zone = workbook.time_zone.as_ref().map(|tz| crate::workbook::time_zone_named(tz).unwrap_or_else(|| tz.clone()));
            return json!({"kind": "timeZone", "timeZone": zone}).to_string();
        }
        Err(_) => return super::unreadable(),
    };
    let Some(index) = workbook.sheet_index(&sheet_id) else {
        return r#"{"kind":"refused","refusal":"unknownSheet"}"#.to_owned();
    };
    let mut contents = workbook.contents_written();
    if index >= contents.sheets.len() {
        return super::unreadable();
    }
    let sheet = contents.sheets.swap_remove(index);
    let mut layout = Map::new();
    layout.insert("kind".into(), json!("sheetLayout"));
    layout.extend(sheet.head);
    layout.extend(sheet.tail);
    Json::Object(layout).to_string()
}
