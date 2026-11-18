//! The looks of the cells (`styles.xml`): each look a cell has is one of the file's cell formats (`xf`), numbered in
//! the order cells first have it, with its number format, font, fill and border each listed once.
//!
//! A cell's look is its format: its number format (every pattern but General written as one of the file's own, from
//! 164), its font (Arial, 10 by default; white when it has no color of its own and its fill is dark), its fill, the
//! lines around it and how it is aligned (to the top when nothing says otherwise). A text Excel would read as a
//! formula (it starts with `=`, `+` or `-`) is marked to be kept as text (`quotePrefix`). Two looks written the same
//! are two cell formats when one's font is white for its fill and the other's by its own color.

use hashbrown::HashMap;
use std::fmt::Write;

use serde_json::Value as Json;

use super::xml::{attribute, number, DECLARATION};
use crate::ids::LineId;
use crate::workbook::formats::Leaf;
use crate::workbook::rich::Mark;
use crate::workbook::Sheet;

/// The colors the standard ones are, by hue and shade: `FF` and six upper-case hex digits.
pub type StandardColors = HashMap<(String, u64), String>;

/// What a cell looks like.
#[derive(Clone, Debug, Default, PartialEq, Eq, Hash)]
pub struct Look {
    /// Its number format's pattern; `None`: General.
    pattern: Option<String>,
    font: Font,
    /// Its fill's color.
    fill: Option<String>,
    /// The line on each side, left, right, top, bottom: its style and color (`None`: Excel's automatic one).
    borders: [Option<(String, Option<String>)>; 4],
    horizontal: Option<String>,
    vertical: Option<String>,
    pub(super) wrap: bool,
    /// Whether its font is white for its dark fill, having no color of its own: a look apart from one whose font is
    /// white by its own color, though both are written the same.
    is_white_for_its_fill: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
struct Font {
    bold: bool,
    italic: bool,
    strikethrough: bool,
    underline: Option<String>,
    size: u64,
    color: Option<String>,
}

impl Default for Font {
    fn default() -> Font {
        Font { bold: false, italic: false, strikethrough: false, underline: None, size: 10, color: None }
    }
}

impl Font {
    /// The font's elements, its typeface named in `name` (`name` in a font, `rFont` in a run's).
    fn write(&self, out: &mut String, name: &str) {
        if self.bold {
            out.push_str("<b/>");
        }
        if self.italic {
            out.push_str("<i/>");
        }
        if self.strikethrough {
            out.push_str("<strike/>");
        }
        match self.underline.as_deref() {
            Some("double") => out.push_str("<u val=\"double\"/>"),
            Some(_) => out.push_str("<u/>"),
            None => {}
        }
        let _ = write!(out, "<sz val=\"{}\"/>", self.size);
        if let Some(c) = &self.color {
            let _ = write!(out, "<color rgb=\"{c}\"/>");
        }
        let _ = write!(out, "<{name} val=\"Arial\"/><family val=\"2\"/>");
    }
}

impl Look {
    /// The look with the number format a formula brings in place of General.
    pub fn bringing(mut self, pattern: &str) -> Look {
        self.pattern = Some(pattern.to_owned());
        self
    }

    /// The look of a cell, from its format.
    pub fn of(sheet: &Sheet, at: (LineId, LineId), colors: &StandardColors) -> Look {
        Look::from_leaves(|leaf| sheet.formats.get(leaf, at), colors)
    }

    /// The look a format's leaves give.
    pub fn from_leaves<'a>(get: impl Fn(Leaf) -> Option<&'a Json>, colors: &StandardColors) -> Look {
        let mut look = Look::default();
        let color = |leaf| get(leaf).and_then(|v| rgb(v, colors));
        if let Some(pattern) = get(Leaf::NumberFormat).and_then(|v| v.get("pattern")).and_then(Json::as_str) {
            if pattern != "General" {
                look.pattern = Some(pattern.to_owned());
            }
        }
        let text = |leaf| get(leaf).and_then(Json::as_str).map(str::to_owned);
        look.horizontal = text(Leaf::Horizontal).filter(|h| h != "general");
        look.vertical = text(Leaf::Vertical).filter(|v| v != "top");
        let flag = |leaf| get(leaf).and_then(Json::as_bool).unwrap_or(false);
        look.wrap = flag(Leaf::Wrap);
        look.fill = color(Leaf::FillColor);
        let edges = [Leaf::BorderLeft, Leaf::BorderRight, Leaf::BorderTop, Leaf::BorderBottom];
        for (i, leaf) in edges.into_iter().enumerate() {
            let Some(v) = get(leaf) else { continue };
            if v.get("kind").and_then(Json::as_str) != Some("line") {
                continue;
            }
            let style = v.get("style").and_then(Json::as_str).unwrap_or("thin").to_owned();
            look.borders[i] = Some((style, v.get("color").and_then(|c| rgb(c, colors))));
        }
        look.font.bold = flag(Leaf::Bold);
        look.font.italic = flag(Leaf::Italic);
        look.font.strikethrough = flag(Leaf::Strikethrough);
        look.font.underline = text(Leaf::Underline).filter(|u| u != "none");
        look.font.size = get(Leaf::FontSize).and_then(Json::as_u64).unwrap_or(10);
        look.font.color = color(Leaf::FontColor);
        if look.font.color.is_none() && look.fill.as_deref().is_some_and(is_dark) {
            look.font.color = Some("FFFFFFFF".to_owned());
            look.is_white_for_its_fill = true;
        }
        look
    }

