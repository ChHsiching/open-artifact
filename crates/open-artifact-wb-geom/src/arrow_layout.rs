//! Arrow layout for a whole board:
//! the sides each arrow leaves and enters, how arrows sharing a side fan out
//! along it, how parallel Z routes stagger their middle legs, and the final
//! geometry of every arrow, trimmed to the outlines of the shapes it joins.
//!
//! The board is a flat list of elements in drawing order. TypeScript
//! resolves each element's layout box (its `ElementLayoutBoxResolver`) and
//! rotation before handing the board over, so nothing here calls back.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use crate::js;
use crate::routing::{self, BendAxis, ElbowShape, Pt, RouteBox, Side, MIN_ARROW_END_LEG};
use crate::shape_paths::{self, Kind};

/// Widest gap between neighboring arrow ends on one side.
pub const MAX_ARROW_END_SPACING: f64 = 24.0;
/// Arrow ends keep this far from a side's corners.
pub const ARROW_END_CORNER_MARGIN: f64 = 12.0;
/// Automatic Z routes with a smaller jog straighten by sliding their ends.
pub const ARROW_STRAIGHTEN_LIMIT: f64 = 32.0;
/// The same for routes with a manual jog or bend (`routing.ts`).
pub const MANUAL_ARROW_STRAIGHTEN_LIMIT: f64 = 12.0;
/// Passes of the ordering heuristic for staggered legs.
pub const ARROW_END_ORDER_PASSES: usize = 4;

const EPSILON: f64 = 0.000001;

/* -------------------------------------------------------------------------- */
/* Ends and arrows                                                             */
/* -------------------------------------------------------------------------- */

/// A resolved arrow end: the (rotated) bounds of its element, or a free point.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum EndGeom {
    Point(f64, f64),
    Box(RouteBox),
}

impl EndGeom {
    pub fn is_box(&self) -> bool {
        matches!(self, EndGeom::Box(_))
    }
    pub fn center(&self) -> Pt {
        match *self {
            EndGeom::Point(x, y) => [x, y],
            EndGeom::Box(b) => [b.x + b.w / 2.0, b.y + b.h / 2.0],
        }
    }
    pub fn as_box(&self) -> RouteBox {
        match *self {
            EndGeom::Point(x, y) => RouteBox { x, y, w: 0.0, h: 0.0 },
            EndGeom::Box(b) => b,
        }
    }
}

/// An arrow's `from` or `to`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum EndRef {
    /// A free point; `alias` is the element whose id is `String([x, y])`, if any.
    Point { x: f64, y: f64, alias: Option<usize> },
    /// An element id found on the board (the element's index).
    Element(usize),
    /// An element id not on the board.
    Missing,
}

impl EndRef {
    /// `typeof end === 'string'`.
    pub fn is_id(&self) -> bool {
        !matches!(self, EndRef::Point { .. })
    }
    /// `board.get(end)` for an id end.
    pub fn target(&self) -> Option<usize> {
        match *self {
            EndRef::Element(index) => Some(index),
            _ => None,
        }
    }
    /// `board.get(String(end))`.
    pub fn keyed(&self) -> Option<usize> {
        match *self {
            EndRef::Element(index) => Some(index),
            EndRef::Point { alias, .. } => alias,
            EndRef::Missing => None,
        }
    }
}

/// The route-relevant fields of an arrow.
#[derive(Clone, Debug, PartialEq)]
pub struct ArrowFields {
    pub from: EndRef,
    pub to: EndRef,
    pub from_side: Option<Side>,
    pub to_side: Option<Side>,
    pub jog: Option<f64>,
    /// The first axis and the bend values after it.
    pub bends: Option<(BendAxis, Vec<f64>)>,
}

impl ArrowFields {
    fn end(&self, end: usize) -> &EndRef {
        if end == 0 { &self.from } else { &self.to }
    }
    /// A jog, or exactly one bend.
    pub fn has_manual_route(&self) -> bool {
        self.jog.is_some() || self.bends.as_ref().is_some_and(|(_, values)| values.len() == 1)
    }
    pub fn straighten_limit(&self) -> f64 {
        if self.has_manual_route() { MANUAL_ARROW_STRAIGHTEN_LIMIT } else { ARROW_STRAIGHTEN_LIMIT }
    }
}

/// How an arrow's ends spread along their sides and how its Z middle leg staggers.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Spread {
    pub exits: [f64; 2],
    pub stagger: f64,
    pub turns: bool,
}

pub const NO_SPREAD: Spread = Spread { exits: [0.0, 0.0], stagger: 0.0, turns: false };

