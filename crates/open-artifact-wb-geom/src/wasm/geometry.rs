//! WASM facade of `geometry` and of the rotation helpers, encoded by
//! `whiteboard-core/src/geometry.ts`. Boxes are `[x, y, w, h]`, cameras
//! `[x, y, zoom]`; a missing zoom is NaN.

use super::{points, route_box};
use crate::arrow_layout::{rotate_point_around, rotated_bounding_box};
use crate::geometry::{self as g, Camera};
use crate::hit_test::{rotate_box_around, rotated_boxes_overlap};
use crate::routing::RouteBox;
use wasm_bindgen::prelude::*;

fn camera(v: &[f64]) -> Camera {
    Camera { x: v[0], y: v[1], zoom: v[2] }
}

fn flat_box(b: RouteBox) -> Vec<f64> {
    vec![b.x, b.y, b.w, b.h]
}

fn zoom(z: f64) -> Option<f64> {
    (!z.is_nan()).then_some(z)
}

#[wasm_bindgen]
pub fn rotate_point_around_xy(x: f64, y: f64, cx: f64, cy: f64, degrees: f64) -> Vec<f64> {
    rotate_point_around([x, y], [cx, cy], degrees).to_vec()
}

#[wasm_bindgen]
pub fn rotated_bounding_box_of(b: &[f64], degrees: f64) -> Vec<f64> {
    flat_box(rotated_bounding_box(route_box(b), degrees))
}

#[wasm_bindgen]
pub fn rotated_boxes_overlap_of(b: &[f64], degrees: f64, other: &[f64]) -> bool {
    rotated_boxes_overlap(&route_box(b), degrees, &route_box(other))
}

/// The new top-left of a box turned around `(cx, cy)`.
#[wasm_bindgen]
pub fn rotate_box_around_of(b: &[f64], cx: f64, cy: f64, degrees: f64) -> Vec<f64> {
    let r = rotate_box_around(&route_box(b), [cx, cy], degrees);
    vec![r.x, r.y]
}

/// `[x, y, w, h]`, or `[]` for no boxes.
#[wasm_bindgen]
pub fn union_bounds(boxes: &[f64]) -> Vec<f64> {
    let boxes: Vec<RouteBox> = boxes.chunks_exact(4).map(route_box).collect();
    g::union_bounds(&boxes).map(flat_box).unwrap_or_default()
}

#[wasm_bindgen]
pub fn arrow_line_bounds(coords: &[f64]) -> Vec<f64> {
    g::arrow_line_bounds(coords).to_vec()
}

#[wasm_bindgen]
pub fn arrow_polyline(elbow: &[f64], head_from: bool, head_to: bool) -> Vec<f64> {
    g::arrow_polyline(&points(elbow), [head_from, head_to])
}

/// `[x, y]`, or `[]` when nothing moves.
#[wasm_bindgen]
pub fn pan_camera_to_reveal(cam: &[f64], b: &[f64], view_w: f64, view_h: f64, inset_top: f64, inset_bottom: f64, margin: f64) -> Vec<f64> {
    g::pan_camera_to_reveal(camera(cam), route_box(b), view_w, view_h, inset_top, inset_bottom, margin).map(|(x, y)| vec![x, y]).unwrap_or_default()
}

#[wasm_bindgen]
pub fn center_camera_on(zoom_value: f64, b: &[f64], view_w: f64, view_h: f64, inset_top: f64, inset_bottom: f64) -> Vec<f64> {
    let (x, y) = g::center_camera_on(zoom_value, route_box(b), view_w, view_h, inset_top, inset_bottom);
    vec![x, y]
}

#[wasm_bindgen]
pub fn fits_in_viewport(zoom_value: f64, b: &[f64], view_w: f64, view_h: f64, inset_top: f64, inset_bottom: f64, margin: f64) -> bool {
    g::fits_in_viewport(zoom_value, route_box(b), view_w, view_h, inset_top, inset_bottom, margin)
}

#[wasm_bindgen]
pub fn is_offscreen(cam: &[f64], b: &[f64], view_w: f64, view_h: f64) -> bool {
    g::is_offscreen(camera(cam), route_box(b), view_w, view_h)
}

/// `[x, y, zoom]`, or `[]` when the zoom stays.
#[wasm_bindgen]
pub fn zoom_camera_at(cam: &[f64], screen_x: f64, screen_y: f64, factor: f64) -> Vec<f64> {
    g::zoom_camera_at(camera(cam), screen_x, screen_y, factor).map(|c| vec![c.x, c.y, c.zoom]).unwrap_or_default()
}

#[wasm_bindgen]
pub fn camera_to_fit_box(b: &[f64], view_w: f64, view_h: f64, padding: f64, max_zoom: f64) -> Vec<f64> {
    let c = g::camera_to_fit_box(route_box(b), view_w, view_h, padding, max_zoom);
    vec![c.x, c.y, c.zoom]
}

#[wasm_bindgen]
pub fn clamp_zoom(z: f64) -> f64 {
    g::clamp_zoom(z)
}

#[wasm_bindgen]
pub fn container_title_scale_for_zoom(z: f64, max_scale: f64) -> f64 {
    g::container_title_scale_for_zoom(z, max_scale)
}

#[wasm_bindgen]
pub fn container_title_band_height_at(scale: f64, z: f64) -> f64 {
    g::container_title_band_height_at(scale, zoom(z))
}

#[wasm_bindgen]
pub fn container_title_scale_for_band(band_height: f64) -> f64 {
    g::container_title_scale_for_band(band_height)
}

/// `measured` is NaN when the title is not measured.
#[wasm_bindgen]
pub fn container_title_bounds(section: &[f64], text_length: f64, measured: f64, scale: f64, z: f64, has_measured: bool) -> Vec<f64> {
    flat_box(g::container_title_bounds(route_box(section), text_length, has_measured.then_some(measured), scale, zoom(z)))
}

#[wasm_bindgen]
pub fn container_title_text_bounds(section: &[f64], measured: f64, scale: f64, z: f64) -> Vec<f64> {
    flat_box(g::container_title_text_bounds(route_box(section), measured, scale, zoom(z)))
}

#[wasm_bindgen]
pub fn resize_rotated_box(b: &[f64], degrees: f64, width: f64, height: f64, flip_x: bool, flip_y: bool, edge_x: u8, edge_y: u8) -> Vec<f64> {
    flat_box(g::resize_rotated_box(route_box(b), degrees, width, height, [flip_x, flip_y], [edge_x, edge_y]))
}

/// `[index, x, y]*` in reading order.
#[wasm_bindgen]
pub fn grid_layout_of_rects(rects: &[f64], gap: f64) -> Vec<f64> {
    let rects: Vec<RouteBox> = rects.chunks_exact(4).map(route_box).collect();
    let mut out = Vec::with_capacity(rects.len() * 3);
    for (index, x, y) in g::grid_layout_of_rects(&rects, gap) {
        out.extend_from_slice(&[index as f64, x, y]);
    }
    out
}
