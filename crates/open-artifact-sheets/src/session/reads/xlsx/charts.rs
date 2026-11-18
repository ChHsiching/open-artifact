//! Charts in the file: each view placed on a sheet that the page describes as one of the file's own kinds of chart
//! (`charts` of the request) is a chart in the file, drawn where the view is placed; every other placed view is left
//! out, with why (`chartsLeftOut`).
//!
//! A placement's view is a chart only when it has exactly one widget (`notAChart`) and the page describes it
//! (`notDescribed`). The description reads strictly (`descriptionNotReadable`): one of the kinds below, with every
//! field it needs and no other, or `none` with why. Then every input of the widget is read as `readInputsOfView`
//! reads it (more than it reads is `inputTooLarge`), and the description's data is checked against them:
//!
//! - From a table, one input holds everything: its first row the headings, its first column the labels (or, when
//!   series are rows, the other way round). The rows whose label is blank or left out are not drawn, but only at the
//!   ends (`categoriesLieApart`); the series left out by their heading are not drawn, and neither is a series with
//!   no number. A table of one row or column, or with no category or no series left, holds none
//!   (`tableHoldsNoCategoryOrNoSeries`).
//! - From lists, each input is one row or one column (`listIsNotOneRowOrColumn`), written as it is read; its first
//!   cell is the series' name when the description says so. A series with no number is not drawn.
//!
//! An input named that the widget does not have is `unknownInput`; one that reads nothing, `inputHoldsNothing`. With
//! no series left that holds a number, `noSeriesHoldsANumber`; a pie or doughnut draws exactly one series
//! (`severalSeriesInAPie`); a scatter's categories hold a number (`categoriesOfAScatterHoldNoNumber`). A chart draws
//! at most 255 series (`tooManySeries`) and 10000 points (`tooManyPoints`, a series' points being as many as its
//! categories or values, whichever are more), and the charts of the file 100000 points in all, counted in the order
//! of the sheets and their placements (`tooManyPointsInAllCharts`).
//!
//! A sheet's charts are in its drawing, each anchored at the cell its placement is anchored at now, in the order of
//! the placements; the charts are numbered across the sheets. A chart refers to the cells it draws, with the values
//! they hold now: texts cut to 100 characters, numbers in the number format of the series' first number.

use std::fmt::Write;

use serde::Deserialize;
use serde_json::{json, Value as Json};

use super::xml::{attribute, number, text, DECLARATION};
use super::RELATIONSHIP;
use crate::formula::column_letters;
use crate::session::reads::objects::views::{read_input, Read, ReadCell};
use crate::workbook::objects::{anchored_at, Placement, ViewElement};
use crate::workbook::Workbook;

/// A chart the page describes, for the view that shows it.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DescribedChart {
    view_id: String,
    description: Json,
}

/// The most series a chart draws.
const SERIES: usize = 255;
/// The most points a chart draws.
const POINTS: usize = 10_000;
/// The most points the charts of a file draw in all.
const ALL_POINTS: usize = 100_000;
/// The colors of the series (of the slices of a pie), in turn.
const PALETTE: [&str; 8] = ["3987E5", "D95926", "199E70", "DB9300", "E87BA4", "006300", "4A3AA7", "E34948"];
/// Pixels to the file's units.
const EMU: u64 = 9525;
const CHART: &str = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const MAIN: &str = "http://schemas.openxmlformats.org/drawingml/2006/main";

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase", deny_unknown_fields)]
enum Description {
    Bar { direction: Direction, stacking: Stacking, data: Data },
    Line { stacking: Stacking, data: Data },
    Area { stacking: Stacking, data: Data },
    Pie { data: Data },
    Doughnut { data: Data },
    Scatter { data: Data },
    None { why: Why },
}

#[derive(Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
enum Direction {
    Vertical,
    Horizontal,
}

