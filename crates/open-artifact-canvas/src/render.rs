//! CPU-side render data: instance and vertex buffers laid out in draw order, with
//! dirty ranges so the renderer uploads only what changed.

use crate::scene::Item;

pub const MODE_BOX: f32 = 0.0;
pub const MODE_SHADOW: f32 = 1.0;
pub const MODE_HOLE: f32 = 2.0;
pub const MODE_CURSOR: f32 = 3.0;

/// Quad flag bits (Quad::tex[3]).
pub const QF_STROKE_SCREEN: f32 = 1.0;

/// One instanced quad: a rounded box with fill/stroke/texture, a shadow, a hole or a cursor.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Quad {
    /// World x, y, w, h (unrotated; rotation is about the centre).
    pub rect: [f32; 4],
    /// cos, sin of the rotation.
    pub rot: [f32; 2],
    pub fill: [u8; 4],
    pub stroke: [u8; 4],
    /// Corner radius, stroke width, opacity, mode.
    pub params: [f32; 4],
    /// Atlas uv rect (u0, v0, u1, v1).
    pub uv: [f32; 4],
    /// Atlas layer (-1 = none), texture alpha (fade), shadow blur, flags.
    pub tex: [f32; 4],
    /// Dash on, dash off, depth, unused.
    pub dash: [f32; 4],
}

pub const QUAD_BYTES: usize = std::mem::size_of::<Quad>();

/// One path vertex: local position, the item's data slot and fill (0) / stroke (1).
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct PathVertex {
    pub x: f32,
    pub y: f32,
    pub slot: u16,
    pub kind: u16,
}

/// Floats per path slot in the data texture: 8 RGBA32F texels (transform,
/// translation/depth/opacity, fill, stroke, two cut-out rects, two unused).
pub const SLOT_FLOATS: usize = 32;
/// Data texture width in texels.
pub const DATA_WIDTH: usize = 1024;

/// A run of consecutive items drawn in one call; `multiply` items blend by multiplying.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Batch {
    Quads { first: u32, count: u32, multiply: bool },
    Paths { first: u32, count: u32, multiply: bool },
}

/// A dirty element range [lo, hi).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Dirty {
    pub lo: usize,
    pub hi: usize,
}

impl Dirty {
    pub fn add(&mut self, lo: usize, hi: usize) {
        if hi <= lo {
            return;
        }
        if self.hi <= self.lo {
            *self = Dirty { lo, hi };
        } else {
            self.lo = self.lo.min(lo);
            self.hi = self.hi.max(hi);
        }
    }
    pub fn take(&mut self) -> Option<(usize, usize)> {
        if self.hi <= self.lo {
            return None;
        }
        let r = (self.lo, self.hi);
        *self = Dirty::default();
        Some(r)
    }
    pub fn is_empty(&self) -> bool {
        self.hi <= self.lo
    }
}

#[derive(Default)]
pub struct RenderData {
    pub quads: Vec<Quad>,
    pub quads_dirty: Dirty,
    pub holes: Vec<Quad>,
    pub holes_dirty: bool,
    pub overlay: Vec<Quad>,
    pub overlay_dirty: bool,
    pub verts: Vec<PathVertex>,
    pub verts_dirty: Dirty,
    pub indices: Vec<u32>,
    pub indices_dirty: Dirty,
    pub slots: Vec<f32>,
    pub slots_dirty: Dirty,
    pub batches: Vec<Batch>,
    /// Bumped by every layout: the renderer re-uploads everything.
    pub generation: u64,
    /// Number of ranked (drawn) items: depth = (rank + 1) / (n + 2).
    pub ranked: u32,
    pub hole_count_visible: u32,
}

pub fn rgba(c: u32) -> [u8; 4] {
    [(c >> 24) as u8, (c >> 16) as u8, (c >> 8) as u8, c as u8]
}

pub fn rgba_f(c: u32) -> [f32; 4] {
    let b = rgba(c);
    [b[0] as f32 / 255.0, b[1] as f32 / 255.0, b[2] as f32 / 255.0, b[3] as f32 / 255.0]
}

pub fn depth(rank: u32, n: u32) -> f32 {
    (rank as f32 + 1.0) / (n as f32 + 2.0)
}

/// Texture fade: 0..1 alpha from `fade_start`.
pub fn fade(now: f64, start: f64, ms: f64) -> f32 {
    if ms <= 0.0 || !start.is_finite() {
        return 1.0;
    }
    (((now - start) / ms).clamp(0.0, 1.0)) as f32
}

