import * as vscode from 'vscode';
import { getNonce } from '../shared/webview';

export function getMapEditorHtml(context: vscode.ExtensionContext, webview: vscode.Webview): string {
  const nonce = getNonce();
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'map-editor.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'map-editor.js'));
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>Pixel Monster Map Editor</title>
</head>
<body>
  <main class="map-app">
    <header class="toolbar">
      <section class="tool-group">
        <button class="button active" data-tool="paint" type="button">Paint</button>
        <button class="button" data-tool="erase" type="button">Erase</button>
        <button class="button" data-tool="fill" type="button">Fill</button>
      </section>
      <section class="tool-group">
        <label for="zoomInput">Zoom</label>
        <input id="zoomInput" type="range" min="20" max="200" step="10" value="50">
        <output id="zoomLabel">50%</output>
        <label class="check"><input id="gridInput" type="checkbox" checked> Grid</label>
      </section>
      <section class="tool-group">
        <span id="mapStatus" class="status">Map</span>
        <span id="cellStatus" class="status">0, 0</span>
      </section>
      <section class="tool-group push">
        <button id="saveButton" class="button" type="button">Save Source</button>
        <button id="exportButton" class="button primary" type="button">Export .tscn</button>
      </section>
    </header>
    <section class="content">
      <section id="workspace" class="workspace">
        <div id="mapFrame" class="map-frame">
          <canvas id="mapCanvas"></canvas>
        </div>
      </section>
      <aside class="sidebar">
        <section class="panel palette-panel">
          <div class="panel-header">
            <strong>Tiles</strong>
            <select id="sourceSelect"></select>
          </div>
          <div class="palette-scroll">
            <div id="paletteFrame" class="palette-frame">
              <canvas id="paletteCanvas"></canvas>
            </div>
          </div>
          <div id="selectionStatus" class="hint">Select a tile.</div>
        </section>
        <section class="panel layers-panel">
          <div class="panel-header">
            <strong>Layers</strong>
            <div>
              <button id="addLayerButton" class="icon-button" type="button">+</button>
              <button id="deleteLayerButton" class="icon-button" type="button">−</button>
            </div>
          </div>
          <div id="layersList" class="layers-list"></div>
        </section>
      </aside>
    </section>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
