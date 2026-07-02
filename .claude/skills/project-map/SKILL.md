---
name: project-map
description: Use at the start of ANY task in this repo (pixel-vscode), before running Explore/grep to "figure out how the codebase works". Gives the file-by-file map of both custom editors, the webview split, sidecar file formats, and Godot integration so you don't have to re-derive architecture from scratch every session. Only fall back to Explore/grep for things this map explicitly says it doesn't cover (exact line numbers, current implementation details, bug repros).
---

# Project Map — pixel-vscode

Read this fully before searching the codebase. It tells you which file owns what,
so you go straight to the right file instead of exploring. For narrative
architecture (why sidecars exist, why Godot is shelled out, save-guard rationale),
see `CLAUDE.md` at the repo root — this skill is the file index, CLAUDE.md is the reasoning.

If this map and the actual file tree disagree, trust the file tree and treat this
file as stale — the person who touched the mismatched area should update this doc.

## Entry point

`src/extension.ts` — registers everything. Two custom editors, 4 commands:
- `pixelVscode.newFile` → `src/commands/fileCommands.ts` (`createNewPixelFile`)
- `pixelVscode.newGodotMap` → `src/mapEditor/createGodotMap.ts`
- `pixelVscode.openEditor` → `src/commands/fileCommands.ts` (`openWithPixelEditor`)
- `pixelVscode.previewAnimation` → `src/commands/animationCommands.ts` (`openAnimationPreview`)

## Extension host (`src/**`, excluding `src/webview` and `src/test`)

