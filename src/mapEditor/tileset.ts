import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { PNG } from 'pngjs';
import { resourcePathToAbsolute, toResourcePath } from '../godotProject';
import { TilePaletteSource } from './types';

export async function pickTileSet(projectRoot: string): Promise<string | undefined> {
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

export async function parseTileSet(
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