/// An elbow route with the sides and exits it uses.
#[derive(Clone, Debug, PartialEq)]
pub struct ElbowRoute {
    pub pts: Vec<Pt>,
    pub sides: [Side; 2],
    pub exits: [f64; 2],
    pub bent: bool,
    pub flat: bool,
    pub z: bool,
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

fn is_vertical(side: Side) -> bool {
    matches!(side, Side::Left | Side::Right)
}

pub fn opposite(side: Side) -> Side {
    match side {
        Side::Left => Side::Right,
        Side::Right => Side::Left,
        Side::Top => Side::Bottom,
        Side::Bottom => Side::Top,
    }
}

pub fn box_side_midpoint(b: &RouteBox, side: Side) -> Pt {
    match side {
        Side::Top => [b.x + b.w / 2.0, b.y],
        Side::Bottom => [b.x + b.w / 2.0, b.y + b.h],
        Side::Left => [b.x, b.y + b.h / 2.0],
        Side::Right => [b.x + b.w, b.y + b.h / 2.0],
    }
}

pub fn box_side_toward_point(b: &RouteBox, x: f64, y: f64) -> Side {
    let rel_x = (x - (b.x + b.w / 2.0)) / js::max(1.0, b.w);
    let rel_y = (y - (b.y + b.h / 2.0)) / js::max(1.0, b.h);
    if rel_x.abs() > rel_y.abs() {
        return if rel_x > 0.0 { Side::Right } else { Side::Left };
    }
    if rel_y > 0.0 { Side::Bottom } else { Side::Top }
}

pub fn arrow_end_sides(arrow: &ArrowFields, from: &EndGeom, to: &EndGeom) -> [Side; 2] {
    let (from_center, to_center) = (from.center(), to.center());
    [
        (if from.is_box() { arrow.from_side } else { None }).unwrap_or_else(|| box_side_toward_point(&from.as_box(), to_center[0], to_center[1])),
        (if to.is_box() { arrow.to_side } else { None }).unwrap_or_else(|| box_side_toward_point(&to.as_box(), from_center[0], from_center[1])),
    ]
}

pub fn arrow_end_precedes(a: &EndGeom, b: &EndGeom) -> bool {
    let (ca, cb) = (a.center(), b.center());
    ca[0] < cb[0] || (ca[0] == cb[0] && ca[1] <= cb[1])
}

pub fn box_side_length(end: &EndGeom, side: Side) -> f64 {
    match end {
        EndGeom::Box(b) => {
            if is_vertical(side) {
                b.h
            } else {
                b.w
            }
        }
        EndGeom::Point(..) => 0.0,
    }
}

pub fn max_arrow_end_offset(end: &EndGeom, side: Side) -> f64 {
    js::max(0.0, box_side_length(end, side) / 2.0 - ARROW_END_CORNER_MARGIN)
}

pub fn rotate_point_around(point: Pt, center: Pt, degrees: f64) -> Pt {
    let radians = (degrees * core::f64::consts::PI) / 180.0;
    let (cos, sin) = (js::cos(radians), js::sin(radians));
    let (dx, dy) = (point[0] - center[0], point[1] - center[1]);
    [center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos]
}

pub fn rotated_bounding_box(b: RouteBox, degrees: f64) -> RouteBox {
    if !js::truthy(degrees) {
        return b;
    }
    let radians = (degrees * core::f64::consts::PI) / 180.0;
    let (cos, sin) = (js::cos(radians).abs(), js::sin(radians).abs());
    let (w, h) = (b.w * cos + b.h * sin, b.w * sin + b.h * cos);
    RouteBox { x: b.x + (b.w - w) / 2.0, y: b.y + (b.h - h) / 2.0, w, h }
}

/// The origins of the bend values after the first axis.
pub fn bend_origins(first: BendAxis, count: usize, from_center: Pt, to_center: Pt) -> Vec<f64> {
    let half = count.div_ceil(2);
    (0..count)
        .map(|index| {
            let center = if index < half { from_center } else { to_center };
            if (first == BendAxis::H) == (index % 2 == 0) { center[0] } else { center[1] }
        })
        .collect()
}

/// `routeDirectionsKey` as comparable values: each leg's two signs, NaN as 2.
pub fn route_directions(points: Option<&[Pt]>) -> Vec<[i8; 2]> {
    let points = points.unwrap_or(&[]);
    let code = |value: f64| -> i8 {
        let sign = js::sign(value);
        if sign.is_nan() { 2 } else { sign as i8 }
    };
    points.windows(2).map(|pair| [code(pair[1][0] - pair[0][0]), code(pair[1][1] - pair[0][1])]).collect()
}

/* -------------------------------------------------------------------------- */
/* Routing one arrow                                                           */
/* -------------------------------------------------------------------------- */

pub fn route_elbow_arrow(arrow: &ArrowFields, from: &EndGeom, to: &EndGeom, spread: &Spread) -> Option<ElbowRoute> {
    let (from_center, to_center) = (from.center(), to.center());
    let has_spread = spread.exits[0] != 0.0 || spread.exits[1] != 0.0;
    let (from_box, to_box) = (from.as_box(), to.as_box());
    let from_side = if from.is_box() { arrow.from_side } else { None };
    let to_side = if to.is_box() { arrow.to_side } else { None };
    if let Some((first, others)) = &arrow.bends {
        let shift = bend_origins(*first, others.len(), from_center, to_center);
        let shifted: Vec<f64> = others.iter().zip(&shift).map(|(value, origin)| value + origin).collect();
        let route_with = |exits: [f64; 2]| routing::build_route_from_bends(&from_box, from_side, &to_box, to_side, *first, &shifted, 0.0, exits).ok();
        let bent_route = route_with(NO_SPREAD.exits);
        let bent_spread_route = if has_spread { route_with(spread.exits) } else { None };
        let (bend_from, bend_to) = routing::sides_for_bends(&from_box, &to_box, *first, &shifted);
        let end_sides = arrow_end_sides(arrow, from, to);
        let spread_used = bent_spread_route.is_some();
        let bent_ok = bent_route.is_some();
        if let Some(route) = bent_spread_route.or(bent_route) {
            if bent_ok || (bend_from == end_sides[0] && bend_to == end_sides[1]) {
                return Some(ElbowRoute {
                    pts: route,
                    sides: [bend_from, bend_to],
                    exits: if spread_used { spread.exits } else { NO_SPREAD.exits },
                    bent: true,
                    flat: false,
                    z: false,
                });
            }
        }
    }
    let sides = arrow_end_sides(arrow, from, to);
    let jog = arrow.jog.unwrap_or(spread.stagger);
    let plan_with = |exits: [f64; 2]| routing::plan_elbow_route(&from_box, sides[0], &to_box, sides[1], jog, exits);
    let plain = plan_with(NO_SPREAD.exits);
    let same_shape = |a: ElbowShape, b: ElbowShape| a == b || (matches!(a, ElbowShape::Z | ElbowShape::Level) && matches!(b, ElbowShape::Z | ElbowShape::Level));
    let spread_route = if plain.is_some() && has_spread { plan_with(spread.exits) } else { None };
    let chosen = match (&plain, spread_route) {
        (Some(plain), Some(spread_route)) if same_shape(plain.shape, spread_route.shape) => Some(spread_route),
        _ => None,
    };
    let was_chosen = chosen.is_some();
    let route = chosen.or(plain)?;
    let jog = match (route.pts.first(), route.pts.last()) {
        (Some(first), Some(last)) => js::min((last[0] - first[0]).abs(), (last[1] - first[1]).abs()),
        _ => f64::INFINITY,
    };
    let flat = !spread.turns && jog < arrow.straighten_limit() && jog <= max_arrow_end_offset(from, sides[0]) + max_arrow_end_offset(to, sides[1]);
    let is_z = route.shape == ElbowShape::Z;
    Some(ElbowRoute {
        pts: route.pts,
        sides,
        exits: if was_chosen { spread.exits } else { NO_SPREAD.exits },
        bent: false,
        flat: is_z && flat,
        z: is_z && !flat,
    })
}

/// One arrow end's use of an element side.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SideUse {
    pub order: f64,
    pub way: f64,
    pub depth: f64,
    pub far: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct EndSideUses {
    pub sides: [Side; 2],
    pub uses: [Option<SideUse>; 2],
    pub flat: bool,
}

pub fn arrow_end_side_uses(arrow: &ArrowFields, spacing: f64, from: &EndGeom, to: &EndGeom, route: Option<&ElbowRoute>) -> EndSideUses {
    let sides = route.map_or_else(|| arrow_end_sides(arrow, from, to), |route| route.sides);
    let precedes = arrow_end_precedes(from, to);
    let use_at = |end: usize| -> Option<SideUse> {
        let (this, other) = if end == 0 { (from, to) } else { (to, from) };
        if !arrow.end(end).is_id() || !this.is_box() {
            return None;
        }
        let side = sides[end];
        let (along, across) = if is_vertical(side) { (1, 0) } else { (0, 1) };
        let order = if matches!(side, Side::Right | Side::Top) == ((end == 0) == precedes) { spacing } else { -spacing };
        if let Some(route) = route {
            let n = route.pts.len();
            let at = |i: usize| if end == 0 { route.pts[i] } else { route.pts[n - 1 - i] };
            if n >= 3 && !route.flat {
                let (p0, p1, p2, last) = (at(0), at(1), at(2), at(n - 1));
                return Some(SideUse {
                    order,
                    way: js::sign(p2[along] - p1[along]),
                    depth: (p1[across] - p0[across]).abs(),
                    far: (last[along] - p0[along]).abs(),
                });
            }
        }
        let delta = other.center()[along] - this.center()[along];
        Some(SideUse { order, way: if route.is_some() { 0.0 } else { js::sign(delta) }, depth: f64::INFINITY, far: delta.abs() })
    };
    EndSideUses { sides, uses: [use_at(0), use_at(1)], flat: route.is_some_and(|route| route.flat) }
}

/// `compareArrowSideUses`.
pub fn compare_side_uses(a: &SideUse, b: &SideUse) -> f64 {
    let way = a.way - b.way;
    if js::truthy(way) {
        return way;
    }
    let inner = if a.way < 0.0 {
        let depth = a.depth - b.depth;
        if js::truthy(depth) { depth } else { b.far - a.far }
    } else if a.way > 0.0 {
        let depth = b.depth - a.depth;
        if js::truthy(depth) { depth } else { a.far - b.far }
    } else {
        0.0
    };
    if js::truthy(inner) {
        return inner;
    }
    a.order - b.order
}

/// Offsets along a side for the (ordered) ends sharing it; only `way` matters.
pub fn spread_arrow_end_offsets(ways: &[f64], side_length: f64) -> Vec<f64> {
    let n = ways.len() as f64;
    let backward = ways.iter().filter(|way| **way < 0.0).count() as f64;
    let straight = ways.iter().filter(|way| **way == 0.0).count() as f64;
    let center = if straight > 0.0 { backward + (straight - 1.0) / 2.0 } else { (n - 1.0) / 2.0 };
    let max_distance = js::max(center, n - 1.0 - center);
    let step = if max_distance == 0.0 { 0.0 } else { js::min(MAX_ARROW_END_SPACING, js::max(0.0, side_length / 2.0 - ARROW_END_CORNER_MARGIN) / max_distance) };
    (0..ways.len()).map(|index| (index as f64 - center) * step).collect()
}

/// What `straightenFacingArrowExits` decides before asking `canUseExit`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Straighten {
    /// Return the given exits unchanged.
    Keep,
    /// Try these candidates in order (preferred end first).
    Try([[f64; 2]; 2]),
}

