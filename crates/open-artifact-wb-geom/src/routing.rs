//! Elbow arrow routing: orthogonal routes between two boxes (or free points)
//! that leave and arrive square to a side, keep a stub clear of each box,
//! never turn back on themselves and never run through their own ends.
//!


use crate::js;

/// A route point `[x, y]`.
pub type Pt = [f64; 2];

/// A box an arrow end attaches to; `w = h = 0` marks a free point.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RouteBox {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// A side of a box, in the order of the TypeScript `SIDE_DIRECTIONS` keys.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Side {
    Top = 0,
    Bottom = 1,
    Left = 2,
    Right = 3,
}

pub const SIDES: [Side; 4] = [Side::Top, Side::Bottom, Side::Left, Side::Right];

impl Side {
    pub fn from_code(code: u8) -> Option<Side> {
        SIDES.get(code as usize).copied()
    }
    /// Unit vector pointing out of the side.
    pub fn dir(self) -> [f64; 2] {
        match self {
            Side::Top => [0.0, -1.0],
            Side::Bottom => [0.0, 1.0],
            Side::Left => [-1.0, 0.0],
            Side::Right => [1.0, 0.0],
        }
    }
}

/// One straight leg of a route (consecutive legs in the same direction are merged).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RouteSegment {
    pub a: Pt,
    pub b: Pt,
    pub dx: f64,
    pub dy: f64,
    pub len: f64,
    /// Unit direction, each component -1, 0 or 1.
    pub dir: [f64; 2],
}

/// Why a route is not valid.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum RouteProblem {
    LegTooShort = 0,
    TurnsBack = 1,
    CrossesItself = 2,
    WrongSide = 3,
    HitsItsOwnEnd = 4,
    EndsOverlap = 5,
    TooManyTurns = 6,
}

/// The family of an automatic route.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum ElbowShape {
    Level = 0,
    Z = 1,
    U = 2,
    Loop = 3,
    Corner = 4,
    Four = 5,
}

/// An automatic route.
#[derive(Clone, Debug, PartialEq)]
pub struct ElbowPlan {
    pub pts: Vec<Pt>,
    pub shape: ElbowShape,
    /// The jog actually applied to a Z's middle leg, relative to the midline.
    pub jog: Option<f64>,
}

/// The axis a manual route starts on.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BendAxis {
    H,
    V,
}

/// A manual route: its first axis and the coordinates of its inner legs.
#[derive(Clone, Debug, PartialEq)]
pub struct RouteBends {
    pub first: BendAxis,
    pub at: Vec<f64>,
}

/// Shortest first and last leg of a route.
pub const MIN_ARROW_END_LEG: f64 = 16.0;
/// Shortest inner leg of a route.
pub const MIN_INNER_LEG: f64 = 12.0;
/// Gap between a box and where its arrow starts.
pub const END_GAP: f64 = 6.0;
/// How far a loop runs outside the boxes.
pub const LOOP_MARGIN: f64 = 22.0;

const EPSILON: f64 = 0.000000001;

/// `x || fallback` for a number: 0, -0 and NaN take the fallback.
#[inline]
fn or(x: f64, fallback: f64) -> f64 {
    if x == 0.0 || x.is_nan() { fallback } else { x }
}

pub fn is_point_box(b: &RouteBox) -> bool {
    b.w == 0.0 && b.h == 0.0
}

/// The middle of a box side, moved `offset` along the side.
pub fn side_anchor_point(b: &RouteBox, side: Side, offset: f64) -> Pt {
    match side {
        Side::Top => [b.x + b.w / 2.0 + offset, b.y],
        Side::Bottom => [b.x + b.w / 2.0 + offset, b.y + b.h],
        Side::Left => [b.x, b.y + b.h / 2.0 + offset],
        Side::Right => [b.x + b.w, b.y + b.h / 2.0 + offset],
    }
}

/// Moves `value` along `dir` from `origin` until it is at least `minimum` away.
pub fn push_past_stub(origin: f64, dir: f64, value: f64, minimum: f64) -> f64 {
    origin + dir * js::max(minimum, (value - origin) * dir)
}

/// The side of a box that faces a point (relative to the box's aspect).
pub fn side_facing_point(b: &RouteBox, p: Pt) -> Side {
    let rel_x = (p[0] - b.x - b.w / 2.0) / js::max(1.0, b.w);
    let rel_y = (p[1] - b.y - b.h / 2.0) / js::max(1.0, b.h);
    if rel_x.abs() > rel_y.abs() {
        if rel_x > 0.0 { Side::Right } else { Side::Left }
    } else if rel_y > 0.0 {
        Side::Bottom
    } else {
        Side::Top
    }
}

