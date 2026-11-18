//! Groups of rows or columns: made, taken away, collapsed and opened, shown to a depth, and lines hidden (a hidden
//! stretch of lines is a collapsed group).
//!
//! Groups are worked out as the page shows them (`groups_contents`): where their ends are now, outer ones first,
//! each with its depth; a group with no lines left, or that crosses the end of one it starts in, is not shown and
//! is passed over. A line is in sight when no collapsed group holds it.
//!
//! Groups made are checked only against groups that are well: when one is written last line first, crosses another,
//! or they nest too deep already, any group is made, and no edit is refused for leaving no line in sight.

use hashbrown::HashMap;

use super::{Lines, DEEPEST_GROUP};
use crate::ids::Bases;
use crate::session::edits::Refused;
use crate::workbook::layout::{EndsOfGroup, GroupPatch, GroupToSet};
use crate::workbook::{Sheet, Workbook};

/// A group as it is shown: its id, the positions of its first and last lines, whether it is collapsed, its depth.
#[derive(Clone, Debug)]
pub struct Shown {
    pub id: String,
    pub first: usize,
    pub last: usize,
    pub is_collapsed: bool,
    pub depth: usize,
    /// Whether its ends are written last line first.
    pub is_reversed: bool,
}

impl Shown {
    fn holds(&self, first: usize, last: usize) -> bool {
        self.first <= first && last <= self.last
    }
}

/// The groups of an axis as they are shown, outer ones first.
pub fn shown(bases: &Bases, sheet: &Sheet, lines: Lines) -> Vec<Shown> {
    nest(live(bases, sheet, lines))
}

/// The groups of an axis with lines left, where their ends are now, in order: by first line, the longer first.
pub fn live(bases: &Bases, sheet: &Sheet, lines: Lines) -> Vec<Shown> {
    let axis = lines.axis(sheet);
    let mut live: Vec<Shown> = lines
        .groups(sheet)
        .values()
        .filter_map(|(id, g)| {
            let (a, b) = (bases.parse(&g.ends.first)?, bases.parse(&g.ends.last)?);
            let (pa, pb) = (axis.snap_toward(a, b)?, axis.snap_toward(b, a)?);
            let (first, last, is_reversed) = (pa.min(pb), pa.max(pb), pa > pb);
            Some(Shown { id: id.clone(), first, last, is_collapsed: g.is_collapsed, depth: 0, is_reversed })
        })
        .collect();
    live.sort_by(|a, b| a.first.cmp(&b.first).then(b.last.cmp(&a.last)));
    live
}

/// Groups in order (by first line, the longer first) with their depths; one that crosses the end of the one it
/// starts in is left out.
fn nest(groups: Vec<Shown>) -> Vec<Shown> {
    let mut open: Vec<usize> = Vec::new();
    let mut out = Vec::with_capacity(groups.len());
    for mut g in groups {
        while open.last().is_some_and(|&end| end < g.first) {
            open.pop();
        }
        if open.last().is_some_and(|&end| end < g.last) {
            continue;
        }
        open.push(g.last);
        g.depth = open.len();
        out.push(g);
    }
    out
}

/// Groups (in order) with more, each `first` to `last` and open, in order.
fn with(groups: &[Shown], added: &[(usize, usize)]) -> Vec<Shown> {
    let mut all: Vec<Shown> = groups.to_vec();
    all.extend(added.iter().map(|&(first, last)| Shown {
        id: String::new(),
        first,
        last,
        is_collapsed: false,
        depth: 0,
        is_reversed: false,
    }));
    all.sort_by(|a, b| a.first.cmp(&b.first).then(b.last.cmp(&a.last)));
    all
}

/// What is wrong with groups (in order), if anything: one written last line first, or that crosses another
/// (`groupsPartlyOverlap`), or groups nested too deep (`groupsTooDeep`).
fn fault(groups: &[Shown]) -> Option<&'static str> {
    let nested = nest(groups.to_vec());
    if groups.iter().any(|g| g.is_reversed) || nested.len() < groups.len() {
        return Some("groupsPartlyOverlap");
    }
    nested.iter().any(|g| g.depth > DEEPEST_GROUP).then_some("groupsTooDeep")
}