pub fn straighten_candidates(arrow: &ArrowFields, exits: [f64; 2], prefer_end: usize, sides: [Side; 2], from: &EndGeom, to: &EndGeom) -> Straighten {
    if opposite(sides[0]) != sides[1] {
        return Straighten::Keep;
    }
    let (cross, along) = if is_vertical(sides[0]) { (1, 0) } else { (0, 1) };
    let direction = if matches!(sides[0], Side::Right | Side::Bottom) { 1.0 } else { -1.0 };
    let (from_box, to_box) = (from.as_box(), to.as_box());
    let overlaps_back = (box_side_midpoint(&to_box, sides[0])[along] - box_side_midpoint(&from_box, sides[1])[along]) * direction < 0.0;
    let nearly_touching = (box_side_midpoint(&to_box, sides[1])[along] - box_side_midpoint(&from_box, sides[0])[along]) * direction < MAX_ARROW_END_SPACING;
    let offset = to.center()[cross] - from.center()[cross];
    let shifted_offset = offset + exits[1] - exits[0];
    let jog = if arrow.has_manual_route() { offset.abs() } else { js::min(offset.abs(), shifted_offset.abs()) };
    if overlaps_back || shifted_offset == 0.0 || jog >= (if nearly_touching { MANUAL_ARROW_STRAIGHTEN_LIMIT } else { arrow.straighten_limit() }) {
        return Straighten::Keep;
    }
    let candidate = |end: usize| -> [f64; 2] {
        let max_offset = max_arrow_end_offset(if end == 0 { from } else { to }, sides[end]);
        let clamped = js::max(-max_offset, js::min(max_offset, exits[end] + if end == 0 { shifted_offset } else { -shifted_offset }));
        if end == 0 { [clamped, clamped - offset] } else { [clamped + offset, clamped] }
    };
    let other = if prefer_end == 0 { 1 } else { 0 };
    Straighten::Try([candidate(prefer_end), candidate(other)])
}