/// True when two boxes overlap (a point overlaps a box it lies in).
pub fn boxes_overlap(a: &RouteBox, b: &RouteBox) -> bool {
    if is_point_box(a) && is_point_box(b) {
        return false;
    }
    if is_point_box(a) {
        return a.x >= b.x && a.x <= b.x + b.w && a.y >= b.y && a.y <= b.y + b.h;
    }
    if is_point_box(b) {
        return boxes_overlap(b, a);
    }
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/// The legs of a route, merging consecutive legs that run the same way and dropping empty ones.
pub fn route_segments(points: &[Pt]) -> Vec<RouteSegment> {
    let mut segments: Vec<RouteSegment> = Vec::with_capacity(points.len());
    for index in 1..points.len() {
        let start = points[index - 1];
        let end = points[index];
        let dx = end[0] - start[0];
        let dy = end[1] - start[1];
        if dx.abs() < EPSILON && dy.abs() < EPSILON {
            continue;
        }
        let dir = [js::sign(if dx.abs() < EPSILON { 0.0 } else { dx }), js::sign(if dy.abs() < EPSILON { 0.0 } else { dy })];
        if let Some(previous) = segments.last_mut() {
            if previous.dir[0] == dir[0] && previous.dir[1] == dir[1] {
                previous.b = end;
                previous.dx += dx;
                previous.dy += dy;
                previous.len = js::hypot2(previous.dx, previous.dy);
                continue;
            }
        }
        segments.push(RouteSegment { a: start, b: end, dx, dy, len: js::hypot2(dx, dy), dir });
    }
    segments
}

/// True when two axis-aligned legs touch or overlap.
pub fn segments_overlap(a: &RouteSegment, b: &RouteSegment) -> bool {
    let range = |s: &RouteSegment, axis: usize| (js::min(s.a[axis], s.b[axis]), js::max(s.a[axis], s.b[axis]));
    (0..2).all(|axis| range(a, axis).0 <= range(b, axis).1 && range(b, axis).0 <= range(a, axis).1)
}

/// True when a leg passes within `margin` of a box.
pub fn segment_near_box(s: &RouteSegment, b: &RouteBox, margin: f64) -> bool {
    let min_x = js::min(s.a[0], s.b[0]);
    let max_x = js::max(s.a[0], s.b[0]);
    let min_y = js::min(s.a[1], s.b[1]);
    let max_y = js::max(s.a[1], s.b[1]);
    max_x > b.x - margin && min_x < b.x + b.w + margin && max_y > b.y - margin && min_y < b.y + b.h + margin
}

/// Why a route is invalid, or `None` when it is valid.
pub fn check_arrow_route(points: &[Pt], from_box: &RouteBox, from_side: Side, to_box: &RouteBox, to_side: Side, extra_clearance: f64) -> Option<RouteProblem> {
    let from_dir = from_side.dir();
    let to_dir = to_side.dir();
    let segments = route_segments(points);
    if segments.is_empty() {
        return Some(RouteProblem::LegTooShort);
    }
    let count = segments.len();
    for index in 0..count {
        let segment = &segments[index];
        if segment.dir[0] != 0.0 && segment.dir[1] != 0.0 {
            return Some(RouteProblem::TurnsBack);
        }
        if index > 0 {
            let previous = &segments[index - 1];
            if segment.dir[0] == -previous.dir[0] && segment.dir[1] == -previous.dir[1] {
                return Some(RouteProblem::TurnsBack);
            }
        }
        let minimum = if index == 0 || index == count - 1 { MIN_ARROW_END_LEG } else { MIN_INNER_LEG };
        if segment.len < minimum - 0.000001 {
            return Some(RouteProblem::LegTooShort);
        }
        if index >= 2 {
            for earlier in 0..index - 1 {
                if segments_overlap(segment, &segments[earlier]) {
                    return Some(RouteProblem::CrossesItself);
                }
            }
        }
    }
    let first = &segments[0];
    let last = &segments[count - 1];
    if first.dir[0] != from_dir[0] || first.dir[1] != from_dir[1] {
        return Some(RouteProblem::WrongSide);
    }
    if last.dir[0] != -to_dir[0] || last.dir[1] != -to_dir[1] {
        return Some(RouteProblem::WrongSide);
    }
    for index in 0..count {
        if !is_point_box(from_box) && segment_near_box(&segments[index], from_box, if index == 0 { 0.0 } else { END_GAP + extra_clearance }) {
            return Some(RouteProblem::HitsItsOwnEnd);
        }
        if !is_point_box(to_box) && segment_near_box(&segments[index], to_box, if index == count - 1 { 0.0 } else { END_GAP + extra_clearance }) {
            return Some(RouteProblem::HitsItsOwnEnd);
        }
    }
    None
}

pub fn is_arrow_route_valid(points: &[Pt], from_box: &RouteBox, from_side: Side, to_box: &RouteBox, to_side: Side, extra_clearance: f64) -> bool {
    check_arrow_route(points, from_box, from_side, to_box, to_side, extra_clearance).is_none()
}

fn is_valid_box(b: &RouteBox) -> bool {
    b.x.is_finite() && b.y.is_finite() && b.w.is_finite() && b.h.is_finite() && b.w >= 0.0 && b.h >= 0.0
}

/// A candidate automatic route.
enum Candidate {
    Z { from_start: Pt, to_start: Pt, cross_axis: usize, from_horizontal: bool, midline: f64, jog_min: f64, jog_max: f64 },
    U { from_start: Pt, to_start: Pt, cross_axis: usize, from_horizontal: bool, outer: f64 },
    Loop { from_start: Pt, from_stub: Pt, to_stub: Pt, to_start: Pt, main_axis: usize, from_horizontal: bool, lane: f64 },
    Corner { from_start: Pt, corner: Pt, to_start: Pt },
    Four { from_start: Pt, to_start: Pt, main_axis: usize, cross_axis: usize, from_horizontal: bool, main: f64, cross: f64 },
}

fn on_axes(from_horizontal: bool, main: f64, cross: f64) -> Pt {
    if from_horizontal { [main, cross] } else { [cross, main] }
}

impl Candidate {
    fn shape(&self) -> ElbowShape {
        match self {
            Candidate::Z { .. } => ElbowShape::Z,
            Candidate::U { .. } => ElbowShape::U,
            Candidate::Loop { .. } => ElbowShape::Loop,
            Candidate::Corner { .. } => ElbowShape::Corner,
            Candidate::Four { .. } => ElbowShape::Four,
        }
    }
    /// Where a Z's middle leg ends up for a jog.
    fn used(&self, jog: f64) -> Option<f64> {
        match *self {
            Candidate::Z { midline, jog_min, jog_max, .. } => Some(js::min(jog_max, js::max(jog_min, midline + jog))),
            _ => None,
        }
    }
    fn auto(&self) -> Option<f64> {
        match *self {
            Candidate::Z { midline, .. } => Some(midline),
            _ => None,
        }
    }
    fn build(&self, jog: f64) -> Vec<Pt> {
        match *self {
            Candidate::Z { from_start, to_start, cross_axis, from_horizontal, .. } => {
                let main = self.used(jog).unwrap_or(0.0);
                vec![from_start, on_axes(from_horizontal, main, from_start[cross_axis]), on_axes(from_horizontal, main, to_start[cross_axis]), to_start]
            }
            Candidate::U { from_start, to_start, cross_axis, from_horizontal, outer } => {
                vec![from_start, on_axes(from_horizontal, outer, from_start[cross_axis]), on_axes(from_horizontal, outer, to_start[cross_axis]), to_start]
            }
            Candidate::Loop { from_start, from_stub, to_stub, to_start, main_axis, from_horizontal, lane } => vec![
                from_start,
                from_stub,
                on_axes(from_horizontal, from_stub[main_axis], lane),
                on_axes(from_horizontal, to_stub[main_axis], lane),
                to_stub,
                to_start,
            ],
            Candidate::Corner { from_start, corner, to_start } => vec![from_start, corner, to_start],
            Candidate::Four { from_start, to_start, main_axis, cross_axis, from_horizontal, main, cross } => vec![
                from_start,
                on_axes(from_horizontal, main, from_start[cross_axis]),
                on_axes(from_horizontal, main, cross),
                on_axes(from_horizontal, to_start[main_axis], cross),
                to_start,
            ],
        }
    }
}

fn box_start(b: &RouteBox, axis: usize) -> f64 {
    if axis == 0 { b.x } else { b.y }
}
fn box_end(b: &RouteBox, axis: usize) -> f64 {
    if axis == 0 { b.x + b.w } else { b.y + b.h }
}

/// The points of a route as legs: the first leg's start, then each leg's end.
fn points_of(segments: &[RouteSegment]) -> Vec<Pt> {
    let mut points = Vec::with_capacity(segments.len() + 1);
    if let Some(first) = segments.first() {
        points.push(first.a);
    }
    points.extend(segments.iter().map(|s| s.b));
    points
}

/// The automatic elbow route between two ends, or `None` when none is valid.
pub fn plan_elbow_route(from_box: &RouteBox, from_side: Side, to_box: &RouteBox, to_side: Side, jog: f64, exit_offsets: [f64; 2]) -> Option<ElbowPlan> {
    if !is_valid_box(from_box) || !is_valid_box(to_box) || !exit_offsets.iter().all(|v| v.is_finite()) {
        return None;
    }
    if boxes_overlap(from_box, to_box) {
        return None;
    }
    let from_dir = from_side.dir();
    let to_dir = to_side.dir();
    let from_anchor: Pt = if is_point_box(from_box) { [from_box.x, from_box.y] } else { side_anchor_point(from_box, from_side, exit_offsets[0]) };
    let to_anchor: Pt = if is_point_box(to_box) { [to_box.x, to_box.y] } else { side_anchor_point(to_box, to_side, exit_offsets[1]) };
    let from_gap = if is_point_box(from_box) { 0.0 } else { END_GAP };
    let to_gap = if is_point_box(to_box) { 0.0 } else { END_GAP };
    let from_start: Pt = [from_anchor[0] + from_dir[0] * from_gap, from_anchor[1] + from_dir[1] * from_gap];
    let to_start: Pt = [to_anchor[0] + to_dir[0] * to_gap, to_anchor[1] + to_dir[1] * to_gap];
    let from_stub: Pt = [from_start[0] + from_dir[0] * MIN_ARROW_END_LEG, from_start[1] + from_dir[1] * MIN_ARROW_END_LEG];
    let to_stub: Pt = [to_start[0] + to_dir[0] * MIN_ARROW_END_LEG, to_start[1] + to_dir[1] * MIN_ARROW_END_LEG];
    let from_horizontal = from_dir[0] != 0.0;
    let to_horizontal = to_dir[0] != 0.0;
    let main_axis = if from_horizontal { 0 } else { 1 };
    let cross_axis = 1 - main_axis;
    let mut candidates: Vec<Candidate> = Vec::new();

    if from_horizontal == to_horizontal {
        let allow_loops;
        if from_dir[main_axis] == -to_dir[main_axis] {
            // Facing sides: a straight line, a Z, or (when they face away) loops.
            let cross_gap = (from_start[cross_axis] - to_start[cross_axis]).abs();
            let main_gap = (to_anchor[main_axis] - from_anchor[main_axis]) * from_dir[main_axis];
            let needed = (if is_point_box(from_box) { MIN_ARROW_END_LEG } else { 22.0 }) + (if is_point_box(to_box) { MIN_ARROW_END_LEG } else { 22.0 });
            if main_gap >= 0.0 && main_gap < needed {
                return None;
            }
            if main_gap >= needed && cross_gap < MIN_INNER_LEG {
                return Some(ElbowPlan { pts: vec![from_start, to_start], shape: ElbowShape::Level, jog: None });
            }
            let midline = (from_start[main_axis] + to_start[main_axis]) / 2.0;
            let jog_min = js::min(from_stub[main_axis], to_stub[main_axis]);
            let jog_max = js::max(from_stub[main_axis], to_stub[main_axis]);
            if main_gap >= needed {
                candidates.push(Candidate::Z { from_start, to_start, cross_axis, from_horizontal, midline, jog_min, jog_max });
            }
            allow_loops = main_gap < 0.0;
        } else {
            // Same-facing sides: a U around the farther stub.
            let outer = if from_dir[main_axis] > 0.0 {
                js::max(from_stub[main_axis], to_stub[main_axis])
            } else {
                js::min(from_stub[main_axis], to_stub[main_axis])
            };
            candidates.push(Candidate::U { from_start, to_start, cross_axis, from_horizontal, outer });
            allow_loops = true;
        }
        let mut lanes: Vec<f64> = Vec::with_capacity(3);
        let inner_end = js::min(box_end(from_box, cross_axis), box_end(to_box, cross_axis));
        let inner_start = js::max(box_start(from_box, cross_axis), box_start(to_box, cross_axis));
        if inner_start - inner_end >= MIN_INNER_LEG {
            lanes.push((inner_end + inner_start) / 2.0);
        }
        lanes.push(js::min(box_start(from_box, cross_axis), box_start(to_box, cross_axis)) - LOOP_MARGIN);
        lanes.push(js::max(box_end(from_box, cross_axis), box_end(to_box, cross_axis)) + LOOP_MARGIN);
        if allow_loops {
            for lane in lanes {
                candidates.push(Candidate::Loop { from_start, from_stub, to_stub, to_start, main_axis, from_horizontal, lane });
            }
        }
    } else {
        // Perpendicular sides: one corner, or a four-leg detour.
        let corner: Pt = if from_horizontal { [to_start[0], from_start[1]] } else { [from_start[0], to_start[1]] };
        let from_reach = (corner[0] - from_start[0]) * from_dir[0] + (corner[1] - from_start[1]) * from_dir[1];
        let to_reach = (corner[0] - to_start[0]) * to_dir[0] + (corner[1] - to_start[1]) * to_dir[1];
        if from_reach >= 0.0 && to_reach >= 0.0 && (from_reach < MIN_ARROW_END_LEG || to_reach < MIN_ARROW_END_LEG) {
            return None;
        }
        if from_reach >= MIN_ARROW_END_LEG && to_reach >= MIN_ARROW_END_LEG {
            candidates.push(Candidate::Corner { from_start, corner, to_start });
        }
        let mains = [
            from_stub[main_axis],
            if from_dir[main_axis] > 0.0 {
                js::max(box_end(from_box, main_axis), box_end(to_box, main_axis)) + LOOP_MARGIN
            } else {
                js::min(box_start(from_box, main_axis), box_start(to_box, main_axis)) - LOOP_MARGIN
            },
        ];
        let crosses = [
            to_stub[cross_axis],
            if to_dir[cross_axis] > 0.0 {
                js::max(box_end(from_box, cross_axis), box_end(to_box, cross_axis)) + LOOP_MARGIN
            } else {
                js::min(box_start(from_box, cross_axis), box_start(to_box, cross_axis)) - LOOP_MARGIN
            },
        ];
        if from_reach < 0.0 || to_reach < 0.0 {
            for main in mains {
                for cross in crosses {
                    candidates.push(Candidate::Four { from_start, to_start, main_axis, cross_axis, from_horizontal, main, cross });
                }
            }
        }
    }

    let mut best: Option<(usize, usize, f64)> = None;
    for (index, candidate) in candidates.iter().enumerate() {
        let points = candidate.build(0.0);
        if !is_arrow_route_valid(&points, from_box, from_side, to_box, to_side, 0.0) {
            continue;
        }
        let segments = route_segments(&points);
        let length = segments.iter().fold(0.0, |sum, s| sum + s.len);
        let better = match best {
            None => true,
            Some((_, n, len)) => segments.len() < n || (segments.len() == n && length < len),
        };
        if better {
            best = Some((index, segments.len(), length));
        }
    }
    let (index, _, _) = best?;
    let candidate = &candidates[index];
    let jog_used = if candidate.auto().is_none() || !jog.is_finite() { 0.0 } else { jog };
    let segments = route_segments(&candidate.build(jog_used));
    let jog = match (candidate.used(jog_used), candidate.auto()) {
        (Some(used), Some(auto)) => Some(used - auto),
        _ => None,
    };
    Some(ElbowPlan { pts: points_of(&segments), shape: candidate.shape(), jog })
}

fn center_of(b: &RouteBox) -> Pt {
    [b.x + b.w / 2.0, b.y + b.h / 2.0]
}

/// The sides a manual route leaves and enters, implied by its first axis and bends.
pub fn sides_for_bends(from_box: &RouteBox, to_box: &RouteBox, first_axis: BendAxis, bends: &[f64]) -> (Side, Side) {
    let last_axis = if (first_axis == BendAxis::H) == (bends.len() % 2 == 1) { 0 } else { 1 };
    let side_toward = |b: &RouteBox, axis: usize, coord: f64| -> Side {
        if axis == 0 {
            if coord >= center_of(b)[0] { Side::Right } else { Side::Left }
        } else if coord >= center_of(b)[1] {
            Side::Bottom
        } else {
            Side::Top
        }
    };
    let first_axis_index = if first_axis == BendAxis::H { 0 } else { 1 };
    (
        side_toward(from_box, first_axis_index, bends.first().copied().unwrap_or_else(|| center_of(to_box)[first_axis_index])),
        side_toward(to_box, last_axis, bends.last().copied().unwrap_or_else(|| center_of(from_box)[last_axis])),
    )
}

/// The points of a manual route, or the problem that makes it invalid.
#[allow(clippy::too_many_arguments)]
pub fn build_route_from_bends(
    from_box: &RouteBox,
    from_side: Option<Side>,
    to_box: &RouteBox,
    to_side: Option<Side>,
    first_axis: BendAxis,
    bends: &[f64],
    extra_clearance: f64,
    exit_offsets: [f64; 2],
) -> Result<Vec<Pt>, RouteProblem> {
    if !is_valid_box(from_box) || !is_valid_box(to_box) || !bends.iter().chain(exit_offsets.iter()).all(|v| v.is_finite()) || boxes_overlap(from_box, to_box) {
        return Err(RouteProblem::EndsOverlap);
    }
    let point_count = bends.len() + 2;
    let axis_at = |index: usize| -> usize { if (first_axis == BendAxis::H) == (index % 2 == 0) { 0 } else { 1 } };
    let (start_side, end_side) = sides_for_bends(from_box, to_box, first_axis, bends);
    if (!is_point_box(from_box) && from_side.is_some_and(|s| s != start_side)) || (!is_point_box(to_box) && to_side.is_some_and(|s| s != end_side)) {
        return Err(RouteProblem::WrongSide);
    }
    let stub_point = |b: &RouteBox, side: Side, offset: f64| -> Pt {
        if is_point_box(b) {
            return [b.x, b.y];
        }
        let anchor = side_anchor_point(b, side, offset);
        let dir = side.dir();
        [anchor[0] + dir[0] * END_GAP, anchor[1] + dir[1] * END_GAP]
    };
    let start = stub_point(from_box, start_side, exit_offsets[0]);
    let end = stub_point(to_box, end_side, exit_offsets[1]);
    let mut coords: Vec<f64> = Vec::with_capacity(point_count);
    coords.push(start[1 - axis_at(0)]);
    coords.extend_from_slice(bends);
    coords.push(end[1 - axis_at(point_count - 1)]);
    if point_count > 2 && !is_point_box(from_box) {
        coords[1] = push_past_stub(start[axis_at(0)], start_side.dir()[axis_at(0)], coords[1], MIN_ARROW_END_LEG);
    }
    if point_count > 2 && !is_point_box(to_box) {
        coords[point_count - 2] = push_past_stub(end[axis_at(point_count - 1)], end_side.dir()[axis_at(point_count - 1)], coords[point_count - 2], MIN_ARROW_END_LEG);
    }
    let mut points: Vec<Pt> = Vec::with_capacity(point_count + 1);
    points.push(start);
    for index in 1..point_count {
        points.push(if axis_at(index) == 0 { [coords[index - 1], coords[index]] } else { [coords[index], coords[index - 1]] });
    }
    points.push(end);
    if let Some(problem) = check_arrow_route(&points, from_box, start_side, to_box, end_side, extra_clearance) {
        return Err(problem);
    }
    Ok(points_of(&route_segments(&points)))
}

/// The manual bends that reproduce a route (alternating axes), or `None` for a single leg.
pub fn bends_from_route(points: &[Pt]) -> Option<RouteBends> {
    let segments = route_segments(points);
    if segments.len() < 2 {
        return None;
    }
    for index in 1..segments.len() {
        if (segments[index].dir[0] != 0.0) == (segments[index - 1].dir[0] != 0.0) {
            return None;
        }
    }
    Some(RouteBends {
        first: if segments[0].dir[0] != 0.0 { BendAxis::H } else { BendAxis::V },
        at: segments[1..segments.len() - 1].iter().map(|s| if s.dir[0] != 0.0 { s.a[1] } else { s.a[0] }).collect(),
    })
}

/// Snaps route points within 12 of a neighbor's coordinate onto it, both ways.
pub fn align_nearby_route_points(points: &[Pt]) -> Vec<Pt> {
    let mut aligned: Vec<Pt> = points.to_vec();
    let n = aligned.len();
    for axis in 0..2 {
        if n >= 2 {
            for index in 1..n - 1 {
                if (aligned[index][axis] - aligned[index - 1][axis]).abs() < MIN_INNER_LEG {
                    aligned[index][axis] = aligned[index - 1][axis];
                }
            }
            let mut index = n - 2;
            while index > 0 {
                if (aligned[index][axis] - aligned[index + 1][axis]).abs() < MIN_INNER_LEG {
                    aligned[index][axis] = aligned[index + 1][axis];
                }
                index -= 1;
            }
        }
    }
    aligned
}

/// Drops middle points of three collinear (axis-aligned) points.
pub fn drop_collinear_points(points: &[Pt]) -> Vec<Pt> {
    let mut kept: Vec<Pt> = Vec::with_capacity(points.len());
    for &point in points {
        kept.push(point);
        loop {
            let length = kept.len();
            if length >= 3 && (0..2).any(|axis| kept[length - 3][axis] == kept[length - 2][axis] && kept[length - 2][axis] == kept[length - 1][axis]) {
                kept.remove(length - 2);
            } else {
                break;
            }
        }
    }
    kept
}

/// An orthogonal path from `start` (leaving along `start_dir`) through each
/// point of `through` to `end` (arriving against `end_dir`), preferring to
/// keep its heading at each turn.
pub fn elbow_path_through_points(start: Pt, start_dir: Option<[f64; 2]>, through: &[Pt], end: Pt, end_dir: Option<[f64; 2]>) -> Vec<Pt> {
    let mut points: Vec<Pt> = vec![start];
    let mut heading = start_dir;
    let step_to = |points: &mut Vec<Pt>, heading: &mut Option<[f64; 2]>, target: Pt, forced_axis: Option<usize>| {
        let last = *points.last().unwrap();
        let delta = [target[0] - last[0], target[1] - last[1]];
        if delta[0] == 0.0 && delta[1] == 0.0 {
            return;
        }
        let heading_axis = match heading {
            None => {
                if delta[0].abs() >= delta[1].abs() { 0 } else { 1 }
            }
            Some(h) => {
                if h[0] != 0.0 { 0 } else { 1 }
            }
        };
        let axis = if delta[0] == 0.0 {
            1
        } else if delta[1] == 0.0 {
            0
        } else {
            forced_axis.unwrap_or_else(|| match heading {
                None => heading_axis,
                Some(h) if js::sign(delta[heading_axis]) == h[heading_axis] => heading_axis,
                Some(_) => 1 - heading_axis,
            })
        };
        points.push(if axis == 0 { [target[0], last[1]] } else { [last[0], target[1]] });
        points.push(target);
        let final_axis = if delta[1 - axis] != 0.0 { 1 - axis } else { axis };
        *heading = Some(if final_axis == 0 { [js::sign(delta[0]), 0.0] } else { [0.0, js::sign(delta[1])] });
    };
    let is_ahead = |origin: Pt, dir: [f64; 2], p: Pt| (p[0] - origin[0]) * dir[0] + (p[1] - origin[1]) * dir[1] > 0.0;
    let stub_from = |p: Pt, dir: [f64; 2]| -> Pt { [p[0] + dir[0] * MIN_ARROW_END_LEG, p[1] + dir[1] * MIN_ARROW_END_LEG] };
    if let Some(dir) = start_dir {
        if !is_ahead(start, dir, through.first().copied().unwrap_or(end)) {
            step_to(&mut points, &mut heading, stub_from(start, dir), None);
        }
    }
    for &p in through {
        step_to(&mut points, &mut heading, p, None);
    }
    let end_axis: Option<usize> = end_dir.map(|d| if d[0] != 0.0 { 1 } else { 0 });
    let last = *points.last().unwrap();
    let approaches_backward = match (end_axis, heading) {
        (Some(axis), Some(h)) => h[axis] != 0.0 && js::sign(end[axis] - last[axis]) == -h[axis],
        _ => false,
    };
    if let (Some(dir), Some(axis)) = (end_dir, end_axis) {
        if !is_ahead(end, dir, last) || approaches_backward {
            step_to(&mut points, &mut heading, stub_from(end, dir), Some(if axis == 0 { 1 } else { 0 }));
        }
    }
    step_to(&mut points, &mut heading, end, end_axis);
    points
}

/// The result of {@link bends_through_points}.
#[derive(Clone, Debug, PartialEq)]
pub enum BendsThrough {
    Bends(RouteBends),
    Straight,
    Problem(RouteProblem),
}

/// Manual bends whose route visits `points` in order (within `tolerance`).
pub fn bends_through_points(
    from_box: &RouteBox,
    from_side: Option<Side>,
    to_box: &RouteBox,
    to_side: Option<Side>,
    points: &[Pt],
    max_bends: f64,
    tolerance: f64,
) -> Option<BendsThrough> {
    let (Some(&first_point), Some(&last_point)) = (points.first(), points.last()) else {
        return Some(BendsThrough::Straight);
    };
    let inside = |b: &RouteBox| !is_point_box(b) && points.iter().any(|p| p[0] > b.x && p[0] < b.x + b.w && p[1] > b.y && p[1] < b.y + b.h);
    if inside(from_box) || inside(to_box) {
        return Some(BendsThrough::Problem(RouteProblem::HitsItsOwnEnd));
    }
    let stub_point = |b: &RouteBox, side: Option<Side>| -> Pt {
        match side {
            None => [b.x, b.y],
            Some(side) => {
                let anchor = side_anchor_point(b, side, 0.0);
                let dir = side.dir();
                [anchor[0] + dir[0] * END_GAP, anchor[1] + dir[1] * END_GAP]
            }
        }
    };
    let is_ahead = |b: &RouteBox, side: Side, p: Pt| {
        let stub = stub_point(b, Some(side));
        let dir = side.dir();
        (p[0] - stub[0]) * dir[0] + (p[1] - stub[1]) * dir[1] > 0.0
    };
    let side_options = |b: &RouteBox, side: Option<Side>, toward: Pt| -> Vec<Option<Side>> {
        if is_point_box(b) {
            return vec![None];
        }
        if let Some(side) = side {
            return vec![Some(side)];
        }
        let facing = side_facing_point(b, toward);
        let mut options = vec![Some(facing)];
        options.extend(SIDES.iter().filter(|&&other| other != facing && is_ahead(b, other, toward)).map(|&s| Some(s)));
        options
    };
    let is_near_segment = |p: Pt, s: &RouteSegment| (0..2).all(|axis| p[axis] >= js::min(s.a[axis], s.b[axis]) - tolerance && p[axis] <= js::max(s.a[axis], s.b[axis]) + tolerance);
    let visits_in_order = |waypoints: &[Pt], segments: &[RouteSegment]| -> bool {
        let mut from: isize = 0;
        for &p in waypoints {
            if from < 0 {
                continue;
            }
            from = segments.iter().enumerate().position(|(index, s)| index as isize >= from && is_near_segment(p, s)).map_or(-1, |i| i as isize);
        }
        from >= 0
    };
    enum Attempt {
        Route { bends: Option<RouteBends>, n: usize, len: f64 },
        Problem(RouteProblem),
    }
    let side_of_dir = |dir: [f64; 2]| -> Side {
        if dir[0] > 0.0 {
            Side::Right
        } else if dir[0] < 0.0 {
            Side::Left
        } else if dir[1] > 0.0 {
            Side::Bottom
        } else {
            Side::Top
        }
    };
    let try_route = |start_side: Option<Side>, end_side: Option<Side>| -> Attempt {
        let start = stub_point(from_box, start_side);
        let end = stub_point(to_box, end_side);
        let mut all = Vec::with_capacity(points.len() + 2);
        all.push(start);
        all.extend_from_slice(points);
        all.push(end);
        let aligned = align_nearby_route_points(&all);
        let waypoints: Vec<Pt> = aligned[1..aligned.len() - 1]
            .iter()
            .copied()
            .filter(|p| ![start, end].iter().any(|other| other[0] == p[0] && other[1] == p[1]))
            .collect();
        let path = drop_collinear_points(&elbow_path_through_points(start, start_side.map(Side::dir), &waypoints, end, end_side.map(Side::dir)));
        let segments = route_segments(&path);
        if !visits_in_order(&waypoints, &segments) {
            return Attempt::Problem(RouteProblem::TurnsBack);
        }
        let bends = bends_from_route(&path);
        let length = segments.iter().fold(0.0, |sum, s| sum + s.len);
        if segments.len() as f64 > max_bends + 2.0 {
            return Attempt::Problem(RouteProblem::TooManyTurns);
        }
        let matches_dir = |s: Option<&RouteSegment>, dir: Option<[f64; 2]>, sign: f64| match s {
            None => false,
            Some(s) => dir.is_none_or(|d| s.dir[0] == sign * d[0] && s.dir[1] == sign * d[1]),
        };
        if segments.len() == 3
            && segments[1].len < MIN_INNER_LEG
            && segments[0].dir[0] == segments[2].dir[0]
            && segments[0].dir[1] == segments[2].dir[1]
            && matches_dir(segments.first(), start_side.map(Side::dir), 1.0)
            && matches_dir(segments.get(2), end_side.map(Side::dir), -1.0)
        {
            return Attempt::Route { bends: None, n: 1, len: length };
        }
        let first_dir = segments.first().map_or([0.0, 0.0], |s| s.dir);
        let problem = match &bends {
            None => check_arrow_route(
                &path,
                from_box,
                start_side.unwrap_or_else(|| side_of_dir(first_dir)),
                to_box,
                end_side.unwrap_or_else(|| side_of_dir([-first_dir[0], -first_dir[1]])),
                0.0,
            ),
            Some(b) => build_route_from_bends(from_box, start_side, to_box, end_side, b.first, &b.at, 0.0, [0.0, 0.0]).err(),
        };
        match problem {
            Some(problem) => Attempt::Problem(problem),
            None => Attempt::Route { bends, n: segments.len(), len: length },
        }
    };
    let mut results: Vec<Attempt> = Vec::new();
    for start_side in side_options(from_box, from_side, first_point) {
        for end_side in side_options(to_box, to_side, last_point) {
            results.push(try_route(start_side, end_side));
        }
    }
    let mut routes: Vec<(Option<RouteBends>, usize, f64)> = results
        .iter()
        .filter_map(|r| match r {
            Attempt::Route { bends, n, len } => Some((bends.clone(), *n, *len)),
            Attempt::Problem(_) => None,
        })
        .collect();
    routes.sort_by(|a, b| a.1.cmp(&b.1).then_with(|| a.2.partial_cmp(&b.2).unwrap_or(std::cmp::Ordering::Equal)));
    if let Some((bends, _, _)) = routes.into_iter().next() {
        return Some(match bends {
            Some(b) => BendsThrough::Bends(b),
            None => BendsThrough::Straight,
        });
    }
    results.into_iter().find_map(|r| match r {
        Attempt::Problem(p) => Some(BendsThrough::Problem(p)),
        Attempt::Route { .. } => None,
    })
}

/// True when leg `index` of a route is long enough to be dragged sideways.
pub fn can_move_route_segment(points: &[Pt], index: usize, attached: [bool; 2], stubs: [f64; 2]) -> bool {
    let (Some(a), Some(b)) = (points.get(index), points.get(index + 1)) else {
        return false;
    };
    let needed = (if index == 0 && attached[0] { stubs[0] } else { 0.0 }) + (if points.len() >= 2 && index == points.len() - 2 && attached[1] { stubs[1] } else { 0.0 });
    js::hypot2(b[0] - a[0], b[1] - a[1]) >= needed + if needed > 0.0 { MIN_INNER_LEG } else { 0.0 }
}

/// The route with leg `index` dragged sideways to `target`.
pub fn move_route_segment(points: &[Pt], index: usize, target: f64, attached: [bool; 2], stubs: [f64; 2]) -> Vec<Pt> {
    if !can_move_route_segment(points, index, attached, stubs) {
        return points.to_vec();
    }
    let last_index = points.len() - 1;
    let a = points[index];
    let b = points[index + 1];
    let axis = if (b[0] - a[0]).abs() >= (b[1] - a[1]).abs() { 1 } else { 0 };
    let across = 1 - axis;
    let direction = or(js::sign(b[across] - a[across]), 1.0);
    let mut position = target;
    struct Neighbour {
        end: f64,
        dir: f64,
        stub: f64,
        attached_end: bool,
    }
    let mut neighbours: Vec<Neighbour> = Vec::with_capacity(2);
    if index >= 1 {
        let before = points[index - 1];
        neighbours.push(Neighbour {
            end: before[axis],
            dir: or(js::sign(a[axis] - before[axis]), 1.0),
            stub: if index - 1 == 0 { stubs[0] } else { 0.0 },
            attached_end: index - 1 == 0 && attached[0],
        });
    }
    if let Some(&after) = points.get(index + 2) {
        neighbours.push(Neighbour {
            end: after[axis],
            dir: or(js::sign(b[axis] - after[axis]), 1.0),
            stub: if index + 1 == last_index - 1 { stubs[1] } else { 0.0 },
            attached_end: index + 1 == last_index - 1 && attached[1],
        });
    }
    for n in &neighbours {
        if n.attached_end {
            position = push_past_stub(n.end, n.dir, position, n.stub);
        }
    }
    for n in &neighbours {
        if !n.attached_end && (position - n.end).abs() < or(n.stub, MIN_INNER_LEG) {
            position = n.end;
        }
    }
    for n in &neighbours {
        if n.attached_end {
            position = push_past_stub(n.end, n.dir, position, n.stub);
        }
    }
    let with_position = |p: Pt| -> Pt { if axis == 1 { [p[0], position] } else { [position, p[1]] } };
    let offset_point = |p: Pt, by: f64| -> Pt { if axis == 1 { [p[0] + by, p[1]] } else { [p[0], p[1] + by] } };
    let far_enough = |p: Pt, is_attached: bool, stub: f64| (position - p[axis]).abs() >= if is_attached { MIN_INNER_LEG } else { stub };
    if (index == 0 && !far_enough(a, attached[0], stubs[0])) || (index == last_index - 1 && !far_enough(b, attached[1], stubs[1])) {
        return points.to_vec();
    }
    let mut out: Vec<Pt> = Vec::with_capacity(points.len() + 4);
    if index == 0 {
        if attached[0] {
            let stub = offset_point(a, direction * stubs[0]);
            out.extend([a, stub, with_position(stub)]);
        } else {
            out.extend([a, with_position(a)]);
        }
    } else {
        out.extend_from_slice(&points[..index]);
        out.push(with_position(a));
    }
    if index == last_index - 1 {
        if attached[1] {
            let stub = offset_point(b, -direction * stubs[1]);
            out.extend([with_position(stub), stub, b]);
        } else {
            out.extend([with_position(b), b]);
        }
    } else {
        out.push(with_position(b));
        out.extend_from_slice(&points[index + 2..]);
    }
    out
}

/// A rounded corner of a route: where the curve starts (`a`) and ends (`b`) around `corner`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RouteCorner {
    pub corner: Pt,
    pub a: Pt,
    pub mid: Pt,
    pub b: Pt,
}

