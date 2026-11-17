//! WASM facade of `arrow_layout`, decoded by `whiteboard-core/src/arrows/layout.ts`.
//!
//! Encodings (all numbers):
//! - an element is 10 numbers: type (0 other, 1 arrow, 2 shape), shape kind
//!   code, shape w, shape h, turn, has layout box (0/1), box x, y, w, h;
//! - an arrow is 15 numbers: element index, from end (4), to end (4),
//!   from side, to side (side codes, 255 none), has jog, jog, bend axis
//!   (-1 no bends, 0 `h`, 1 `v`), bend count; its bend values follow in a
//!   separate array;
//! - an end is kind (0 point, 1 element, 2 id not on the board), then x and
//!   y of a point or the element index, then the index of the element whose
//!   id is the point's `String` (-1 none);
//! - an end geometry is 5 numbers: is box (0/1), x, y, w, h;
//! - a geometry is `[0]` (none) or `[status, x1, y1, x2, y2, n, …points]`
//!   with status 1 straight, 2 elbow, 3 elbow through manual bends.

use super::{flat, points};
use crate::arrow_layout::{self as l, ArrowFields, Board, BoardArrow, Elem, ElemType, EndGeom, EndRef, Geometry, Spread, Straighten};
use crate::routing::{BendAxis, RouteBox, Side};
use crate::shape_paths::Kind;
use wasm_bindgen::prelude::*;

fn side_or_top(code: f64) -> Side {
    Side::from_code(code as u8).unwrap_or(Side::Top)
}

fn optional_side(code: f64) -> Option<Side> {
    if (0.0..4.0).contains(&code) { Side::from_code(code as u8) } else { None }
}

fn index_or_none(value: f64) -> Option<usize> {
    if value >= 0.0 { Some(value as usize) } else { None }
}

fn end_ref(v: &[f64]) -> EndRef {
    match v[0] as u8 {
        0 => EndRef::Point { x: v[1], y: v[2], alias: index_or_none(v[3]) },
        1 => EndRef::Element(v[1] as usize),
        _ => EndRef::Missing,
    }
}

/// An arrow record (15 numbers) and its bend values.
fn arrow_fields(v: &[f64], bends: &[f64]) -> ArrowFields {
    ArrowFields {
        from: end_ref(&v[1..5]),
        to: end_ref(&v[5..9]),
        from_side: optional_side(v[9]),
        to_side: optional_side(v[10]),
        jog: if v[11] != 0.0 { Some(v[12]) } else { None },
        bends: if v[13] < 0.0 { None } else { Some((if v[13] == 0.0 { BendAxis::H } else { BendAxis::V }, bends.to_vec())) },
    }
}

fn elem(v: &[f64]) -> Elem {
    Elem {
        ty: match v[0] as u8 {
            1 => ElemType::Arrow,
            2 => ElemType::Shape,
            _ => ElemType::Other,
        },
        kind: Kind::from_code(v[1] as u8),
        w: v[2],
        h: v[3],
        turn: v[4],
        layout: if v[5] != 0.0 { Some(RouteBox { x: v[6], y: v[7], w: v[8], h: v[9] }) } else { None },
    }
}

fn end_geom(v: &[f64]) -> EndGeom {
    if v[0] != 0.0 { EndGeom::Box(RouteBox { x: v[1], y: v[2], w: v[3], h: v[4] }) } else { EndGeom::Point(v[1], v[2]) }
}

fn push_geometry(out: &mut Vec<f64>, geometry: Option<Geometry>) {
    match geometry {
        None => out.push(0.0),
        Some(g) => {
            let status = match (&g.elbow, g.bent) {
                (None, _) => 1.0,
                (Some(_), false) => 2.0,
                (Some(_), true) => 3.0,
            };
            out.extend_from_slice(&[status, g.x1, g.y1, g.x2, g.y2]);
            match g.elbow {
                None => out.push(0.0),
                Some(points) => {
                    out.push(points.len() as f64);
                    out.extend(flat(&points));
                }
            }
        }
    }
}

/// A board for arrow layout, kept on the WebAssembly side so planning and
/// geometry calls do not resend it. Its plans are computed once.
#[wasm_bindgen]
pub struct GeomBoard {
    board: Board,
    plans: Option<Vec<Option<Spread>>>,
}

impl GeomBoard {
    fn plans_ref(&mut self) -> &Vec<Option<Spread>> {
        if self.plans.is_none() {
            self.plans = Some(self.board.plan_arrows());
        }
        self.plans.as_ref().unwrap()
    }
}