### Pixel editor (`src/pixelEditor/`) — opens *.png/*.jpg/*.jpeg
| File | Owns |
|---|---|
| `pixelEditorProvider.ts` | `PixelEditorProvider`, view type `PIXEL_EDITOR_VIEW_TYPE` (`pixelVscode.pixelEditor`), undo/redo wiring, `saveCustomDocument` (calls `confirmOverwrite()` — anti-data-loss guard, don't bypass) |
| `pixelDocument.ts` | `PixelDocument` — in-memory bytes, `onDidChangeContent` |
| `html.ts` | webview HTML shell, nonce CSP |
| `editorClipboard.ts` | clipboard helpers for layers/selections |
| `spriteSheetExport.ts` | sprite sheet export logic |

### Map editor (`src/mapEditor/`) — opens *.pixelmap.json
| File | Owns |
|---|---|
| `mapEditorProvider.ts` | `MapEditorProvider`, `MapEditorProvider.viewType` (`pixelVscode.mapEditor`) |
| `mapDocument.ts` | `MapDocument` — in-memory state, `onDidChangeContent` |
| `mapModel.ts` | parse/serialize/validate `.pixelmap.json` (editor-side source format only) |
| `html.ts` | webview HTML shell |
| `types.ts` | `MapWebviewMessage` discriminated union |
| `tileset.ts` | parses `TileSetAtlasSource` entries out of Godot `.tres` TileSet resource (text parsing) — feeds the palette panel |
| `godotExport.ts` | invokes the Godot exporter (see below) |
| `createGodotMap.ts` | command handler for `pixelVscode.newGodotMap` |

### Godot integration
- `src/godotProject.ts` — walks up from resource/workspace folders to find `project.godot`; shells out to the real `godot` binary headlessly via `execFile`. Executable name configurable via `pixelVscode.godotExecutable` setting.
- `media/godot_map_exporter.gd` — GDScript exporter script, NOT compiled by the TS build, invoked directly by path.
- Output: `.tscn` under `scenes/world/maps/` — the real Godot artifact, never read back by the extension.
- `.pixelmap.json` never round-trips through Godot; it's purely the editor's own format.

### Animation preview
- `src/animationPreview/animationPreviewProvider.ts` + `types.ts` — small webview provider (~70 lines) for previewing sprite animations, wired via `pixelVscode.previewAnimation`.
- `src/commands/animationCommands.ts` — command handler that resolves selected resources and opens the preview.

### Sidecar/data formats
- `src/layerState.ts` — reads/writes `.foo_image.pixvjson` next to `foo.png` (`LayerStateFile`: layers, opacity, visibility, rig/pivot). This is the ONLY place layer/rig structure lives — the PNG itself only stores the flattened composite.
- `src/collisionShape.ts` — reads/writes `foo.collision.tres`, a Godot `ConvexPolygonShape2D`, hand-parsed via regex on `PackedVector2Array(...)` — no Godot tooling involved.

### Shared (`src/shared/`)
| File | Owns |
|---|---|
| `types.ts` | `WebviewMessage` discriminated union (pixel editor) |
| `webview.ts` | `getNonce()` for CSP |
| `uri.ts` | `confirmOverwrite()` and other URI/path helpers |
| `png.ts` | PNG encode/decode helpers (wraps `pngjs`) |

### Commands (`src/commands/`)
- `fileCommands.ts` — new file / open-with-editor handlers
- `animationCommands.ts` — animation preview handler

## Webview code (`src/webview/**`) — separate TS project, NO vscode/Node API

Compiles independently (`src/webview/tsconfig.json`), bundled by `esbuild.js` into `media/`.
Only bridge to extension host: `acquireVsCodeApi().postMessage(...)` and `window.addEventListener('message', ...)`.
**No test harness covers this directory** — don't expect/add `src/test/*.test.ts` coverage for changes here.

### `src/webview/editor/` → `media/editor.js` (pixel editor, largest bundle)
`main.ts` (entry) + focused modules: `canvasCore.ts`, `drawing.ts`, `selection.ts`, `hitbox.ts`,
`rig.ts`, `layersPanel.ts`, `palettePanel.ts`, `palettes.ts`, `resizeHandles.ts`, `autoTrace.ts`,
`state.ts`, `dom.ts`, `wireTypes.ts` (mirrors a subset of `src/shared/types.ts` — keep manually in sync).

### `src/webview/mapEditor/` → `media/map-editor.js`
`main.ts` (entry) + `canvas.ts`, `dom.ts`, `layersPanel.ts`, `palettePanel.ts`, `state.ts`,
`wireTypes.ts` (mirrors `src/mapEditor/types.ts`).

### `src/webview/animation/` → `media/animation.js`
`main.ts` (entry) + `dom.ts`, `frameLoader.ts`, `framesPanel.ts`, `playback.ts`, `state.ts`, `wireTypes.ts`.

### `src/webview/domUtil.ts`
Shared DOM helpers used across the three webview entry points.

## Tests (`src/test/*.test.ts`)

Mocha suite, runs in a real VS Code instance via `@vscode/test-cli` (`npm test`). One test file per
extension-host module being covered — match new/changed behavior to the file with the same base name:

| Source | Test |
|---|---|
| `pixelEditor/pixelDocument.ts` | `pixelDocument.test.ts` |
| `pixelEditor/editorClipboard.ts` | `editorClipboard.test.ts` |
| `pixelEditor/spriteSheetExport.ts` | `spriteSheetExport.test.ts` |
| `layerState.ts` | `layerState.test.ts` |
| `collisionShape.ts` | `collisionShape.test.ts` |
| `mapEditor/mapDocument.ts` | `mapDocument.test.ts` |
| `mapEditor/mapModel.ts` | `mapModel.test.ts` |
| `mapEditor/tileset.ts` | `tileset.test.ts` |
| `godotProject.ts` | `godotProject.test.ts` |
| activation/command registration | `smoke.test.ts` |

No test file yet exists for `animationPreview/**` or `commands/**` — if you change those, this
is a gap, not a precedent to skip testing.

## Build commands (see CLAUDE.md for full list)

`npm run compile` (full), `npm run watch`, `npm run check` (typecheck only), `npm test`.

## After touching this repo

Per CLAUDE.md: every `src/**` behavior change (excluding `src/webview/**`) needs a test in
`src/test/*.test.ts`, a `CHANGELOG.md` entry, and a `README.md` update if user-facing. Do this
in the same change, not a follow-up.

## When this map is NOT enough — go read the actual file

- Exact function signatures, line numbers, current implementation details.
- Message shape details for `WebviewMessage` / `MapWebviewMessage` — read `src/shared/types.ts` /
  `src/mapEditor/types.ts` directly since these change often and drift is exactly what breaks
  webview↔host communication.
- Anything in `src/webview/**` you're about to edit — the map tells you which file, but not
  what's inside it.
