# Pixel VSCode

VS Code pixel editor with native export workflows for the `pixel-monster` Godot 4.6.2 project.

## Features

- Create a blank pixel PNG from the command palette with `Pixel: New Pixel Image`.
- Open PNG files with a custom pixel editor.
- Draw, erase, fill, pick colors, resize the canvas, and save back to disk.
- Work with session layers and flatten the visible result into PNG on save.
- Pick colors from built-in palettes such as PICO-8, Game Boy, DawnBringer 16, and AAP-16.
- Rig a layer with a pivot and rotation handle to pose it before flattening.
- Draw a hitbox polygon over the sprite, or auto-trace one from the opaque pixels, and save it as a `ConvexPolygonShape2D` `.collision.tres` next to the PNG.
- Preview PNG frame animations with `Pixel: Preview PNG Animation`, selecting multiple frames and setting one duration for all frames or per-frame durations.
- Create streaming-friendly map sources with `Pixel: New Pixel Monster Map`.
- Paint map cells from any `TileSetAtlasSource` declared in a Godot `.tres` TileSet.
- Export `.pixelmap.json` sources through Godot headless into native `.tscn` scenes containing `TileMapLayer` data.
- Create blank or cloned LPC character/monster packs with all 15 actions required by the game.
- Validate exact LPC sheet dimensions and synchronize the idle preview sheet with `Pixel: Validate and Sync Character Pack`.

## Pixel Monster maps

Run `Pixel: New Pixel Monster Map` while the `pixel-monster` folder is open:

1. Enter a map/chunk id and cell dimensions. `32x32` is the recommended streaming chunk size.
2. Select a TileSet under `assets/tiles`.
3. Paint on multiple map layers using Paint, Erase, and Fill.
4. Save the editable `.pixelmap.json` source.
5. Select `Export .tscn` to generate `scenes/world/maps/<map_id>.tscn`.

JSON is retained only as editor source. The game-ready output is a native Godot scene with serialized `TileMapLayer` cell data.

Configure `pixelVscode.godotExecutable` if the Godot binary is not available as `godot`.

## Pixel Monster characters

Run `Pixel: New Pixel Monster Character`, then choose `character` or `monster`. The command creates:

- `assets/generated/lpc_characters_full/<id>/<action>.png`, or the equivalent monster path.
- All 15 action sheets with 64x64 frames and the exact character or monster sheet layout currently used by `LpcAnimationLibrary`.
- `assets/generated/lpc_characters/<id>.png`, or the equivalent monster idle preview.

PNG files inside an LPC action pack automatically open with a 64x64 guide grid and a `Sync Pack` action. Run synchronization after editing to validate every sheet and refresh the idle preview. The Godot runtime discovers valid pack directories automatically.

## Development

```sh
npm install
npm run compile
npx @vscode/vsce package
```

Press `F5` in VS Code to launch an Extension Development Host.
