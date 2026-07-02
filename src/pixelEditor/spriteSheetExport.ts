import { PNG } from 'pngjs';
import * as vscode from 'vscode';
import { decodePngDataUri } from '../shared/png';
import { AnimationLayerFrame } from '../shared/types';

export interface SpriteSheetLayout {
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
}

export function composeSpriteSheet(frames: { name: string; png: PNG }[]): { png: PNG; layout: SpriteSheetLayout } {
  if (frames.length === 0) {
    throw new Error('No frames to export.');
  }

  const frameWidth = frames[0].png.width;
  const frameHeight = frames[0].png.height;
  const columns = Math.ceil(Math.sqrt(frames.length));
  const rows = Math.ceil(frames.length / columns);

  const sheet = new PNG({ width: columns * frameWidth, height: rows * frameHeight });

  frames.forEach((frame, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const destX = col * frameWidth;
    const destY = row * frameHeight;
    PNG.bitblt(frame.png, sheet, 0, 0, frameWidth, frameHeight, destX, destY);
  });

  return { png: sheet, layout: { columns, rows, frameWidth, frameHeight } };
}

export function decodeFrames(frames: AnimationLayerFrame[]): { name: string; png: PNG }[] {
  return frames.map((frame) => {
    const bytes = decodePngDataUri(frame.dataUri);
    if (!bytes) {
      throw new Error(`Could not decode frame "${frame.name}" as PNG data.`);
    }
    return { name: frame.name, png: PNG.sync.read(Buffer.from(bytes)) };
  });
}

export async function exportSpriteSheet(frames: AnimationLayerFrame[], defaultUri: vscode.Uri | undefined): Promise<void> {
  if (frames.length === 0) {
    vscode.window.showWarningMessage('No visible layers to export as a sprite sheet.');
    return;
  }

  const decoded = decodeFrames(frames);
  const widths = new Set(decoded.map((frame) => frame.png.width));
  const heights = new Set(decoded.map((frame) => frame.png.height));
  if (widths.size > 1 || heights.size > 1) {
    vscode.window.showErrorMessage('All layers must be the same size to export a sprite sheet.');
    return;
  }

  const { png } = composeSpriteSheet(decoded);

  const destination = await vscode.window.showSaveDialog({
    title: 'Export sprite sheet',
    defaultUri,
    filters: { Images: ['png'] }
  });
  if (!destination) {
    return;
  }

  await vscode.workspace.fs.writeFile(destination, PNG.sync.write(png));
  vscode.window.showInformationMessage(`Sprite sheet exported: ${destination.fsPath}`);
}