pub fn straighten_facing_arrow_exits(
    arrow: &ArrowFields,
    exits: [f64; 2],
    prefer_end: usize,
    mut can_use_exit: impl FnMut(usize, f64) -> bool,
    sides: [Side; 2],
    from: &EndGeom,
    to: &EndGeom,
) -> Option<[f64; 2]> {
    match straighten_candidates(arrow, exits, prefer_end, sides, from, to) {
        Straighten::Keep => Some(exits),
        Straighten::Try(candidates) => candidates.into_iter().find(|candidate| (0..2).all(|end| candidate[end] == exits[end] || can_use_exit(end, candidate[end]))),
    }
}

/* -------------------------------------------------------------------------- */
/* Staggering parallel Z legs                                                  */
/* -------------------------------------------------------------------------- */

/// An arrow's automatic Z route for staggering: its start, first corner and end.
pub type ZLeg = (Pt, Pt, Pt);

/// The Z points of a route (`route?.z ? route.pts : []` with all three present).
pub fn z_leg(route: Option<&ElbowRoute>) -> Option<ZLeg> {
    let route = route?;
    (route.z && route.pts.len() >= 4).then(|| (route.pts[0], route.pts[1], route.pts[3]))
}

#[derive(Clone, Copy, Debug)]
struct StaggerLeg {
    arrow: usize,
    place: f64,
    ends_level: bool,
    at: f64,
    before: f64,
    after: f64,
    room: [f64; 2],
    group: usize,
}

/// Staggers of parallel Z routes, as `(arrow index, stagger)` in the order
/// TypeScript sets them. `legs[i]` is arrow i's place and its Z leg (when
/// it has no jog and its stagger-0 route is a Z).
pub fn stagger_parallel_arrows(legs_in: &[(f64, Option<ZLeg>)]) -> Vec<(usize, f64)> {
    let mut legs: Vec<StaggerLeg> = Vec::new();
    for (arrow, (place, z)) in legs_in.iter().enumerate() {
        let Some((start, corner, end)) = *z else { continue };
        let (main, cross) = if start[1] == corner[1] { (0, 1) } else { (1, 0) };
        let (near, far) = if start[main] < end[main] { (start, end) } else { (end, start) };
        legs.push(StaggerLeg {
            arrow,
            place: *place,
            ends_level: main == 0,
            at: corner[main],
            before: near[cross],
            after: far[cross],
            room: [near[main] + MIN_ARROW_END_LEG, far[main] - MIN_ARROW_END_LEG],
            group: legs.len(),
        });
    }
    let between = |value: f64, leg: &StaggerLeg| -> f64 { if value > js::min(leg.before, leg.after) && value < js::max(leg.before, leg.after) { 1.0 } else { 0.0 } };
    let overlaps = |a: &StaggerLeg, b: &StaggerLeg| -> bool {
        js::min(js::max(a.before, a.after), js::max(b.before, b.after)) > js::max(js::min(a.before, a.after), js::min(b.before, b.after))
    };
    for index in 0..legs.len() {
        for other_index in 0..index {
            let (leg, other) = (legs[index], legs[other_index]);
            if leg.group == other.group || leg.ends_level != other.ends_level || (leg.at - other.at).abs() >= MAX_ARROW_END_SPACING || !overlaps(&leg, &other) {
                continue;
            }
            let (from, into) = (leg.group, other.group);
            for any in legs.iter_mut() {
                if any.group == from {
                    any.group = into;
                }
            }
        }
    }
    let mut groups: Vec<usize> = Vec::new();
    for leg in &legs {
        if !groups.contains(&leg.group) {
            groups.push(leg.group);
        }
    }
    let mut staggers = Vec::new();
    for group in groups {
        // Legs are referred to by their index in `legs` (identity in TypeScript).
        let mut matches: Vec<usize> = (0..legs.len()).filter(|&i| legs[i].group == group).collect();
        if matches.len() < 2 {
            continue;
        }
        let crossing_cost = |a: usize, b: usize| -> f64 { between(legs[a].after, &legs[b]) + between(legs[b].before, &legs[a]) };
        js::sort_by(&mut matches, |&a, &b| {
            let (a, b) = (&legs[a], &legs[b]);
            let before = a.before - b.before;
            if js::truthy(before) {
                return before;
            }
            let after = a.after - b.after;
            if js::truthy(after) {
                return after;
            }
            a.place - b.place
        });
        let mut pass = 0;
        let mut moved = true;
        while moved && pass < ARROW_END_ORDER_PASSES {
            moved = false;
            for leg in matches.clone() {
                let from_index = matches.iter().position(|&m| m == leg).unwrap();
                matches.remove(from_index);
                let mut cost = matches.iter().fold(0.0, |total, &other| total + crossing_cost(leg, other));
                let mut costs = Vec::with_capacity(matches.len() + 1);
                costs.push(cost);
                for &other in &matches {
                    cost += crossing_cost(other, leg) - crossing_cost(leg, other);
                    costs.push(cost);
                }
                let min_cost = js::min_of(costs.iter().copied());
                let best_index = if costs[from_index] == min_cost { from_index } else { costs.iter().position(|&c| c == min_cost).unwrap_or(usize::MAX) };
                // `costs.indexOf` never misses: the minimum is one of the costs.
                matches.insert(best_index, leg);
                moved = moved || best_index != from_index;
            }
            pass += 1;
        }
        let mut lanes: Vec<(usize, f64)> = Vec::with_capacity(matches.len());
        for &leg in &matches {
            let lane = js::max_of(std::iter::once(0.0).chain(lanes.iter().map(|&(other, lane)| if overlaps(&legs[other], &legs[leg]) { lane + 1.0 } else { 0.0 })));
            match lanes.iter_mut().find(|(other, _)| *other == leg) {
                Some(entry) => entry.1 = lane,
                None => lanes.push((leg, lane)),
            }
        }
        let lane_count = js::max_of(lanes.iter().map(|&(_, lane)| lane));
        let room_start = js::max_of(matches.iter().map(|&leg| legs[leg].room[0]));
        let room_end = js::min_of(matches.iter().map(|&leg| legs[leg].room[1]));
        let spacing = js::min(MAX_ARROW_END_SPACING, js::max(0.0, room_end - room_start) / lane_count);
        let spread = js::max_of(matches.iter().map(|&leg| legs[leg].at)) - js::min_of(matches.iter().map(|&leg| legs[leg].at));
        if lane_count * spacing <= spread {
            continue;
        }
        let mean = matches.iter().fold(0.0, |sum, &leg| sum + legs[leg].at) / matches.len() as f64;
        let center = js::max(room_start + (lane_count * spacing) / 2.0, js::min(room_end - (lane_count * spacing) / 2.0, mean));
        for &(leg, lane) in &lanes {
            staggers.push((legs[leg].arrow, center + (lane - lane_count / 2.0) * spacing - legs[leg].at));
        }
    }
    staggers
}