/// Refuses groups added when they would spoil groups that are well: ones that are not already (written last line
/// first, crossing or too deep) take any.
fn check_added(live: &[Shown], added: &[(usize, usize)]) -> Result<(), Refused> {
    match fault(live) {
        Some(_) => Ok(()),
        None => fault(&with(live, added)).map_or(Ok(()), |why| Err(Refused::Because(why))),
    }
}

/// Which lines of an axis of `len` lines are in sight, with groups collapsed as given.
fn in_sight(len: usize, groups: &[Shown], collapsed: &HashMap<&str, bool>) -> Vec<bool> {
    let mut sight = vec![true; len];
    for g in groups {
        if *collapsed.get(g.id.as_str()).unwrap_or(&g.is_collapsed) {
            sight[g.first..=g.last.min(len - 1)].iter_mut().for_each(|s| *s = false);
        }
    }
    sight
}

/// Whether any line of an axis is in sight.
pub fn is_any_in_sight(bases: &Bases, sheet: &Sheet, lines: Lines) -> bool {
    in_sight(lines.axis(sheet).len(), &shown(bases, sheet, lines), &HashMap::new()).contains(&true)
}

/// Whether an edit after which no line of the axis is in sight (unless `is_any_left`) is refused for it: when a line
/// is in sight now, and the groups are well now (when they are not, it is not asked).
pub fn leaves_none_in_sight(bases: &Bases, sheet: &Sheet, lines: Lines, is_any_left: bool) -> bool {
    !is_any_left && fault(&live(bases, sheet, lines)).is_none() && is_any_in_sight(bases, sheet, lines)
}

/// The lines in sight among these spans, from the first to the last; `None` when none is.
fn in_sight_of(sight: &[bool], spans: impl Iterator<Item = (usize, usize)>) -> Option<(usize, usize)> {
    let mut out: Option<(usize, usize)> = None;
    for (first, last) in spans {
        for (p, _) in sight.iter().enumerate().take(last + 1).skip(first).filter(|(_, s)| **s) {
            out = Some(out.map_or((p, p), |(a, b)| (a.min(p), b.max(p))));
        }
    }
    out
}

/// What a group edit made: the groups set, and the lines it shows (the sheet when `None`).
pub struct Grouped {
    pub groups: Vec<GroupToSet>,
    pub shows: Option<(usize, usize)>,
}

fn ends(workbook: &Workbook, sheet: &Sheet, lines: Lines, first: usize, last: usize) -> EndsOfGroup {
    let axis = lines.axis(sheet);
    let id = |p: usize| workbook.bases.text(axis.line(p).expect("a live position"));
    EndsOfGroup { first: id(first), last: id(last) }
}

/// A new group from `first` to `last`, open; nothing when one is there already.
pub fn group(workbook: &Workbook, sheet: &Sheet, lines: Lines, (first, last): (usize, usize), code: &str)
    -> Result<Grouped, Refused> {
    let live = live(&workbook.bases, sheet, lines);
    if nest(live.clone()).iter().any(|g| g.first == first && g.last == last) {
        return Ok(Grouped { groups: Vec::new(), shows: None });
    }
    check_added(&live, &[(first, last)])?;
    // What it shows is worked out with it there: a group it crosses is not shown then.
    let sight = in_sight(lines.axis(sheet).len(), &nest(with(&live, &[(first, last)])), &HashMap::new());
    let group = GroupToSet {
        group_id: format!("{}_{code}.0", lines.group_prefix()),
        group: Some(GroupPatch { ends: Some(ends(workbook, sheet, lines, first, last)), is_collapsed: Some(false) }),
    };
    Ok(Grouped { groups: vec![group], shows: in_sight_of(&sight, std::iter::once((first, last))) })
}

/// Takes away the deepest group that holds the lines from `first` to `last`; when none does, the groups among
/// them (the outer ones).
pub fn ungroup(workbook: &Workbook, sheet: &Sheet, lines: Lines, (first, last): (usize, usize)) -> Vec<GroupToSet> {
    let groups = shown(&workbook.bases, sheet, lines);
    let taken: Vec<&Shown> = match groups.iter().filter(|g| g.holds(first, last)).max_by_key(|g| g.depth) {
        Some(g) => vec![g],
        None => {
            let inside: Vec<&Shown> = groups.iter().filter(|g| first <= g.first && g.last <= last).collect();
            let is_outer = |g: &&Shown| !inside.iter().any(|o| o.depth < g.depth && o.holds(g.first, g.last));
            inside.iter().filter(|g| is_outer(g)).copied().collect()
        }
    };
    taken.into_iter().map(|g| GroupToSet { group_id: g.id.clone(), group: None }).collect()
}

