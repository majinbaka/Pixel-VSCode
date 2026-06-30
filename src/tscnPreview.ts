import * as path from 'path';
import * as vscode from 'vscode';

type TscnExtResource = {
  id: string;
  resType: string;
  resPath: string;
  uid: string;
};

type TscnSubResource = {
  id: string;
  resType: string;
  props: Record<string, string>;
};

type TscnNode = {
  name: string;
  nodeType: string | null;
  parent: string | null;
  instance: string | null;
  groups: string | null;
  props: Record<string, string>;
};

type TscnConnection = {
  signal: string;
  from: string;
  to: string;
  method: string;
};

type TscnEditable = {
  path: string;
  resType: string;
};

export type TscnScene = {
  format: number;
  uid: string;
  extResources: TscnExtResource[];
  subResources: TscnSubResource[];
  nodes: TscnNode[];
  connections: TscnConnection[];
  editables: TscnEditable[];
};

export type SceneTreeNode = {
  name: string;
  nodeType: string;
  parent: string | null;
  instance: string | null;
  groups: string | null;
  children: SceneTreeNode[];
  props: Record<string, string>;
  connections: TscnConnection[];
};

class TscnDocument implements vscode.CustomDocument {
  public constructor(public readonly uri: vscode.Uri) {}
  public dispose(): void {}
}

export class TscnPreviewProvider implements vscode.CustomReadonlyEditorProvider<TscnDocument> {
  public static readonly viewType = 'pixelVscode.tscnPreview';

  public constructor(private readonly context: vscode.ExtensionContext) {}

  public openCustomDocument(uri: vscode.Uri): TscnDocument {
    return new TscnDocument(uri);
  }

