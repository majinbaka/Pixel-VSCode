import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { PNG } from 'pngjs';
import {
  findGodotProjectRoot,
  pascalCase,
  resourcePathToAbsolute,
  runGodotMapExporter,
  sanitizeResourceId,
  toResourcePath
} from './godotProject';

type MapCell = [number, number, number, number, number, number?];

type MapLayer = {
  name: string;
  zIndex: number;
  cells: MapCell[];
};

type PixelMapData = {
  format: 'pixel-vscode-map';
  version: 1;
  name: string;
  tileSet: string;
  output: string;
  width: number;
  height: number;
  tileSize: number;
  layers: MapLayer[];
};

type TilePaletteSource = {
  sourceId: number;
  name: string;
  dataUri: string;
  regionWidth: number;
  regionHeight: number;
  columns: number;
  rows: number;
};

export async function createGodotMap(): Promise<void> {
  const projectRoot = findGodotProjectRoot();
  if (!projectRoot) {
    vscode.window.showErrorMessage('Open a Godot project folder before creating a map.');
    return;
  }

  const mapIdInput = await vscode.window.showInputBox({
    title: 'New Pixel Monster Map',
    prompt: 'Map or chunk id. The exported scene uses this name.',
    value: 'open_world_chunk_0_0',
    validateInput(value) {
      return sanitizeResourceId(value) ? undefined : 'Use lowercase letters, numbers, and underscores; start with a letter.';
    }
  });
  const mapId = mapIdInput ? sanitizeResourceId(mapIdInput) : undefined;
  if (!mapId) {
    return;
  }

  const sizeInput = await vscode.window.showInputBox({
    title: 'Map Chunk Size',
    prompt: 'Width and height in map cells. 32x32 is recommended for streaming chunks.',
    value: '32x32',
    validateInput(value) {
      return parseMapSize(value) ? undefined : 'Use WIDTHxHEIGHT from 1x1 to 128x128.';
    }
  });
  const size = sizeInput ? parseMapSize(sizeInput) : undefined;
  if (!size) {
    return;
  }

  const tileSet = await pickTileSet(projectRoot);
  if (!tileSet) {
    return;
  }
  const parsedTileSet = await parseTileSet(projectRoot, tileSet);

  const sourceDirectory = path.join(projectRoot, 'assets', 'maps');
  const sourcePath = path.join(sourceDirectory, `${mapId}.pixelmap.json`);
  if (fs.existsSync(sourcePath)) {
    vscode.window.showErrorMessage(`Map source already exists: ${sourcePath}`);
    return;
  }

  const data: PixelMapData = {
    format: 'pixel-vscode-map',
    version: 1,
    name: pascalCase(mapId),
    tileSet,
    output: `res://scenes/world/maps/${mapId}.tscn`,
    width: size.width,
    height: size.height,
    tileSize: parsedTileSet.tileSize,
    layers: [
      { name: 'Ground', zIndex: -20, cells: [] },
      { name: 'Details', zIndex: -19, cells: [] }
    ]
  };

  await fs.promises.mkdir(sourceDirectory, { recursive: true });
  await fs.promises.writeFile(sourcePath, serializeMap(data), 'utf8');
  await vscode.commands.executeCommand(
    'vscode.openWith',
    vscode.Uri.file(sourcePath),
    MapEditorProvider.viewType
  );
}

class MapDocument implements vscode.CustomDocument {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private disposed = false;
  private bytes: Uint8Array;

  public readonly onDidChangeContent = this.changeEmitter.event;

  public constructor(public readonly uri: vscode.Uri, bytes: Uint8Array) {
    this.bytes = bytes;
  }

  public get data(): Uint8Array {
    return this.bytes;
  }

  public update(bytes: Uint8Array, notify = true): void {
    if (this.disposed) {
      return;
    }
    this.bytes = bytes;
    if (notify) {
      this.changeEmitter.fire();
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.changeEmitter.dispose();
  }
}

export class MapEditorProvider implements vscode.CustomEditorProvider<MapDocument> {
  public static readonly viewType = 'pixelVscode.mapEditor';

  private readonly editEmitter = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<MapDocument>>();
  public readonly onDidChangeCustomDocument = this.editEmitter.event;

  public constructor(private readonly context: vscode.ExtensionContext) {}

  public async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext
  ): Promise<MapDocument> {
    const source = openContext.backupId ? vscode.Uri.parse(openContext.backupId) : uri;
    return new MapDocument(uri, await vscode.workspace.fs.readFile(source));
  }

