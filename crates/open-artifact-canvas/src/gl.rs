//! The WebGL2 renderer (wasm32 only). It draws what `Engine::frame` prepared in
//! `RenderData`: a hole depth pre-pass, the background grid, the item batches in
//! z order (instanced quads and path meshes) and the overlay.

use crate::engine::Engine;
use crate::render::{bytes_of, Batch, Quad, DATA_WIDTH, QUAD_BYTES};
use crate::textures::Placement;
use wasm_bindgen::prelude::*;
use web_sys::{
    WebGl2RenderingContext as GL, WebGlBuffer, WebGlFramebuffer, WebGlProgram, WebGlShader, WebGlTexture, WebGlUniformLocation,
    WebGlVertexArrayObject,
};

#[wasm_bindgen]
extern "C" {
    /// The WebGL2 context, seen untyped so one binding takes any image source.
    type AnyGl;
    /// texSubImage3D with any TexImageSource (ImageBitmap, canvas, image, ImageData, video).
    #[wasm_bindgen(method, catch, js_name = texSubImage3D)]
    fn tex_sub_image_3d_source(
        this: &AnyGl,
        target: u32,
        level: i32,
        x: i32,
        y: i32,
        z: i32,
        w: i32,
        h: i32,
        d: i32,
        format: u32,
        ty: u32,
        source: &JsValue,
    ) -> Result<(), JsValue>;
}

const QUAD_VS: &str = r#"#version 300 es
precision highp float;
layout(location=0) in vec4 a_rect;
layout(location=1) in vec2 a_rot;
layout(location=2) in vec4 a_fill;
layout(location=3) in vec4 a_stroke;
layout(location=4) in vec4 a_params;
layout(location=5) in vec4 a_uv;
layout(location=6) in vec4 a_tex;
layout(location=7) in vec4 a_dash;
uniform vec3 u_cam;
uniform vec2 u_view;
out vec2 v_p;
flat out vec2 v_half;
flat out vec4 v_fill;
flat out vec4 v_stroke;
flat out vec4 v_params;
flat out vec4 v_uv;
flat out vec4 v_tex;
flat out vec4 v_dash;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  vec2 h = a_rect.zw * 0.5;
  float px = 1.0 / u_cam.z;
  float mode = a_params.w;
  float sw = a_params.y * (mod(a_tex.w, 2.0) >= 1.0 ? px : 1.0);
  float margin = sw * 0.5 + px * 1.5;
  if (mode == 1.0) margin = a_tex.z * 1.5 + px * 2.0;
  vec2 p = corner * (h + margin);
  vec2 w = a_rect.xy + h + vec2(a_rot.x * p.x - a_rot.y * p.y, a_rot.y * p.x + a_rot.x * p.y);
  vec2 s = (w - u_cam.xy) * u_cam.z;
  gl_Position = vec4(s.x / u_view.x * 2.0 - 1.0, 1.0 - s.y / u_view.y * 2.0, a_dash.z * 2.0 - 1.0, 1.0);
  v_p = p;
  v_half = h;
  v_fill = a_fill;
  v_stroke = a_stroke;
  v_params = vec4(a_params.x, sw, a_params.z, mode);
  v_uv = a_uv;
  v_tex = a_tex;
  v_dash = a_dash;
}
"#;

