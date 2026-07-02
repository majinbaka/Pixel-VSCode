# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A VS Code extension (`pixel-vscode`) that provides a custom PNG/JPG pixel-art editor and a Godot tile-map editor, both implemented as webview-based custom editors. Single runtime dependency: `pngjs`.

## Commands

```sh
npm run compile         # Full build: extension host + webviews -> out/ and media/
npm run compile:ext     # tsc compile of the extension host only (src/** excluding src/webview) -> out/
npm run compile:webviews # esbuild bundle of the three webview entry points -> media/*.js
npm run watch            # Watch mode for both extension host and webviews
npm run check             # Type-check only, no emit (runs tsc twice: root tsconfig + src/webview/tsconfig.json)
npm run package           # Production build (minified esbuild + tsc) — runs before vsce packaging
npm test                  # Compiles the extension host, then runs the Mocha suite via @vscode/test-cli in a real VS Code instance
```

- `npm test` downloads/launches VS Code Electron and runs everything under `out/test/**/*.test.js` (compiled from `src/test/*.test.ts`) against a scratch workspace at `.vscode-test/smoke-workspace`. There is no filter flag wired up in `package.json`; to run a single test file, edit `files` in `.vscode-test.mjs` temporarily or use Mocha's `.only`.
- There is no lint script.
- Press `F5` in VS Code to launch an Extension Development Host for manual testing.

## Architecture

### Two independent custom editors, one shared plumbing pattern

The extension registers two `vscode.CustomEditorProvider` implementations in `src/extension.ts`:
- `PixelEditorProvider` (`src/pixelEditor/`) — opens `*.png/*.jpg/*.jpeg`, view type `pixelVscode.pixelEditor`.
- `MapEditorProvider` (`src/mapEditor/`) — opens `*.pixelmap.json`, view type `pixelVscode.mapEditor`.

Both follow the same shape: a `*Document` class (`PixelDocument`, `MapDocument`) implementing `vscode.CustomDocument` holds the in-memory bytes and fires `onDidChangeContent`; the provider wires up undo/redo through `onDidChangeCustomDocument` (fire an edit event with `undo`/`redo` closures that call `document.update(...)`), and communicates with its webview purely through `postMessage`/`onDidReceiveMessage` using a discriminated-union message type (`WebviewMessage` in `src/shared/types.ts`, `MapWebviewMessage` in `src/mapEditor/types.ts`). Every provider's `resolveCustomEditor` responds to a `'ready'` message from the webview by posting an `'init'` message with the full document state — this is the only way state enters the webview.

Each editor's webview HTML is generated server-side in an `html.ts` (`src/pixelEditor/html.ts`, `src/mapEditor/html.ts`) using a nonce-based CSP (`getNonce()` from `src/shared/webview.ts`) and `webview.asWebviewUri(...)` for `media/*.css`/`media/*.js`. The webview JS itself is a separate, sandboxed TypeScript program.

### Webview code is a separate TS project with no vscode API access

