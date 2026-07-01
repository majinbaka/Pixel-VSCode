import * as path from 'path';
import * as vscode from 'vscode';
import { deleteCollisionPolygon, readCollisionPolygon, writeCollisionPolygon } from '../collisionShape';
import { deleteLayerState, LayerStateFile, readLayerState, writeLayerState } from '../layerState';
import { decodePngDataUri } from '../shared/png';
import { confirmOverwrite, pickNonConflictingUri } from '../shared/uri';
import { WebviewMessage } from '../shared/types';
import { getPixelEditorHtml } from './html';
import { PixelDocument } from './pixelDocument';

export const PIXEL_EDITOR_VIEW_TYPE = 'pixelVscode.pixelEditor';

export class PixelEditorProvider implements vscode.CustomEditorProvider<PixelDocument> {
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
    const layerState = await readLayerState(uri);
    return new PixelDocument(uri, bytes, layerState);
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
    webviewPanel.webview.html = getPixelEditorHtml(this.context, webviewPanel.webview);

    const postDocument = async () => {
      const collisionPoints = await readCollisionPolygon(document.uri);
      const mimeType = getImageMimeType(document.uri);
      webviewPanel.webview.postMessage({
        type: 'init',
        filename: path.basename(document.uri.path),
        dataUri: `data:${mimeType};base64,${Buffer.from(document.data).toString('base64')}`,
        collisionPoints,
        layerState: document.currentLayerState
      });
    };

    const changeSubscription = document.onDidChangeContent((source) => {
      if (source !== webviewPanel) {
        void postDocument();
      }
    });
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
          await this.applyEdit(document, message.dataUri, message.label ?? 'Edit pixels', message.layerState, webviewPanel);
          return;

        case 'save':
          await vscode.commands.executeCommand('workbench.action.files.save');
          return;

        case 'saveCollision':
          await this.saveCollision(document.uri, message.points ?? []);
          return;
      }
    });
  }

  public async saveCustomDocument(document: PixelDocument, _cancellation: vscode.CancellationToken): Promise<void> {
    if (path.extname(document.uri.path).toLowerCase() !== '.png') {
      const newUri = await pickNonConflictingUri(document.uri, '.png');
      if (newUri) {
        await vscode.workspace.fs.writeFile(newUri, document.data);
        vscode.window.showInformationMessage(
          `Pixel Editor saved edits as a new PNG file: ${path.basename(newUri.fsPath)}`
        );
        await vscode.commands.executeCommand('vscode.openWith', newUri, PIXEL_EDITOR_VIEW_TYPE);
      }
      return;
    }

    const confirmed = await confirmOverwrite(document.uri);
    if (confirmed === 'overwrite') {
      await vscode.workspace.fs.writeFile(document.uri, document.data);
    } else if (confirmed === 'saveas') {
      const newUri = await pickNonConflictingUri(document.uri);
      if (newUri) {
        await vscode.workspace.fs.writeFile(newUri, document.data);
        await vscode.commands.executeCommand('vscode.openWith', newUri, PIXEL_EDITOR_VIEW_TYPE);
      }
    }
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
    const layerState = await readLayerState(document.uri);
    document.update(bytes, layerState);
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

  private async applyEdit(
    document: PixelDocument,
    dataUri: string,
    label: string,
    layerState: LayerStateFile | undefined,
    sourcePanel: vscode.WebviewPanel
  ) {
    const nextBytes = decodePngDataUri(dataUri);
    if (!nextBytes) {
      vscode.window.showErrorMessage('Pixel Editor could not read the edited PNG data.');
      return;
    }

    const previousBytes = document.data;
    const previousLayerState = document.currentLayerState;

    await this.persistLayerState(document.uri, layerState);
    document.update(nextBytes, layerState, sourcePanel);

    this.onDidChangeCustomDocumentEmitter.fire({
      document,
      label,
      undo: async () => {
        await this.persistLayerState(document.uri, previousLayerState);
        document.update(previousBytes, previousLayerState);
      },
      redo: async () => {
        await this.persistLayerState(document.uri, layerState);
        document.update(nextBytes, layerState);
      }
    });
  }

  private async persistLayerState(uri: vscode.Uri, layerState: LayerStateFile | undefined): Promise<void> {
    if (layerState) {
      await writeLayerState(uri, layerState);
    } else {
      await deleteLayerState(uri);
    }
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
}

function getImageMimeType(uri: vscode.Uri): string {
  const extension = path.extname(uri.path).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }
  return 'image/png';
}
