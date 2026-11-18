//! What a cell holds besides a number, a text, a boolean, a formula or a dropdown's option: the people it names
//! (`user`, `users`), and text with looks (`richText`: paragraphs of runs, each run bold, italic, underlined or
//! struck through, and perhaps a link).
//!
//! A cell reads as text: a person's label, the labels of several joined by `, `, the runs of text with looks one
//! after another, its paragraphs on lines of their own.
//!
//! A paragraph may be a line of a list: bulleted, numbered or of checkboxes, at a level 0 to 7 as read. A cell keeps
//! it at most 2 deep and at most one deeper than the line above it (`kept_levels`); an operation may not name a line
//! more than one deeper than the line above it, as given, nor a first line, or one under a line of no list, deeper
//! than 0. A numbered line is numbered on from the last numbered line at its level, unless a line of another kind at
//! that level, a line less deep or a line of no list came between (`numbers`).
//!
//! An operation that sets such an input is read strictly (`is_well_formed`, else `unreadableRequest`): a person's id
//! is `u_` and 22 letters, digits or `_`, a label is not empty, several people are two or more, none named twice;
//! text with looks has a paragraph, a run is not empty and holds no line break, its marks are each named once and
//! in order (bold, italic, underline, strikethrough), a link is not empty, two runs next to each other do not look
//! alike, no mark covers all of the text, and something about it is rich (a mark or a link): text that is not is
//! plain text.

use serde::{Deserialize, Serialize};

/// A person a cell names: their id, and how the cell writes them.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Person {
    pub user_id: String,
    pub label: String,
}

/// A paragraph of text with looks.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Paragraph {
    pub list: List,
    pub runs: Vec<Run>,
}

/// What list a paragraph is in: none, or a line of one at a level.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", from = "ListRead")]
pub enum List {
    None,
    Bullet { level: Level },
    Numbered { level: Level },
    #[serde(rename_all = "camelCase")]
    Checkbox { level: Level, is_checked: bool },
}

/// A line of a list as read: a field more refuses it, `{"kind":"none","level":0}` too.
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum ListRead {
    None {},
    Bullet { level: Level },
    Numbered { level: Level },
    #[serde(rename_all = "camelCase")]
    Checkbox { level: Level, is_checked: bool },
}

impl From<ListRead> for List {
    fn from(list: ListRead) -> List {
        match list {
            ListRead::None {} => List::None,
            ListRead::Bullet { level } => List::Bullet { level },
            ListRead::Numbered { level } => List::Numbered { level },
            ListRead::Checkbox { level, is_checked } => List::Checkbox { level, is_checked },
        }
    }
}

/// How deep a line of a list lies: 0 to 7 as read (more is not read).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(try_from = "u8", into = "u8")]
pub struct Level(u8);

/// The deepest level read.
const DEEPEST_READ: u8 = 7;
/// The deepest level a cell keeps (`limits.deepestLevelOfAListLine`).
const DEEPEST_KEPT: u8 = 2;

impl TryFrom<u8> for Level {
    type Error = &'static str;
    fn try_from(level: u8) -> Result<Level, &'static str> {
        if level <= DEEPEST_READ { Ok(Level(level)) } else { Err("a level too deep") }
    }
}

impl From<Level> for u8 {
    fn from(level: Level) -> u8 {
        level.0
    }
}

impl List {
    /// The line's level, when it is a line of a list.
    pub fn level(self) -> Option<u8> {
        match self {
            List::None => None,
            List::Bullet { level } | List::Numbered { level } | List::Checkbox { level, .. } => Some(level.0),
        }
    }

    /// The same line at another level.
    fn at(self, level: u8) -> List {
        let level = Level(level);
        match self {
            List::None => List::None,
            List::Bullet { .. } => List::Bullet { level },
            List::Numbered { .. } => List::Numbered { level },
            List::Checkbox { is_checked, .. } => List::Checkbox { level, is_checked },
        }
    }
}

