import * as vscode from 'vscode';
import { getNonce } from '../shared/webview';

export function getPixelEditorHtml(context: vscode.ExtensionContext, webview: vscode.Webview): string {
  const nonce = getNonce();
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'editor.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'editor.js'));

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>Pixel Editor</title>
</head>
<body>
  <main class="app">
    <header class="toolbar" aria-label="Pixel editor toolbar">
      <section class="tool-group" aria-label="Tools">
        <button class="icon-button active" type="button" data-tool="pencil" title="Pencil" aria-label="Pencil">✏️</button>
        <button class="icon-button" type="button" data-tool="eraser" title="Eraser" aria-label="Eraser">🧹</button>
        <button class="icon-button" type="button" data-tool="fill" title="Fill" aria-label="Fill">🪣</button>
        <button class="icon-button" type="button" data-tool="picker" title="Color picker" aria-label="Color picker">💧</button>
      </section>

      <section class="tool-group" aria-label="Selection">
        <button class="icon-button" type="button" data-tool="select-rect" title="Rectangular Selection: drag to select a region" aria-label="Rectangular selection">▭</button>
        <button class="icon-button" type="button" data-tool="select-ellipse" title="Ellipse Selection: drag to select an ellipse region" aria-label="Ellipse selection">◯</button>
        <button class="icon-button" type="button" data-tool="select-lasso" title="Lasso Selection: draw a freehand closed shape to select" aria-label="Lasso selection">🪢</button>
        <button id="selectionMoveButton" class="text-button" type="button" title="Move the selected region (or press M)" disabled>Move</button>
        <button id="selectionCutButton" class="text-button" type="button" title="Cut the selected region (or press Delete)" disabled>Cut</button>
        <button id="selectionClearButton" class="text-button" type="button" title="Clear selection (or press Escape)" disabled>Deselect</button>
      </section>

      <section class="tool-group" aria-label="Brush">
        <label class="compact-label" for="colorInput">Color</label>
        <input id="colorInput" class="color-input" type="color" value="#2f80ed" title="Color">
        <label class="compact-label" for="brushSize">Brush</label>
        <input id="brushSize" class="range" type="range" min="1" max="64" step="1" value="1" title="Brush size">
        <output id="brushSizeLabel" class="metric">1</output>
      </section>

      <section class="tool-group" aria-label="View">
        <label class="compact-label" for="zoom">Zoom</label>
        <input id="zoom" class="range" type="range" min="0.1" max="40" step="0.1" value="16" title="Zoom">
        <button id="fitZoomButton" class="text-button" type="button" title="Fit image to the visible workspace">Fit</button>
        <output id="zoomLabel" class="metric">16x</output>
        <button id="toggleGrid" class="icon-button active" type="button" title="Toggle grid" aria-label="Toggle grid">▦</button>
        <button id="toggleSnap" class="icon-button" type="button" title="Snap to guide grid" aria-label="Snap to guide">⊹</button>
        <label class="compact-label" for="guideSize">Guide</label>
        <select id="guideSize" class="select-input" title="Guide grid size">
          <option value="1">1 px</option>
          <option value="8">8 px</option>
          <option value="16">16 px</option>
          <option value="32">32 px</option>
          <option value="64">64 px</option>
          <option value="128">128 px</option>
        </select>
      </section>

      <section class="tool-group" aria-label="Canvas size">
        <output id="canvasSizeDisplay" class="metric" title="Canvas size">32 x 32</output>
      </section>

      <section class="tool-group" aria-label="Hitbox">
        <button class="icon-button" type="button" data-tool="hitbox" title="Edit hitbox (click to add a point, drag to move, right-click to delete)" aria-label="Edit hitbox">⬡</button>
        <button id="autoTraceButton" class="text-button" type="button" title="Generate a convex hitbox from the sprite's opaque pixels">Auto</button>
        <button id="clearHitboxButton" class="text-button" type="button" title="Remove all hitbox points">Clear</button>
        <button id="saveHitboxButton" class="text-button" type="button" title="Write the hitbox to a ConvexPolygonShape2D .tres next to this PNG">Save Hitbox</button>
        <output id="hitboxPointCount" class="metric" title="Hitbox point count">0</output>
      </section>

      <section class="tool-group" aria-label="Rig">
        <button class="icon-button" type="button" data-tool="rig" title="Rig: click a pivot to select it, drag the pivot, then drag the handle to rotate" aria-label="Rig tool">🦴</button>
        <label class="compact-label" for="rigAngle">Angle</label>
        <input id="rigAngle" class="number-input" type="number" step="1" value="0" title="Rotation angle in degrees">
        <button id="addPivotButton" class="text-button" type="button" title="Add a new pivot point to the active layer">+ Pivot</button>
        <div id="pivotsList" class="pivots-list" aria-label="Pivot points"></div>
        <button id="resetRigButton" class="text-button" type="button" title="Reset rotation and position for the active pivot">Reset</button>
      </section>

      <section class="tool-group push" aria-label="File">
        <span id="fileStatus" class="status">pixel.png</span>
        <button id="saveButton" class="text-button primary" type="button">Save</button>
      </section>
    </header>

    <section class="editor-shell" aria-label="Pixel editor workspace">
      <section id="workspace" class="workspace" aria-label="Pixel canvas workspace">
        <div id="canvasFrame" class="canvas-frame grid">
          <canvas id="pixelCanvas" class="pixel-canvas" aria-label="Pixel canvas"></canvas>
          <svg id="hitboxOverlay" class="hitbox-overlay" aria-hidden="true"></svg>
          <svg id="rigOverlay" class="hitbox-overlay" aria-hidden="true"></svg>
          <svg id="selectionOverlay" class="hitbox-overlay selection-overlay" aria-hidden="true"></svg>
          <canvas id="selectionDragCanvas" class="selection-drag-canvas" aria-hidden="true" hidden></canvas>
          <div id="cursorOverlay" class="cursor-overlay" aria-hidden="true" hidden></div>
          <div class="resize-handle" data-edge="n" aria-hidden="true"></div>
          <div class="resize-handle" data-edge="s" aria-hidden="true"></div>
          <div class="resize-handle" data-edge="e" aria-hidden="true"></div>
          <div class="resize-handle" data-edge="w" aria-hidden="true"></div>
          <div class="resize-handle" data-edge="nw" aria-hidden="true"></div>
          <div class="resize-handle" data-edge="ne" aria-hidden="true"></div>
          <div class="resize-handle" data-edge="sw" aria-hidden="true"></div>
          <div class="resize-handle" data-edge="se" aria-hidden="true"></div>
        </div>
      </section>

      <aside class="side-panel" aria-label="Pixel editor panels">
        <section class="panel-section" aria-label="Color palettes">
          <div class="panel-header">
            <label class="panel-title" for="paletteSelect">Palette</label>
            <select id="paletteSelect" class="select-input" title="Palette"></select>
          </div>
          <div id="paletteSwatches" class="palette-swatches" aria-label="Palette colors"></div>
        </section>

        <section class="panel-section grow" aria-label="Layers">
          <div class="panel-header">
            <span class="panel-title">Layers</span>
            <div class="panel-actions">
              <button id="addLayerButton" class="icon-button" type="button" title="Add layer" aria-label="Add layer">+</button>
              <button id="importLayerButton" class="icon-button" type="button" title="Import images as layers" aria-label="Import images as layers">📥</button>
              <button id="duplicateLayerButton" class="icon-button" type="button" title="Duplicate layer" aria-label="Duplicate layer">⧉</button>
              <button id="deleteLayerButton" class="icon-button" type="button" title="Delete layer" aria-label="Delete layer">🗑️</button>
            </div>
          </div>
          <div class="layer-actions">
            <button id="moveLayerUpButton" class="icon-button" type="button" title="Move layer up" aria-label="Move layer up">↑</button>
            <button id="moveLayerDownButton" class="icon-button" type="button" title="Move layer down" aria-label="Move layer down">↓</button>
            <button id="mergeLayerDownButton" class="icon-button" type="button" title="Merge layer down" aria-label="Merge layer down">⤓</button>
            <button id="previewAnimationButton" class="icon-button" type="button" title="Preview layers as animation" aria-label="Preview layers as animation">▶</button>
          </div>
          <label class="opacity-control" for="layerOpacity">
            <span class="compact-label">Opacity</span>
            <input id="layerOpacity" class="range" type="range" min="0" max="100" step="1" value="100" title="Layer opacity">
            <output id="layerOpacityLabel" class="metric">100%</output>
          </label>
          <div id="layersList" class="layers-list" aria-label="Layer list"></div>
        </section>
      </aside>
    </section>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