#[wasm_bindgen]
impl GeomBoard {
    #[wasm_bindgen(constructor)]
    pub fn new(elems: &[f64], arrows: &[f64], bends: &[f64]) -> GeomBoard {
        let elems: Vec<Elem> = elems.chunks_exact(10).map(elem).collect();
        let mut at = 0;
        let arrows = arrows
            .chunks_exact(15)
            .map(|record| {
                let count = if record[13] < 0.0 { 0 } else { record[14] as usize };
                let fields = arrow_fields(record, &bends[at..at + count]);
                at += count;
                BoardArrow { elem: record[0] as usize, fields }
            })
            .collect();
        GeomBoard { board: Board { elems, arrows }, plans: None }
    }

    /// Per arrow: planned (0/1), exit from, exit to, stagger.
    pub fn plans(&mut self) -> Vec<f64> {
        let mut out = Vec::new();
        for plan in self.plans_ref() {
            match plan {
                Some(p) => out.extend_from_slice(&[1.0, p.exits[0], p.exits[1], p.stagger]),
                None => out.extend_from_slice(&[0.0, 0.0, 0.0, 0.0]),
            }
        }
        out
    }

    /// The geometry of every arrow, concatenated in arrow order.
    pub fn geometries(&mut self) -> Vec<f64> {
        self.plans_ref();
        let plans = self.plans.as_ref().unwrap();
        let mut out = Vec::new();
        for geometry in self.board.arrow_geometries(plans) {
            push_geometry(&mut out, geometry);
        }
        out
    }

    /// Sets an element's layout box (boxes are sent only for the elements
    /// arrow ends name; a draft arrow may name another one).
    #[allow(clippy::too_many_arguments)]
    pub fn set_layout(&mut self, index: usize, has_box: bool, x: f64, y: f64, w: f64, h: f64) {
        if let Some(elem) = self.board.elems.get_mut(index) {
            elem.layout = if has_box { Some(RouteBox { x, y, w, h }) } else { None };
        }
    }

    /// The geometry of an arrow record with a given plan.
    pub fn geometry(&self, arrow: &[f64], bends: &[f64], exit_from: f64, exit_to: f64, stagger: f64) -> Vec<f64> {
        let mut out = Vec::new();
        let plan = Spread { exits: [exit_from, exit_to], stagger, turns: false };
        push_geometry(&mut out, self.board.arrow_geometry(&arrow_fields(arrow, bends), &plan));
        out
    }

    /// `insetArrowEndsToOutline` for an arrow record's ends.
    #[allow(clippy::too_many_arguments)]
    pub fn inset_ends(&self, pts: &[f64], arrow: &[f64], bends: &[f64], side_from: f64, side_to: f64, exit_from: f64, exit_to: f64) -> Vec<f64> {
        let fields = arrow_fields(arrow, bends);
        flat(&self.board.inset_ends_to_outline(&points(pts), &fields.from, &fields.to, [side_or_top(side_from), side_or_top(side_to)], [exit_from, exit_to]))
    }
}

/// `routeElbowArrow`: empty, or `[side from, side to, exit from, exit to, flags, …points]`;
/// flags: 1 bent, 2 flat, 4 z, 8 the exits are the spread's (else none).
#[allow(clippy::too_many_arguments)]
#[wasm_bindgen]
pub fn arrow_route_elbow(arrow: &[f64], bends: &[f64], ends: &[f64], exit_from: f64, exit_to: f64, stagger: f64, turns: bool) -> Vec<f64> {
    let fields = arrow_fields(arrow, bends);
    let spread = Spread { exits: [exit_from, exit_to], stagger, turns };
    match l::route_elbow_arrow(&fields, &end_geom(&ends[0..5]), &end_geom(&ends[5..10]), &spread) {
        None => Vec::new(),
        Some(route) => {
            let flags = (route.bent as u8) | ((route.flat as u8) << 1) | ((route.z as u8) << 2);
            let has_spread = spread.exits[0] != 0.0 || spread.exits[1] != 0.0;
            let from_spread = has_spread && route.exits[0].to_bits() == spread.exits[0].to_bits() && route.exits[1].to_bits() == spread.exits[1].to_bits();
            let flags = flags | ((from_spread as u8) << 3);
            let mut out = vec![route.sides[0] as u8 as f64, route.sides[1] as u8 as f64, route.exits[0], route.exits[1], flags as f64];
            out.extend(flat(&route.pts));
            out
        }
    }
}