/// Lines of lists put as a cell keeps them, each level first taken as at most 2. The lines above a line that are still
/// open are those not followed by a line less deep: a line as deep as an open one is kept as deep as it; a line deeper
/// than the deepest open line less deep than it is kept one deeper than that line; a line with none such lies 0 deep,
/// as a first line and one under a line of no list do (found by probing `readListLinesAsKept`: after lines at 0, 3
/// and 4, kept at 0, 1 and 1, a line at 2 is kept at 1).
pub fn kept_lists(lists: &mut [List]) {
    // The open lines, the shallowest first: their levels as taken, and as kept.
    let mut open: Vec<(u8, u8)> = Vec::new();
    for list in lists {
        let Some(level) = list.level() else {
            open.clear();
            continue;
        };
        let level = level.min(DEEPEST_KEPT);
        while open.last().is_some_and(|&(given, _)| given > level) {
            open.pop();
        }
        let kept = match open.last() {
            Some(&(given, kept)) if given == level => {
                open.pop();
                kept
            }
            Some(&(_, kept)) => kept + 1,
            None => 0,
        };
        open.push((level, kept));
        *list = list.at(kept);
    }
}

/// The paragraphs' lines of lists put as a cell keeps them (`kept_lists`).
pub fn kept_levels(paragraphs: &mut [Paragraph]) {
    let mut lists: Vec<List> = paragraphs.iter().map(|p| p.list).collect();
    kept_lists(&mut lists);
    for (paragraph, list) in paragraphs.iter_mut().zip(lists) {
        paragraph.list = list;
    }
}

/// The number of each line of lists as kept: a numbered line's, on from the last numbered line at its level unless a
/// line of another kind at that level, a line less deep or a line of no list came between; none for other lines.
pub fn numbers(lists: &[List]) -> Vec<Option<u32>> {
    // At each level down to the line's: the number of the last numbered line there, or none after another kind.
    let mut open: Vec<Option<u32>> = Vec::new();
    lists
        .iter()
        .map(|list| {
            let Some(level) = list.level() else {
                open.clear();
                return None;
            };
            let level = usize::from(level);
            open.truncate(level + 1);
            let number = matches!(list, List::Numbered { .. })
                .then(|| open.get(level).copied().flatten().map_or(1, |n| n + 1));
            if open.len() <= level {
                open.resize(level + 1, None);
            }
            open[level] = number;
            number
        })
        .collect()
}

/// The numbers of the paragraphs' lines (`numbers`), when one of them is a numbered line.
pub fn numbers_of_lines(paragraphs: &[Paragraph]) -> Option<Vec<Option<u32>>> {
    let lists: Vec<List> = paragraphs.iter().map(|p| p.list).collect();
    lists.iter().any(|l| matches!(l, List::Numbered { .. })).then(|| numbers(&lists))
}

/// What each paragraph is written after where lists can't be kept (an .xlsx file): four spaces a level, then `• `
/// for a bullet, its number and `. ` for a numbered line, `☑ ` or `☐ ` for a checkbox; nothing for a line of no list.
/// `None` when no paragraph is a line of a list.
pub fn list_prefixes(paragraphs: &[Paragraph]) -> Option<Vec<String>> {
    if paragraphs.iter().all(|p| p.list == List::None) {
        return None;
    }
    let lists: Vec<List> = paragraphs.iter().map(|p| p.list).collect();
    let numbers = numbers(&lists);
    let prefix = |(list, number): (&List, Option<u32>)| {
        let indent = "    ".repeat(list.level().unwrap_or(0) as usize);
        match list {
            List::None => String::new(),
            List::Bullet { .. } => format!("{indent}• "),
            List::Numbered { .. } => format!("{indent}{}. ", number.unwrap_or(1)),
            List::Checkbox { is_checked: true, .. } => format!("{indent}☑ "),
            List::Checkbox { is_checked: false, .. } => format!("{indent}☐ "),
        }
    };
    Some(lists.iter().zip(numbers).map(prefix).collect())
}

