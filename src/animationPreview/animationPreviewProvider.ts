import * as vscode from 'vscode';
import { getNonce } from '../shared/webview';

export function getAnimationHtml(context: vscode.ExtensionContext, webview: vscode.Webview): string {
  const nonce = getNonce();
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'animation.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'animation.js'));

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>Pixel Animation Preview</title>
</head>
<body>
  <main class="animation-app">
    <header class="animation-toolbar" aria-label="Animation preview toolbar">
      <section class="tool-group" aria-label="Playback">
        <button id="playButton" class="text-button primary" type="button">Play</button>
        <button id="restartButton" class="text-button" type="button">Restart</button>
        <label class="check-label">
          <input id="loopInput" type="checkbox" checked>
          Loop
        </label>
      </section>

      <section class="tool-group" aria-label="Timing">
        <label class="compact-label" for="allDurationInput">Duration</label>
        <input id="allDurationInput" class="number-input" type="number" min="20" max="10000" step="10" value="120" title="Frame duration">
        <span class="compact-label">ms</span>
        <button id="applyDurationButton" class="text-button" type="button">Apply</button>
      </section>

      <section class="tool-group" aria-label="View">
        <label class="compact-label" for="zoomInput">Zoom</label>
        <input id="zoomInput" class="range" type="range" min="1" max="32" step="1" value="8" title="Zoom">
        <output id="zoomLabel" class="metric">8x</output>
      </section>

      <section class="tool-group push" aria-label="Frames">
        <span id="statusText" class="status">No frames</span>
        <button id="pickFramesButton" class="text-button" type="button">Frames</button>
      </section>
    </header>

    <section class="animation-shell" aria-label="Animation workspace">
      <section class="preview-workspace" aria-label="Animation preview">
        <div id="previewFrame" class="preview-frame">
          <canvas id="previewCanvas" class="preview-canvas" aria-label="Animation frame"></canvas>
        </div>
      </section>

      <aside class="frames-panel" aria-label="Animation frames">
        <div class="panel-header">
          <span class="panel-title">Frames</span>
          <span id="frameCountText" class="panel-count">0</span>
        </div>
        <div id="framesList" class="frames-list" aria-label="Frame list"></div>
      </aside>
    </section>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