#[derive(Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
enum Stacking {
    None,
    Stacked,
    StackedToTheWhole,
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
enum Why {
    WorksOutItsNumbersInCode,
    NoSuchKind,
}

#[derive(Deserialize)]
#[serde(tag = "from", rename_all = "camelCase", rename_all_fields = "camelCase", deny_unknown_fields)]
enum Data {
    Table { input: String, series_are: SeriesAre, labels_left_out: Vec<String> },
    Lists { categories: String, series: Vec<String>, first_cell_is_a_heading: bool },
}

#[derive(Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
enum SeriesAre {
    Columns,
    Rows,
}

/// A chart's kind as the file draws it.
#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Bar(Direction),
    Line,
    Area,
    Pie,
    Doughnut,
    Scatter,
}

/// Cells in one row or one column of a sheet, as a chart refers to them.
struct Cells<'a> {
    sheet: usize,
    first: (usize, usize),
    last: (usize, usize),
    cells: Vec<&'a ReadCell>,
}

impl Cells<'_> {
    /// The cells as a formula refers to them: the sheet's name quoted, the cells' rows and columns absolute.
    fn reference(&self, names: &[String]) -> String {
        let cell = |(r, c): (usize, usize)| format!("${}${}", column_letters(c), r + 1);
        let sheet = format!("'{}'", names[self.sheet].replace('\'', "''"));
        if self.first == self.last {
            format!("{sheet}!{}", cell(self.first))
        } else {
            format!("{sheet}!{}:{}", cell(self.first), cell(self.last))
        }
    }

    fn has_a_number(&self) -> bool {
        self.cells.iter().any(|c| c.value.is_number())
    }
}

/// A series a chart draws: its name, its categories and its values.
struct Series<'a> {
    name: Option<Cells<'a>>,
    categories: Cells<'a>,
    values: Cells<'a>,
}

/// A chart the file draws.
struct Chart<'a> {
    kind: Kind,
    stacking: Stacking,
    series: Vec<Series<'a>>,
}

/// A sheet's drawing: its number, and its part, its links to its charts, and its charts, each with its number.
pub struct Drawing {
    pub number: usize,
    pub xml: String,
    pub rels: String,
    pub charts: Vec<(usize, String)>,
}

/// The charts of the file: each sheet's drawing, by the sheet's index, and the placed views left out.
pub struct Charts {
    pub drawings: Vec<Option<Drawing>>,
    pub left_out: Vec<Json>,
}

