import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { findGodotProjectRoot, pascalCase, sanitizeResourceId } from '../godotProject';
import { serializeMap, parseMapSize } from './mapModel';
import { parseTileSet, pickTileSet } from './tileset';
import { PixelMapData } from './types';
import { MAP_EDITOR_VIEW_TYPE } from './mapEditorProvider';

export async function createGodotMap(): Promise<void> {
  const projectRoot = findGodotProjectRoot();
  if (!projectRoot) {
    vscode.window.showErrorMessage('Open a Godot project folder before creating a map.');
    return;
  }

  const mapIdInput = await vscode.window.showInputBox({
    title: 'New Pixel Monster Map',
    prompt: 'Map or chunk id. The exported scene uses this name.',
    value: 'open_world_chunk_0_0',
    validateInput(value) {
      return sanitizeResourceId(value) ? undefined : 'Use lowercase letters, numbers, and underscores; start with a letter.';
    }
  });
  const mapId = mapIdInput ? sanitizeResourceId(mapIdInput) : undefined;
  if (!mapId) {
    return;
  }

  const sizeInput = await vscode.window.showInputBox({
    title: 'Map Chunk Size',
    prompt: 'Width and height in map cells. 32x32 is recommended for streaming chunks.',
    value: '32x32',
    validateInput(value) {
      return parseMapSize(value) ? undefined : 'Use WIDTHxHEIGHT from 1x1 to 128x128.';
    }
  });
  const size = sizeInput ? parseMapSize(sizeInput) : undefined;
  if (!size) {
    return;
  }

  const tileSet = await pickTileSet(projectRoot);
  if (!tileSet) {
    return;
  }
  const parsedTileSet = await parseTileSet(projectRoot, tileSet);

  const sourceDirectory = path.join(projectRoot, 'assets', 'maps');
  const sourcePath = path.join(sourceDirectory, `${mapId}.pixelmap.json`);
  if (fs.existsSync(sourcePath)) {
    vscode.window.showErrorMessage(`Map source already exists: ${sourcePath}`);
    return;
  }

  const data: PixelMapData = {
    format: 'pixel-vscode-map',
    version: 1,
    name: pascalCase(mapId),
    tileSet,
    output: `res://scenes/world/maps/${mapId}.tscn`,
    width: size.width,
    height: size.height,
    tileSize: parsedTileSet.tileSize,
    layers: [
      { name: 'Ground', zIndex: -20, cells: [] },
      { name: 'Details', zIndex: -19, cells: [] }
    ]
  };

  await fs.promises.mkdir(sourceDirectory, { recursive: true });
  await fs.promises.writeFile(sourcePath, serializeMap(data), 'utf8');
  await vscode.commands.executeCommand(
    'vscode.openWith',
    vscode.Uri.file(sourcePath),
    MAP_EDITOR_VIEW_TYPE
  );
}