/* -------------------------------------------------------------------------- */
/* The board                                                                   */
/* -------------------------------------------------------------------------- */

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ElemType {
    Other,
    Arrow,
    Shape,
}

/// One board element: what arrow layout needs of it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Elem {
    pub ty: ElemType,
    /// A shape's kind, size (its own `w`/`h`).
    pub kind: Kind,
    pub w: f64,
    pub h: f64,
    /// `elementTurn(element)`.
    pub turn: f64,
    /// The resolver's unrotated layout box (only needed for arrow ends).
    pub layout: Option<RouteBox>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BoardArrow {
    /// The arrow's element index.
    pub elem: usize,
    pub fields: ArrowFields,
}

/// A board in drawing order, with its arrows in the same order.
#[derive(Clone, Debug, Default)]
pub struct Board {
    pub elems: Vec<Elem>,
    pub arrows: Vec<BoardArrow>,
}

/// Where an arrow is drawn.
#[derive(Clone, Debug, PartialEq)]
pub struct Geometry {
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub elbow: Option<Vec<Pt>>,
    pub bent: bool,
}

struct Planned {
    arrow: usize,
    from: EndGeom,
    to: EndGeom,
    place: f64,
}

#[derive(Clone)]
struct Group {
    length: f64,
    /// (planned index, end).
    uses: Vec<(usize, usize)>,
}

fn stagger_key(stagger: f64) -> u64 {
    if stagger == 0.0 {
        0
    } else if stagger.is_nan() {
        f64::NAN.to_bits()
    } else {
        stagger.to_bits()
    }
}

impl Board {
    pub fn element_bounds(&self, index: usize) -> Option<RouteBox> {
        let elem = self.elems.get(index)?;
        elem.layout.map(|b| rotated_bounding_box(b, elem.turn))
    }

    /// `resolveArrowEndGeometry`.
    pub fn resolve(&self, end: &EndRef) -> Option<EndGeom> {
        match *end {
            EndRef::Point { x, y, .. } => Some(EndGeom::Point(x, y)),
            EndRef::Element(index) => {
                if self.elems.get(index)?.ty == ElemType::Arrow {
                    None
                } else {
                    self.element_bounds(index).map(EndGeom::Box)
                }
            }
            EndRef::Missing => None,
        }
    }

    /// `planBoardArrows`: the spread of each arrow (`None` when an end is missing).
    pub fn plan_arrows(&self) -> Vec<Option<Spread>> {
        let mut planned: Vec<Planned> = Vec::new();
        for (arrow, entry) in self.arrows.iter().enumerate() {
            if let (Some(from), Some(to)) = (self.resolve(&entry.fields.from), self.resolve(&entry.fields.to)) {
                planned.push(Planned { arrow, from, to, place: (entry.elem + 1) as f64 });
            }
        }
        let mut turning = vec![false; planned.len()];
        let mut cache: HashMap<(usize, u64, bool), Option<ElbowRoute>> = HashMap::new();
        loop {
            let (plans, still_turn) = self.plan_pass(&planned, &turning, &mut cache);
            if still_turn.is_empty() {
                return plans;
            }
            for index in still_turn {
                turning[index] = true;
            }
        }
    }