  public async resolveCustomEditor(
    document: TscnDocument,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    const projectRoot = await findGodotProjectRoot(document.uri);

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        ...(projectRoot ? [projectRoot] : [])
      ]
    };
    panel.webview.html = this.getHtml(panel.webview);

    const load = async () => {
      try {
        const bytes = await vscode.workspace.fs.readFile(document.uri);
        const text = new TextDecoder().decode(bytes);
        const scene = parseTscn(text);
        const tree = buildSceneTree(scene.nodes, scene.connections);
        const textureUris = projectRoot
          ? resolveTextureUris(scene.extResources, projectRoot, panel.webview)
          : {};
        panel.webview.postMessage({
          type: 'init',
          filename: path.basename(document.uri.path),
          scene,
          tree,
          textureUris
        });
      } catch (error) {
        panel.webview.postMessage({
          type: 'error',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    };

    panel.webview.onDidReceiveMessage(async (message: { type: string }) => {
      if (message.type === 'ready' || message.type === 'refresh') {
        await load();
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = generateNonce();
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'tscn-preview.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'tscn-preview.js'));

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Scene Preview</title>
</head>
<body>
  <div class="tscn-app">
    <header class="tscn-toolbar">
      <span id="filenameLabel" class="filename">Loading...</span>
      <label class="check-label"><input id="showGridInput" type="checkbox" checked> Grid</label>
      <label class="zoom-label">
        Zoom
        <input id="zoomInput" type="range" min="25" max="400" step="25" value="100">
        <output id="zoomLabel">100%</output>
      </label>
      <button id="refreshButton" class="action-button" type="button">Refresh</button>
    </header>
    <div class="tscn-body">
      <aside class="tree-panel">
        <div class="panel-header">Scene Tree</div>
        <div id="treeContainer" class="tree-container"></div>
      </aside>
      <main class="canvas-panel">
        <div class="canvas-scroll">
          <canvas id="sceneCanvas"></canvas>
          <div id="errorMessage" class="error-message" hidden></div>
        </div>
      </main>
      <aside class="inspector-panel">
        <div class="panel-header">Inspector</div>
        <div id="inspectorContainer" class="inspector-container"></div>
      </aside>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function parseTscn(text: string): TscnScene {
  const scene: TscnScene = {
    format: 3,
    uid: '',
    extResources: [],
    subResources: [],
    nodes: [],
    connections: [],
    editables: []
  };

  for (const { header, propLines } of splitSections(text)) {
    const tag = header.match(/^\[(\w+)/)?.[1] ?? '';
    const props = parseProps(propLines);

    switch (tag) {
      case 'gd_scene':
        scene.format = parseInt(getAttr(header, 'format') ?? '3', 10);
        scene.uid = getAttr(header, 'uid') ?? '';
        break;
      case 'ext_resource':
        scene.extResources.push({
          id: getAttr(header, 'id') ?? '',
          resType: getAttr(header, 'type') ?? '',
          resPath: getAttr(header, 'path') ?? '',
          uid: getAttr(header, 'uid') ?? ''
        });
        break;
      case 'sub_resource':
        scene.subResources.push({
          id: getAttr(header, 'id') ?? '',
          resType: getAttr(header, 'type') ?? '',
          props
        });
        break;
      case 'node':
        scene.nodes.push({
          name: getAttr(header, 'name') ?? '',
          nodeType: getAttr(header, 'type'),
          parent: getAttr(header, 'parent'),
          instance: getAttr(header, 'instance'),
          groups: getAttr(header, 'groups'),
          props
        });
        break;
      case 'connection':
        scene.connections.push({
          signal: getAttr(header, 'signal') ?? '',
          from: getAttr(header, 'from') ?? '',
          to: getAttr(header, 'to') ?? '',
          method: getAttr(header, 'method') ?? ''
        });
        break;
      case 'editable':
        scene.editables.push({
          path: getAttr(header, 'path') ?? '',
          resType: getAttr(header, 'type') ?? ''
        });
        break;
    }
  }

  return scene;
}

function splitSections(text: string): Array<{ header: string; propLines: string[] }> {
  const result: Array<{ header: string; propLines: string[] }> = [];
  let current: { header: string; propLines: string[] } | null = null;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']') && !trimmed.startsWith('[;') && isSectionHeader(trimmed)) {
      if (current) {
        result.push(current);
      }
      current = { header: trimmed, propLines: [] };
    } else if (current && line.length > 0 && !trimmed.startsWith(';')) {
      current.propLines.push(line);
    }
  }

  if (current) {
    result.push(current);
  }

  return result;
}

function isSectionHeader(trimmed: string): boolean {
  return /^\[(gd_scene|gd_resource|ext_resource|sub_resource|node|connection|editable)\b/.test(trimmed);
}

function parseProps(lines: string[]): Record<string, string> {
  const props: Record<string, string> = {};
  let pendingKey: string | null = null;
  let pendingValue: string[] = [];
  let openBrackets = 0;
  let insideString = false;

  const flush = () => {
    if (pendingKey !== null) {
      props[pendingKey] = pendingValue.join('\n').trim();
    }
    pendingKey = null;
    pendingValue = [];
  };

  const isPending = () => pendingKey !== null && (openBrackets > 0 || insideString);

  for (const rawLine of lines) {
    if (pendingKey === null) {
      const trimmed = rawLine.trim();
      const eq = trimmed.indexOf(' = ');
      if (eq === -1) {
        continue;
      }
      pendingKey = trimmed.substring(0, eq).trim();
      const value = trimmed.substring(eq + 3);
      pendingValue = [value];
      openBrackets = countBrackets(value);
      insideString = countUnescapedQuotes(value) % 2 === 1;
      if (!isPending()) {
        flush();
      }
    } else {
      pendingValue.push(rawLine);
      openBrackets += countBrackets(rawLine);
      if (countUnescapedQuotes(rawLine) % 2 === 1) {
        insideString = !insideString;
      }
      if (!isPending()) {
        flush();
      }
    }
  }
  flush();

  return props;
}

function countBrackets(value: string): number {
  let depth = 0;
  for (const ch of value) {
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
    }
  }
  return depth;
}

function countUnescapedQuotes(value: string): number {
  let count = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '"' && value[i - 1] !== '\\') {
      count++;
    }
  }
  return count;
}

function getAttr(header: string, attr: string): string | null {
  const quoted = header.match(new RegExp(`\\b${attr}="([^"]*)"`));
  if (quoted) {
    return quoted[1];
  }
  const bare = header.match(new RegExp(`\\b${attr}=([^\\s\\]]+)`));
  return bare ? bare[1] : null;
}

function buildSceneTree(nodes: TscnNode[], connections: TscnConnection[]): SceneTreeNode | null {
  if (nodes.length === 0) {
    return null;
  }

  const root: SceneTreeNode = {
    name: nodes[0].name,
    nodeType: nodes[0].nodeType ?? 'Node',
    parent: nodes[0].parent,
    instance: nodes[0].instance,
    groups: nodes[0].groups,
    children: [],
    props: nodes[0].props,
    connections: []
  };

  const pathMap = new Map<string, SceneTreeNode>();
  pathMap.set('.', root);

  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    const parentPath = node.parent ?? '.';
    const parentNode = pathMap.get(parentPath);

    const treeNode: SceneTreeNode = {
      name: node.name,
      nodeType: node.nodeType ?? 'Unknown',
      parent: node.parent,
      instance: node.instance,
      groups: node.groups,
      children: [],
      props: node.props,
      connections: []
    };

    parentNode?.children.push(treeNode);

    const ownPath = parentPath === '.' ? node.name : `${parentPath}/${node.name}`;
    pathMap.set(ownPath, treeNode);
  }

  for (const conn of connections) {
    const fromNode = pathMap.get(conn.from);
    fromNode?.connections.push(conn);
  }

  return root;
}

async function findGodotProjectRoot(fileUri: vscode.Uri): Promise<vscode.Uri | null> {
  let dir = vscode.Uri.joinPath(fileUri, '..');
  for (let i = 0; i < 16; i++) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.joinPath(dir, 'project.godot'));
      return dir;
    } catch {
      const parent = vscode.Uri.joinPath(dir, '..');
      if (parent.path === dir.path) {
        return null;
      }
      dir = parent;
    }
  }
  return null;
}

const TEXTURE_RES_TYPES = new Set(['Texture2D', 'CompressedTexture2D', 'ImageTexture', 'AtlasTexture']);

function resolveTextureUris(
  extResources: TscnExtResource[],
  projectRoot: vscode.Uri,
  webview: vscode.Webview
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const res of extResources) {
    if (!TEXTURE_RES_TYPES.has(res.resType) || !res.resPath.startsWith('res://')) {
      continue;
    }
    const relPath = res.resPath.slice('res://'.length);
    const fileUri = vscode.Uri.joinPath(projectRoot, relPath);
    result[res.id] = webview.asWebviewUri(fileUri).toString();
  }
  return result;
}

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
