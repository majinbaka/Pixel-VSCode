import * as path from 'path';
import * as vscode from 'vscode';

export interface LayerPivotState {
  id: string;
  name: string;
  x: number;
  y: number;
  angle: number;
}

export interface LayerEntryState {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  dataUri: string;
  rig: {
    activePivotId: string;
    pivots: LayerPivotState[];
  };
}

export interface LayerStateFile {
  layers: LayerEntryState[];
}

export function layerStateResourceUri(pngUri: vscode.Uri): vscode.Uri {
  const dir = path.dirname(pngUri.fsPath);
  const base = path.basename(pngUri.fsPath, '.png');
  return vscode.Uri.file(path.join(dir, `.${base}_image.pixvjson`));
}

export async function readLayerState(pngUri: vscode.Uri): Promise<LayerStateFile | undefined> {
  let text: string;
  try {
    text = Buffer.from(await vscode.workspace.fs.readFile(layerStateResourceUri(pngUri))).toString('utf8');
  } catch {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.layers)) {
      return undefined;
    }
    return parsed as LayerStateFile;
  } catch {
    return undefined;
  }
}

export async function writeLayerState(pngUri: vscode.Uri, state: LayerStateFile): Promise<void> {
  const text = JSON.stringify(state);
  await vscode.workspace.fs.writeFile(layerStateResourceUri(pngUri), new TextEncoder().encode(text));
}

export async function deleteLayerState(pngUri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.delete(layerStateResourceUri(pngUri));
  } catch {
    // Nothing to delete.
  }
}