  public async resolveCustomEditor(
    document: MapDocument,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
    };
    panel.webview.html = this.getHtml(panel.webview);

    const postDocument = async () => {
      try {
        const map = parseMap(document.data);
        const projectRoot = findGodotProjectRoot(document.uri);
        if (!projectRoot) {
          throw new Error('Could not locate project.godot.');
        }
        const tileSet = await parseTileSet(projectRoot, map.tileSet);
        await panel.webview.postMessage({
          type: 'init',
          map,
          sources: tileSet.sources
        });
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    };

    const subscription = document.onDidChangeContent(() => void postDocument());
    panel.onDidDispose(() => subscription.dispose());
    panel.webview.onDidReceiveMessage(async (message: MapWebviewMessage) => {
      switch (message.type) {
        case 'ready':
          await postDocument();
          return;

        case 'edit':
          if (message.map) {
            this.applyEdit(document, message.map, message.label ?? 'Edit map');
          }
          return;

        case 'save':
          await vscode.commands.executeCommand('workbench.action.files.save');
          return;

        case 'export':
          await this.exportMap(document);
          return;
      }
    });
  }

  public async saveCustomDocument(document: MapDocument): Promise<void> {
    await vscode.workspace.fs.writeFile(document.uri, document.data);
  }

  public async saveCustomDocumentAs(document: MapDocument, destination: vscode.Uri): Promise<void> {
    await vscode.workspace.fs.writeFile(destination, document.data);
  }

  public async revertCustomDocument(document: MapDocument): Promise<void> {
    document.update(await vscode.workspace.fs.readFile(document.uri));
  }

