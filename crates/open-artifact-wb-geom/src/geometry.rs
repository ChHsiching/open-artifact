//! Board geometry: bounds, the drawn arrow polyline,
//! the camera, section title scales, resizing a rotated box and the grid
//! layout. Text size estimates stay in TypeScript. The rotation helpers
//! live in `arrow_layout` and `hit_test`, which use them too.

use crate::arrow_layout::rotate_point_around;
use crate::js;
use crate::routing::{rounded_route_corners, Pt, RouteBox as Box};
use crate::snapping::{self, Edge, Rect};

/* ------------------------------------------------------------------------ */
/* Bounds                                                                   */
/* ------------------------------------------------------------------------ */

/// `unionBounds` (`None` for no boxes). Comparisons skip NaN and keep the
/// first of equal values, as the original's `<` and `>` do.
pub fn union_bounds(boxes: &[Box]) -> Option<Box> {
    if boxes.is_empty() {
        return None;
    }
    let (mut min_x, mut min_y, mut max_x, mut max_y) = (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
    for b in boxes {
        if b.x < min_x {
            min_x = b.x;
        }
        if b.y < min_y {
            min_y = b.y;
        }
        if b.x + b.w > max_x {
            max_x = b.x + b.w;
        }
        if b.y + b.h > max_y {
            max_y = b.y + b.h;
        }
    }
    Some(Box { x: min_x, y: min_y, w: max_x - min_x, h: max_y - min_y })
}

/// `arrowLineBounds` over flat coordinates `[x0, y0, x1, y1, …]`: `[x0, y0, x1, y1]`.
pub fn arrow_line_bounds(coords: &[f64]) -> [f64; 4] {
    let xs = || coords.iter().step_by(2).copied();
    let ys = || coords.iter().skip(1).step_by(2).copied();
    [js::min_of(xs()), js::min_of(ys()), js::max_of(xs()), js::max_of(ys())]
}

/// `arrowPolyline` of a route with at least one point: the route with each
/// rounded corner as three points, flat.
pub fn arrow_polyline(elbow: &[Pt], heads: [bool; 2]) -> Vec<f64> {
    let corners = rounded_route_corners(elbow, heads);
    let mut out = Vec::with_capacity(4 + corners.len() * 6);
    out.extend_from_slice(&elbow[0]);
    for corner in &corners {
        out.extend_from_slice(&corner.a);
        out.extend_from_slice(&corner.mid);
        out.extend_from_slice(&corner.b);
    }
    out.extend_from_slice(&elbow[elbow.len() - 1]);
    out
}

/* ------------------------------------------------------------------------ */
/* Camera                                                                   */
/* ------------------------------------------------------------------------ */

pub const MIN_ZOOM: f64 = 0.05;
pub const MAX_ZOOM: f64 = 8.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Camera {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

pub fn clamp_zoom(zoom: f64) -> f64 {
    js::min(MAX_ZOOM, js::max(MIN_ZOOM, zoom))
}

/// `panCameraToReveal`: the new `(x, y)`, or `None` when nothing moves.
pub fn pan_camera_to_reveal(camera: Camera, b: Box, view_w: f64, view_h: f64, inset_top: f64, inset_bottom: f64, margin: f64) -> Option<(f64, f64)> {
    let overflow_by = |min: f64, max: f64, start: f64, end: f64| -> f64 {
        if end - start > max - min || start < min {
            start - min
        } else if end > max {
            end - max
        } else {
            0.0
        }
    };
    let (sx, sy) = ((b.x - camera.x) * camera.zoom, (b.y - camera.y) * camera.zoom);
    let dx = overflow_by(margin, view_w - margin, sx, sx + b.w * camera.zoom);
    let dy = overflow_by(inset_top + margin, view_h - inset_bottom - margin, sy, sy + b.h * camera.zoom);
    if dx == 0.0 && dy == 0.0 {
        return None;
    }
    Some((camera.x + dx / camera.zoom, camera.y + dy / camera.zoom))
}

/// `centerCameraOn`: the new `(x, y)`.
pub fn center_camera_on(zoom: f64, b: Box, view_w: f64, view_h: f64, inset_top: f64, inset_bottom: f64) -> (f64, f64) {
    (b.x + b.w / 2.0 - view_w / 2.0 / zoom, b.y + b.h / 2.0 - (inset_top + (view_h - inset_top - inset_bottom) / 2.0) / zoom)
}

pub fn fits_in_viewport(zoom: f64, b: Box, view_w: f64, view_h: f64, inset_top: f64, inset_bottom: f64, margin: f64) -> bool {
    b.w * zoom <= view_w - 2.0 * margin && b.h * zoom <= view_h - inset_top - inset_bottom - 2.0 * margin
}

pub fn is_offscreen(camera: Camera, b: Box, view_w: f64, view_h: f64) -> bool {
    let (sx, sy) = ((b.x - camera.x) * camera.zoom, (b.y - camera.y) * camera.zoom);
    sx >= view_w || sy >= view_h || sx + b.w * camera.zoom <= 0.0 || sy + b.h * camera.zoom <= 0.0
}

/// `zoomCameraAt`: the new camera, or `None` when the zoom stays.
pub fn zoom_camera_at(camera: Camera, screen_x: f64, screen_y: f64, factor: f64) -> Option<Camera> {
    let zoom = clamp_zoom(camera.zoom * factor);
    if zoom == camera.zoom {
        return None;
    }
    let anchor = (camera.x + screen_x / camera.zoom, camera.y + screen_y / camera.zoom);
    Some(Camera { x: anchor.0 - screen_x / zoom, y: anchor.1 - screen_y / zoom, zoom })
}

pub fn camera_to_fit_box(b: Box, view_w: f64, view_h: f64, padding: f64, max_zoom: f64) -> Camera {
    let avail_w = js::max(1.0, view_w - padding * 2.0);
    let avail_h = js::max(1.0, view_h - padding * 2.0);
    let zoom = clamp_zoom(js::min_of([avail_w / js::max(1.0, b.w), avail_h / js::max(1.0, b.h), max_zoom]));
    Camera { x: b.x + b.w / 2.0 - view_w / 2.0 / zoom, y: b.y + b.h / 2.0 - view_h / 2.0 / zoom, zoom }
}

/* ------------------------------------------------------------------------ */
/* Section titles                                                           */
/* ------------------------------------------------------------------------ */

pub const CONTAINER_TITLE_FONT_PX: f64 = 16.0;
pub const CONTAINER_TITLE_GAP: f64 = 6.0;
/// `Math.round(16 * 1.375) + 6`.
pub const CONTAINER_TITLE_BAND_HEIGHT: f64 = 28.0;
pub const CONTAINER_TITLE_PADDING_X: f64 = 8.0;
pub const MIN_CONTAINER_TITLE_TEXT_WIDTH: f64 = 40.0;
pub const CONTAINER_TITLE_SCREEN_PX: f64 = 13.0;
pub const CONTAINER_TITLE_MIN_SCREEN_PX: f64 = 11.0;
pub const CONTAINER_TITLE_SHRINK_END_ZOOM: f64 = 0.5;
pub const CONTAINER_TITLE_GAP_SCALED: f64 = 2.0;

pub fn container_title_scale_for_zoom(zoom: f64, max_scale: f64) -> f64 {
    let shrink = js::min(1.0, js::max(0.0, (1.0 - zoom) / (1.0 - CONTAINER_TITLE_SHRINK_END_ZOOM)));
    js::min((CONTAINER_TITLE_SCREEN_PX - (CONTAINER_TITLE_SCREEN_PX - CONTAINER_TITLE_MIN_SCREEN_PX) * shrink) / CONTAINER_TITLE_FONT_PX / zoom, max_scale)
}

fn scaled_gap() -> f64 {
    (CONTAINER_TITLE_GAP - CONTAINER_TITLE_GAP_SCALED) * container_title_scale_for_zoom(1.0, f64::INFINITY)
}

const SCALED_BAND: f64 = CONTAINER_TITLE_BAND_HEIGHT - CONTAINER_TITLE_GAP + CONTAINER_TITLE_GAP_SCALED;

/// `containerTitleBandHeightAt`; `zoom` is `None` for no zoom.
pub fn container_title_band_height_at(scale: f64, zoom: Option<f64>) -> f64 {
    match zoom {
        Some(zoom) if zoom < 1.0 => scaled_gap() + SCALED_BAND * scale,
        _ => CONTAINER_TITLE_BAND_HEIGHT * scale,
    }
}

pub fn container_title_scale_for_band(band_height: f64) -> f64 {
    js::max(container_title_scale_for_zoom(1.0, f64::INFINITY), (band_height - scaled_gap()) / SCALED_BAND)
}

/// The numbers of `containerTitleBounds` once the title shows: `measured`
/// is the measured title width, else the width is estimated from
/// `text_length` UTF-16 units.
pub fn container_title_bounds(section: Box, text_length: f64, measured: Option<f64>, scale: f64, zoom: Option<f64>) -> Box {
    let title_width = match measured {
        Some(width) => CONTAINER_TITLE_PADDING_X / 2.0 + width,
        None => CONTAINER_TITLE_PADDING_X + text_length * CONTAINER_TITLE_FONT_PX * 0.55,
    };
    let band = container_title_band_height_at(scale, zoom);
    Box {
        x: section.x,
        y: section.y - band,
        w: js::min(section.w, js::max(title_width, CONTAINER_TITLE_PADDING_X + MIN_CONTAINER_TITLE_TEXT_WIDTH) * scale),
        h: band,
    }
}

/// The numbers of `containerTitleTextBounds` once the title shows.
pub fn container_title_text_bounds(section: Box, measured: f64, scale: f64, zoom: Option<f64>) -> Box {
    let inset = (CONTAINER_TITLE_PADDING_X / 2.0) * scale;
    Box {
        x: section.x + inset,
        y: section.y - container_title_band_height_at(scale, zoom),
        w: js::min(measured * scale, section.w - inset),
        h: (CONTAINER_TITLE_BAND_HEIGHT - CONTAINER_TITLE_GAP) * scale,
    }
}

/* ------------------------------------------------------------------------ */
/* Rotation and layout                                                      */
/* ------------------------------------------------------------------------ */

/// `resizeRotatedBox`: `flip` says the anchor is `left` / `top` (the size
/// change goes the other way), `edges` are the edge codes of the anchor.
pub fn resize_rotated_box(b: Box, degrees: f64, width: f64, height: f64, flip: [bool; 2], edges: [Edge; 2]) -> Box {
    let sign = |flip: bool| if flip { -1.0 } else { 1.0 };
    let delta = rotate_point_around([sign(flip[0]) * (width - b.w), sign(flip[1]) * (height - b.h)], [0.0, 0.0], degrees);
    let r = snapping::resize_rotated_rect(Rect { x: b.x, y: b.y, w: b.w, h: b.h }, degrees, edges, delta[0], delta[1], [0.0, 0.0], [f64::INFINITY, f64::INFINITY], false);
    Box { x: r.x, y: r.y, w: r.w, h: r.h }
}

/// `gridLayoutOfRects`: `(item index, x, y)` in reading order.
pub fn grid_layout_of_rects(rects: &[Box], gap: f64) -> Vec<(usize, f64, f64)> {
    let Some(bounds) = union_bounds(rects) else { return Vec::new() };
    let mut sorted: Vec<usize> = (0..rects.len()).collect();
    js::sort_by(&mut sorted, |&a, &b| {
        let dy = rects[a].y - rects[b].y;
        if js::truthy(dy) { dy } else { rects[a].x - rects[b].x }
    });
    let columns = (sorted.len() as f64).sqrt().ceil();
    let cell_w = js::max_of(sorted.iter().map(|&i| rects[i].w));
    let cell_h = js::max_of(sorted.iter().map(|&i| rects[i].h));
    sorted
        .iter()
        .enumerate()
        .map(|(index, &item)| {
            let index = index as f64;
            let column = index % columns;
            let row = (index / columns).floor();
            let r = rects[item];
            (item, bounds.x + column * (cell_w + gap) + (cell_w - r.w) / 2.0, bounds.y + row * (cell_h + gap) + (cell_h - r.h) / 2.0)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_scales() {
        assert_eq!(container_title_scale_for_zoom(1.0, f64::INFINITY), 13.0 / 16.0);
        assert_eq!(scaled_gap(), 3.25);
        assert_eq!(container_title_band_height_at(1.0, None), 28.0);
        assert_eq!(container_title_band_height_at(1.0, Some(0.5)), 3.25 + 24.0);
    }

    #[test]
    fn union_keeps_first_of_equal_zeros() {
        let b = union_bounds(&[Box { x: -0.0, y: 0.0, w: 1.0, h: 1.0 }, Box { x: 0.0, y: f64::NAN, w: 1.0, h: 1.0 }]).unwrap();
        assert!(b.x == 0.0 && b.x.is_sign_negative());
        assert_eq!(b.y, 0.0);
    }

    #[test]
    fn grid_layout_reading_order() {
        let rects = [Box { x: 100.0, y: 0.0, w: 10.0, h: 10.0 }, Box { x: 0.0, y: 0.0, w: 20.0, h: 10.0 }];
        let out = grid_layout_of_rects(&rects, 24.0);
        assert_eq!(out, vec![(1, 0.0, 0.0), (0, 44.0 + 5.0, 0.0)]);
    }

    #[test]
    fn camera_fit_and_zoom() {
        let camera = camera_to_fit_box(Box { x: 0.0, y: 0.0, w: 100.0, h: 100.0 }, 400.0, 400.0, 48.0, 2.0);
        assert_eq!(camera.zoom, 2.0);
        assert!(zoom_camera_at(Camera { x: 0.0, y: 0.0, zoom: 8.0 }, 10.0, 10.0, 2.0).is_none());
    }
}