`src/webview/**` compiles independently (`src/webview/tsconfig.json`, `moduleResolution: bundler`, DOM lib, `noEmit: true` — it's type-checked but actually built by esbuild, not tsc). It cannot import `vscode` or Node APIs; the only bridge to the extension host is `acquireVsCodeApi().postMessage(...)` and the `window.addEventListener('message', ...)` handler. There are three independent webview entry points bundled by `esbuild.js` into `media/`:
- `src/webview/editor/main.ts` → `media/editor.js` (the pixel editor — by far the largest, split into focused modules: `canvasCore`, `drawing`, `selection`, `hitbox`, `rig`, `layersPanel`, `palettePanel`, `resizeHandles`, `state`, `dom`, `wireTypes`).
- `src/webview/mapEditor/main.ts` → `media/map-editor.js`.
- `src/webview/animation/main.ts` → `media/animation.js`.

Each webview module directory has its own `wireTypes.ts` mirroring (a subset of) the extension-host message types — keep both sides in sync manually when changing message shapes, there is no shared codegen.

### Sidecar files: the PNG is never the only source of truth

For a given `foo.png`, the editor persists auxiliary state as sibling files, all derived deterministically from the PNG path (see `src/layerState.ts`, `src/collisionShape.ts`):
- `.foo_image.pixvjson` — `LayerStateFile` (layers, opacity, visibility, rig/pivot data) as JSON. Read/written by `readLayerState`/`writeLayerState`/`deleteLayerState`. Only the flattened composite is ever encoded into the PNG itself; layer/rig structure lives only in this sidecar.
- `foo.collision.tres` — a Godot `ConvexPolygonShape2D` resource, hand-serialized/parsed as text (regex-matched `PackedVector2Array(...)`) rather than through any Godot tooling — see `src/collisionShape.ts`.

When saving, `PixelEditorProvider.saveCustomDocument` always calls `confirmOverwrite()` (`src/shared/uri.ts`) if the on-disk PNG wasn't created by the current session and the target isn't already a `.png`; this is a deliberate anti-data-loss guard — don't bypass it when touching save logic.

### Godot integration is shell-out based, not a Godot API binding

`src/godotProject.ts` locates the Godot project root by walking up from the resource (or workspace folders) looking for `project.godot`, then exports maps by invoking the real `godot` binary headlessly:
```
godot --headless --path <projectRoot> --script media/godot_map_exporter.gd -- --input <path> --output <res://path>
```
The exporter script itself lives at `media/godot_map_exporter.gd` (GDScript, not TypeScript) and is invoked via `execFile`, not edited by the TS build. The executable name is configurable via the `pixelVscode.godotExecutable` setting. `.pixelmap.json` is only ever an editor-side source format (`src/mapEditor/mapModel.ts` parses/serializes/validates it); the exported `.tscn` under `scenes/world/maps/` is the actual Godot-consumable artifact and is never read back by the extension.

### Tile sets come from Godot `.tres` files

`src/mapEditor/tileset.ts` parses `TileSetAtlasSource` entries directly out of a Godot `.tres` TileSet resource (text parsing, same style as `collisionShape.ts`) rather than requiring any Godot-side export step — this is how the map editor's palette panel gets its tile sources.

## Testing

Tests live in `src/test/*.test.ts` and run as Mocha suites inside a real VS Code instance via `@vscode/test-cli` (not a headless/jsdom mock). Most test files exercise the pure extension-host logic directly (`pixelDocument.test.ts`, `layerState.test.ts`, `collisionShape.test.ts`, `mapDocument.test.ts`, `mapModel.test.ts`, `tileset.test.ts`, `godotProject.test.ts`); `smoke.test.ts` drives the actual extension activation and command registration through the `vscode` API. There is no test coverage yet for the `src/webview/**` code (it can't easily run inside the VS Code test host since it depends on `acquireVsCodeApi`/DOM).

## Required after every code change

These three steps are mandatory whenever you add, change, or fix behavior in this repo — not optional cleanup:

1. **Add or update unit tests.** Every behavior change to `src/**` (excluding `src/webview/**`, which has no test harness — see above) needs a corresponding test in `src/test/*.test.ts` covering the new/changed behavior, not just a passing build. Run `npm test` before considering the change done.
2. **Update `CHANGELOG.md`.** Add an entry for the change under the current top version section (or a new `[Unreleased]`/next-version section if one doesn't exist yet), following the existing Keep a Changelog style (`### Added` / `### Changed` / `### Fixed`).
3. **Update `README.md`** if the change adds, removes, or changes user-facing behavior described there (a feature under "Highlighted features", a command, a setting, etc.). Skip this step for pure internal refactors with no user-visible effect.

Do this as part of the same change, not as a separate follow-up — a code change without its matching test and changelog entry is incomplete.