/// The charts of a workbook's placed views, the sheets named as the file names them.
pub fn charts(workbook: &Workbook, names: &[String], described: &[DescribedChart]) -> Charts {
    let mut drawings = Vec::new();
    let mut left_out = Vec::new();
    let (mut budget, mut numbered, mut drawn) = (ALL_POINTS, 0, 0);
    for sheet in &workbook.sheets {
        let mut anchors = String::new();
        let mut charts = Vec::new();
        for (_, placement) in sheet.placements.values() {
            let view_id = placement.shows.view_id();
            let chart = read(workbook, view_id, described);
            let chart = match chart.as_ref().map_err(|why| *why).and_then(chart_of) {
                Ok(chart) => chart,
                Err(why) => {
                    left_out.push(json!({"viewId": view_id, "why": why}));
                    continue;
                }
            };
            let points = points(&chart);
            if points > budget {
                left_out.push(json!({"viewId": view_id, "why": "tooManyPointsInAllCharts"}));
                continue;
            }
            let Some(at) = anchor(workbook, sheet, placement) else { continue };
            budget -= points;
            numbered += 1;
            let name = workbook.views.get(view_id).map_or("", |(_, v)| v.name.as_str());
            anchors.push_str(&anchor_xml(at, placement, charts.len(), name));
            charts.push((numbered, chart_xml(&chart, name, names)));
        }
        if charts.is_empty() {
            drawings.push(None);
            continue;
        }
        drawn += 1;
        let mut xml = String::from(DECLARATION);
        let _ = write!(
            xml,
            "<xdr:wsDr xmlns:xdr=\"http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing\" \
             xmlns:a=\"{MAIN}\">{anchors}</xdr:wsDr>"
        );
        let mut rels = String::from(DECLARATION);
        rels.push_str("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">");
        for (i, (n, _)) in charts.iter().enumerate() {
            let _ = write!(
                rels,
                "<Relationship Id=\"rId{}\" Type=\"{RELATIONSHIP}/chart\" Target=\"../charts/chart{n}.xml\"/>",
                i + 1
            );
        }
        rels.push_str("</Relationships>");
        drawings.push(Some(Drawing { number: drawn, xml, rels, charts }));
    }
    Charts { drawings, left_out }
}

/// A described chart and what the inputs of its widget read.
struct Described {
    kind: Kind,
    stacking: Stacking,
    data: Data,
    reads: Vec<(String, Read)>,
}

/// What a placed view's chart is drawn from, or why it is none: its description and its widget's inputs.
fn read(workbook: &Workbook, view_id: &str, described: &[DescribedChart]) -> Result<Described, &'static str> {
    let Some((_, view)) = workbook.views.get(view_id) else { return Err("notAChart") };
    let [ViewElement::Widget { inputs, .. }] = view.elements.as_slice() else { return Err("notAChart") };
    let described = described.iter().find(|c| c.view_id == view_id).ok_or("notDescribed")?;
    let description: Description =
        serde_json::from_value(described.description.clone()).map_err(|_| "descriptionNotReadable")?;
    let (kind, stacking, data) = match description {
        Description::Bar { direction, stacking, data } => (Kind::Bar(direction), stacking, data),
        Description::Line { stacking, data } => (Kind::Line, stacking, data),
        Description::Area { stacking, data } => (Kind::Area, stacking, data),
        Description::Pie { data } => (Kind::Pie, Stacking::None, data),
        Description::Doughnut { data } => (Kind::Doughnut, Stacking::None, data),
        Description::Scatter { data } => (Kind::Scatter, Stacking::None, data),
        Description::None { why: Why::WorksOutItsNumbersInCode } => return Err("worksOutItsNumbersInCode"),
        Description::None { why: Why::NoSuchKind } => return Err("noSuchKind"),
    };
    if matches!(&data, Data::Lists { series, .. } if series.is_empty()) {
        return Err("descriptionNotReadable");
    }
    let mut reads = Vec::new();
    for input in inputs {
        let (read, _) = read_input(workbook, &input.range).map_err(|_| "inputTooLarge")?;
        reads.push((input.name.clone(), read));
    }
    Ok(Described { kind, stacking, data, reads })
}

/// The chart drawn from a description and what its inputs read, or why it is none.
fn chart_of(described: &Described) -> Result<Chart<'_>, &'static str> {
    let Described { kind, stacking, data, reads } = described;
    let (kind, stacking) = (*kind, *stacking);
    let input = |name: &str| reads.iter().find(|(n, _)| n == name).map(|(_, read)| read).ok_or("unknownInput");
    let series = match data {
        Data::Table { input: name, series_are, labels_left_out } => {
            table(input(name)?, *series_are == SeriesAre::Columns, labels_left_out)?
        }
        Data::Lists { categories, series, first_cell_is_a_heading } => {
            let categories = list(input(categories)?)?;
            let series = series.iter().map(|name| list(input(name)?)).collect::<Result<Vec<_>, _>>()?;
            lists(categories, series, *first_cell_is_a_heading)?
        }
    };
    if series.is_empty() {
        return Err("noSeriesHoldsANumber");
    }
    if matches!(kind, Kind::Pie | Kind::Doughnut) && series.len() != 1 {
        return Err("severalSeriesInAPie");
    }
    if kind == Kind::Scatter && !series.iter().any(|s| s.categories.has_a_number()) {
        return Err("categoriesOfAScatterHoldNoNumber");
    }
    let chart = Chart { kind, stacking, series };
    if chart.series.len() > SERIES {
        return Err("tooManySeries");
    }
    if points(&chart) > POINTS {
        return Err("tooManyPoints");
    }
    Ok(chart)
}

/// The points a chart draws: for each series as many as its categories or its values, whichever are more.
fn points(chart: &Chart) -> usize {
    chart.series.iter().map(|s| s.categories.cells.len().max(s.values.cells.len())).sum()
}

