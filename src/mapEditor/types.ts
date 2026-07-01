export type MapCell = [number, number, number, number, number, number?];

export type MapLayer = {
  name: string;
  zIndex: number;
  cells: MapCell[];
};

export type PixelMapData = {
  format: 'pixel-vscode-map';
  version: 1;
  name: string;
  tileSet: string;
  output: string;
  width: number;
  height: number;
  tileSize: number;
  layers: MapLayer[];
};

export type TilePaletteSource = {
  sourceId: number;
  name: string;
  dataUri: string;
  regionWidth: number;
  regionHeight: number;
  columns: number;
  rows: number;
};

export type MapWebviewMessage =
  | { type: 'ready' }
  | { type: 'edit'; map?: PixelMapData; label?: string }
  | { type: 'save' }
  | { type: 'export' };