    fn plan_pass(&self, planned: &[Planned], turning: &[bool], cache: &mut HashMap<(usize, u64, bool), Option<ElbowRoute>>) -> (Vec<Option<Spread>>, Vec<usize>) {
        let mut route_for = |index: usize, stagger: f64| -> Option<ElbowRoute> {
            let entry = &planned[index];
            let key = (index, stagger_key(stagger), turning[index]);
            cache
                .entry(key)
                .or_insert_with(|| {
                    let fields = &self.arrows[entry.arrow].fields;
                    route_elbow_arrow(fields, &entry.from, &entry.to, &Spread { exits: [0.0, 0.0], stagger, turns: turning[index] })
                })
                .clone()
        };
        let legs: Vec<(f64, Option<ZLeg>)> = planned
            .iter()
            .enumerate()
            .map(|(index, entry)| {
                let z = if self.arrows[entry.arrow].fields.jog.is_none() { z_leg(route_for(index, 0.0).as_ref()) } else { None };
                (entry.place, z)
            })
            .collect();
        let mut staggers: Vec<Option<f64>> = vec![None; planned.len()];
        for (index, value) in stagger_parallel_arrows(&legs) {
            staggers[index] = Some(value);
        }
        let uses: Vec<EndSideUses> = planned
            .iter()
            .enumerate()
            .map(|(index, entry)| {
                let route = route_for(index, staggers[index].unwrap_or(0.0));
                arrow_end_side_uses(&self.arrows[entry.arrow].fields, entry.place, &entry.from, &entry.to, route.as_ref())
            })
            .collect();
        let fields_of = |index: usize| &self.arrows[planned[index].arrow].fields;
        let mut groups: Vec<Group> = Vec::new();
        let mut group_index: HashMap<(usize, u8), usize> = HashMap::new();
        let key_of = |index: usize, end: usize, sides: &[Side; 2]| -> Option<(usize, u8)> { fields_of(index).end(end).keyed().map(|elem| (elem, sides[end] as u8)) };
        for (index, entry) in uses.iter().enumerate() {
            for end in 0..2 {
                if entry.uses[end].is_none() {
                    continue;
                }
                let key = key_of(index, end, &entry.sides).expect("a side use has an element end");
                let slot = *group_index.entry(key).or_insert_with(|| {
                    let geom = if end == 0 { &planned[index].from } else { &planned[index].to };
                    groups.push(Group { length: box_side_length(geom, entry.sides[end]), uses: Vec::new() });
                    groups.len() - 1
                });
                groups[slot].uses.push((index, end));
            }
        }
        let use_of = |(index, end): (usize, usize)| uses[index].uses[end].unwrap();
        let mut offsets: Vec<[f64; 2]> = vec![[0.0, 0.0]; planned.len()];
        for group in groups.iter_mut() {
            js::sort_by(&mut group.uses, |a, b| compare_side_uses(&use_of(*a), &use_of(*b)));
            let ways: Vec<f64> = group.uses.iter().map(|u| use_of(*u).way).collect();
            let spread = spread_arrow_end_offsets(&ways, group.length);
            for (slot, &(index, end)) in group.uses.iter().enumerate() {
                offsets[index][end] = spread[slot];
            }
        }
        let mut plans: Vec<Option<Spread>> = vec![None; self.arrows.len()];
        let mut still_turn: Vec<usize> = Vec::new();
        for (index, entry) in uses.iter().enumerate() {
            let fields = fields_of(index);
            let geoms = [planned[index].from, planned[index].to];
            let offset_of = |offsets: &Vec<[f64; 2]>, end: usize| if entry.uses[end].is_some() { offsets[index][end] } else { 0.0 };
            let end_score = |offsets: &Vec<[f64; 2]>, end: usize| -> [f64; 4] {
                let side = entry.sides[end];
                let target = fields.end(end).keyed();
                let inset = match target.map(|t| &self.elems[t]) {
                    Some(elem) if elem.ty == ElemType::Shape => (shape_paths::shape_edge_inset(elem.kind, elem.w, elem.h, side, ARROW_END_CORNER_MARGIN, 0.0)
                        - shape_paths::shape_edge_inset(elem.kind, elem.w, elem.h, side, 0.0, 0.0))
                    .abs(),
                    _ => 0.0,
                };
                [
                    if offset_of(offsets, end) == 0.0 { 1.0 } else { 0.0 },
                    if inset > 1.0 { 0.0 } else { 1.0 },
                    box_side_length(&geoms[end], side),
                    -target.map_or(0.0, |t| (t + 1) as f64),
                ]
            };
            let (from_score, to_score) = (end_score(&offsets, 0), end_score(&offsets, 1));
            let prefer_end = match (0..4).find(|&i| from_score[i] != to_score[i] || from_score[i].is_nan()) {
                Some(i) => {
                    if from_score[i] >= to_score[i] {
                        0
                    } else {
                        1
                    }
                }
                None => 0,
            };
            let current = [offset_of(&offsets, 0), offset_of(&offsets, 1)];
            let shifted = {
                let can_use_exit = |end: usize, offset: f64| -> bool {
                    let Some(_) = entry.uses[end] else { return false };
                    let Some(&slot) = key_of(index, end, &entry.sides).and_then(|key| group_index.get(&key)) else { return false };
                    let group = &groups[slot];
                    if offset.abs() > js::max(0.0, group.length / 2.0 - ARROW_END_CORNER_MARGIN) {
                        return false;
                    }
                    let mine = offset_of(&offsets, end);
                    group.uses.iter().all(|&(other_index, other_end)| {
                        let other = offsets[other_index][other_end];
                        let before = other - mine;
                        let after = other - offset;
                        (other_index == index && other_end == end) || (before * after > 0.0 && after.abs() >= js::min(before.abs(), ARROW_END_CORNER_MARGIN))
                    })
                };
                straighten_facing_arrow_exits(fields, current, prefer_end, can_use_exit, entry.sides, &geoms[0], &geoms[1])
            };
            let signature = |exits: [f64; 2]| {
                let route = route_elbow_arrow(fields, &geoms[0], &geoms[1], &Spread { exits, stagger: 0.0, turns: false });
                route_directions(route.as_ref().map(|r| r.pts.as_slice()))
            };
            let exits = match shifted {
                Some(shifted) if fields.bends.is_some() && signature(shifted) != signature(current) => Some(current),
                other => other,
            };
            plans[planned[index].arrow] = Some(Spread { exits: exits.unwrap_or(current), stagger: staggers[index].unwrap_or(0.0), turns: false });
            for end in 0..2 {
                if let (Some(_), Some(exits)) = (entry.uses[end], exits) {
                    offsets[index][end] = exits[end];
                }
                if entry.flat && exits.is_none() {
                    if let Some(&slot) = key_of(index, end, &entry.sides).and_then(|key| group_index.get(&key)) {
                        for &(other_index, _) in &groups[slot].uses {
                            if uses[other_index].flat && !still_turn.contains(&other_index) {
                                still_turn.push(other_index);
                            }
                        }
                    }
                }
            }
        }
        (plans, still_turn)
    }

    /* ---------------------------------------------------------------------- */
    /* Trimming to outlines                                                    */
    /* ---------------------------------------------------------------------- */

