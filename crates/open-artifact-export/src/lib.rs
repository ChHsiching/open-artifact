//! Export packing shared by the Design, Whiteboard and Slides editors: zip
//! archives with deflate, PDF assembly and lossless PNG re-compression.
//!
//! Compiled to WebAssembly and run in a Worker by `packages/wasm-export`
//! (or in-thread where there are no Workers: Node tests, the CLI). The
//! editors keep composing their files (Office Open XML, page pictures) in
//! TypeScript and hand the bytes over here to be packed.

pub mod deflate;
pub mod font;
pub mod pdf;
pub mod png;
pub mod zip;

#[cfg(target_arch = "wasm32")]
mod wasm;
