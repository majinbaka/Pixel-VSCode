import * as path from 'path';
import * as vscode from 'vscode';
import { PNG } from 'pngjs';
import { createPixelMonsterCharacter, syncPixelMonsterCharacter } from './characterAssets';
import { deleteCollisionPolygon, readCollisionPolygon, writeCollisionPolygon } from './collisionShape';
import { LayerStateFile, readLayerState, writeLayerState } from './layerState';
import { createGodotMap, MapEditorProvider } from './mapEditor';

const VIEW_TYPE = 'pixelVscode.pixelEditor';
const ANIMATION_VIEW_TYPE = 'pixelVscode.animationPreview';

export function activate(context: vscode.ExtensionContext) {
  const provider = new PixelEditorProvider(context);
  const mapProvider = new MapEditorProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      supportsMultipleEditorsPerDocument: false,
      webviewOptions: {
        retainContextWhenHidden: true
      }
    }),
    vscode.window.registerCustomEditorProvider(MapEditorProvider.viewType, mapProvider, {
      supportsMultipleEditorsPerDocument: false,
      webviewOptions: {
        retainContextWhenHidden: true
      }
    }),
    vscode.commands.registerCommand('pixelVscode.newFile', () => createNewPixelFile()),
    vscode.commands.registerCommand('pixelVscode.newGodotMap', () => createGodotMap()),
    vscode.commands.registerCommand('pixelVscode.newPixelMonsterCharacter', () => createPixelMonsterCharacter()),
    vscode.commands.registerCommand('pixelVscode.openEditor', (resource?: vscode.Uri) => openWithPixelEditor(resource)),
    vscode.commands.registerCommand('pixelVscode.previewAnimation', (resource?: vscode.Uri, selectedResources?: vscode.Uri[]) =>
      openAnimationPreview(context, resource, selectedResources)
    ),
    vscode.commands.registerCommand('pixelVscode.syncPixelMonsterCharacter', (resource?: vscode.Uri) =>
      syncPixelMonsterCharacter(resource)
    )
  );
}

export function deactivate() {}

async function createNewPixelFile() {
  const sizeInput = await vscode.window.showInputBox({
    title: 'New Pixel Image',
    prompt: 'Enter canvas size as WIDTHxHEIGHT.',
    value: '32x32',
    validateInput(value) {
      return parseCanvasSize(value) ? undefined : 'Use a size from 1x1 to 1024x1024, for example 32x32.';
    }
  });

  if (!sizeInput) {
    return;
  }

  const size = parseCanvasSize(sizeInput);
  if (!size) {
    return;
  }

  const defaultFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const defaultUri = defaultFolder ? vscode.Uri.joinPath(defaultFolder, 'pixel.png') : undefined;
  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: {
      'PNG image': ['png']
    },
    saveLabel: 'Create Pixel Image'
  });

  if (!target) {
    return;
  }

  const targetUri = normalizePngUri(target);
  if (!targetUri) {
    vscode.window.showWarningMessage('Pixel Editor currently creates PNG files only. Use the .png file extension.');
    return;
  }

  const png = createTransparentPng(size.width, size.height);
  await vscode.workspace.fs.writeFile(targetUri, png);
  await vscode.commands.executeCommand('vscode.openWith', targetUri, VIEW_TYPE);
}

async function openWithPixelEditor(resource?: vscode.Uri) {
  const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
  if (!uri) {
    vscode.window.showWarningMessage('Select a PNG file to open with the Pixel Editor.');
    return;
  }

  if (path.extname(uri.path).toLowerCase() !== '.png') {
    vscode.window.showWarningMessage('Pixel Editor currently saves PNG files only.');
    return;
  }

  await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE);
}

