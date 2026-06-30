import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  findGodotProjectRoot,
  pascalCase,
  runGodotHudExporter,
  sanitizeResourceId
} from './godotProject';

type HudElementKind = 'panel' | 'label' | 'bar' | 'button' | 'slot' | 'minimap';

type HudRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type HudElement = {
  id: string;
  kind: HudElementKind;
  name: string;
  rect: HudRect;
  text: string;
  fill: string;
  stroke: string;
  textColor: string;
  value?: number;
};

type PixelHudData = {
  format: 'pixel-vscode-hud';
  version: 1;
  name: string;
  output: string;
  viewport: {
    width: number;
    height: number;
  };
  elements: HudElement[];
};

const HUD_KINDS = new Set<HudElementKind>(['panel', 'label', 'bar', 'button', 'slot', 'minimap']);

export async function createPixelMonsterHud(): Promise<void> {
  const projectRoot = findGodotProjectRoot();
  if (!projectRoot) {
    vscode.window.showErrorMessage('Open a Godot project folder before creating a HUD.');
    return;
  }

  const hudIdInput = await vscode.window.showInputBox({
    title: 'New Pixel Monster HUD',
    prompt: 'HUD source id. The exported scene uses this name.',
    value: 'player_hud_custom',
    validateInput(value) {
      return sanitizeResourceId(value) ? undefined : 'Use lowercase letters, numbers, and underscores; start with a letter.';
    }
  });
  const hudId = hudIdInput ? sanitizeResourceId(hudIdInput) : undefined;
  if (!hudId) {
    return;
  }

  const sizeInput = await vscode.window.showInputBox({
    title: 'HUD Canvas Size',
    prompt: 'Width and height in pixels. Pixel Monster currently uses 640x360.',
    value: '640x360',
    validateInput(value) {
      return parseViewportSize(value) ? undefined : 'Use WIDTHxHEIGHT from 64x64 to 4096x4096.';
    }
  });
  const viewport = sizeInput ? parseViewportSize(sizeInput) : undefined;
  if (!viewport) {
    return;
  }

  const sourceDirectory = path.join(projectRoot, 'assets', 'ui', 'hud');
  const sourcePath = path.join(sourceDirectory, `${hudId}.pixelhud.json`);
  if (fs.existsSync(sourcePath)) {
    vscode.window.showErrorMessage(`HUD source already exists: ${sourcePath}`);
    return;
  }

  const data: PixelHudData = {
    format: 'pixel-vscode-hud',
    version: 1,
    name: pascalCase(hudId),
    output: `res://scenes/ui/${hudId}.tscn`,
    viewport,
    elements: defaultHudElements(viewport.width, viewport.height)
  };

  await fs.promises.mkdir(sourceDirectory, { recursive: true });
  await fs.promises.writeFile(sourcePath, serializeHud(data), 'utf8');
  await vscode.commands.executeCommand(
    'vscode.openWith',
    vscode.Uri.file(sourcePath),
    HudEditorProvider.viewType
  );
}

class HudDocument implements vscode.CustomDocument {
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

export class HudEditorProvider implements vscode.CustomEditorProvider<HudDocument> {
  public static readonly viewType = 'pixelVscode.hudEditor';

  private readonly editEmitter = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<HudDocument>>();
  public readonly onDidChangeCustomDocument = this.editEmitter.event;

  public constructor(private readonly context: vscode.ExtensionContext) {}

  public async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext
  ): Promise<HudDocument> {
    const source = openContext.backupId ? vscode.Uri.parse(openContext.backupId) : uri;
    return new HudDocument(uri, await vscode.workspace.fs.readFile(source));
  }

  public async resolveCustomEditor(document: HudDocument, panel: vscode.WebviewPanel): Promise<void> {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
    };
    panel.webview.html = this.getHtml(panel.webview);

    const postDocument = async () => {
      try {
        panel.webview.postMessage({
          type: 'init',
          hud: parseHud(document.data)
        });
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    };

    const subscription = document.onDidChangeContent(() => void postDocument());
    panel.onDidDispose(() => subscription.dispose());
    panel.webview.onDidReceiveMessage(async (message: HudWebviewMessage) => {
      switch (message.type) {
        case 'ready':
          await postDocument();
          return;

        case 'edit':
          if (message.hud) {
            this.applyEdit(document, message.hud, message.label ?? 'Edit HUD');
          }
          return;

        case 'save':
          await vscode.commands.executeCommand('workbench.action.files.save');
          return;

        case 'export':
          await this.exportHud(document);
          return;
      }
    });
  }

