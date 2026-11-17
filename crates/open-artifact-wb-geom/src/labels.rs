//! Arrow heads and label placement.
//!
//! Words are measured in TypeScript (by the page, or by an estimate); this
//! module gets their widths and returns wrapped lines as word ranges.

use crate::js;
use crate::routing::{self, Pt, RouteBox};

pub const ARROW_LABEL_HEIGHT: f64 = 16.0;
pub const ARROW_LABEL_HALO_WIDTH: f64 = 10.0;
pub const ARROW_LABEL_GAP: f64 = 6.0;
pub const ARROW_LABEL_END_MARGIN: f64 = 12.0;
pub const ARROW_LABEL_HEAD_MARGIN: f64 = 5.0;
pub const ARROW_LABEL_STROKE_CLEARANCE: f64 = 1.75;
pub const ARROW_HEAD_LENGTH: f64 = 11.0;
pub const ARROW_HEAD_SPREAD: f64 = 0.55;
pub const ARROW_CIRCLE_RADIUS: f64 = 5.0;
pub const ARROW_LABEL_LINE_HEIGHT: f64 = 18.0;
pub const ARROW_LABEL_MAX_LINES: usize = 3;
pub const ARROW_LABEL_GAP_PAD: f64 = 2.0;
/// `COORDINATE_LIMIT` of the schema.
pub const COORDINATE_LIMIT: f64 = 1e6;

/// An arrow head: `none`, `arrow`, or a circle (any other kind).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Head {
    None,
    Arrow,
    Circle,
}

impl Head {
    pub fn from_code(code: u8) -> Head {
        match code {
            0 => Head::None,
            1 => Head::Arrow,
            _ => Head::Circle,
        }
    }
}

/// A label's measured words: their widths (`widths[i]` for word i, which
/// may be missing) and the width of a space.
#[derive(Clone, Debug, PartialEq)]
pub struct Measure {
    pub word_count: usize,
    pub widths: Vec<f64>,
    pub space: f64,
}

/// A wrapped line: words `start..end` and its width.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Line {
    pub start: usize,
    pub end: usize,
    pub w: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Placed {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub on_line: bool,
    /// Lines as word ranges.
    pub lines: Vec<(usize, usize)>,
}

/// An arrow's line as `ArrowGeometry` carries it.
#[derive(Clone, Debug, PartialEq)]
pub struct LineGeom {
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub elbow: Option<Vec<Pt>>,
    pub bent: bool,
}

/// `routeLabelSegment` threw (an elbow with fewer than two points).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct EmptyRoute;

type Segment = (Pt, Pt);

/* -------------------------------------------------------------------------- */
/* Heads and caps                                                              */
/* -------------------------------------------------------------------------- */

fn or_one(x: f64) -> f64 {
    if js::truthy(x) { x } else { 1.0 }
}

pub fn arrow_circle_center(tip_x: f64, tip_y: f64, from_x: f64, from_y: f64) -> Pt {
    let distance = or_one(js::hypot2(tip_x - from_x, tip_y - from_y));
    [tip_x - ((tip_x - from_x) / distance) * ARROW_CIRCLE_RADIUS, tip_y - ((tip_y - from_y) / distance) * ARROW_CIRCLE_RADIUS]
}

/// The two wing tips of an arrow head, then the midpoints of each wing.
pub fn arrow_head_points(tip_x: f64, tip_y: f64, from_x: f64, from_y: f64) -> [Pt; 4] {
    let dx = tip_x - from_x;
    let dy = tip_y - from_y;
    let distance = or_one(js::hypot2(dx, dy));
    let ux = dx / distance;
    let uy = dy / distance;
    let half_width = ARROW_HEAD_LENGTH * ARROW_HEAD_SPREAD;
    let wings = [
        [tip_x - ux * ARROW_HEAD_LENGTH - uy * half_width, tip_y - uy * ARROW_HEAD_LENGTH + ux * half_width],
        [tip_x - ux * ARROW_HEAD_LENGTH + uy * half_width, tip_y - uy * ARROW_HEAD_LENGTH - ux * half_width],
    ];
    [wings[0], wings[1], [(wings[0][0] + tip_x) / 2.0, (wings[0][1] + tip_y) / 2.0], [(wings[1][0] + tip_x) / 2.0, (wings[1][1] + tip_y) / 2.0]]
}

