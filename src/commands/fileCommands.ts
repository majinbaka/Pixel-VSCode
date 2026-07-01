import * as path from 'path';
import * as vscode from 'vscode';
import { PNG } from 'pngjs';
import { parseCanvasSize } from '../shared/png';
import { PIXEL_EDITOR_VIEW_TYPE } from '../pixelEditor/pixelEditorProvider';

export async function createNewPixelFile(): Promise<void> {
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
  await vscode.commands.executeCommand('vscode.openWith', targetUri, PIXEL_EDITOR_VIEW_TYPE);
}

export async function openWithPixelEditor(resource?: vscode.Uri): Promise<void> {
  const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
  if (!uri) {
    vscode.window.showWarningMessage('Select a PNG file to open with the Pixel Editor.');
    return;
  }

  if (path.extname(uri.path).toLowerCase() !== '.png') {
    vscode.window.showWarningMessage('Pixel Editor currently saves PNG files only.');
    return;
  }

  await vscode.commands.executeCommand('vscode.openWith', uri, PIXEL_EDITOR_VIEW_TYPE);
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