/// The rounded corners of a route (radius up to 10, never eating into an attached end's head room).
pub fn rounded_route_corners(points: &[Pt], attached_ends: [bool; 2]) -> Vec<RouteCorner> {
    if points.len() < 3 {
        return Vec::new();
    }
    (1..points.len() - 1)
        .map(|point_index| {
            let corner = points[point_index];
            let prev = points[point_index - 1];
            let next = points[point_index + 1];
            let len_in = js::hypot2(corner[0] - prev[0], corner[1] - prev[1]);
            let len_out = js::hypot2(next[0] - corner[0], next[1] - corner[1]);
            let max_in = if point_index == 1 && attached_ends[0] { js::max(0.0, len_in - 11.0) } else { len_in / 2.0 };
            let max_out = if point_index == points.len() - 2 && attached_ends[1] { js::max(0.0, len_out - 11.0) } else { len_out / 2.0 };
            let radius = js::min(js::min(10.0, max_in), max_out);
            let start: Pt = [corner[0] - ((corner[0] - prev[0]) / or(len_in, 1.0)) * radius, corner[1] - ((corner[1] - prev[1]) / or(len_in, 1.0)) * radius];
            let end: Pt = [corner[0] + ((next[0] - corner[0]) / or(len_out, 1.0)) * radius, corner[1] + ((next[1] - corner[1]) / or(len_out, 1.0)) * radius];
            RouteCorner { corner, a: start, mid: [(start[0] + 2.0 * corner[0] + end[0]) / 4.0, (start[1] + 2.0 * corner[1] + end[1]) / 4.0], b: end }
        })
        .collect()
}