/// The series of a table: the columns (or rows) under a heading not left out that hold a number, over the rows (or
/// columns) between the first and the last label drawn.
fn table<'a>(read: &'a Read, columns: bool, left_out: &[String]) -> Result<Vec<Series<'a>>, &'static str> {
    let Some((sheet, top, left)) = read.at else { return Err("inputHoldsNothing") };
    let rows = &read.rows;
    // `i` counts categories (0 the headings), `j` series (0 the labels).
    let (count_i, count_j) = if columns { (rows.len(), rows[0].len()) } else { (rows[0].len(), rows.len()) };
    let cell = |i: usize, j: usize| if columns { &rows[i][j] } else { &rows[j][i] };
    let at = |i: usize, j: usize| if columns { (top + i, left + j) } else { (top + j, left + i) };
    if count_i < 2 || count_j < 2 {
        return Err("tableHoldsNoCategoryOrNoSeries");
    }
    let is_left_out = |c: &ReadCell| left_out.iter().any(|l| *l == c.text);
    let drawn: Vec<usize> = (1..count_i).filter(|&i| !cell(i, 0).text.is_empty() && !is_left_out(cell(i, 0))).collect();
    let (Some(&first), Some(&last)) = (drawn.first(), drawn.last()) else {
        return Err("tableHoldsNoCategoryOrNoSeries");
    };
    if last - first + 1 != drawn.len() {
        return Err("categoriesLieApart");
    }
    let headed: Vec<usize> = (1..count_j).filter(|&j| !is_left_out(cell(0, j))).collect();
    if headed.is_empty() {
        return Err("tableHoldsNoCategoryOrNoSeries");
    }
    let run = |j: usize| {
        let cells = (first..=last).map(|i| cell(i, j)).collect();
        Cells { sheet, first: at(first, j), last: at(last, j), cells }
    };
    let mut out = Vec::new();
    for j in headed {
        let values = run(j);
        if !values.has_a_number() {
            continue;
        }
        let heading = cell(0, j);
        let name =
            (!heading.text.is_empty()).then(|| Cells { sheet, first: at(0, j), last: at(0, j), cells: vec![heading] });
        out.push(Series { name, categories: run(0), values });
    }
    Ok(out)
}

/// The cells of a list, one row or one column.
fn list(read: &Read) -> Result<Cells<'_>, &'static str> {
    let Some((sheet, top, left)) = read.at else { return Err("inputHoldsNothing") };
    let rows = &read.rows;
    if rows.len() > 1 && rows[0].len() > 1 {
        return Err("listIsNotOneRowOrColumn");
    }
    let cells: Vec<&ReadCell> = rows.iter().flatten().collect();
    let last = if rows.len() > 1 { (top + rows.len() - 1, left) } else { (top, left + rows[0].len() - 1) };
    Ok(Cells { sheet, first: (top, left), last, cells })
}

/// A list without its first cell, and that cell.
fn headed(list: Cells<'_>) -> (Option<Cells<'_>>, Option<Cells<'_>>) {
    let Cells { sheet, first, last, mut cells } = list;
    let heading = cells.remove(0);
    let head = Cells { sheet, first, last: first, cells: vec![heading] };
    if cells.is_empty() {
        return (Some(head), None);
    }
    let next = if first.0 == last.0 { (first.0, first.1 + 1) } else { (first.0 + 1, first.1) };
    (Some(head), Some(Cells { sheet, first: next, last, cells }))
}

/// The series of lists: each list that holds a number, over the categories' list.
fn lists<'a>(
    categories: Cells<'a>,
    series: Vec<Cells<'a>>,
    first_cell_is_a_heading: bool,
) -> Result<Vec<Series<'a>>, &'static str> {
    let categories = if first_cell_is_a_heading {
        headed(categories).1.ok_or("inputHoldsNothing")?
    } else {
        categories
    };
    let mut out = Vec::new();
    for values in series {
        let (name, values) = if first_cell_is_a_heading {
            let (head, values) = headed(values);
            let head = head.filter(|h| !h.cells[0].text.is_empty());
            (head, values.ok_or("inputHoldsNothing")?)
        } else {
            (None, values)
        };
        if !values.has_a_number() {
            continue;
        }
        let categories = Cells { cells: categories.cells.clone(), ..categories };
        out.push(Series { name, categories, values });
    }
    Ok(out)
}