/// Whether a line of the paragraphs lies more than one deeper than the line above it, as given (a first line, and one
/// under a line of no list, deeper than 0).
fn is_a_line_too_deep(paragraphs: &[Paragraph]) -> bool {
    let mut above: Option<u8> = None;
    paragraphs.iter().any(|p| {
        let level = p.list.level();
        let too_deep = level.is_some_and(|l| l > above.map_or(0, |a| a + 1));
        above = level;
        too_deep
    })
}

/// A run of text that looks one way.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Run {
    pub text: String,
    pub marks: Vec<Mark>,
    pub link: Option<String>,
}

/// A look of a run, in the order a run names them.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Mark {
    Bold,
    Italic,
    Underline,
    Strikethrough,
}

impl Mark {
    pub const ALL: [Mark; 4] = [Mark::Bold, Mark::Italic, Mark::Underline, Mark::Strikethrough];

    /// The mark's leaf in a cell's font format.
    pub fn font_leaf(self) -> &'static str {
        match self {
            Mark::Bold => "bold",
            Mark::Italic => "italic",
            Mark::Underline => "underline",
            Mark::Strikethrough => "strikethrough",
        }
    }
}

/// Whether a person's id is one: `u_` and 22 letters, digits or `_`.
pub fn is_user_id(id: &str) -> bool {
    id.len() == 24 && id.starts_with("u_") && id[2..].bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
}

/// Whether one person is set so that it reads.
pub fn is_person(person: &Person) -> bool {
    is_user_id(&person.user_id) && !person.label.is_empty()
}

/// Whether several people are set so that they read: two or more, none twice.
pub fn are_people(people: &[Person]) -> bool {
    people.len() >= 2
        && people.iter().all(is_person)
        && people.iter().enumerate().all(|(i, p)| people[..i].iter().all(|q| q.user_id != p.user_id))
}

/// The text of text with looks: its runs one after another, its paragraphs on lines of their own.
pub fn plain_text(paragraphs: &[Paragraph]) -> String {
    let lines: Vec<String> = paragraphs.iter().map(|p| p.runs.iter().map(|r| r.text.as_str()).collect()).collect();
    lines.join("\n")
}

/// The labels of several people, as the cell reads.
pub fn labels(people: &[Person]) -> String {
    people.iter().map(|p| p.label.as_str()).collect::<Vec<_>>().join(", ")
}

/// Why text with looks is not as it must be kept, if it is not (the refusal's name).
pub fn fault(paragraphs: &[Paragraph]) -> Option<&'static str> {
    if paragraphs.is_empty() {
        return Some("richTextHasNoParagraph");
    }
    if paragraphs.len() == 1 && paragraphs[0].runs.is_empty() {
        return Some("richTextHasNoParagraph");
    }
    if is_a_line_too_deep(paragraphs) {
        return Some("richTextListLineTooDeep");
    }
    let runs = || paragraphs.iter().flat_map(|p| p.runs.iter());
    for run in runs() {
        if run.text.is_empty() {
            return Some("richTextRunIsEmpty");
        }
        if run.text.contains('\n') {
            return Some("richTextRunHoldsLineBreak");
        }
        if run.marks.windows(2).any(|w| w[0] >= w[1]) {
            return Some("richTextMarksOutOfOrder");
        }
        if run.link.as_deref() == Some("") {
            return Some("richTextLinkHasNoAddress");
        }
    }
    for paragraph in paragraphs {
        if paragraph.runs.windows(2).any(|w| w[0].marks == w[1].marks && w[0].link == w[1].link) {
            return Some("richTextNeighborsLookAlike");
        }
    }
    if Mark::ALL.iter().any(|m| runs().all(|r| r.marks.contains(m))) {
        return Some("richTextMarkCoversAllOfTheText");
    }
    let is_any_list = paragraphs.iter().any(|p| p.list != List::None);
    if !is_any_list && runs().all(|r| r.marks.is_empty() && r.link.is_none()) {
        return Some("richTextHasNothingRich");
    }
    None
}