/// SVG `d` of a route with rounded corners.
pub fn rounded_route_path(points: &[Pt], attached_ends: [bool; 2]) -> String {
    let format_number = |v: f64| js::number_to_string(js::round(v * 10.0) / 10.0);
    let format_point = |p: Pt| format!("{} {}", format_number(p[0]), format_number(p[1]));
    let mut d = format!("M {}", format_point(points[0]));
    for corner in rounded_route_corners(points, attached_ends) {
        d.push_str(&format!(" L {} Q {} {}", format_point(corner.a), format_point(corner.corner), format_point(corner.b)));
    }
    d.push_str(&format!(" L {}", format_point(points[points.len() - 1])));
    d
}

/// The leg of a route that carries its label: the middle leg, or the longest of an even count.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RouteLabelSegment {
    pub a: Pt,
    pub b: Pt,
    pub len: f64,
    pub level: bool,
    /// The leg's index (it runs from point `index` to `index + 1`).
    pub index: usize,
}

pub fn route_label_segment(points: &[Pt]) -> Option<RouteLabelSegment> {
    let segments: Vec<(Pt, Pt, f64, usize)> = (1..points.len()).map(|i| (points[i - 1], points[i], js::hypot2(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]), i - 1)).collect();
    let (a, b, len, index) = if segments.len() % 2 == 1 {
        segments[(segments.len() - 1) / 2]
    } else {
        let mut iter = segments.into_iter();
        let first = iter.next()?;
        iter.fold(first, |best, candidate| if candidate.2 > best.2 { candidate } else { best })
    };
    Some(RouteLabelSegment { a, b, len, level: (b[0] - a[0]).abs() >= (b[1] - a[1]).abs(), index })
}