    /// `outlineHitFraction` for element `index`.
    pub fn outline_hit_fraction(&self, index: usize, start: Pt, end: Pt) -> Option<f64> {
        outline_hit_fraction(&self.elems[index], start, end)
    }

    pub fn rotated_outline_inset(&self, index: usize, side: Side, at: f64) -> f64 {
        rotated_outline_inset(&self.elems[index], side, at)
    }

    /// `insetArrowEndsToOutline`.
    pub fn inset_ends_to_outline(&self, points: &[Pt], from: &EndRef, to: &EndRef, sides: [Side; 2], exits: [f64; 2]) -> Vec<Pt> {
        let mut trimmed = points.to_vec();
        let ends = [(0usize, from, sides[0], exits[0]), (points.len().wrapping_sub(1), to, sides[1], exits[1])];
        for (index, end_ref, side, exit) in ends {
            let Some(target) = end_ref.target().and_then(|t| self.elems.get(t)) else { continue };
            let Some(&point) = trimmed.get(index) else { continue };
            if target.ty != ElemType::Shape && target.turn == 0.0 {
                continue;
            }
            let outline_inset = |offset: f64| if target.ty == ElemType::Shape { shape_paths::shape_edge_inset(target.kind, target.w, target.h, side, offset, 0.0) } else { 0.0 };
            let inset = if target.turn != 0.0 {
                rotated_outline_inset(target, side, if is_vertical(side) { point[1] } else { point[0] })
            } else {
                js::max(0.0, outline_inset(exit) - if target.ty == ElemType::Shape && target.kind == Kind::Parallelogram { outline_inset(0.0) } else { 0.0 })
            };
            trimmed[index] = match side {
                Side::Left => [point[0] + inset, point[1]],
                Side::Right => [point[0] - inset, point[1]],
                Side::Top => [point[0], point[1] + inset],
                Side::Bottom => [point[0], point[1] - inset],
            };
        }
        trimmed
    }

    /// `arrowGeometry` with the arrow's plan already known.
    pub fn arrow_geometry(&self, arrow: &ArrowFields, plan: &Spread) -> Option<Geometry> {
        let from_end = self.resolve(&arrow.from)?;
        let to_end = self.resolve(&arrow.to)?;
        if let Some(route) = route_elbow_arrow(arrow, &from_end, &to_end, plan) {
            let trimmed = self.inset_ends_to_outline(&route.pts, &arrow.from, &arrow.to, route.sides, route.exits);
            if let (Some(&start), Some(&end)) = (trimmed.first(), trimmed.last()) {
                return Some(Geometry { x1: start[0], y1: start[1], x2: end[0], y2: end[1], elbow: Some(trimmed), bent: route.bent });
            }
        }
        let sides = arrow_end_sides(arrow, &from_end, &to_end);
        let offset_along = |point: Pt, side: Side, offset: f64| -> Pt { if is_vertical(side) { [point[0], point[1] + offset] } else { [point[0] + offset, point[1]] } };
        let anchor = |end: &EndGeom, side: Side, exit: f64| -> Pt {
            match end {
                EndGeom::Box(b) => offset_along(box_side_midpoint(b, side), side, exit),
                EndGeom::Point(x, y) => [*x, *y],
            }
        };
        let inset = self.inset_ends_to_outline(&[anchor(&from_end, sides[0], plan.exits[0]), anchor(&to_end, sides[1], plan.exits[1])], &arrow.from, &arrow.to, sides, plan.exits);
        let clip = |end_ref: &EndRef, endpoint: &EndGeom, fallback: Pt, from: Pt| -> Pt {
            let center = endpoint.center();
            let hit = match end_ref.target().and_then(|t| self.elems.get(t)) {
                Some(target) if target.turn != 0.0 => outline_hit_fraction(target, from, center),
                _ => None,
            };
            match hit {
                None => fallback,
                Some(t) => [from[0] + (center[0] - from[0]) * t, from[1] + (center[1] - from[1]) * t],
            }
        };
        let clipped_start = clip(&arrow.from, &from_end, inset[0], to_end.center());
        let clipped_end = clip(&arrow.to, &to_end, inset[1], clipped_start);
        let dx = clipped_end[0] - clipped_start[0];
        let dy = clipped_end[1] - clipped_start[1];
        let hyp = js::hypot2(dx, dy);
        let length = if js::truthy(hyp) { hyp } else { 1.0 };
        let gap = js::min(6.0, length / 3.0);
        let start_gap = if from_end.is_box() { gap } else { 0.0 };
        let end_gap = if to_end.is_box() { gap } else { 0.0 };
        Some(Geometry {
            x1: clipped_start[0] + (dx / length) * start_gap,
            y1: clipped_start[1] + (dy / length) * start_gap,
            x2: clipped_end[0] - (dx / length) * end_gap,
            y2: clipped_end[1] - (dy / length) * end_gap,
            elbow: None,
            bent: false,
        })
    }

    /// The geometry of every arrow on the board, each with its own plan.
    pub fn arrow_geometries(&self, plans: &[Option<Spread>]) -> Vec<Option<Geometry>> {
        self.arrows.iter().zip(plans).map(|(entry, plan)| self.arrow_geometry(&entry.fields, plan.as_ref().unwrap_or(&NO_SPREAD))).collect()
    }
}

/* -------------------------------------------------------------------------- */
/* Outlines                                                                    */
/* -------------------------------------------------------------------------- */

type OutlineKey = (u8, u64, u64);

thread_local! {
    static OUTLINE_CACHE: RefCell<(HashMap<OutlineKey, Rc<Vec<[f64; 4]>>>, std::collections::VecDeque<OutlineKey>)> = RefCell::new((HashMap::new(), std::collections::VecDeque::new()));
}

