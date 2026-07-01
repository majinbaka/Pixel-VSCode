import { MapCell, MapLayerWire, PixelMapDataWire, TilePaletteSourceWire } from './wireTypes';

export type Tool = 'paint' | 'erase' | 'fill';

export interface MapLayer {
  name: string;
  zIndex: number;
  cellMap: Map<string, MapCell>;
}

export interface MapModel {
  format: 'pixel-vscode-map';
  version: 1;
  name: string;
  tileSet: string;
  output: string;
  width: number;
  height: number;
  tileSize: number;
  layers: MapLayer[];
}

export interface LoadedTileSource extends TilePaletteSourceWire {
  image: HTMLImageElement;
}

export interface SelectedTile {
  sourceId: number;
  atlasX: number;
  atlasY: number;
}

export interface MapEditorState {
  map: MapModel | undefined;
  sources: LoadedTileSource[];
  sourceById: Map<number, LoadedTileSource>;
  activeLayer: number;
  hiddenLayers: Set<number>;
  selectedTile: SelectedTile | undefined;
  tool: Tool;
  zoom: number;
  drawing: boolean;
  changedInStroke: boolean;
  lastCell: string;
  pointerId: number | undefined;
  loadToken: number;
}

export function createInitialState(): MapEditorState {
  return {
    map: undefined,
    sources: [],
    sourceById: new Map(),
    activeLayer: 0,
    hiddenLayers: new Set(),
    selectedTile: undefined,
    tool: 'paint',
    zoom: 0.5,
    drawing: false,
    changedInStroke: false,
    lastCell: '',
    pointerId: undefined,
    loadToken: 0
  };
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function toMapModel(map: PixelMapDataWire): MapModel {
  return {
    ...map,
    layers: map.layers.map((layer) => toMapLayer(layer))
  };
}

function toMapLayer(layer: MapLayerWire): MapLayer {
  const cellMap = new Map<string, MapCell>();
  for (const cell of layer.cells) {
    cellMap.set(cellKey(cell[0], cell[1]), cell);
  }
  return { name: layer.name, zIndex: layer.zIndex, cellMap };
}

export function serializeMap(map: MapModel): PixelMapDataWire {
  return {
    ...map,
    layers: map.layers.map((layer) => ({
      name: layer.name,
      zIndex: layer.zIndex,
      cells: Array.from(layer.cellMap.values()).sort((a, b) => a[1] - b[1] || a[0] - b[0])
    }))
  };
}