/// Where a placement is anchored now: its row and column.
fn anchor(workbook: &Workbook, sheet: &crate::workbook::Sheet, placement: &Placement) -> Option<(usize, usize)> {
    let r = anchored_at(&sheet.rows, workbook.bases.parse(&placement.top_left.r)?)?;
    let c = anchored_at(&sheet.columns, workbook.bases.parse(&placement.top_left.c)?)?;
    Some((r, c))
}

/// A chart's anchor in its sheet's drawing, the `i`th.
fn anchor_xml((row, column): (usize, usize), placement: &Placement, i: usize, name: &str) -> String {
    let (x, y) = placement.offset_from_anchor_cell.as_ref().map_or((0, 0), |o| (o.x_in_pixels, o.y_in_pixels));
    let emu = |px: u32| u64::from(px) * EMU;
    format!(
        "<xdr:oneCellAnchor><xdr:from><xdr:col>{column}</xdr:col><xdr:colOff>{}</xdr:colOff><xdr:row>{row}</xdr:row>\
         <xdr:rowOff>{}</xdr:rowOff></xdr:from><xdr:ext cx=\"{}\" cy=\"{}\"/><xdr:graphicFrame macro=\"\">\
         <xdr:nvGraphicFramePr><xdr:cNvPr id=\"{}\" name=\"{}\"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>\
         <xdr:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/></xdr:xfrm><a:graphic><a:graphicData \
         uri=\"{CHART}\"><c:chart xmlns:c=\"{CHART}\" xmlns:r=\"{RELATIONSHIP}\" r:id=\"rId{}\"/></a:graphicData>\
         </a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>",
        emu(x),
        emu(y),
        emu(placement.width_in_pixels),
        emu(placement.height_in_pixels),
        i + 2,
        attribute(name),
        i + 1
    )
}

fn fill(hex: &str) -> String {
    format!("<a:solidFill><a:srgbClr val=\"{hex}\"/></a:solidFill>")
}

/// A text as a chart keeps it: cut to 100 characters.
fn cut(s: &str) -> String {
    text(&s.chars().take(100).collect::<String>())
}

/// Cells referred to as texts, with the texts they show (blank ones left out).
fn texts(cells: &Cells, names: &[String]) -> String {
    let mut out = format!(
        "<c:strRef><c:f>{}</c:f><c:strCache><c:ptCount val=\"{}\"/>",
        text(&cells.reference(names)),
        cells.cells.len()
    );
    for (i, cell) in cells.cells.iter().enumerate() {
        if !cell.text.is_empty() {
            let _ = write!(out, "<c:pt idx=\"{i}\"><c:v>{}</c:v></c:pt>", cut(&cell.text));
        }
    }
    out.push_str("</c:strCache></c:strRef>");
    out
}

/// Cells referred to as numbers, with the numbers they hold, in the number format of the first.
fn numbers(cells: &Cells, names: &[String]) -> String {
    let first_number = cells.cells.iter().find(|c| c.value.is_number());
    let format = first_number.and_then(|c| c.pattern.as_deref()).unwrap_or("General");
    let mut out = format!(
        "<c:numRef><c:f>{}</c:f><c:numCache><c:formatCode>{}</c:formatCode><c:ptCount val=\"{}\"/>",
        text(&cells.reference(names)),
        text(format),
        cells.cells.len()
    );
    for (i, cell) in cells.cells.iter().enumerate() {
        if let Some(n) = cell.value.as_f64() {
            let _ = write!(out, "<c:pt idx=\"{i}\"><c:v>{}</c:v></c:pt>", number(n));
        }
    }
    out.push_str("</c:numCache></c:numRef>");
    out
}