/// Hides stretches of lines (in order, each from its first to its last): each, cut where a group starts or ends
/// inside it, is a collapsed group, the one there already or a new one.
pub fn hide(workbook: &Workbook, sheet: &Sheet, lines: Lines, stretches: &[(usize, usize)], code: &str)
    -> Result<Vec<GroupToSet>, Refused> {
    let groups = shown(&workbook.bases, sheet, lines);
    let mut pieces: Vec<(usize, usize)> = Vec::new();
    for &(first, last) in stretches {
        let mut cuts: Vec<usize> = Vec::new();
        for g in &groups {
            if first < g.first && g.first <= last && last < g.last {
                cuts.push(g.first);
            }
            if g.first < first && first <= g.last && g.last < last {
                cuts.push(g.last + 1);
            }
        }
        cuts.sort_unstable();
        cuts.dedup();
        let mut start = first;
        for cut in cuts {
            pieces.push((start, cut - 1));
            start = cut;
        }
        pieces.push((start, last));
    }
    let mut set = Vec::new();
    let mut added = Vec::new();
    let mut collapsed: HashMap<&str, bool> = HashMap::new();
    for &(first, last) in &pieces {
        match groups.iter().find(|g| g.first == first && g.last == last) {
            Some(g) if g.is_collapsed => {}
            Some(g) => {
                collapsed.insert(&g.id, true);
                let patch = GroupPatch { ends: None, is_collapsed: Some(true) };
                set.push(GroupToSet { group_id: g.id.clone(), group: Some(patch) });
            }
            None => {
                let group_id = format!("{}_{code}.{}", lines.group_prefix(), added.len());
                added.push((first, last));
                let ends = Some(ends(workbook, sheet, lines, first, last));
                set.push(GroupToSet { group_id, group: Some(GroupPatch { ends, is_collapsed: Some(true) }) });
            }
        }
    }
    check_added(&live(&workbook.bases, sheet, lines), &added)?;
    let mut sight = in_sight(lines.axis(sheet).len(), &groups, &collapsed);
    for &(first, last) in &added {
        sight[first..=last].iter_mut().for_each(|s| *s = false);
    }
    if leaves_none_in_sight(&workbook.bases, sheet, lines, sight.contains(&true)) {
        return Err(Refused::Because("nothingLeftInSight"));
    }
    Ok(set)
}

/// Collapses or opens groups, as they are wanted: `want` says of each shown group whether it is to be collapsed
/// (`None`: as it is). The groups changed are set in the order shown, or by id. Opening shows the lines of the
/// groups opened that come into sight.
pub fn collapse(
    workbook: &Workbook,
    sheet: &Sheet,
    lines: Lines,
    by_id: bool,
    want: impl Fn(&Shown) -> Option<bool>,
) -> Result<Grouped, Refused> {
    let groups = shown(&workbook.bases, sheet, lines);
    let mut changed: Vec<(bool, &Shown)> =
        groups.iter().filter_map(|g| Some((want(g).filter(|c| *c != g.is_collapsed)?, g))).collect();
    if by_id {
        changed.sort_by(|a, b| a.1.id.cmp(&b.1.id));
    }
    let collapsed: HashMap<&str, bool> = changed.iter().map(|(c, g)| (g.id.as_str(), *c)).collect();
    let sight = in_sight(lines.axis(sheet).len(), &groups, &collapsed);
    if !changed.is_empty() && leaves_none_in_sight(&workbook.bases, sheet, lines, sight.contains(&true)) {
        return Err(Refused::Because("nothingLeftInSight"));
    }
    let shows = in_sight_of(&sight, changed.iter().filter(|(c, _)| !c).map(|(_, g)| (g.first, g.last)));
    let set = |(c, g): (bool, &Shown)| GroupToSet {
        group_id: g.id.clone(),
        group: Some(GroupPatch { ends: None, is_collapsed: Some(c) }),
    };
    let groups = changed.into_iter().map(set).collect();
    Ok(Grouped { groups, shows })
}
