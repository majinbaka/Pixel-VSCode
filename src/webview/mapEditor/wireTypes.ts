export type MapCell = [number, number, number, number, number, number?];

export type MapLayerWire = {
  name: string;
  zIndex: number;
  cells: MapCell[];
};

export type PixelMapDataWire = {
  format: 'pixel-vscode-map';
  version: 1;
  name: string;
  tileSet: string;
  output: string;
  width: number;
  height: number;
  tileSize: number;
  layers: MapLayerWire[];
};

export type TilePaletteSourceWire = {
  sourceId: number;
  name: string;
  dataUri: string;
  regionWidth: number;
  regionHeight: number;
  columns: number;
  rows: number;
};

export type MapEditorInboundMessage =
  | { type: 'init'; map: PixelMapDataWire; sources: TilePaletteSourceWire[] };

export type MapEditorOutboundMessage =
  | { type: 'ready' }
  | { type: 'edit'; map: PixelMapDataWire; label: string }
  | { type: 'save' }
  | { type: 'export' };

export interface VsCodeApi {
  postMessage(message: MapEditorOutboundMessage): void;
}
