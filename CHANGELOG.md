# Changelog

All notable changes to the "Pixel VSCode" extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Keyboard shortcuts for tool switching in the Pixel Editor: P (Pencil), E (Eraser), B (Fill), I (Color picker), R (Rectangular selection), O (Ellipse selection), L (Lasso selection), H (Hitbox), G (Rig).
- Copy/paste for layers and selections via an in-session editor clipboard, letting you copy a layer or selection in one PNG and paste it into another open Pixel Editor tab.
- `Export sprite sheet` button that composites all visible layers into a single grid-atlas PNG (one cell per visible layer).

## [1.0.0]

### Added
- Custom Pixel Editor for `.png`, `.jpg`, `.jpeg` files with Pencil, Eraser, Fill, and Color picker tools (brush size 1–64px).
- Built-in color palettes: PICO-8, Game Boy, DawnBringer 16, AAP-16.
- Guide grid with snapping (step sizes 1, 8, 16, 32, 64, 128px).
- Smooth zoom (0.1x–40x) with cursor-anchored zoom and Fit to screen.
- Rectangular, Ellipse, and Lasso selection tools with Move and Cut, including staircase polygon snapping for pixel-accurate selections on the grid.
- Full layer system: add, duplicate, delete, reorder, merge down, per-layer opacity, import images as new layers, and persistence to a `.pixvjson` sidecar file.
- Rigging tools: pivot points with on-canvas rotation handles, angle snapping, and flatten-to-pixels.
- Hitbox/collision editing with manual polygon drawing and auto-trace convex hull, exported as Godot `ConvexPolygonShape2D` (`.collision.tres`).
- Visual canvas resizing via edge/corner drag handles.
- `Pixel: Preview PNG Animation` command to play back a sequence of PNGs with shared or per-frame durations.
- `Pixel: New Pixel Monster Map` command and Pixel Map Editor for building Godot-ready tile maps, with paint/erase/fill tools and multi-layer support.
- `Export .tscn` for map sources, generating native Godot `TileMapLayer` scenes via a configurable Godot executable (`pixelVscode.godotExecutable`).
- Safe save behavior: prompts to Overwrite or Save as new file when the PNG on disk wasn't created by the current editing session.
