//! The WebAssembly facade: plain functions over flat number arrays, so a
//! call costs one copy each way and no object marshalling. The TypeScript
//! modules in `whiteboard-core` decode the results back into their types.

pub mod routing;
pub mod shape_paths;
pub mod snapping;
pub mod arrow_layout;
pub mod labels;
pub mod end_snap;
pub mod bend_drag;
pub mod hit_test;
pub mod free_space;
pub mod geometry;

use crate::routing::{Pt, RouteBox, Side};
use crate::shape_paths::Cmd;

pub(crate) fn route_box(v: &[f64]) -> RouteBox {
    RouteBox { x: v[0], y: v[1], w: v[2], h: v[3] }
}

pub(crate) fn boxes(v: &[f64]) -> (RouteBox, RouteBox) {
    (route_box(&v[0..4]), route_box(&v[4..8]))
}

pub(crate) fn points(v: &[f64]) -> Vec<Pt> {
    v.chunks_exact(2).map(|c| [c[0], c[1]]).collect()
}

pub(crate) fn flat(points: &[Pt]) -> Vec<f64> {
    let mut out = Vec::with_capacity(points.len() * 2);
    for p in points {
        out.push(p[0]);
        out.push(p[1]);
    }
    out
}

pub(crate) fn side(code: u8) -> Option<Side> {
    Side::from_code(code)
}

/// Commands from `[code, …args]` (0 M, 1 L, 2 C, 3 Z).
pub(crate) fn commands(v: &[f64]) -> Vec<Cmd> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < v.len() {
        match v[i] as u8 {
            0 => {
                out.push(Cmd::M(v[i + 1], v[i + 2]));
                i += 3;
            }
            1 => {
                out.push(Cmd::L(v[i + 1], v[i + 2]));
                i += 3;
            }
            2 => {
                out.push(Cmd::C([v[i + 1], v[i + 2], v[i + 3], v[i + 4], v[i + 5], v[i + 6]]));
                i += 7;
            }
            _ => {
                out.push(Cmd::Z);
                i += 1;
            }
        }
    }
    out
}

pub(crate) fn flat_commands(cmds: &[Cmd]) -> Vec<f64> {
    let mut out = Vec::with_capacity(cmds.len() * 7);
    for c in cmds {
        match *c {
            Cmd::M(x, y) => out.extend_from_slice(&[0.0, x, y]),
            Cmd::L(x, y) => out.extend_from_slice(&[1.0, x, y]),
            Cmd::C(p) => {
                out.push(2.0);
                out.extend_from_slice(&p);
            }
            Cmd::Z => out.push(3.0),
        }
    }
    out
}
