import * as vscode from 'vscode';
import { findGodotProjectRoot } from '../godotProject';
import { getMapEditorHtml } from './html';
import { exportMap } from './godotExport';
import { MapDocument } from './mapDocument';
import { parseMap, serializeMap, validateMap } from './mapModel';
import { parseTileSet } from './tileset';
import { MapWebviewMessage, PixelMapData } from './types';

export const MAP_EDITOR_VIEW_TYPE = 'pixelVscode.mapEditor';

export class MapEditorProvider implements vscode.CustomEditorProvider<MapDocument> {
  public static readonly viewType = MAP_EDITOR_VIEW_TYPE;

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
    panel.webview.html = getMapEditorHtml(this.context, panel.webview);

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
          await exportMap(this.context, document);
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
}