pub fn arrow_end_cap_points(kind: Head, tip_x: f64, tip_y: f64, from_x: f64, from_y: f64) -> Vec<Pt> {
    match kind {
        Head::Arrow => arrow_head_points(tip_x, tip_y, from_x, from_y).to_vec(),
        Head::None => Vec::new(),
        Head::Circle => {
            let center = arrow_circle_center(tip_x, tip_y, from_x, from_y);
            let radius = ARROW_CIRCLE_RADIUS / js::cos(core::f64::consts::PI / 8.0);
            (0..8)
                .map(|index| {
                    let angle = (index as f64 * core::f64::consts::PI) / 4.0;
                    [center[0] + radius * js::cos(angle), center[1] + radius * js::sin(angle)]
                })
                .collect()
        }
    }
}

pub fn arrow_end_cap_segments(kind: Head, tip: Pt, from: Pt) -> Vec<Segment> {
    if kind == Head::Arrow {
        let wings = arrow_head_points(tip[0], tip[1], from[0], from[1]);
        return vec![(tip, wings[0]), (tip, wings[1])];
    }
    let points = arrow_end_cap_points(kind, tip[0], tip[1], from[0], from[1]);
    (0..points.len()).map(|index| (points[index], points[(index + 1) % points.len()])).collect()
}

/* -------------------------------------------------------------------------- */
/* Wrapping                                                                    */
/* -------------------------------------------------------------------------- */

pub fn wrap_label_words(measure: &Measure, max_width: f64) -> Vec<Line> {
    let mut lines: Vec<Line> = Vec::new();
    for index in 0..measure.word_count {
        let width = measure.widths.get(index).copied().unwrap_or(0.0);
        match lines.last_mut() {
            Some(last) if last.w + measure.space + width <= max_width => {
                last.end = index + 1;
                last.w += measure.space + width;
            }
            _ => lines.push(Line { start: index, end: index + 1, w: width }),
        }
    }
    lines
}

pub fn measured_text_width(measure: &Measure) -> f64 {
    measure.widths.iter().fold(0.0, |sum, width| sum + width) + measure.space * js::max(0.0, measure.word_count as f64 - 1.0)
}

/* -------------------------------------------------------------------------- */
/* Placement                                                                   */
/* -------------------------------------------------------------------------- */

fn label_segment(points: &[Pt]) -> Result<routing::RouteLabelSegment, EmptyRoute> {
    routing::route_label_segment(points).ok_or(EmptyRoute)
}

fn arrow_midpoint(line: &LineGeom) -> Result<Pt, EmptyRoute> {
    match &line.elbow {
        None => Ok([(line.x1 + line.x2) / 2.0, (line.y1 + line.y2) / 2.0]),
        Some(elbow) => {
            let middle = label_segment(elbow)?;
            Ok([(middle.a[0] + middle.b[0]) / 2.0, (middle.a[1] + middle.b[1]) / 2.0])
        }
    }
}

pub fn segment_intersects_box(x1: f64, y1: f64, x2: f64, y2: f64, b: &RouteBox) -> bool {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let mut t_min = 0.0;
    let mut t_max = 1.0;
    for (direction, distance) in [(-dx, x1 - b.x), (dx, b.x + b.w - x1), (-dy, y1 - b.y), (dy, b.y + b.h - y1)] {
        if direction == 0.0 {
            if distance < 0.0 {
                return false;
            }
            continue;
        }
        let t = distance / direction;
        if direction < 0.0 {
            t_min = js::max(t_min, t);
        } else {
            t_max = js::min(t_max, t);
        }
        if t_min > t_max {
            return false;
        }
    }
    true
}

