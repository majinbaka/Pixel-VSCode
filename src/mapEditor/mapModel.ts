import { PixelMapData } from './types';

export function parseMap(bytes: Uint8Array): PixelMapData {
  const value = JSON.parse(new TextDecoder().decode(bytes)) as PixelMapData;
  validateMap(value);
  return value;
}

export function validateMap(map: PixelMapData): void {
  if (map.format !== 'pixel-vscode-map' || map.version !== 1) {
    throw new Error('Unsupported pixel map format.');
  }
  if (!map.name || !map.tileSet?.startsWith('res://') || !map.output?.startsWith('res://')) {
    throw new Error('Map name, TileSet, and output path are required.');
  }
  if (!Number.isInteger(map.width) || !Number.isInteger(map.height) || map.width < 1 || map.height < 1) {
    throw new Error('Map width and height must be positive integers.');
  }
  if (!Array.isArray(map.layers) || map.layers.length === 0) {
    throw new Error('Map must contain at least one layer.');
  }
  for (const layer of map.layers) {
    if (!layer.name || !Array.isArray(layer.cells)) {
      throw new Error('Every map layer requires a name and cells array.');
    }
  }
}

export function serializeMap(map: PixelMapData): string {
  return `${JSON.stringify(map, null, 2)}\n`;
}

export function parseMapSize(value: string): { width: number; height: number } | undefined {
  const match = value.trim().match(/^(\d{1,3})\s*x\s*(\d{1,3})$/i);
  if (!match) {
    return undefined;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width >= 1 && width <= 128 && height >= 1 && height <= 128
    ? { width, height }
    : undefined;
}
