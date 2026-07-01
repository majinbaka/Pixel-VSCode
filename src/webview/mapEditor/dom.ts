import { byId } from '../domUtil';

export interface Elements {
  mapCanvas: HTMLCanvasElement;
  mapContext: CanvasRenderingContext2D;
  mapFrame: HTMLElement;
  paletteCanvas: HTMLCanvasElement;
  paletteContext: CanvasRenderingContext2D;
  sourceSelect: HTMLSelectElement;
  layersList: HTMLElement;
  mapStatus: HTMLElement;
  cellStatus: HTMLElement;
  selectionStatus: HTMLElement;
  zoomInput: HTMLInputElement;
  zoomLabel: HTMLOutputElement;
  gridInput: HTMLInputElement;
  saveButton: HTMLButtonElement;
  exportButton: HTMLButtonElement;
  addLayerButton: HTMLButtonElement;
  deleteLayerButton: HTMLButtonElement;
  toolButtons: HTMLButtonElement[];
}

export function queryElements(): Elements {
  const mapCanvas = byId<HTMLCanvasElement>('mapCanvas');
  const paletteCanvas = byId<HTMLCanvasElement>('paletteCanvas');
  const mapContext = mapCanvas.getContext('2d');
  const paletteContext = paletteCanvas.getContext('2d');
  if (!mapContext || !paletteContext) {
    throw new Error('Unable to acquire 2D canvas context');
  }

  return {
    mapCanvas,
    mapContext,
    mapFrame: byId('mapFrame'),
    paletteCanvas,
    paletteContext,
    sourceSelect: byId<HTMLSelectElement>('sourceSelect'),
    layersList: byId('layersList'),
    mapStatus: byId('mapStatus'),
    cellStatus: byId('cellStatus'),
    selectionStatus: byId('selectionStatus'),
    zoomInput: byId<HTMLInputElement>('zoomInput'),
    zoomLabel: byId<HTMLOutputElement>('zoomLabel'),
    gridInput: byId<HTMLInputElement>('gridInput'),
    saveButton: byId<HTMLButtonElement>('saveButton'),
    exportButton: byId<HTMLButtonElement>('exportButton'),
    addLayerButton: byId<HTMLButtonElement>('addLayerButton'),
    deleteLayerButton: byId<HTMLButtonElement>('deleteLayerButton'),
    toolButtons: Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tool]'))
  };
}