/// `placeArrowLabel` for a line that is not an elbow of three or more points
/// (TypeScript sends those to the cached elbow placement).
pub fn place_straight_arrow_label(line: &LineGeom, heads: [Head; 2], measure: &Measure, end_boxes: [Option<RouteBox>; 2]) -> Result<Placed, EmptyRoute> {
    let whole = (0, measure.word_count);
    let text_width = measured_text_width(measure);
    let mid = arrow_midpoint(line)?;
    let dx = line.x2 - line.x1;
    let dy = line.y2 - line.y1;
    let line_length = or_one(js::hypot2(dx, dy));
    let cos_x = dx.abs() / line_length;
    let sin_y = dy.abs() / line_length;
    let label_span = js::min(
        if cos_x > 0.000001 { (text_width + ARROW_LABEL_HALO_WIDTH) / cos_x } else { f64::INFINITY },
        if sin_y > 0.000001 { (ARROW_LABEL_HEIGHT + ARROW_LABEL_HALO_WIDTH) / sin_y } else { f64::INFINITY },
    );
    let end_margin = if heads[0] == Head::None && heads[1] == Head::None { ARROW_LABEL_END_MARGIN } else { ARROW_HEAD_LENGTH + ARROW_LABEL_HEAD_MARGIN };
    if (line_length - label_span) / 2.0 >= end_margin {
        return Ok(Placed { x: mid[0] - text_width / 2.0, y: mid[1] - ARROW_LABEL_HEIGHT / 2.0, w: text_width, h: ARROW_LABEL_HEIGHT, on_line: true, lines: vec![whole] });
    }
    let mut lines = vec![Line { start: whole.0, end: whole.1, w: text_width }];
    let mid_x = (line.x1 + line.x2) / 2.0;
    let mid_y = (line.y1 + line.y2) / 2.0;
    let mut gap_center_x: Option<f64> = None;
    if let [Some(from_box), Some(to_box)] = end_boxes {
        if measure.word_count > 1 && dx.abs() >= dy.abs() {
            let gap_left = js::min(from_box.x + from_box.w, to_box.x + to_box.w);
            let gap_width = js::max(from_box.x, to_box.x) - gap_left;
            let wrap_width = js::max_of(std::iter::once(gap_width - 2.0 * ARROW_LABEL_GAP_PAD).chain(measure.widths.iter().copied()));
            if gap_width > 0.0 && text_width > wrap_width {
                let wrapped = wrap_label_words(measure, wrap_width);
                let top = mid_y + ARROW_LABEL_STROKE_CLEARANCE + ARROW_LABEL_GAP;
                if wrapped.len() <= ARROW_LABEL_MAX_LINES && top < js::min(from_box.y + from_box.h, to_box.y + to_box.h) {
                    lines = wrapped;
                    gap_center_x = Some(gap_left + gap_width / 2.0);
                }
            }
        }
    }
    let label_w = js::max_of(lines.iter().map(|line| line.w));
    let label_h = if lines.len() == 1 { ARROW_LABEL_HEIGHT } else { lines.len() as f64 * ARROW_LABEL_LINE_HEIGHT };
    let mut obstacles: Vec<Pt> = (0..=32).map(|index| [line.x1 + (dx * index as f64) / 32.0, line.y1 + (dy * index as f64) / 32.0]).collect();
    obstacles.extend(arrow_end_cap_points(heads[1], line.x2, line.y2, line.x1, line.y1));
    obstacles.extend(arrow_end_cap_points(heads[0], line.x1, line.y1, line.x2, line.y2));
    let mut normal_x = -dy / line_length;
    let mut normal_y = dx / line_length;
    if if dx.abs() >= dy.abs() { normal_y < 0.0 } else { normal_x < 0.0 } {
        normal_x = -normal_x;
        normal_y = -normal_y;
    }
    if gap_center_x.is_some() || (dx == 0.0 && dy == 0.0) {
        normal_x = 0.0;
        normal_y = 1.0;
    }
    let clearance = ARROW_LABEL_STROKE_CLEARANCE + ARROW_LABEL_GAP;
    let center_x = gap_center_x.unwrap_or(mid_x);
    let box_at = |distance: f64| RouteBox { x: center_x + normal_x * distance - label_w / 2.0, y: mid_y + normal_y * distance - label_h / 2.0, w: label_w, h: label_h };
    let is_clear = |distance: f64| -> bool {
        let b = box_at(distance);
        obstacles.iter().all(|p| {
            js::hypot2(js::max_of([b.x - p[0], 0.0, p[0] - b.x - b.w]), js::max_of([b.y - p[1], 0.0, p[1] - b.y - b.h])) >= clearance
        })
    };
    let mut offset = (label_h / 2.0) * normal_y.abs() + (label_w / 2.0) * normal_x.abs();
    if is_clear(offset) {
        let mut blocked = 0.0;
        for _ in 0..12 {
            let candidate = (blocked + offset) / 2.0;
            if is_clear(candidate) {
                offset = candidate;
            } else {
                blocked = candidate;
            }
        }
    } else {
        let limit = offset + 48.0;
        while !is_clear(offset) && offset < limit {
            offset += 0.5;
        }
    }
    let b = box_at(offset);
    Ok(Placed { x: b.x, y: b.y, w: b.w, h: b.h, on_line: false, lines: lines.iter().map(|line| (line.start, line.end)).collect() })
}