  public async backupCustomDocument(
    document: MapDocument,
    context: vscode.CustomDocumentBackupContext
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

  private applyEdit(document: MapDocument, map: PixelMapData, label: string): void {
    try {
      validateMap(map);
      const nextBytes = new TextEncoder().encode(serializeMap(map));
      const previousBytes = document.data;
      document.update(nextBytes, false);
      this.editEmitter.fire({
        document,
        label,
        undo: async () => document.update(previousBytes),
        redo: async () => document.update(nextBytes)
      });
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  private async exportMap(document: MapDocument): Promise<void> {
    try {
      const map = parseMap(document.data);
      const projectRoot = findGodotProjectRoot(document.uri);
      if (!projectRoot) {
        throw new Error('Could not locate project.godot.');
      }
      await vscode.commands.executeCommand('workbench.action.files.save');
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Exporting ${map.output}`,
        cancellable: false
      }, async () => {
        await runGodotMapExporter(this.context, projectRoot, document.uri.fsPath, map.output);
      });
      vscode.window.showInformationMessage(`Map exported as native Godot scene: ${map.output}`);
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = nonceValue();
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'map-editor.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'map-editor.js'));
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
}

async function pickTileSet(projectRoot: string): Promise<string | undefined> {
  const files = await vscode.workspace.findFiles('assets/tiles/**/*.tres', '**/.godot/**');
  const candidates = files
    .filter((uri) => uri.scheme === 'file' && uri.fsPath.startsWith(projectRoot))
    .map((uri) => ({
      label: path.relative(projectRoot, uri.fsPath).replaceAll(path.sep, '/'),
      resourcePath: toResourcePath(projectRoot, uri.fsPath)
    }));

  if (candidates.length === 0) {
    vscode.window.showErrorMessage('No TileSet .tres files were found under assets/tiles.');
    return undefined;
  }

  const selected = await vscode.window.showQuickPick(candidates, {
    title: 'Map TileSet',
    placeHolder: 'Choose the TileSet resource used by the exported TileMapLayer nodes.'
  });
  return selected?.resourcePath;
}

async function parseTileSet(
  projectRoot: string,
  resourcePath: string
): Promise<{ tileSize: number; sources: TilePaletteSource[] }> {
  const absolutePath = resourcePathToAbsolute(projectRoot, resourcePath);
  const text = await fs.promises.readFile(absolutePath, 'utf8');
  const tileSizeMatch = text.match(/^tile_size\s*=\s*Vector2i\((\d+),\s*(\d+)\)/m);
  const tileSize = tileSizeMatch ? Number(tileSizeMatch[1]) : 32;

  const extResources = new Map<string, string>();
  for (const match of text.matchAll(/^\[ext_resource[^\]]*path="([^"]+)"[^\]]*id="([^"]+)"\]$/gm)) {
    extResources.set(match[2], match[1]);
  }

  const subResources = new Map<string, { textureId: string; width: number; height: number }>();
  for (const match of text.matchAll(/\[sub_resource type="TileSetAtlasSource" id="([^"]+)"\]([\s\S]*?)(?=\n\[|$)/g)) {
    const texture = match[2].match(/texture\s*=\s*ExtResource\("([^"]+)"\)/);
    const region = match[2].match(/texture_region_size\s*=\s*Vector2i\((\d+),\s*(\d+)\)/);
    if (texture && region) {
      subResources.set(match[1], {
        textureId: texture[1],
        width: Number(region[1]),
        height: Number(region[2])
      });
    }
  }

  const sources: TilePaletteSource[] = [];
  for (const match of text.matchAll(/^sources\/(\d+)\s*=\s*SubResource\("([^"]+)"\)$/gm)) {
    const sourceId = Number(match[1]);
    const source = subResources.get(match[2]);
    const texturePath = source ? extResources.get(source.textureId) : undefined;
    if (!source || !texturePath) {
      continue;
    }
    const image = await readImage(projectRoot, texturePath);
    sources.push({
      sourceId,
      name: path.basename(texturePath),
      dataUri: image.dataUri,
      regionWidth: source.width,
      regionHeight: source.height,
      columns: Math.floor(image.width / source.width),
      rows: Math.floor(image.height / source.height)
    });
  }

  if (sources.length === 0) {
    throw new Error(`TileSet has no readable atlas sources: ${resourcePath}`);
  }
  return { tileSize, sources };
}

async function readImage(
  projectRoot: string,
  resourcePath: string
): Promise<{ dataUri: string; width: number; height: number }> {
  const absolutePath = resourcePathToAbsolute(projectRoot, resourcePath);
  const bytes = await fs.promises.readFile(absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();
  if (extension === '.png') {
    const png = PNG.sync.read(bytes);
    return {
      dataUri: `data:image/png;base64,${bytes.toString('base64')}`,
      width: png.width,
      height: png.height
    };
  }
  if (extension === '.svg') {
    const text = bytes.toString('utf8');
    const width = Number(text.match(/<svg[^>]*\bwidth="(\d+)"/)?.[1]);
    const height = Number(text.match(/<svg[^>]*\bheight="(\d+)"/)?.[1]);
    if (!width || !height) {
      throw new Error(`SVG must declare numeric width and height: ${resourcePath}`);
    }
    return {
      dataUri: `data:image/svg+xml;base64,${bytes.toString('base64')}`,
      width,
      height
    };
  }
  throw new Error(`Unsupported TileSet texture: ${resourcePath}`);
}

function parseMap(bytes: Uint8Array): PixelMapData {
  const value = JSON.parse(new TextDecoder().decode(bytes)) as PixelMapData;
  validateMap(value);
  return value;
}

function validateMap(map: PixelMapData): void {
  if (map.format !== 'pixel-vscode-map' || map.version !== 1) {
    throw new Error('Unsupported pixel map format.');
  }
  if (!map.name || !map.tileSet?.startsWith('res://') || !map.output?.startsWith('res://')) {
    throw new Error('Map name, TileSet, and output path are required.');
  }
  if (!Number.isInteger(map.width) || !Number.isInteger(map.height) || map.width < 1 || map.height < 1) {
    throw new Error('Map width and height must be positive integers.');
  }
  if (!Array.isArray(map.layers) || map.layers.length === 0) {
    throw new Error('Map must contain at least one layer.');
  }
  for (const layer of map.layers) {
    if (!layer.name || !Array.isArray(layer.cells)) {
      throw new Error('Every map layer requires a name and cells array.');
    }
  }
}

function serializeMap(map: PixelMapData): string {
  return `${JSON.stringify(map, null, 2)}\n`;
}

function parseMapSize(value: string): { width: number; height: number } | undefined {
  const match = value.trim().match(/^(\d{1,3})\s*x\s*(\d{1,3})$/i);
  if (!match) {
    return undefined;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width >= 1 && width <= 128 && height >= 1 && height <= 128
    ? { width, height }
    : undefined;
}

function nonceValue(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

type MapWebviewMessage =
  | { type: 'ready' }
  | { type: 'edit'; map?: PixelMapData; label?: string }
  | { type: 'save' }
  | { type: 'export' };