async function openAnimationPreview(
  context: vscode.ExtensionContext,
  resource?: vscode.Uri,
  selectedResources?: vscode.Uri[]
) {
  const selectedPngs = getPngUris(resource, selectedResources);
  const frameUris = selectedPngs.length >= 2 ? selectedPngs : await pickAnimationFrames();
  if (!frameUris || frameUris.length < 2) {
    vscode.window.showWarningMessage('Select at least two PNG files to preview an animation.');
    return;
  }

  const durationInput = await vscode.window.showInputBox({
    title: 'Pixel Animation Preview',
    prompt: `Frame duration in milliseconds. Enter one value for all ${frameUris.length} frames, or ${frameUris.length} comma-separated values.`,
    value: '120',
    validateInput(value) {
      return parseFrameDurations(value, frameUris.length)
        ? undefined
        : `Use one duration or exactly ${frameUris.length} comma-separated durations, from 20 to 10000 ms.`;
    }
  });

  if (!durationInput) {
    return;
  }

  const durations = parseFrameDurations(durationInput, frameUris.length);
  if (!durations) {
    return;
  }

  const frames = await readAnimationFrames(frameUris, durations);
  const panel = vscode.window.createWebviewPanel(
    ANIMATION_VIEW_TYPE,
    'Pixel Animation Preview',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'media')
      ]
    }
  );

  panel.webview.html = getAnimationHtml(context, panel.webview);
  panel.webview.onDidReceiveMessage(async (message: AnimationPreviewMessage) => {
    switch (message.type) {
      case 'ready':
        panel.webview.postMessage({
          type: 'init',
          frames
        });
        return;

      case 'pickFrames':
        await replaceAnimationFrames(panel);
        return;
    }
  });
}

async function replaceAnimationFrames(panel: vscode.WebviewPanel) {
  const frameUris = await pickAnimationFrames();
  if (!frameUris || frameUris.length < 2) {
    return;
  }

  const durationInput = await vscode.window.showInputBox({
    title: 'Pixel Animation Preview',
    prompt: `Frame duration in milliseconds. Enter one value for all ${frameUris.length} frames, or ${frameUris.length} comma-separated values.`,
    value: '120',
    validateInput(value) {
      return parseFrameDurations(value, frameUris.length)
        ? undefined
        : `Use one duration or exactly ${frameUris.length} comma-separated durations, from 20 to 10000 ms.`;
    }
  });

  if (!durationInput) {
    return;
  }

  const durations = parseFrameDurations(durationInput, frameUris.length);
  if (!durations) {
    vscode.window.showWarningMessage(`Use one duration or exactly ${frameUris.length} comma-separated durations.`);
    return;
  }

  panel.webview.postMessage({
    type: 'init',
    frames: await readAnimationFrames(frameUris, durations)
  });
}

async function pickAnimationFrames(): Promise<vscode.Uri[] | undefined> {
  const defaultFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const uris = await vscode.window.showOpenDialog({
    title: 'Select PNG animation frames',
    defaultUri: defaultFolder,
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: true,
    filters: {
      'PNG images': ['png']
    },
    openLabel: 'Preview Animation'
  });

  if (!uris?.length) {
    return undefined;
  }

  return dedupeAndSortPngUris(uris);
}

function getPngUris(resource?: vscode.Uri, selectedResources?: vscode.Uri[]): vscode.Uri[] {
  return dedupeAndSortPngUris([
    ...(resource ? [resource] : []),
    ...(selectedResources ?? [])
  ]);
}

function dedupeAndSortPngUris(uris: vscode.Uri[]): vscode.Uri[] {
  const byPath = new Map<string, vscode.Uri>();
  for (const uri of uris) {
    if (path.extname(uri.path).toLowerCase() === '.png') {
      byPath.set(uri.toString(), uri);
    }
  }

  return Array.from(byPath.values()).sort((first, second) => first.fsPath.localeCompare(second.fsPath, undefined, {
    numeric: true,
    sensitivity: 'base'
  }));
}

function parseFrameDurations(value: string, frameCount: number): number[] | undefined {
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }

  const durations = parts.map((part) => Number(part));
  if (durations.some((duration) =>
    !Number.isInteger(duration) || duration < 20 || duration > 10000
  )) {
    return undefined;
  }

  if (durations.length === 1) {
    return Array.from({ length: frameCount }, () => durations[0]);
  }

  return durations.length === frameCount ? durations : undefined;
}