/// `arrowEndSideUses`. `route` is empty or `[side from, side to, flat, …points]`.
/// Out: side from, side to, flat, then per end: has use, order, way, depth, far.
#[wasm_bindgen]
pub fn arrow_end_side_uses(arrow: &[f64], bends: &[f64], spacing: f64, ends: &[f64], route: &[f64]) -> Vec<f64> {
    let fields = arrow_fields(arrow, bends);
    let route = (!route.is_empty()).then(|| l::ElbowRoute {
        pts: points(&route[3..]),
        sides: [side_or_top(route[0]), side_or_top(route[1])],
        exits: [0.0, 0.0],
        bent: false,
        flat: route[2] != 0.0,
        z: false,
    });
    let uses = l::arrow_end_side_uses(&fields, spacing, &end_geom(&ends[0..5]), &end_geom(&ends[5..10]), route.as_ref());
    let mut out = vec![uses.sides[0] as u8 as f64, uses.sides[1] as u8 as f64, if uses.flat { 1.0 } else { 0.0 }];
    for side_use in uses.uses {
        match side_use {
            Some(u) => out.extend_from_slice(&[1.0, u.order, u.way, u.depth, u.far]),
            None => out.extend_from_slice(&[0.0, 0.0, 0.0, 0.0, 0.0]),
        }
    }
    out
}

/// `spreadArrowEndOffsets` (only each use's `way` matters).
#[wasm_bindgen]
pub fn arrow_spread_end_offsets(ways: &[f64], side_length: f64) -> Vec<f64> {
    l::spread_arrow_end_offsets(ways, side_length)
}

/// `straightenFacingArrowExits` up to the `canUseExit` checks: `[0]` keep the
/// exits, or `[1, a0, a1, b0, b1]` candidates to try in order.
#[allow(clippy::too_many_arguments)]
#[wasm_bindgen]
pub fn arrow_straighten_candidates(arrow: &[f64], bends: &[f64], exit_from: f64, exit_to: f64, prefer_end: u8, side_from: f64, side_to: f64, ends: &[f64]) -> Vec<f64> {
    let fields = arrow_fields(arrow, bends);
    let sides = [side_or_top(side_from), side_or_top(side_to)];
    match l::straighten_candidates(&fields, [exit_from, exit_to], prefer_end as usize, sides, &end_geom(&ends[0..5]), &end_geom(&ends[5..10])) {
        Straighten::Keep => vec![0.0],
        Straighten::Try([a, b]) => vec![1.0, a[0], a[1], b[0], b[1]],
    }
}

/// `staggerParallelArrows` from each arrow's `[place, has Z, start x, y, corner x, y, end x, y]`;
/// out: `[arrow index, stagger]` pairs in the order they are set.
#[wasm_bindgen]
pub fn arrow_stagger_parallel(legs: &[f64]) -> Vec<f64> {
    let input: Vec<(f64, Option<l::ZLeg>)> = legs.chunks_exact(8).map(|v| (v[0], (v[1] != 0.0).then_some(([v[2], v[3]], [v[4], v[5]], [v[6], v[7]])))).collect();
    let mut out = Vec::new();
    for (index, value) in l::stagger_parallel_arrows(&input) {
        out.push(index as f64);
        out.push(value);
    }
    out
}

/// `shapeOutlineSegments`, 4 numbers per segment.
#[wasm_bindgen]
pub fn arrow_shape_outline_segments(kind: u8, w: f64, h: f64) -> Vec<f64> {
    l::shape_outline_segments(Kind::from_code(kind), w, h).iter().flatten().copied().collect()
}

/// `outlineHitFraction` of an element record: empty for `undefined`.
#[wasm_bindgen]
pub fn arrow_outline_hit_fraction(element: &[f64], sx: f64, sy: f64, ex: f64, ey: f64) -> Vec<f64> {
    l::outline_hit_fraction(&elem(element), [sx, sy], [ex, ey]).into_iter().collect()
}

#[wasm_bindgen]
pub fn arrow_rotated_outline_inset(element: &[f64], side: f64, at: f64) -> f64 {
    l::rotated_outline_inset(&elem(element), side_or_top(side), at)
}

#[wasm_bindgen]
pub fn rotated_bounding_box(x: f64, y: f64, w: f64, h: f64, degrees: f64) -> Vec<f64> {
    let b = l::rotated_bounding_box(RouteBox { x, y, w, h }, degrees);
    vec![b.x, b.y, b.w, b.h]
}

#[wasm_bindgen]
pub fn rotate_point_around(px: f64, py: f64, cx: f64, cy: f64, degrees: f64) -> Vec<f64> {
    l::rotate_point_around([px, py], [cx, cy], degrees).to_vec()
}