    pub fn is_default(&self) -> bool {
        *self == Look::default()
    }

    /// A run's font in a text with looks (`<rPr>`): its cell's, with the run's marks on it. A run underlined in a
    /// cell that is not is underlined once; in one that is, as the cell is.
    pub fn run_properties(&self, marks: &[Mark]) -> String {
        let mut font = self.font.clone();
        font.bold |= marks.contains(&Mark::Bold);
        font.italic |= marks.contains(&Mark::Italic);
        font.strikethrough |= marks.contains(&Mark::Strikethrough);
        if font.underline.is_none() && marks.contains(&Mark::Underline) {
            font.underline = Some("single".to_owned());
        }
        let mut out = String::from("<rPr>");
        font.write(&mut out, "rFont");
        out.push_str("</rPr>");
        out
    }
}

/// A color's `FFRRGGBB`; `None` for no color.
fn rgb(v: &Json, colors: &StandardColors) -> Option<String> {
    match v.get("kind")?.as_str()? {
        "rgb" => Some(format!("FF{}", v.get("hex")?.as_str()?.trim_start_matches('#').to_ascii_uppercase())),
        "standard" => colors.get(&(v.get("hue")?.as_str()?.to_owned(), v.get("shade")?.as_u64()?)).cloned(),
        _ => None,
    }
}

/// Whether white text reads better than black on a fill (`FFRRGGBB`): by their contrast with it, as WCAG weighs it.
fn is_dark(fill: &str) -> bool {
    let channel = |i: usize| {
        let c = u8::from_str_radix(&fill[i..i + 2], 16).unwrap_or(0) as f64 / 255.0;
        if c <= 0.04045 { c / 12.92 } else { ((c + 0.055) / 1.055).powf(2.4) }
    };
    let l = 0.2126 * channel(2) + 0.7152 * channel(4) + 0.0722 * channel(6);
    1.05 / (l + 0.05) > (l + 0.05) / 0.05
}

#[derive(Clone, PartialEq, Eq, Hash)]
struct Xf {
    number_format: usize,
    font: usize,
    fill: usize,
    border: usize,
    horizontal: Option<String>,
    vertical: Option<String>,
    wrap: bool,
    is_white_for_its_fill: bool,
    quote_prefix: bool,
}

/// The file's cell formats, and those they are made of, each in the order first used.
pub struct Styles {
    patterns: Vec<String>,
    fonts: Vec<Font>,
    fills: Vec<Option<String>>,
    borders: Vec<[Option<(String, Option<String>)>; 4]>,
    xfs: Vec<Xf>,
    index: HashMap<Xf, usize>,
}

impl Default for Styles {
    fn default() -> Styles {
        let plain = Xf {
            number_format: 0,
            font: 0,
            fill: 0,
            border: 0,
            horizontal: None,
            vertical: None,
            wrap: false,
            is_white_for_its_fill: false,
            quote_prefix: false,
        };
        Styles {
            patterns: Vec::new(),
            fonts: vec![Font::default()],
            fills: vec![None, None],
            borders: vec![Default::default()],
            index: HashMap::from([(plain.clone(), 0)]),
            xfs: vec![plain],
        }
    }
}

/// The place of an item in a list, added at its end when new.
fn place<T: PartialEq + Clone>(list: &mut Vec<T>, item: &T) -> usize {
    list.iter().position(|x| x == item).unwrap_or_else(|| {
        list.push(item.clone());
        list.len() - 1
    })
}