const QUAD_FS: &str = r#"#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform vec3 u_cam;
uniform float u_dpr;
uniform float u_page;
uniform sampler2DArray u_atlas;
in vec2 v_p;
flat in vec2 v_half;
flat in vec4 v_fill;
flat in vec4 v_stroke;
flat in vec4 v_params;
flat in vec4 v_uv;
flat in vec4 v_tex;
flat in vec4 v_dash;
out vec4 o;
float sdBox(vec2 p, vec2 b, float r) {
  r = min(r, min(b.x, b.y));
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float sdTri(vec2 p, vec2 a, vec2 b, vec2 c) {
  vec2 e0 = b - a, e1 = c - b, e2 = a - c;
  vec2 v0 = p - a, v1 = p - b, v2 = p - c;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                   vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
                   vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
vec4 pm(vec4 c) { return vec4(c.rgb * c.a, c.a); }
void main() {
  float s = u_cam.z * u_dpr;
  float mode = v_params.w;
  // Texture coordinates are computed for every fragment so derivatives stay defined.
  vec2 t = (v_p + v_half) / max(2.0 * v_half, vec2(1e-6));
  vec2 uv = mix(v_uv.xy, v_uv.zw, t);
  vec2 texel = uv * u_page;
  float rho = max(length(dFdx(texel)), length(dFdy(texel)));
  float sd = sdBox(v_p, v_half, v_params.x);
  if (mode == 2.0) {
    if (sd > 0.0) discard;
    o = vec4(0.0);
    return;
  }
  if (mode == 1.0) {
    float b = max(v_tex.z, 1.0 / s);
    float a = 1.0 - smoothstep(-b, b, sd);
    o = pm(v_fill) * a * v_params.z;
    if (o.a <= 0.0) discard;
    return;
  }
  if (mode == 3.0) {
    vec2 q = (v_p + v_half) * u_cam.z;
    float d = sdTri(q, vec2(0.0, 0.0), vec2(0.0, 17.0), vec2(12.0, 12.0)) * u_dpr;
    float fill = clamp(0.5 - d, 0.0, 1.0);
    float edge = clamp(0.5 - (abs(d) - 0.75 * u_dpr), 0.0, 1.0);
    vec4 c = pm(v_fill) * fill;
    vec4 e = pm(v_stroke) * edge;
    o = e + c * (1.0 - e.a);
    if (o.a <= 0.0) discard;
    return;
  }
  float cov = clamp(0.5 - sd * s, 0.0, 1.0);
  vec4 col = pm(v_fill);
  if (v_tex.x >= 0.0) {
    float lod = max(log2(max(rho, 1e-6)), 0.0);
    float inset = 0.5 * exp2(ceil(lod)) / u_page;
    vec2 lo = v_uv.xy + inset, hi = v_uv.zw - inset;
    uv = clamp(uv, min(lo, hi), max(lo, hi));
    vec4 tc = textureGrad(u_atlas, vec3(uv, v_tex.x), dFdx(uv), dFdy(uv)) * v_tex.y;
    col = tc + col * (1.0 - tc.a);
  }
  col *= cov;
  float sw = v_params.y;
  if (sw > 0.0 && v_stroke.a > 0.0) {
    float cs = clamp(0.5 - (abs(sd) - sw * 0.5) * s, 0.0, 1.0);
    if (v_dash.x > 0.0) {
      vec2 h = v_half;
      vec2 p = v_p;
      float dx = h.x - abs(p.x), dy = h.y - abs(p.y);
      float u;
      if (dy < dx) u = p.y < 0.0 ? p.x + h.x : 3.0 * h.x + 2.0 * h.y - p.x;
      else u = p.x > 0.0 ? 2.0 * h.x + h.y + p.y : 4.0 * h.x + 3.0 * h.y - p.y;
      float unit = mod(v_tex.w, 2.0) >= 1.0 ? u_cam.z : 1.0;
      float m = mod(u * unit, v_dash.x + v_dash.y);
      float fw = max(fwidth(u * unit), 1e-4);
      cs *= clamp((v_dash.x - m) / fw + 0.5, 0.0, 1.0) * clamp(m / fw + 0.5, 0.0, 1.0);
    }
    vec4 sc = pm(v_stroke) * cs;
    col = sc + col * (1.0 - sc.a);
  }
  o = col * v_params.z;
  if (o.a <= 0.0) discard;
}
"#;

const PATH_VS: &str = r#"#version 300 es
precision highp float;
precision highp sampler2D;
layout(location=0) in vec2 a_pos;
layout(location=1) in uvec2 a_meta;
uniform vec3 u_cam;
uniform vec2 u_view;
uniform sampler2D u_data;
out vec4 v_color;
out vec2 v_local;
flat out vec4 v_cut0;
flat out vec4 v_cut1;
void main() {
  int base = int(a_meta.x) * 8;
  ivec2 c = ivec2(base % 1024, base / 1024);
  vec4 m = texelFetch(u_data, c, 0);
  vec4 t = texelFetch(u_data, c + ivec2(1, 0), 0);
  vec4 col = texelFetch(u_data, c + ivec2(2 + int(a_meta.y), 0), 0);
  vec2 w = vec2(m.x * a_pos.x + m.y * a_pos.y, m.z * a_pos.x + m.w * a_pos.y) + t.xy;
  vec2 s = (w - u_cam.xy) * u_cam.z;
  gl_Position = vec4(s.x / u_view.x * 2.0 - 1.0, 1.0 - s.y / u_view.y * 2.0, t.z * 2.0 - 1.0, 1.0);
  v_color = vec4(col.rgb * col.a, col.a) * t.w;
  v_local = a_pos;
  v_cut0 = texelFetch(u_data, c + ivec2(4, 0), 0);
  v_cut1 = texelFetch(u_data, c + ivec2(5, 0), 0);
}
"#;

// Cut-out rects draw nothing (transparent, so no discard: depth writes are off).
const PATH_FS: &str = r#"#version 300 es
precision highp float;
in vec4 v_color;
in vec2 v_local;
flat in vec4 v_cut0;
flat in vec4 v_cut1;
out vec4 o;
bool inside(vec4 r) { return r.z > 0.0 && all(greaterThanEqual(v_local, r.xy)) && all(lessThan(v_local, r.xy + r.zw)); }
void main() { o = inside(v_cut0) || inside(v_cut1) ? vec4(0.0) : v_color; }
"#;

const GRID_VS: &str = r#"#version 300 es
precision highp float;
uniform float u_depth;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  gl_Position = vec4(p, u_depth * 2.0 - 1.0, 1.0);
}
"#;

const GRID_FS: &str = r#"#version 300 es
precision highp float;
uniform vec3 u_cam;
uniform vec2 u_view;
uniform float u_dpr;
uniform vec4 u_bg;
uniform vec4 u_color;
uniform vec4 u_grid; // spacing (world), fine-level alpha, kind, major step
out vec4 o;
float dot_level(vec2 world, float sp) {
  vec2 f = (fract(world / sp + 0.5) - 0.5) * sp * u_cam.z * u_dpr;
  return clamp(1.0 * u_dpr + 0.5 - length(f), 0.0, 1.0);
}
// Whether device column (or row) `px` is on a line of spacing `sp`: lines are one CSS pixel
// wide, centred on their position and snapped to whole device pixels (as a DOM 1px line is).
float line_on(float px, float origin, float sp) {
  float scale = u_cam.z * u_dpr;
  float k = floor((px / scale + origin) / sp);
  float width = max(1.0, floor(u_dpr + 0.5));
  for (float j = 0.0; j < 2.0; j++) {
    float start = floor(((k + j) * sp - origin) * scale - 0.5 * width + 0.5);
    if (px >= start && px < start + width) return 1.0;
  }
  return 0.0;
}
float line_level(vec2 dev, float sp) {
  float x = line_on(dev.x, u_cam.x, sp);
  float y = line_on(dev.y, u_cam.y, sp);
  return 1.0 - (1.0 - x * u_color.a) * (1.0 - y * u_color.a);
}
void main() {
  vec2 css = vec2(gl_FragCoord.x, u_view.y * u_dpr - gl_FragCoord.y) / u_dpr;
  vec2 world = u_cam.xy + css / u_cam.z;
  vec4 bg = vec4(u_bg.rgb * u_bg.a, u_bg.a);
  float a = 0.0;
  if (u_grid.z == 1.0) {
    a = max(dot_level(world, u_grid.x) * u_grid.y, dot_level(world, u_grid.x * u_grid.w)) * u_color.a;
  } else if (u_grid.z == 2.0) {
    // Device pixel (top-left origin): coarse lines in full, the finer ones as far as they have faded in.
    vec2 dev = floor(css * u_dpr);
    a = max(line_level(dev, u_grid.x) * u_grid.y, line_level(dev, u_grid.x * u_grid.w));
  }
  vec4 g = vec4(u_color.rgb, 1.0) * a;
  o = g + bg * (1.0 - g.a);
}
"#;

struct Program {
    prog: WebGlProgram,
    u: Vec<Option<WebGlUniformLocation>>,
}

fn compile(gl: &GL, kind: u32, src: &str) -> Result<WebGlShader, String> {
    let sh = gl.create_shader(kind).ok_or("createShader failed")?;
    gl.shader_source(&sh, src);
    gl.compile_shader(&sh);
    if gl.get_shader_parameter(&sh, GL::COMPILE_STATUS).as_bool().unwrap_or(false) || gl.is_context_lost() {
        Ok(sh)
    } else {
        Err(gl.get_shader_info_log(&sh).unwrap_or_default())
    }
}

fn program(gl: &GL, vs: &str, fs: &str, uniforms: &[&str]) -> Result<Program, String> {
    let v = compile(gl, GL::VERTEX_SHADER, vs)?;
    let f = compile(gl, GL::FRAGMENT_SHADER, fs)?;
    let prog = gl.create_program().ok_or("createProgram failed")?;
    gl.attach_shader(&prog, &v);
    gl.attach_shader(&prog, &f);
    gl.link_program(&prog);
    if !gl.get_program_parameter(&prog, GL::LINK_STATUS).as_bool().unwrap_or(false) && !gl.is_context_lost() {
        return Err(gl.get_program_info_log(&prog).unwrap_or_default());
    }
    gl.delete_shader(Some(&v));
    gl.delete_shader(Some(&f));
    let u = uniforms.iter().map(|n| gl.get_uniform_location(&prog, n)).collect();
    Ok(Program { prog, u })
}

/// A growable GPU buffer.
struct Buf {
    buf: WebGlBuffer,
    target: u32,
    cap: usize,
}

impl Buf {
    fn new(gl: &GL, target: u32) -> Self {
        Buf { buf: gl.create_buffer().unwrap(), target, cap: 0 }
    }
    /// Uploads all of `data`, growing the buffer if needed.
    fn upload(&mut self, gl: &GL, data: &[u8]) {
        gl.bind_buffer(self.target, Some(&self.buf));
        if data.len() > self.cap || data.len() * 4 < self.cap {
            let cap = (data.len() + data.len() / 4).max(256);
            gl.buffer_data_with_i32(self.target, cap as i32, GL::DYNAMIC_DRAW);
            self.cap = cap;
        }
        if !data.is_empty() {
            gl.buffer_sub_data_with_i32_and_u8_array(self.target, 0, data);
        }
    }
    fn update(&mut self, gl: &GL, offset: usize, data: &[u8]) {
        gl.bind_buffer(self.target, Some(&self.buf));
        gl.buffer_sub_data_with_i32_and_u8_array(self.target, offset as i32, data);
    }
}

const QUAD_UNIFORMS: [&str; 5] = ["u_cam", "u_view", "u_dpr", "u_page", "u_atlas"];
const PATH_UNIFORMS: [&str; 3] = ["u_cam", "u_view", "u_data"];
const GRID_UNIFORMS: [&str; 7] = ["u_cam", "u_view", "u_dpr", "u_bg", "u_color", "u_grid", "u_depth"];

pub struct Renderer {
    pub gl: GL,
    quad: Program,
    path: Program,
    grid: Program,
    quad_vao: WebGlVertexArrayObject,
    quad_buf: Buf,
    hole_buf: Buf,
    overlay_buf: Buf,
    path_vao: WebGlVertexArrayObject,
    vert_buf: Buf,
    index_buf: Buf,
    grid_vao: WebGlVertexArrayObject,
    data_tex: WebGlTexture,
    data_rows: usize,
    atlas: WebGlTexture,
    atlas_layers: u32,
    read_fb: WebGlFramebuffer,
    draw_fb: WebGlFramebuffer,
    pub page: u32,
    pub levels: u32,
    pub max_layers_gl: u32,
    generation: u64,
    pub draw_calls: u32,
}

fn bind_quad_attribs(gl: &GL, first: u32) {
    let base = (first as usize * QUAD_BYTES) as i32;
    let s = QUAD_BYTES as i32;
    // (location, size, type, normalized, offset)
    let attrs: [(u32, i32, u32, bool, i32); 8] = [
        (0, 4, GL::FLOAT, false, 0),
        (1, 2, GL::FLOAT, false, 16),
        (2, 4, GL::UNSIGNED_BYTE, true, 24),
        (3, 4, GL::UNSIGNED_BYTE, true, 28),
        (4, 4, GL::FLOAT, false, 32),
        (5, 4, GL::FLOAT, false, 48),
        (6, 4, GL::FLOAT, false, 64),
        (7, 4, GL::FLOAT, false, 80),
    ];
    for (loc, size, ty, norm, off) in attrs {
        gl.vertex_attrib_pointer_with_i32(loc, size, ty, norm, s, base + off);
    }
}

impl Renderer {
    pub fn new(gl: GL) -> Result<Renderer, String> {
        let max_tex = gl.get_parameter(GL::MAX_TEXTURE_SIZE).ok().and_then(|v| v.as_f64()).unwrap_or(2048.0) as u32;
        let max_layers_gl = gl.get_parameter(GL::MAX_ARRAY_TEXTURE_LAYERS).ok().and_then(|v| v.as_f64()).unwrap_or(256.0) as u32;
        let page = max_tex.min(2048);
        let levels = 5;
        let quad = program(&gl, QUAD_VS, QUAD_FS, &QUAD_UNIFORMS)?;
        let path = program(&gl, PATH_VS, PATH_FS, &PATH_UNIFORMS)?;
        let grid = program(&gl, GRID_VS, GRID_FS, &GRID_UNIFORMS)?;

        let quad_vao = gl.create_vertex_array().ok_or("createVertexArray failed")?;
        gl.bind_vertex_array(Some(&quad_vao));
        let quad_buf = Buf::new(&gl, GL::ARRAY_BUFFER);
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&quad_buf.buf));
        for loc in 0..8 {
            gl.enable_vertex_attrib_array(loc);
            gl.vertex_attrib_divisor(loc, 1);
        }
        bind_quad_attribs(&gl, 0);
        let hole_buf = Buf::new(&gl, GL::ARRAY_BUFFER);
        let overlay_buf = Buf::new(&gl, GL::ARRAY_BUFFER);

        let path_vao = gl.create_vertex_array().ok_or("createVertexArray failed")?;
        gl.bind_vertex_array(Some(&path_vao));
        let vert_buf = Buf::new(&gl, GL::ARRAY_BUFFER);
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&vert_buf.buf));
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_with_i32(0, 2, GL::FLOAT, false, 12, 0);
        gl.enable_vertex_attrib_array(1);
        gl.vertex_attrib_i_pointer_with_i32(1, 2, GL::UNSIGNED_SHORT, 12, 8);
        let index_buf = Buf::new(&gl, GL::ELEMENT_ARRAY_BUFFER);
        gl.bind_buffer(GL::ELEMENT_ARRAY_BUFFER, Some(&index_buf.buf));
        gl.bind_vertex_array(None);

        let grid_vao = gl.create_vertex_array().ok_or("createVertexArray failed")?;

        let data_tex = gl.create_texture().ok_or("createTexture failed")?;
        gl.bind_texture(GL::TEXTURE_2D, Some(&data_tex));
        for (p, v) in [(GL::TEXTURE_MIN_FILTER, GL::NEAREST), (GL::TEXTURE_MAG_FILTER, GL::NEAREST)] {
            gl.tex_parameteri(GL::TEXTURE_2D, p, v as i32);
        }
        let atlas = gl.create_texture().ok_or("createTexture failed")?;
        let read_fb = gl.create_framebuffer().ok_or("createFramebuffer failed")?;
        let draw_fb = gl.create_framebuffer().ok_or("createFramebuffer failed")?;
        let mut r = Renderer {
            gl,
            quad,
            path,
            grid,
            quad_vao,
            quad_buf,
            hole_buf,
            overlay_buf,
            path_vao,
            vert_buf,
            index_buf,
            grid_vao,
            data_tex,
            data_rows: 0,
            atlas,
            atlas_layers: 0,
            read_fb,
            draw_fb,
            page,
            levels,
            max_layers_gl,
            generation: u64::MAX,
            draw_calls: 0,
        };
        r.alloc_atlas(1);
        Ok(r)
    }

    fn atlas_storage(&self, tex: &WebGlTexture, layers: u32) {
        let gl = &self.gl;
        gl.bind_texture(GL::TEXTURE_2D_ARRAY, Some(tex));
        gl.tex_storage_3d(GL::TEXTURE_2D_ARRAY, self.levels as i32, GL::RGBA8, self.page as i32, self.page as i32, layers as i32);
        gl.tex_parameteri(GL::TEXTURE_2D_ARRAY, GL::TEXTURE_MIN_FILTER, GL::LINEAR_MIPMAP_LINEAR as i32);
        gl.tex_parameteri(GL::TEXTURE_2D_ARRAY, GL::TEXTURE_MAG_FILTER, GL::LINEAR as i32);
        gl.tex_parameteri(GL::TEXTURE_2D_ARRAY, GL::TEXTURE_WRAP_S, GL::CLAMP_TO_EDGE as i32);
        gl.tex_parameteri(GL::TEXTURE_2D_ARRAY, GL::TEXTURE_WRAP_T, GL::CLAMP_TO_EDGE as i32);
        gl.tex_parameteri(GL::TEXTURE_2D_ARRAY, GL::TEXTURE_MAX_LEVEL, self.levels as i32 - 1);
    }

    fn alloc_atlas(&mut self, layers: u32) {
        self.atlas_storage(&self.atlas, layers);
        self.atlas_layers = layers;
    }

    /// Grows the atlas to hold at least `need` layers, copying what it holds.
    pub fn ensure_layers(&mut self, need: u32, max: u32) {
        if need <= self.atlas_layers {
            return;
        }
        let layers = need.next_power_of_two().min(max.max(need)).min(self.max_layers_gl);
        let gl = &self.gl;
        let Some(next) = gl.create_texture() else { return };
        self.atlas_storage(&next, layers);
        gl.bind_framebuffer(GL::READ_FRAMEBUFFER, Some(&self.read_fb));
        for layer in 0..self.atlas_layers {
            for level in 0..self.levels {
                let s = (self.page >> level) as i32;
                gl.framebuffer_texture_layer(GL::READ_FRAMEBUFFER, GL::COLOR_ATTACHMENT0, Some(&self.atlas), level as i32, layer as i32);
                gl.copy_tex_sub_image_3d(GL::TEXTURE_2D_ARRAY, level as i32, 0, 0, layer as i32, 0, 0, s, s);
            }
        }
        gl.bind_framebuffer(GL::READ_FRAMEBUFFER, None);
        gl.delete_texture(Some(&self.atlas));
        self.atlas = next;
        self.atlas_layers = layers;
    }

    /// Uploads one resolution of a texture into its atlas region and builds its mips.
    pub fn upload(&mut self, p: Placement, source: &JsValue, max_layers: u32) -> Result<(), JsValue> {
        self.ensure_layers(p.layer + 1, max_layers);
        let gl = &self.gl;
        gl.bind_texture(GL::TEXTURE_2D_ARRAY, Some(&self.atlas));
        gl.pixel_storei(GL::UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
        gl.pixel_storei(GL::UNPACK_FLIP_Y_WEBGL, 0);
        let r = gl.unchecked_ref::<AnyGl>().tex_sub_image_3d_source(
            GL::TEXTURE_2D_ARRAY,
            0,
            p.x as i32,
            p.y as i32,
            p.layer as i32,
            p.w as i32,
            p.h as i32,
            1,
            GL::RGBA,
            GL::UNSIGNED_BYTE,
            source,
        );
        gl.pixel_storei(GL::UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
        r?;
        // Mips for this region only: each level is a linear 2:1 blit of the one above.
        gl.bind_framebuffer(GL::READ_FRAMEBUFFER, Some(&self.read_fb));
        gl.bind_framebuffer(GL::DRAW_FRAMEBUFFER, Some(&self.draw_fb));
        for level in 1..self.levels {
            let (sx, sy) = ((p.x >> (level - 1)) as i32, (p.y >> (level - 1)) as i32);
            let sw = ((p.w + (1 << (level - 1)) - 1) >> (level - 1)).max(1) as i32;
            let sh = ((p.h + (1 << (level - 1)) - 1) >> (level - 1)).max(1) as i32;
            let (dx, dy) = ((p.x >> level) as i32, (p.y >> level) as i32);
            let dw = ((p.w + (1 << level) - 1) >> level).max(1) as i32;
            let dh = ((p.h + (1 << level) - 1) >> level).max(1) as i32;
            gl.framebuffer_texture_layer(GL::READ_FRAMEBUFFER, GL::COLOR_ATTACHMENT0, Some(&self.atlas), level as i32 - 1, p.layer as i32);
            gl.framebuffer_texture_layer(GL::DRAW_FRAMEBUFFER, GL::COLOR_ATTACHMENT0, Some(&self.atlas), level as i32, p.layer as i32);
            gl.blit_framebuffer(sx, sy, sx + sw, sy + sh, dx, dy, dx + dw, dy + dh, GL::COLOR_BUFFER_BIT, GL::LINEAR);
        }
        gl.bind_framebuffer(GL::READ_FRAMEBUFFER, None);
        gl.bind_framebuffer(GL::DRAW_FRAMEBUFFER, None);
        Ok(())
    }

    fn upload_slots(&mut self, slots: &[f32], lo: usize, hi: usize, full: bool) {
        let gl = &self.gl;
        let row = DATA_WIDTH * 4;
        let rows = slots.len().div_ceil(row).max(1);
        gl.bind_texture(GL::TEXTURE_2D, Some(&self.data_tex));
        if full || rows > self.data_rows {
            let cap = rows.next_power_of_two();
            let mut data = vec![0f32; cap * row];
            data[..slots.len()].copy_from_slice(slots);
            // SAFETY: the view is used before any allocation can move wasm memory.
            let view = unsafe { js_sys::Float32Array::view(&data) };
            let _ = gl.tex_image_2d_with_i32_and_i32_and_i32_and_format_and_type_and_opt_array_buffer_view(
                GL::TEXTURE_2D,
                0,
                GL::RGBA32F as i32,
                DATA_WIDTH as i32,
                cap as i32,
                0,
                GL::RGBA,
                GL::FLOAT,
                Some(&view),
            );
            self.data_rows = cap;
            return;
        }
        let (r0, r1) = (lo / row, hi.div_ceil(row));
        let end = (r1 * row).min(slots.len());
        let mut data = vec![0f32; (r1 - r0) * row];
        data[..end - r0 * row].copy_from_slice(&slots[r0 * row..end]);
        // SAFETY: as above.
        let view = unsafe { js_sys::Float32Array::view(&data) };
        let _ = gl.tex_sub_image_2d_with_i32_and_i32_and_u32_and_type_and_opt_array_buffer_view(
            GL::TEXTURE_2D,
            0,
            0,
            r0 as i32,
            DATA_WIDTH as i32,
            (r1 - r0) as i32,
            GL::RGBA,
            GL::FLOAT,
            Some(&view),
        );
    }

    /// Uploads what changed in the render data since the last frame.
    fn sync(&mut self, e: &mut Engine) {
        let gl = self.gl.clone();
        let rd = &mut e.rd;
        let full = rd.generation != self.generation;
        if full {
            self.generation = rd.generation;
            self.quad_buf.upload(&gl, bytes_of(&rd.quads));
            self.vert_buf.upload(&gl, bytes_of(&rd.verts));
            gl.bind_vertex_array(Some(&self.path_vao));
            self.index_buf.upload(&gl, bytes_of(&rd.indices));
            gl.bind_vertex_array(None);
            let slots = std::mem::take(&mut rd.slots);
            self.upload_slots(&slots, 0, slots.len(), true);
            rd.slots = slots;
            rd.quads_dirty.take();
            rd.verts_dirty.take();
            rd.indices_dirty.take();
            rd.slots_dirty.take();
            rd.holes_dirty = true;
        } else {
            if let Some((lo, hi)) = rd.quads_dirty.take() {
                self.quad_buf.update(&gl, lo * QUAD_BYTES, bytes_of(&rd.quads[lo..hi]));
            }
            if let Some((lo, hi)) = rd.verts_dirty.take() {
                self.vert_buf.update(&gl, lo * 12, bytes_of(&rd.verts[lo..hi]));
            }
            if let Some((lo, hi)) = rd.indices_dirty.take() {
                gl.bind_vertex_array(Some(&self.path_vao));
                self.index_buf.update(&gl, lo * 4, bytes_of(&rd.indices[lo..hi]));
                gl.bind_vertex_array(None);
            }
            if let Some((lo, hi)) = rd.slots_dirty.take() {
                let slots = std::mem::take(&mut rd.slots);
                self.upload_slots(&slots, lo, hi, false);
                rd.slots = slots;
            }
        }
        if rd.holes_dirty {
            rd.holes_dirty = false;
            self.hole_buf.upload(&gl, bytes_of(&rd.holes));
        }
        self.overlay_buf.upload(&gl, bytes_of(&rd.overlay));
    }

    fn draw_quads(&mut self, buf_is: u8, first: u32, count: u32) {
        if count == 0 {
            return;
        }
        let gl = &self.gl;
        let buf = match buf_is {
            0 => &self.quad_buf.buf,
            1 => &self.hole_buf.buf,
            _ => &self.overlay_buf.buf,
        };
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(buf));
        bind_quad_attribs(gl, first);
        gl.draw_arrays_instanced(GL::TRIANGLE_STRIP, 0, 4, count as i32);
        self.draw_calls += 1;
    }

    pub fn render(&mut self, e: &mut Engine) {
        if self.gl.is_context_lost() {
            return;
        }
        self.sync(e);
        self.draw_calls = 0;
        let gl = self.gl.clone();
        let (w, h) = (gl.drawing_buffer_width(), gl.drawing_buffer_height());
        let cam = &e.cam;
        let (cx, cy, z) = (cam.x as f32, cam.y as f32, cam.zoom as f32);
        let (vw, vh, dpr) = (cam.vw as f32, cam.vh as f32, cam.dpr as f32);
        gl.viewport(0, 0, w, h);
        gl.color_mask(true, true, true, true);
        gl.depth_mask(true);
        gl.clear_color(0.0, 0.0, 0.0, 0.0);
        gl.clear_depth(0.0);
        gl.clear(GL::COLOR_BUFFER_BIT | GL::DEPTH_BUFFER_BIT);
        gl.enable(GL::DEPTH_TEST);
        gl.depth_func(GL::GREATER);
        gl.enable(GL::BLEND);
        gl.blend_func(GL::ONE, GL::ONE_MINUS_SRC_ALPHA);
        gl.disable(GL::CULL_FACE);

        // Quad program state shared by every quad pass.
        gl.use_program(Some(&self.quad.prog));
        let u = &self.quad.u;
        gl.uniform3f(u[0].as_ref(), cx, cy, z);
        gl.uniform2f(u[1].as_ref(), vw, vh);
        gl.uniform1f(u[2].as_ref(), dpr);
        gl.uniform1f(u[3].as_ref(), self.page as f32);
        gl.uniform1i(u[4].as_ref(), 0);
        gl.active_texture(GL::TEXTURE0);
        gl.bind_texture(GL::TEXTURE_2D_ARRAY, Some(&self.atlas));
        gl.bind_vertex_array(Some(&self.quad_vao));

        // 1. Holes write depth only: everything below them fails the depth test.
        let holes = e.rd.holes.len() as u32;
        if holes > 0 {
            gl.color_mask(false, false, false, false);
            self.draw_quads(1, 0, holes);
            gl.color_mask(true, true, true, true);
        }
        gl.depth_mask(false);

        // 2. Background and grid, under every item.
        let o = &e.opts;
        gl.use_program(Some(&self.grid.prog));
        let u = &self.grid.u;
        gl.uniform3f(u[0].as_ref(), cx, cy, z);
        gl.uniform2f(u[1].as_ref(), vw, vh);
        gl.uniform1f(u[2].as_ref(), dpr);
        let bg = crate::render::rgba_f(o.theme.background);
        gl.uniform4f(u[3].as_ref(), bg[0], bg[1], bg[2], bg[3]);
        let gc = crate::render::rgba_f(o.theme.grid);
        gl.uniform4f(u[4].as_ref(), gc[0], gc[1], gc[2], gc[3]);
        let (sp, fine) = e.grid_level();
        gl.uniform4f(u[5].as_ref(), sp as f32, fine, o.grid_kind as f32, o.grid_major as f32);
        gl.uniform1f(u[6].as_ref(), 0.25 / (e.rd.ranked as f32 + 2.0));
        gl.bind_vertex_array(Some(&self.grid_vao));
        gl.draw_arrays(GL::TRIANGLES, 0, 3);
        self.draw_calls += 1;

        // 3. Items, in z order.
        let batches = e.rd.batches.clone();
        let mut path_ready = false;
        let mut quad_ready = false;
        let mut multiplying = false;
        for b in batches {
            let (Batch::Quads { multiply, .. } | Batch::Paths { multiply, .. }) = b;
            if multiply != multiplying {
                multiplying = multiply;
                if multiply {
                    // Premultiplied multiply: dst × mix(1, src, srcAlpha); alpha composites as usual.
                    gl.blend_func_separate(GL::DST_COLOR, GL::ONE_MINUS_SRC_ALPHA, GL::ONE, GL::ONE_MINUS_SRC_ALPHA);
                } else {
                    gl.blend_func(GL::ONE, GL::ONE_MINUS_SRC_ALPHA);
                }
            }
            match b {
                Batch::Quads { first, count, .. } => {
                    if !quad_ready {
                        gl.use_program(Some(&self.quad.prog));
                        gl.bind_vertex_array(Some(&self.quad_vao));
                        quad_ready = true;
                        path_ready = false;
                    }
                    self.draw_quads(0, first, count);
                }
                Batch::Paths { first, count, .. } => {
                    if !path_ready {
                        gl.use_program(Some(&self.path.prog));
                        let u = &self.path.u;
                        gl.uniform3f(u[0].as_ref(), cx, cy, z);
                        gl.uniform2f(u[1].as_ref(), vw, vh);
                        gl.uniform1i(u[2].as_ref(), 1);
                        gl.active_texture(GL::TEXTURE1);
                        gl.bind_texture(GL::TEXTURE_2D, Some(&self.data_tex));
                        gl.active_texture(GL::TEXTURE0);
                        gl.bind_vertex_array(Some(&self.path_vao));
                        path_ready = true;
                        quad_ready = false;
                    }
                    gl.draw_elements_with_i32(GL::TRIANGLES, count as i32, GL::UNSIGNED_INT, (first * 4) as i32);
                    self.draw_calls += 1;
                }
            }
        }

        if multiplying {
            gl.blend_func(GL::ONE, GL::ONE_MINUS_SRC_ALPHA);
        }

        // 4. Overlay on top.
        let n = e.rd.overlay.len() as u32;
        if n > 0 {
            gl.use_program(Some(&self.quad.prog));
            gl.bind_vertex_array(Some(&self.quad_vao));
            self.draw_quads(2, 0, n);
        }
        gl.bind_vertex_array(None);
        e.draw_calls = self.draw_calls;
    }
}

/// Keeps the overlay quad type referenced for size assertions.
const _: () = assert!(std::mem::size_of::<Quad>() == 96);