/// A chart's part.
fn chart_xml(chart: &Chart, title: &str, names: &[String]) -> String {
    let mut out = String::from(DECLARATION);
    let _ = write!(
        out,
        "<c:chartSpace xmlns:c=\"{CHART}\" xmlns:a=\"{MAIN}\" xmlns:r=\"{RELATIONSHIP}\"><c:roundedCorners val=\"0\"/>\
         <c:chart>"
    );
    if title.is_empty() {
        out.push_str("<c:autoTitleDeleted val=\"1\"/>");
    } else {
        let _ = write!(
            out,
            "<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>{}</a:t></a:r></a:p></c:rich></c:tx>\
             <c:overlay val=\"0\"/></c:title><c:autoTitleDeleted val=\"0\"/>",
            text(title)
        );
    }
    out.push_str("<c:plotArea><c:layout/>");
    let grouping = |none: &str| match chart.stacking {
        Stacking::None => none.to_owned(),
        Stacking::Stacked => "stacked".to_owned(),
        Stacking::StackedToTheWhole => "percentStacked".to_owned(),
    };
    let series = |out: &mut String, each: &dyn Fn(&mut String, usize, &Series)| {
        for (i, s) in chart.series.iter().enumerate() {
            let _ = write!(out, "<c:ser><c:idx val=\"{i}\"/><c:order val=\"{i}\"/>");
            if let Some(name) = &s.name {
                let _ = write!(out, "<c:tx>{}</c:tx>", texts(name, names));
            }
            each(out, i, s);
            out.push_str("</c:ser>");
        }
    };
    let cat_val = |s: &Series| {
        format!("<c:cat>{}</c:cat><c:val>{}</c:val>", texts(&s.categories, names), numbers(&s.values, names))
    };
    let color = |i: usize| fill(PALETTE[i % PALETTE.len()]);
    const AXES: &str = "<c:axId val=\"1\"/><c:axId val=\"2\"/>";
    match chart.kind {
        Kind::Bar(direction) => {
            let dir = if direction == Direction::Vertical { "col" } else { "bar" };
            let _ = write!(
                out,
                "<c:barChart><c:barDir val=\"{dir}\"/><c:grouping val=\"{}\"/><c:varyColors val=\"0\"/>",
                grouping("clustered")
            );
            series(&mut out, &|out, i, s| {
                let _ = write!(out, "<c:spPr>{}</c:spPr><c:invertIfNegative val=\"0\"/>{}", color(i), cat_val(s));
            });
            out.push_str("<c:gapWidth val=\"50\"/>");
            if chart.stacking != Stacking::None {
                out.push_str("<c:overlap val=\"100\"/>");
            }
            let _ = write!(out, "{AXES}</c:barChart>");
        }
        Kind::Line => {
            let _ = write!(out, "<c:lineChart><c:grouping val=\"{}\"/><c:varyColors val=\"0\"/>", grouping("standard"));
            series(&mut out, &|out, i, s| {
                let _ = write!(
                    out,
                    "<c:spPr><a:ln w=\"28575\" cap=\"rnd\">{}<a:round/></a:ln></c:spPr><c:marker><c:symbol \
                     val=\"circle\"/><c:size val=\"5\"/><c:spPr>{}<a:ln><a:noFill/></a:ln></c:spPr></c:marker>{}\
                     <c:smooth val=\"0\"/>",
                    color(i),
                    color(i),
                    cat_val(s)
                );
            });
            let _ = write!(out, "<c:marker val=\"1\"/>{AXES}</c:lineChart>");
        }
        Kind::Area => {
            let _ = write!(out, "<c:areaChart><c:grouping val=\"{}\"/><c:varyColors val=\"0\"/>", grouping("standard"));
            series(&mut out, &|out, i, s| {
                let _ = write!(out, "<c:spPr>{}</c:spPr>{}", color(i), cat_val(s));
            });
            let _ = write!(out, "{AXES}</c:areaChart>");
        }
        Kind::Pie | Kind::Doughnut => {
            let element = if chart.kind == Kind::Pie { "pieChart" } else { "doughnutChart" };
            let _ = write!(out, "<c:{element}><c:varyColors val=\"1\"/>");
            series(&mut out, &|out, _, s| {
                for k in 0..s.values.cells.len() {
                    let _ = write!(
                        out,
                        "<c:dPt><c:idx val=\"{k}\"/><c:bubble3D val=\"0\"/><c:spPr>{}</c:spPr></c:dPt>",
                        color(k)
                    );
                }
                out.push_str(&cat_val(s));
            });
            out.push_str("<c:firstSliceAng val=\"0\"/>");
            if chart.kind == Kind::Doughnut {
                out.push_str("<c:holeSize val=\"60\"/>");
            }
            let _ = write!(out, "</c:{element}>");
        }
        Kind::Scatter => {
            out.push_str("<c:scatterChart><c:scatterStyle val=\"lineMarker\"/><c:varyColors val=\"0\"/>");
            series(&mut out, &|out, i, s| {
                let _ = write!(
                    out,
                    "<c:spPr><a:ln w=\"19050\"><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val=\"circle\"/>\
                     <c:size val=\"7\"/><c:spPr>{}<a:ln><a:noFill/></a:ln></c:spPr></c:marker><c:xVal>{}</c:xVal>\
                     <c:yVal>{}</c:yVal><c:smooth val=\"0\"/>",
                    color(i),
                    numbers(&s.categories, names),
                    numbers(&s.values, names)
                );
            });
            let _ = write!(out, "{AXES}</c:scatterChart>");
        }
    }
    out.push_str(&axes(chart));
    out.push_str("</c:plotArea>");
    if chart.series.len() > 1 || matches!(chart.kind, Kind::Pie | Kind::Doughnut) {
        out.push_str("<c:legend><c:legendPos val=\"t\"/><c:overlay val=\"0\"/></c:legend>");
    }
    out.push_str("<c:plotVisOnly val=\"0\"/><c:dispBlanksAs val=\"gap\"/></c:chart></c:chartSpace>");
    out
}

