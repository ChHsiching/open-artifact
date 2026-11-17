//! Whiteboard geometry, compiled to WebAssembly for the editor and the CLI.
//!
//! The geometry must give the same numbers as the editor: derived
//! geometry is written into board files. `js` reproduces the JavaScript
//! number semantics the ports rely on.

mod fdlibm;
pub mod js;
pub mod routing;
pub mod shape_paths;
pub mod ink;
pub mod snapping;
pub mod arrow_layout;
pub mod labels;
pub mod end_snap;
pub mod bend_drag;
pub mod hit_test;
pub mod free_space;
pub mod geometry;

#[cfg(target_arch = "wasm32")]
mod wasm;
