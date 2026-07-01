import * as vscode from 'vscode';
import { openAnimationPreview } from './commands/animationCommands';
import { createNewPixelFile, openWithPixelEditor } from './commands/fileCommands';
import { createGodotMap } from './mapEditor/createGodotMap';
import { MapEditorProvider } from './mapEditor/mapEditorProvider';
import { PIXEL_EDITOR_VIEW_TYPE, PixelEditorProvider } from './pixelEditor/pixelEditorProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new PixelEditorProvider(context);
  const mapProvider = new MapEditorProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(PIXEL_EDITOR_VIEW_TYPE, provider, {
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
    vscode.commands.registerCommand('pixelVscode.openEditor', (resource?: vscode.Uri) => openWithPixelEditor(resource)),
    vscode.commands.registerCommand('pixelVscode.previewAnimation', (resource?: vscode.Uri, selectedResources?: vscode.Uri[]) =>
      openAnimationPreview(context, resource, selectedResources)
    )
  );
}

export function deactivate() {}