fn inflate(b: &RouteBox, amount: f64) -> RouteBox {
    RouteBox { x: b.x - amount, y: b.y - amount, w: b.w + 2.0 * amount, h: b.h + 2.0 * amount }
}

fn crosses_box(segment: &Segment, b: &RouteBox) -> bool {
    segment_intersects_box(segment.0[0], segment.0[1], segment.1[0], segment.1[1], b)
}

fn touches_box(segment: &Segment, b: &RouteBox) -> bool {
    js::max(segment.0[0], segment.1[0]) >= b.x && js::min(segment.0[0], segment.1[0]) <= b.x + b.w && js::max(segment.0[1], segment.1[1]) >= b.y && js::min(segment.0[1], segment.1[1]) <= b.y + b.h
}

fn overlaps_box(a: &RouteBox, b: &RouteBox) -> bool {
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

struct Layout {
    lines: Vec<(usize, usize)>,
    w: f64,
    h: f64,
    xs: Vec<f64>,
}

/// `placeElbowArrowLabel`.
pub fn place_elbow_arrow_label(line: &LineGeom, heads: [Head; 2], measure: &Measure, end_boxes: [Option<RouteBox>; 2]) -> Result<Placed, EmptyRoute> {
    let empty = Vec::new();
    let elbow: &Vec<Pt> = line.elbow.as_ref().unwrap_or(&empty);
    let mid = arrow_midpoint(line)?;
    let longest = label_segment(elbow)?;
    let segments: Vec<Segment> = elbow.windows(2).map(|pair| (pair[0], pair[1])).collect();
    let longest_index = longest.index;
    let segment_lengths: Vec<f64> = segments.iter().map(|(a, b)| js::hypot2(b[0] - a[0], b[1] - a[1])).collect();
    let is_horizontal = |index: usize| -> bool {
        let (dx, dy) = segments.get(index).map_or((0.0, 0.0), |(a, b)| (b[0] - a[0], b[1] - a[1]));
        dx.abs() >= dy.abs()
    };
    let n = elbow.len();
    let mut cap_segments: Vec<Segment> = Vec::new();
    if n >= 2 {
        cap_segments.extend(arrow_end_cap_segments(heads[1], elbow[n - 1], elbow[n - 2]));
        cap_segments.extend(arrow_end_cap_segments(heads[0], elbow[0], elbow[1]));
    }
    let corner_segments: Vec<Segment> = routing::rounded_route_corners(elbow, [heads[0] != Head::None, heads[1] != Head::None])
        .into_iter()
        .flat_map(|corner| [(corner.a, corner.mid), (corner.mid, corner.b)])
        .collect();
    let obstacles: Vec<RouteBox> = end_boxes.iter().flatten().copied().collect();
    let pad = ARROW_LABEL_HALO_WIDTH / 2.0;
    let clearance = ARROW_LABEL_STROKE_CLEARANCE + ARROW_LABEL_GAP;
    let end_margin = |has_head: bool| if has_head { ARROW_HEAD_LENGTH + ARROW_LABEL_HEAD_MARGIN } else { ARROW_LABEL_END_MARGIN };
    let fits = |b: &RouteBox, segment_index: Option<usize>, strict: bool| -> bool {
        let padded = inflate(b, pad);
        let cap_box = if segment_index.is_some() { padded } else { inflate(b, clearance) };
        if obstacles.iter().any(|obstacle| overlaps_box(&padded, obstacle)) || cap_segments.iter().any(|segment| crosses_box(segment, &cap_box)) {
            return false;
        }
        let Some(index) = segment_index else {
            let clear = inflate(b, clearance);
            return segments.iter().all(|segment| !touches_box(segment, &clear)) && corner_segments.iter().all(|segment| !crosses_box(segment, &clear));
        };
        let room = segment_lengths.get(index).copied().unwrap_or(0.0) / 2.0 - ((if is_horizontal(index) { b.w } else { b.h }) / 2.0 + pad);
        let run_length = |from: usize, to: usize| -> f64 {
            let to = to.min(segment_lengths.len());
            let sum = if strict || from >= to { 0.0 } else { segment_lengths[from..to].iter().fold(0.0, |sum, length| sum + length) };
            sum + room
        };
        let needed = |end: usize| end_margin(heads[end] != Head::None && (!strict || index == if end == 0 { 0 } else { segments.len().wrapping_sub(1) }));
        let epsilon = if strict { 0.000001 } else { 0.0 };
        segments.iter().enumerate().all(|(i, segment)| i == index || !touches_box(segment, &padded))
            && run_length(0, index) + epsilon >= needed(0)
            && run_length(index + 1, segments.len()) + epsilon >= needed(1)
    };
    let text_width = measured_text_width(measure);
    let mut candidates = vec![Layout { lines: vec![(0, measure.word_count)], w: text_width, h: ARROW_LABEL_HEIGHT, xs: vec![mid[0]] }];
    let (from_box, to_box) = (obstacles.first(), obstacles.get(1));
    let (gap_left, gap_width) = match (from_box, to_box) {
        (Some(f), Some(t)) => {
            let left = js::min(f.x + f.w, t.x + t.w);
            (left, js::max(f.x, t.x) - left)
        }
        _ => (0.0, 0.0),
    };
    let wrap_width = gap_width - 2.0 * pad;
    let wrapped = if wrap_width > 0.0 && measure.word_count > 1 && text_width > wrap_width { wrap_label_words(measure, wrap_width) } else { Vec::new() };
    if wrapped.len() > 1 && wrapped.len() <= ARROW_LABEL_MAX_LINES && wrapped.iter().all(|entry| entry.w <= wrap_width) {
        candidates.push(Layout {
            lines: wrapped.iter().map(|line| (line.start, line.end)).collect(),
            w: js::max_of(wrapped.iter().map(|entry| entry.w)),
            h: wrapped.len() as f64 * ARROW_LABEL_LINE_HEIGHT,
            xs: vec![mid[0], gap_left + gap_width / 2.0],
        });
    }
    let layout_at = |layout: &Layout, x: f64, y: f64, on_line: bool| Placed { x: x - layout.w / 2.0, y: y - layout.h / 2.0, w: layout.w, h: layout.h, on_line, lines: layout.lines.clone() };
    let as_box = |placed: &Placed| RouteBox { x: placed.x, y: placed.y, w: placed.w, h: placed.h };
    let single = &candidates[0];
    let on_mid = layout_at(single, mid[0], mid[1], true);
    if fits(&as_box(&on_mid), Some(longest_index), false) {
        let mut longer: Vec<usize> = if !line.bent || fits(&as_box(&on_mid), Some(longest_index), true) {
            Vec::new()
        } else {
            (0..segments.len()).filter(|&index| segment_lengths[index] > longest.len + 0.5).collect()
        };
        while !longer.is_empty() {
            let max_length = js::max_of(longer.iter().map(|&index| segment_lengths[index]));
            let distance = |index: usize| (index as i64 - longest_index as i64).abs();
            let Some(pick) = longer.iter().copied().filter(|&index| max_length - segment_lengths[index] <= 0.5).min_by_key(|&index| (distance(index), index)) else { break };
            let (a, b) = segments[pick];
            let placed = layout_at(single, (a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0, true);
            if fits(&as_box(&placed), Some(pick), true) {
                return Ok(placed);
            }
            longer.retain(|&index| index != pick);
        }
        return Ok(on_mid);
    }
    let directions: [(f64, f64); 4] = [(0.0, 1.0), (1.0, 0.0), (0.0, -1.0), (-1.0, 0.0)];
    let mut distance = ARROW_LABEL_HEIGHT / 2.0;
    while distance < 200.0 {
        for layout in &candidates {
            for &x in &layout.xs {
                for (dir_x, dir_y) in directions {
                    let placed = layout_at(layout, x + dir_x * distance, mid[1] + dir_y * distance, false);
                    if fits(&as_box(&placed), None, false) {
                        return Ok(placed);
                    }
                }
            }
        }
        distance += 0.5;
    }
    let extent_ys = elbow.iter().map(|p| p[1]).chain(cap_segments.iter().map(|s| s.1[1])).chain(obstacles.iter().flat_map(|b| [b.y, b.y + b.h]));
    let min_y = js::min_of(extent_ys.clone());
    let max_y = js::max_of(extent_ys);
    let center_x = (js::min_of(elbow.iter().map(|p| p[0])) + js::max_of(elbow.iter().map(|p| p[0]))) / 2.0;
    let offset = clearance + 1.0 + ARROW_LABEL_HEIGHT / 2.0;
    Ok(layout_at(single, center_x, if min_y - offset < -COORDINATE_LIMIT { max_y + offset } else { min_y - offset }, false))
}
