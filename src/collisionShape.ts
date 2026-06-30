import * as path from 'path';
import * as vscode from 'vscode';

export function collisionResourceUri(pngUri: vscode.Uri): vscode.Uri {
  const dir = path.dirname(pngUri.fsPath);
  const base = path.basename(pngUri.fsPath, '.png');
  return vscode.Uri.file(path.join(dir, `${base}.collision.tres`));
}

export async function readCollisionPolygon(pngUri: vscode.Uri): Promise<number[] | undefined> {
  let text: string;
  try {
    text = Buffer.from(await vscode.workspace.fs.readFile(collisionResourceUri(pngUri))).toString('utf8');
  } catch {
    return undefined;
  }

  const match = text.match(/points\s*=\s*PackedVector2Array\(([^)]*)\)/);
  if (!match) {
    return undefined;
  }

  const values = match[1]
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => !Number.isNaN(value));
  return values.length >= 6 && values.length % 2 === 0 ? values : undefined;
}

export async function writeCollisionPolygon(pngUri: vscode.Uri, points: number[]): Promise<vscode.Uri> {
  const resourceUri = collisionResourceUri(pngUri);
  const pairs: string[] = [];
  for (let index = 0; index < points.length; index += 2) {
    pairs.push(`${formatNumber(points[index])}, ${formatNumber(points[index + 1])}`);
  }

  const text = `[gd_resource type="ConvexPolygonShape2D" format=3]\n\n[resource]\npoints = PackedVector2Array(${pairs.join(', ')})\n`;
  await vscode.workspace.fs.writeFile(resourceUri, new TextEncoder().encode(text));
  return resourceUri;
}

export async function deleteCollisionPolygon(pngUri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.delete(collisionResourceUri(pngUri));
  } catch {
    // Nothing to delete.
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