/// A chart's axes: none for a pie; a category axis and a value axis, or for a scatter two value axes.
fn axes(chart: &Chart) -> String {
    let line = |hex: &str| format!("<c:spPr><a:ln w=\"9525\">{}</a:ln></c:spPr>", fill(hex));
    let ticks = "<c:majorTickMark val=\"none\"/><c:minorTickMark val=\"none\"/><c:tickLblPos val=\"nextTo\"/>";
    let start = |id: u8, orientation: &str, position: &str| {
        format!(
            "<c:axId val=\"{id}\"/><c:scaling><c:orientation val=\"{orientation}\"/></c:scaling><c:delete val=\"0\"/>\
             <c:axPos val=\"{position}\"/>"
        )
    };
    let gridlines = format!("<c:majorGridlines>{}</c:majorGridlines>", line("E0E0E0"));
    let general = "<c:numFmt formatCode=\"General\" sourceLinked=\"1\"/>";
    match chart.kind {
        Kind::Pie | Kind::Doughnut => String::new(),
        Kind::Scatter => format!(
            "<c:valAx>{}{general}{ticks}{}<c:crossAx val=\"2\"/><c:crosses val=\"autoZero\"/><c:crossBetween \
             val=\"midCat\"/></c:valAx><c:valAx>{}{gridlines}{general}{ticks}{}<c:crossAx val=\"1\"/><c:crosses \
             val=\"autoZero\"/><c:crossBetween val=\"midCat\"/></c:valAx>",
            start(1, "minMax", "b"),
            line("A4A4A4"),
            start(2, "minMax", "l"),
            line("A4A4A4")
        ),
        kind => {
            let horizontal = kind == Kind::Bar(Direction::Horizontal);
            let (orientation, cat_at, val_at, crosses) =
                if horizontal { ("maxMin", "l", "b", "max") } else { ("minMax", "b", "l", "autoZero") };
            let format = if chart.stacking == Stacking::StackedToTheWhole {
                "<c:numFmt formatCode=\"0%\" sourceLinked=\"0\"/>"
            } else {
                general
            };
            let between = if kind == Kind::Area { "midCat" } else { "between" };
            format!(
                "<c:catAx>{}{general}{ticks}{}<c:crossAx val=\"2\"/><c:crosses val=\"autoZero\"/><c:auto val=\"0\"/>\
                 <c:lblAlgn val=\"ctr\"/><c:lblOffset val=\"100\"/><c:noMultiLvlLbl val=\"1\"/></c:catAx><c:valAx>{}\
                 {gridlines}{format}{ticks}{}<c:crossAx val=\"1\"/><c:crosses val=\"{crosses}\"/><c:crossBetween \
                 val=\"{between}\"/></c:valAx>",
                start(1, orientation, cat_at),
                line("A4A4A4"),
                start(2, "minMax", val_at),
                line("A4A4A4")
            )
        }
    }
}