  public async saveCustomDocument(document: HudDocument): Promise<void> {
    await vscode.workspace.fs.writeFile(document.uri, document.data);
  }

  public async saveCustomDocumentAs(document: HudDocument, destination: vscode.Uri): Promise<void> {
    await vscode.workspace.fs.writeFile(destination, document.data);
  }

  public async revertCustomDocument(document: HudDocument): Promise<void> {
    document.update(await vscode.workspace.fs.readFile(document.uri));
  }

  public async backupCustomDocument(
    document: HudDocument,
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

  private applyEdit(document: HudDocument, hud: PixelHudData, label: string): void {
    try {
      validateHud(hud);
      const nextBytes = new TextEncoder().encode(serializeHud(hud));
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

  private async exportHud(document: HudDocument): Promise<void> {
    try {
      const hud = parseHud(document.data);
      const projectRoot = findGodotProjectRoot(document.uri);
      if (!projectRoot) {
        throw new Error('Could not locate project.godot.');
      }
      await vscode.commands.executeCommand('workbench.action.files.save');
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Exporting ${hud.output}`,
        cancellable: false
      }, async () => {
        await runGodotHudExporter(this.context, projectRoot, document.uri.fsPath, hud.output);
      });
      vscode.window.showInformationMessage(`HUD exported as native Godot scene: ${hud.output}`);
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = nonceValue();
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'hud-editor.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'hud-editor.js'));
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>Pixel Monster HUD Editor</title>
</head>
<body>
  <main class="hud-app">
    <header class="toolbar">
      <section class="tool-group">
        <button class="button active" data-tool="select" type="button">Select</button>
      </section>
      <section class="tool-group">
        <label for="kindSelect">Add</label>
        <select id="kindSelect">
          <option value="panel">Panel</option>
          <option value="label">Label</option>
          <option value="bar">Bar</option>
          <option value="button">Button</option>
          <option value="slot">Slot</option>
          <option value="minimap">Minimap</option>
        </select>
        <button id="addElementButton" class="button" type="button">Add</button>
        <button id="duplicateButton" class="button" type="button">Duplicate</button>
        <button id="deleteButton" class="button" type="button">Delete</button>
      </section>
      <section class="tool-group">
        <label for="zoomInput">Zoom</label>
        <input id="zoomInput" type="range" min="50" max="300" step="10" value="100">
        <output id="zoomLabel">100%</output>
        <label class="check"><input id="gridInput" type="checkbox" checked> Grid</label>
      </section>
      <section class="tool-group">
        <span id="hudStatus" class="status">HUD</span>
        <span id="pointerStatus" class="status">0, 0</span>
      </section>
      <section class="tool-group push">
        <button id="saveButton" class="button" type="button">Save Source</button>
        <button id="exportButton" class="button primary" type="button">Export .tscn</button>
      </section>
    </header>
    <section class="content">
      <section class="workspace">
        <div id="hudFrame" class="hud-frame grid">
          <canvas id="hudCanvas"></canvas>
        </div>
      </section>
      <aside class="sidebar">
        <section class="panel inspector-panel">
          <div class="panel-header"><strong>Inspector</strong></div>
          <label>Name<input id="nameInput" type="text"></label>
          <label>Text<input id="textInput" type="text"></label>
          <div class="rect-grid">
            <label>X<input id="xInput" type="number" min="0"></label>
            <label>Y<input id="yInput" type="number" min="0"></label>
            <label>W<input id="widthInput" type="number" min="1"></label>
            <label>H<input id="heightInput" type="number" min="1"></label>
          </div>
          <div class="color-grid">
            <label>Fill<input id="fillInput" type="color"></label>
            <label>Stroke<input id="strokeInput" type="color"></label>
            <label>Text<input id="textColorInput" type="color"></label>
          </div>
        </section>
        <section class="panel layers-panel">
          <div class="panel-header"><strong>Elements</strong></div>
          <div id="elementsList" class="elements-list"></div>
        </section>
      </aside>
    </section>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function defaultHudElements(width: number, height: number): HudElement[] {
  return [
    element('status_panel', 'panel', 'Status Panel', { x: 10, y: 10, width: 216, height: 76 }, '', '#101916', '#7a6d47', '#e8f1de'),
    element('score_label', 'label', 'Score Label', { x: 64, y: 18, width: 120, height: 14 }, 'Quái: 0', '#000000', '#000000', '#ffe073'),
    element('hp_bar', 'bar', 'HP Bar', { x: 64, y: 40, width: 136, height: 10 }, 'HP', '#e13d38', '#4f6157', '#ffffff', 72),
    element('mana_bar', 'bar', 'Mana Bar', { x: 64, y: 56, width: 136, height: 10 }, 'MP', '#458ced', '#4f6157', '#ffffff', 58),
    element('minimap', 'minimap', 'Mini Map', { x: width - 140, y: 10, width: 128, height: 96 }, '', '#0d1716', '#5f7d75', '#c9fff0'),
    element('quick_item', 'slot', 'Quick Item', { x: 12, y: height - 54, width: 42, height: 42 }, 'ITEM', '#263831', '#73a890', '#f5fff8'),
    element('skill_bar', 'panel', 'Skill Panel', { x: 64, y: height - 54, width: 362, height: 42 }, '', '#101916', '#7a6d47', '#e8f1de'),
    element('skill_slot_1', 'slot', 'Skill Slot 1', { x: 74, y: height - 45, width: 24, height: 24 }, '1', '#263831', '#73a890', '#f5fff8'),
    element('skill_slot_2', 'slot', 'Skill Slot 2', { x: 104, y: height - 45, width: 24, height: 24 }, '2', '#263831', '#73a890', '#f5fff8'),
    element('inventory_button', 'button', 'Inventory Button', { x: width - 116, y: height - 45, width: 46, height: 32 }, 'Bag', '#25443b', '#73a890', '#f5fff8'),
    element('settings_button', 'button', 'Settings Button', { x: width - 62, y: height - 45, width: 46, height: 32 }, 'Gear', '#25443b', '#73a890', '#f5fff8')
  ];
}

function element(
  id: string,
  kind: HudElementKind,
  name: string,
  rect: HudRect,
  text: string,
  fill: string,
  stroke: string,
  textColor: string,
  value?: number
): HudElement {
  return { id, kind, name, rect, text, fill, stroke, textColor, value };
}

function parseHud(bytes: Uint8Array): PixelHudData {
  const value = JSON.parse(new TextDecoder().decode(bytes)) as PixelHudData;
  validateHud(value);
  return value;
}

function validateHud(hud: PixelHudData): void {
  if (hud.format !== 'pixel-vscode-hud' || hud.version !== 1) {
    throw new Error('Unsupported pixel HUD format.');
  }
  if (!hud.name || !hud.output?.startsWith('res://')) {
    throw new Error('HUD name and output path are required.');
  }
  if (!Number.isInteger(hud.viewport?.width) || !Number.isInteger(hud.viewport?.height)) {
    throw new Error('HUD viewport width and height must be integers.');
  }
  if (hud.viewport.width < 16 || hud.viewport.height < 16 || hud.viewport.width > 4096 || hud.viewport.height > 4096) {
    throw new Error('HUD viewport must be between 16x16 and 4096x4096.');
  }
  if (!Array.isArray(hud.elements)) {
    throw new Error('HUD elements must be an array.');
  }
  for (const item of hud.elements) {
    if (!item.id || !item.name || !HUD_KINDS.has(item.kind)) {
      throw new Error('Every HUD element requires an id, name, and supported kind.');
    }
    const rect = item.rect;
    if (!rect || !isFiniteNumber(rect.x) || !isFiniteNumber(rect.y) || !isFiniteNumber(rect.width) || !isFiniteNumber(rect.height)) {
      throw new Error(`HUD element '${item.id}' has an invalid rect.`);
    }
    if (rect.width < 1 || rect.height < 1) {
      throw new Error(`HUD element '${item.id}' width and height must be positive.`);
    }
  }
}

function serializeHud(hud: PixelHudData): string {
  return `${JSON.stringify(hud, null, 2)}\n`;
}

function parseViewportSize(value: string): { width: number; height: number } | undefined {
  const match = value.trim().match(/^(\d{2,4})\s*x\s*(\d{2,4})$/i);
  if (!match) {
    return undefined;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width >= 64 && width <= 4096 && height >= 64 && height <= 4096
    ? { width, height }
    : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonceValue(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

type HudWebviewMessage =
  | { type: 'ready' }
  | { type: 'edit'; hud?: PixelHudData; label?: string }
  | { type: 'save' }
  | { type: 'export' };