/// The outline of a shape as segments `[x1, y1, x2, y2]` in its own
/// coordinates. Cached (1024 entries, oldest dropped first) under a key that
/// treats -0 as 0, like the TypeScript cache keyed by `[kind, w, h].join()`.
pub fn shape_outline_segments(kind: Kind, w: f64, h: f64) -> Rc<Vec<[f64; 4]>> {
    let key = (kind as u8, stagger_key(w), stagger_key(h));
    if let Some(found) = OUTLINE_CACHE.with(|cache| cache.borrow().0.get(&key).cloned()) {
        return found;
    }
    let segments = Rc::new(shape_paths::curved_shape_line_segments(kind, w, h).unwrap_or_else(|| {
        let mut out = Vec::new();
        for side in [Side::Top, Side::Right, Side::Bottom, Side::Left] {
            let span = if matches!(side, Side::Top | Side::Bottom) { w } else { h };
            let steps = js::min(128.0, js::max(32.0, js::round(span / 8.0)));
            if steps.is_nan() {
                continue;
            }
            let steps = steps as usize;
            let mut previous: Option<Pt> = None;
            for step in 0..=steps {
                let along = span * (step as f64 / steps as f64 - 0.5);
                let inset = shape_paths::shape_edge_inset(kind, w, h, side, along, 0.0);
                let point = match side {
                    Side::Top => [w / 2.0 + along, inset],
                    Side::Bottom => [w / 2.0 + along, h - inset],
                    Side::Left => [inset, h / 2.0 + along],
                    Side::Right => [w - inset, h / 2.0 + along],
                };
                if let Some(p) = previous {
                    out.push([p[0], p[1], point[0], point[1]]);
                }
                previous = Some(point);
            }
        }
        out
    }));
    OUTLINE_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        if cache.0.len() >= 1024 {
            if let Some(oldest) = cache.1.pop_front() {
                cache.0.remove(&oldest);
            }
        }
        cache.0.insert(key, segments.clone());
        cache.1.push_back(key);
    });
    segments
}

/// Where `start → end` first meets the element's outline, as a fraction of
/// its length (rotation and exact shape outlines honored); `None` when it
/// misses or starts inside.
pub fn outline_hit_fraction(elem: &Elem, start: Pt, end: Pt) -> Option<f64> {
    let b = elem.layout?;
    let center = [b.x + b.w / 2.0, b.y + b.h / 2.0];
    let local = |point: Pt| {
        let rotated = rotate_point_around(point, center, -elem.turn);
        [rotated[0] - b.x, rotated[1] - b.y]
    };
    let (local_start, local_end) = (local(start), local(end));
    let (dx, dy) = (local_end[0] - local_start[0], local_end[1] - local_start[1]);
    let (mut enter_t, mut exit_t) = (0.0f64, 1.0f64);
    for (origin, delta, size) in [(local_start[0], dx, b.w), (local_start[1], dy, b.h)] {
        if delta == 0.0 && (origin < 0.0 || origin > size) {
            return None;
        }
        if delta != 0.0 {
            let (a, c) = (-origin / delta, (size - origin) / delta);
            let next_enter = js::max(enter_t, js::min(a, c));
            let next_exit = js::min(exit_t, js::max(a, c));
            enter_t = next_enter;
            exit_t = next_exit;
        }
    }
    if enter_t > exit_t || (local_start[0] > EPSILON && local_start[0] < b.w - EPSILON && local_start[1] > EPSILON && local_start[1] < b.h - EPSILON) {
        return None;
    }
    let mut hit_t = f64::INFINITY;
    if elem.ty == ElemType::Shape {
        for &[x1, y1, x2, y2] in shape_outline_segments(elem.kind, elem.w, elem.h).iter() {
            let denominator = dx * (y2 - y1) - dy * (x2 - x1);
            let ray_t = ((x1 - local_start[0]) * (y2 - y1) - (y1 - local_start[1]) * (x2 - x1)) / denominator;
            let segment_t = ((x1 - local_start[0]) * dy - (y1 - local_start[1]) * dx) / denominator;
            if segment_t > -EPSILON && segment_t < 1.0 + EPSILON && ray_t > -EPSILON && ray_t < hit_t {
                hit_t = js::max(0.0, ray_t);
            }
        }
    }
    Some(if hit_t <= 1.0 { hit_t } else { enter_t })
}

/// How far inside a rotated element's bounds its outline is, along the line
/// `at` crossing `side`.
pub fn rotated_outline_inset(elem: &Elem, side: Side, at: f64) -> f64 {
    let Some(b) = elem.layout.map(|b| rotated_bounding_box(b, elem.turn)) else { return 0.0 };
    let (near, far) = if is_vertical(side) { ([b.x, at], [b.x + b.w, at]) } else { ([at, b.y], [at, b.y + b.h]) };
    let from_far = matches!(side, Side::Right | Side::Bottom);
    let hit = outline_hit_fraction(elem, if from_far { far } else { near }, if from_far { near } else { far });
    hit.unwrap_or(0.0) * if is_vertical(side) { b.w } else { b.h }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn js_sort_matches_v8_order() {
        let mut values = vec![3.0, 1.0, 2.0, 1.0, 5.0];
        js::sort_by(&mut values, |a, b| a - b);
        assert_eq!(values, vec![1.0, 1.0, 2.0, 3.0, 5.0]);
        // Stable: equal keys keep their order.
        let mut pairs = vec![(1, 'a'), (0, 'b'), (1, 'c'), (0, 'd')];
        js::sort_by(&mut pairs, |a, b| (a.0 - b.0) as f64);
        assert_eq!(pairs, vec![(0, 'b'), (0, 'd'), (1, 'a'), (1, 'c')]);
        let mut long: Vec<(i32, usize)> = (0..200).map(|i| ((i * 37 % 11) as i32, i)).collect();
        let mut expected = long.clone();
        expected.sort_by_key(|p| p.0);
        js::sort_by(&mut long, |a, b| (a.0 - b.0) as f64);
        assert_eq!(long, expected);
    }

    #[test]
    fn spreads_three_straight_ends() {
        assert_eq!(spread_arrow_end_offsets(&[0.0, 0.0, 0.0], 100.0), vec![-24.0, 0.0, 24.0]);
    }
}