/// The quads for a box item (shadow first, if any), at `depth`.
pub fn box_quads(it: &Item, depth: f32, page: u32, tex_alpha: f32, out: &mut Vec<Quad>) {
    let (s, c) = it.rot.sin_cos();
    let r = it.rect;
    let st = &it.style;
    let flags = if it.flags & crate::scene::F_STROKE_SCREEN != 0 { QF_STROKE_SCREEN } else { 0.0 };
    if st.has_shadow() {
        out.push(Quad {
            rect: [(r.x + st.shadow_dx as f64) as f32, (r.y + st.shadow_dy as f64) as f32, r.w as f32, r.h as f32],
            rot: [c as f32, s as f32],
            fill: rgba(st.shadow),
            stroke: [0; 4],
            params: [st.radius, 0.0, it.opacity, MODE_SHADOW],
            uv: [0.0; 4],
            tex: [-1.0, 0.0, st.shadow_blur.max(0.0), 0.0],
            dash: [0.0, 0.0, depth, 0.0],
        });
    }
    let (uv, layer) = match it.tex {
        Some(p) => {
            let f = page as f32;
            ([p.x as f32 / f, p.y as f32 / f, (p.x + p.w) as f32 / f, (p.y + p.h) as f32 / f], p.layer as f32)
        }
        None => ([0.0; 4], -1.0),
    };
    out.push(Quad {
        rect: [r.x as f32, r.y as f32, r.w as f32, r.h as f32],
        rot: [c as f32, s as f32],
        fill: rgba(st.fill),
        stroke: rgba(st.stroke),
        params: [st.radius, st.stroke_w, it.opacity, MODE_BOX],
        uv,
        tex: [layer, tex_alpha, 0.0, flags],
        dash: [st.dash.0, st.dash.1, depth, 0.0],
    });
}

pub fn hole_quad(it: &Item, depth: f32) -> Quad {
    let (s, c) = it.rot.sin_cos();
    let r = it.rect;
    Quad {
        rect: [r.x as f32, r.y as f32, r.w as f32, r.h as f32],
        rot: [c as f32, s as f32],
        params: [it.style.radius, 0.0, 1.0, MODE_HOLE],
        tex: [-1.0, 0.0, 0.0, 0.0],
        dash: [0.0, 0.0, depth, 0.0],
        ..Default::default()
    }
}

/// The data-texture slot for a path item: transform, depth/opacity, fill and stroke colours, cut-out rects.
pub fn path_slot(it: &Item, depth: f32) -> [f32; SLOT_FLOATS] {
    let Some(p) = &it.path else { return [0.0; SLOT_FLOATS] };
    let (sx, sy) = it.preview_scale(p);
    let (s, c) = it.rot.sin_cos();
    let (hw, hh) = (it.rect.w * 0.5, it.rect.h * 0.5);
    let (m00, m01, m10, m11) = (c * sx, -s * sy, s * sx, c * sy);
    let tx = it.rect.cx() - (c * hw - s * hh);
    let ty = it.rect.cy() - (s * hw + c * hh);
    let f = rgba_f(p.style.fill);
    let k = rgba_f(p.style.stroke);
    let mut out = [0.0; SLOT_FLOATS];
    out[..16].copy_from_slice(&[
        m00 as f32, m01 as f32, m10 as f32, m11 as f32, tx as f32, ty as f32, depth, it.opacity, f[0], f[1], f[2], f[3], k[0], k[1], k[2], k[3],
    ]);
    out[16..16 + p.cuts.len()].copy_from_slice(&p.cuts);
    out
}

/// Raw bytes of a slice of plain-old-data values (Quad, PathVertex, f32, u32).
pub fn bytes_of<T: Copy>(v: &[T]) -> &[u8] {
    // SAFETY: T is a repr(C) Copy type without padding-sensitive invariants; reading its bytes is fine.
    unsafe { std::slice::from_raw_parts(v.as_ptr() as *const u8, std::mem::size_of_val(v)) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layouts_are_packed() {
        assert_eq!(QUAD_BYTES, 96);
        assert_eq!(std::mem::size_of::<PathVertex>(), 12);
    }

    #[test]
    fn dirty_ranges_merge() {
        let mut d = Dirty::default();
        d.add(5, 6);
        d.add(2, 3);
        assert_eq!(d.take(), Some((2, 6)));
        assert!(d.take().is_none());
    }

    #[test]
    fn colours() {
        assert_eq!(rgba(0x11223344), [0x11, 0x22, 0x33, 0x44]);
    }
}