async function readAnimationFrames(uris: vscode.Uri[], durations: number[]): Promise<AnimationFrameData[]> {
  return Promise.all(uris.map(async (uri, index) => {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return {
      name: path.basename(uri.fsPath),
      path: uri.fsPath,
      duration: durations[index],
      dataUri: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`
    };
  }));
}

function parseCanvasSize(value: string): { width: number; height: number } | undefined {
  const match = value.trim().match(/^(\d{1,4})\s*x\s*(\d{1,4})$/i);
  if (!match) {
    return undefined;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 1024 || height > 1024) {
    return undefined;
  }

  return { width, height };
}

function createTransparentPng(width: number, height: number): Uint8Array {
  const image = new PNG({ width, height });
  return PNG.sync.write(image);
}

function normalizePngUri(uri: vscode.Uri): vscode.Uri | undefined {
  const extension = path.extname(uri.path).toLowerCase();
  if (extension === '.png') {
    return uri;
  }

  if (!extension) {
    return uri.with({ path: `${uri.path}.png` });
  }

  return undefined;
}

class PixelDocument implements vscode.CustomDocument {
  private readonly onDidChangeContentEmitter = new vscode.EventEmitter<Uint8Array>();
  private disposed = false;
  private bytes: Uint8Array;

  public readonly onDidChangeContent = this.onDidChangeContentEmitter.event;

  public constructor(public readonly uri: vscode.Uri, initialBytes: Uint8Array) {
    this.bytes = initialBytes;
  }

  public get data(): Uint8Array {
    return this.bytes;
  }

  public update(bytes: Uint8Array, notifyWebviews = true) {
    if (this.disposed) {
      return;
    }

    this.bytes = bytes;
    if (notifyWebviews) {
      this.onDidChangeContentEmitter.fire(bytes);
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.onDidChangeContentEmitter.dispose();
  }
}

class PixelEditorProvider implements vscode.CustomEditorProvider<PixelDocument> {
  private readonly onDidChangeCustomDocumentEmitter = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<PixelDocument>>();
  public readonly onDidChangeCustomDocument = this.onDidChangeCustomDocumentEmitter.event;

  public constructor(private readonly context: vscode.ExtensionContext) {}

  public async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<PixelDocument> {
    const source = openContext.backupId ? vscode.Uri.parse(openContext.backupId) : uri;
    const bytes = await vscode.workspace.fs.readFile(source);
    return new PixelDocument(uri, bytes);
  }

  public async resolveCustomEditor(
    document: PixelDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media')
      ]
    };
    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

    const postDocument = async () => {
      const assetProfile = getPixelAssetProfile(document.uri);
      const collisionPoints = await readCollisionPolygon(document.uri);
      const layerState = await readLayerState(document.uri);
      webviewPanel.webview.postMessage({
        type: 'init',
        filename: path.basename(document.uri.path),
        dataUri: `data:image/png;base64,${Buffer.from(document.data).toString('base64')}`,
        assetProfile,
        collisionPoints,
        layerState
      });
    };

    const changeSubscription = document.onDidChangeContent(() => void postDocument());
    webviewPanel.onDidDispose(() => changeSubscription.dispose());

    webviewPanel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      switch (message.type) {
        case 'ready':
          await postDocument();
          return;

        case 'edit':
          if (!message.dataUri) {
            return;
          }
          await this.applyEdit(document, message.dataUri, message.label ?? 'Edit pixels', message.layerState);
          return;

        case 'save':
          await vscode.commands.executeCommand('workbench.action.files.save');
          return;

        case 'syncCharacter':
          await vscode.commands.executeCommand('workbench.action.files.save');
          await syncPixelMonsterCharacter(document.uri);
          return;

        case 'saveCollision':
          await this.saveCollision(document.uri, message.points ?? []);
          return;
      }
    });
  }

  public async saveCustomDocument(document: PixelDocument, _cancellation: vscode.CancellationToken): Promise<void> {
    await vscode.workspace.fs.writeFile(document.uri, document.data);
  }

  public async saveCustomDocumentAs(
    document: PixelDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    await vscode.workspace.fs.writeFile(destination, document.data);
  }

  public async revertCustomDocument(document: PixelDocument, _cancellation: vscode.CancellationToken): Promise<void> {
    const bytes = await vscode.workspace.fs.readFile(document.uri);
    document.update(bytes);
  }

  public async backupCustomDocument(
    document: PixelDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken
  ): Promise<vscode.CustomDocumentBackup> {
    await vscode.workspace.fs.writeFile(context.destination, document.data);

    return {
      id: context.destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(context.destination);
        } catch {
          // Backup cleanup should not block editor recovery.
        }
      }
    };
  }

  private async applyEdit(document: PixelDocument, dataUri: string, label: string, layerState?: LayerStateFile) {
    const nextBytes = decodePngDataUri(dataUri);
    if (!nextBytes) {
      vscode.window.showErrorMessage('Pixel Editor could not read the edited PNG data.');
      return;
    }

    if (layerState) {
      await writeLayerState(document.uri, layerState);
    }

    const previousBytes = document.data;
    document.update(nextBytes, false);

    this.onDidChangeCustomDocumentEmitter.fire({
      document,
      label,
      undo: async () => document.update(previousBytes),
      redo: async () => document.update(nextBytes)
    });
  }

  private async saveCollision(pngUri: vscode.Uri, points: number[]): Promise<void> {
    try {
      if (points.length === 0) {
        await deleteCollisionPolygon(pngUri);
        vscode.window.showInformationMessage('Hitbox cleared.');
        return;
      }

      if (points.length < 6 || points.length % 2 !== 0) {
        vscode.window.showWarningMessage('A hitbox needs at least 3 points.');
        return;
      }

      const resourceUri = await writeCollisionPolygon(pngUri, points);
      vscode.window.showInformationMessage(`Hitbox saved: ${path.basename(resourceUri.fsPath)}`);
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.js'));

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
        <input id="widthInput" class="number-input" type="number" min="1" max="1024" value="32" title="Canvas width">
        <span class="separator">x</span>
        <input id="heightInput" class="number-input" type="number" min="1" max="1024" value="32" title="Canvas height">
        <button id="resizeButton" class="text-button" type="button">Resize</button>
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
        <button id="syncCharacterButton" class="text-button" type="button" hidden>Sync Pack</button>
        <button id="saveButton" class="text-button primary" type="button">Save</button>
      </section>
    </header>

    <section class="editor-shell" aria-label="Pixel editor workspace">
      <section id="workspace" class="workspace" aria-label="Pixel canvas workspace">
        <div id="canvasFrame" class="canvas-frame grid">
          <canvas id="pixelCanvas" class="pixel-canvas" aria-label="Pixel canvas"></canvas>
          <svg id="hitboxOverlay" class="hitbox-overlay" aria-hidden="true"></svg>
          <svg id="rigOverlay" class="hitbox-overlay" aria-hidden="true"></svg>
          <div id="cursorOverlay" class="cursor-overlay" aria-hidden="true" hidden></div>
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
              <button id="duplicateLayerButton" class="icon-button" type="button" title="Duplicate layer" aria-label="Duplicate layer">⧉</button>
              <button id="deleteLayerButton" class="icon-button" type="button" title="Delete layer" aria-label="Delete layer">🗑️</button>
            </div>
          </div>
          <div class="layer-actions">
            <button id="moveLayerUpButton" class="icon-button" type="button" title="Move layer up" aria-label="Move layer up">↑</button>
            <button id="moveLayerDownButton" class="icon-button" type="button" title="Move layer down" aria-label="Move layer down">↓</button>
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
}

function getAnimationHtml(context: vscode.ExtensionContext, webview: vscode.Webview): string {
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

type AnimationFrameData = {
  name: string;
  path: string;
  duration: number;
  dataUri: string;
};

type AnimationPreviewMessage =
  | { type: 'ready' }
  | { type: 'pickFrames' };

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'edit'; dataUri?: string; label?: string; layerState?: LayerStateFile }
  | { type: 'save' }
  | { type: 'syncCharacter' }
  | { type: 'saveCollision'; points?: number[] };

type PixelAssetProfile = {
  kind: 'lpc-action';
  entityType: 'character' | 'monster';
  entityId: string;
  action: string;
  guideSize: number;
};

function getPixelAssetProfile(uri: vscode.Uri): PixelAssetProfile | undefined {
  const normalized = uri.fsPath.replaceAll('\\', '/');
  const match = normalized.match(/\/lpc_(characters|monsters)_full\/([^/]+)\/([^/]+)\.png$/);
  if (!match) {
    return undefined;
  }

  return {
    kind: 'lpc-action',
    entityType: match[1] === 'characters' ? 'character' : 'monster',
    entityId: match[2],
    action: match[3],
    guideSize: 64
  };
}

function decodePngDataUri(dataUri: string): Uint8Array | undefined {
  const match = dataUri.match(/^data:image\/png;base64,(.+)$/);
  if (!match) {
    return undefined;
  }

  return new Uint8Array(Buffer.from(match[1], 'base64'));
}

function getNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 32; i += 1) {
    value += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return value;
}