impl Styles {
    /// The number of a look's cell format (`s`), added when new.
    pub fn xf(&mut self, look: &Look, quote_prefix: bool) -> usize {
        let number_format = match &look.pattern {
            None => 0,
            Some(p) => 164 + place(&mut self.patterns, p),
        };
        let font = place(&mut self.fonts, &look.font);
        let fill = match &look.fill {
            None => 0,
            Some(_) => {
                // The first two fills are Excel's own (none, gray125); their place is never found for a color.
                match self.fills[2..].iter().position(|f| *f == look.fill) {
                    Some(i) => i + 2,
                    None => {
                        self.fills.push(look.fill.clone());
                        self.fills.len() - 1
                    }
                }
            }
        };
        let border = place(&mut self.borders, &look.borders);
        let xf = Xf {
            number_format,
            font,
            fill,
            border,
            horizontal: look.horizontal.clone(),
            vertical: look.vertical.clone(),
            wrap: look.wrap,
            is_white_for_its_fill: look.is_white_for_its_fill,
            quote_prefix,
        };
        if let Some(&i) = self.index.get(&xf) {
            return i;
        }
        self.xfs.push(xf.clone());
        self.index.insert(xf, self.xfs.len() - 1);
        self.xfs.len() - 1
    }

    pub fn part(&self) -> String {
        let mut out = String::from(DECLARATION);
        out.push_str("<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">");
        if !self.patterns.is_empty() {
            let _ = write!(out, "<numFmts count=\"{}\">", self.patterns.len());
            for (i, p) in self.patterns.iter().enumerate() {
                let _ = write!(out, "<numFmt numFmtId=\"{}\" formatCode=\"{}\"/>", 164 + i, attribute(p));
            }
            out.push_str("</numFmts>");
        }
        let _ = write!(out, "<fonts count=\"{}\">", self.fonts.len());
        for f in &self.fonts {
            out.push_str("<font>");
            f.write(&mut out, "name");
            out.push_str("</font>");
        }
        out.push_str("</fonts>");
        let _ = write!(out, "<fills count=\"{}\">", self.fills.len());
        out.push_str(
            "<fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill>",
        );
        for f in &self.fills[2..] {
            let c = f.as_deref().unwrap_or_default();
            let _ = write!(
                out,
                "<fill><patternFill patternType=\"solid\"><fgColor rgb=\"{c}\"/><bgColor indexed=\"64\"/>\
                 </patternFill></fill>"
            );
        }
        out.push_str("</fills>");
        let _ = write!(out, "<borders count=\"{}\">", self.borders.len());
        for b in &self.borders {
            out.push_str("<border>");
            for (side, edge) in ["left", "right", "top", "bottom"].iter().zip(b) {
                match edge {
                    None => {
                        let _ = write!(out, "<{side}/>");
                    }
                    Some((style, Some(color))) => {
                        let _ = write!(out, "<{side} style=\"{style}\"><color rgb=\"{color}\"/></{side}>");
                    }
                    Some((style, None)) => {
                        let _ = write!(out, "<{side} style=\"{style}\"><color auto=\"1\"/></{side}>");
                    }
                }
            }
            out.push_str("<diagonal/></border>");
        }
        out.push_str("</borders>");
        out.push_str(
            "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" \
             applyAlignment=\"1\"><alignment vertical=\"top\"/></xf></cellStyleXfs>",
        );
        let _ = write!(out, "<cellXfs count=\"{}\">", self.xfs.len());
        for x in &self.xfs {
            let _ = write!(
                out,
                "<xf numFmtId=\"{}\" fontId=\"{}\" fillId=\"{}\" borderId=\"{}\" xfId=\"0\" applyNumberFormat=\"1\" \
                 applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\" applyAlignment=\"1\"{}><alignment",
                x.number_format,
                x.font,
                x.fill,
                x.border,
                if x.quote_prefix { " quotePrefix=\"1\"" } else { "" }
            );
            if let Some(h) = &x.horizontal {
                let _ = write!(out, " horizontal=\"{h}\"");
            }
            let _ = write!(out, " vertical=\"{}\"", x.vertical.as_deref().unwrap_or("top"));
            if x.wrap {
                out.push_str(" wrapText=\"1\"");
            }
            out.push_str("/></xf>");
        }
        out.push_str("</cellXfs>");
        out.push_str(
            "<cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>",
        );
        out
    }
}

/// A width in pixels as Excel's (characters of a 7-pixel digit), at most 255; and whether it was cut.
pub fn width(pixels: u32) -> (String, bool) {
    let w = pixels as f64 / 7.0;
    if w > 255.0 { ("255".into(), true) } else { (number(w), false) }
}

/// A height in pixels as Excel's (points), at most 409.5; and whether it was cut.
pub fn height(pixels: u32) -> (String, bool) {
    let h = pixels as f64 * 0.75;
    if h > 409.5 { ("409.5".into(), true) } else { (number(h), false) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dark_fills() {
        assert!(is_dark("FF757575"));
        assert!(!is_dark("FF767676"));
        assert!(is_dark("FF102030"));
        assert!(!is_dark("FFCDE2FB"));
    }
}
