# Pixel VSCode

VS Code pixel editor with native export workflows for the Godot project.

## Features

- Create a blank pixel PNG from the command palette with `Pixel: New Pixel Image`.
- Open PNG files with a custom pixel editor via `Pixel: Open With Pixel Editor` or from the Explorer context menu.
- Draw, erase, fill, and pick colors with adjustable brush size.
- Select regions with rectangular, ellipse, or lasso tools; move or cut the selection.
- Resize the canvas by dragging handles on any edge or corner.
- Snap drawing to a configurable guide grid (1, 8, 16, 32, 64, or 128 px).
- Work with multiple layers: add, duplicate, delete, reorder, and set per-layer opacity.
- Layer state is persisted to a sidecar `.pixvjson` file and restored on reopen.
- Pick colors from built-in palettes: PICO-8, Game Boy, DawnBringer 16, and AAP-16.
- Rig a layer with pivot points and a rotation handle to pose it before flattening.
- Draw a hitbox polygon over the sprite, or auto-trace a convex hull from the opaque pixels, and save it as a `ConvexPolygonShape2D` `.collision.tres` next to the PNG.
- When saving, choose to overwrite the original file or save as a new file.
- Preview PNG frame animations with `Pixel: Preview PNG Animation`; select at least two frames and set one duration for all frames or per-frame durations.
- Create streaming-friendly map sources with `Pixel: New Pixel Map`.
- Paint map cells from any `TileSetAtlasSource` declared in a Godot `.tres` TileSet.
- Export `.pixelmap.json` sources through Godot headless into native `.tscn` scenes.

## Pixel editor

Open any PNG with the pixel editor. The toolbar provides:

| Section | Controls |
|---|---|
| Tools | Pencil, Eraser, Fill, Color picker |
| Selection | Rectangular, Ellipse, Lasso — then Move or Cut |
| Brush | Color picker, brush size (1–64 px) |
| View | Zoom slider, Fit button, grid toggle, snap toggle, guide size |
| Hitbox | Edit hitbox points, Auto-trace, Clear, Save Hitbox |
| Rig | Select pivot, set angle, add pivot, reset rig |
| File | Status, Save |

Layers are managed in the side panel alongside built-in color palettes.

## Save behavior

When you save, if the PNG on disk was not created by the editor in this session, a dialog asks whether to **Overwrite** the original or **Save as new file**. Saving as new opens the copy in the editor automatically.

## Pixel maps

Run `Pixel: New Pixel Map` while the Godot folder is open:

1. Enter a map/chunk id and cell dimensions. `32x32` is the recommended streaming chunk size.
2. Select a TileSet under `assets/tiles`.
3. Paint on multiple map layers using Paint, Erase, and Fill.
4. Save the editable `.pixelmap.json` source.
5. Select `Export .tscn` to generate `scenes/world/maps/<map_id>.tscn`.

JSON is retained only as editor source. The game-ready output is a native Godot scene with serialized `TileMapLayer` cell data.

Configure `pixelVscode.godotExecutable` if the Godot binary is not available as `godot`.

## Development

```sh
npm install
npm run compile
npx @vscode/vsce package
```

Press `F5` in VS Code to launch an Extension Development Host.

| Script | Purpose |
|---|---|
| `npm run compile` | Compile TypeScript to `out/` |
| `npm run watch` | Watch mode compilation |
| `npm run check` | Type-check without emitting |
