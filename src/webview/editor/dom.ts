import { byId } from '../domUtil';

export interface Elements {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  canvasFrame: HTMLElement;
  workspace: HTMLElement;
  fileStatus: HTMLElement;
  colorInput: HTMLInputElement;
  brushSizeInput: HTMLInputElement;
  brushSizeLabel: HTMLOutputElement;
  zoomInput: HTMLInputElement;
  zoomLabel: HTMLOutputElement;
  fitZoomButton: HTMLButtonElement;
  guideSizeSelect: HTMLSelectElement;
  canvasSizeDisplay: HTMLElement;
  resizeHandles: HTMLElement[];
  saveButton: HTMLButtonElement;
  toggleGridButton: HTMLButtonElement;
  toggleSnapButton: HTMLButtonElement;
  paletteSelect: HTMLSelectElement;
  paletteSwatches: HTMLElement;
  layersList: HTMLElement;
  addLayerButton: HTMLButtonElement;
  importLayerButton: HTMLButtonElement;
  previewAnimationButton: HTMLButtonElement;
  duplicateLayerButton: HTMLButtonElement;
  deleteLayerButton: HTMLButtonElement;
  moveLayerUpButton: HTMLButtonElement;
  moveLayerDownButton: HTMLButtonElement;
  mergeLayerDownButton: HTMLButtonElement;
  layerOpacityInput: HTMLInputElement;
  layerOpacityLabel: HTMLOutputElement;
  toolButtons: HTMLButtonElement[];
  hitboxOverlay: SVGSVGElement;
  autoTraceButton: HTMLButtonElement;
  clearHitboxButton: HTMLButtonElement;
  saveHitboxButton: HTMLButtonElement;
  hitboxPointCount: HTMLElement;
  cursorOverlay: HTMLElement;
  rigOverlay: SVGSVGElement;
  rigAngleInput: HTMLInputElement;
  resetRigButton: HTMLButtonElement;
  addPivotButton: HTMLButtonElement;
  pivotsList: HTMLElement;
  selectionOverlay: SVGSVGElement;
  selectionDragCanvas: HTMLCanvasElement;
  selectionMoveButton: HTMLButtonElement;
  selectionCutButton: HTMLButtonElement;
  selectionClearButton: HTMLButtonElement;
}

export function queryElements(): Elements {
  const canvas = byId<HTMLCanvasElement>('pixelCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  return {
    canvas,
    ctx,
    canvasFrame: byId('canvasFrame'),
    workspace: byId('workspace'),
    fileStatus: byId('fileStatus'),
    colorInput: byId<HTMLInputElement>('colorInput'),
    brushSizeInput: byId<HTMLInputElement>('brushSize'),
    brushSizeLabel: byId<HTMLOutputElement>('brushSizeLabel'),
    zoomInput: byId<HTMLInputElement>('zoom'),
    zoomLabel: byId<HTMLOutputElement>('zoomLabel'),
    fitZoomButton: byId<HTMLButtonElement>('fitZoomButton'),
    guideSizeSelect: byId<HTMLSelectElement>('guideSize'),
    canvasSizeDisplay: byId('canvasSizeDisplay'),
    resizeHandles: Array.from(document.querySelectorAll<HTMLElement>('.resize-handle')),
    saveButton: byId<HTMLButtonElement>('saveButton'),
    toggleGridButton: byId<HTMLButtonElement>('toggleGrid'),
    toggleSnapButton: byId<HTMLButtonElement>('toggleSnap'),
    paletteSelect: byId<HTMLSelectElement>('paletteSelect'),
    paletteSwatches: byId('paletteSwatches'),
    layersList: byId('layersList'),
    addLayerButton: byId<HTMLButtonElement>('addLayerButton'),
    importLayerButton: byId<HTMLButtonElement>('importLayerButton'),
    previewAnimationButton: byId<HTMLButtonElement>('previewAnimationButton'),
    duplicateLayerButton: byId<HTMLButtonElement>('duplicateLayerButton'),
    deleteLayerButton: byId<HTMLButtonElement>('deleteLayerButton'),
    moveLayerUpButton: byId<HTMLButtonElement>('moveLayerUpButton'),
    moveLayerDownButton: byId<HTMLButtonElement>('moveLayerDownButton'),
    mergeLayerDownButton: byId<HTMLButtonElement>('mergeLayerDownButton'),
    layerOpacityInput: byId<HTMLInputElement>('layerOpacity'),
    layerOpacityLabel: byId<HTMLOutputElement>('layerOpacityLabel'),
    toolButtons: Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tool]')),
    hitboxOverlay: byId<SVGSVGElement>('hitboxOverlay'),
    autoTraceButton: byId<HTMLButtonElement>('autoTraceButton'),
    clearHitboxButton: byId<HTMLButtonElement>('clearHitboxButton'),
    saveHitboxButton: byId<HTMLButtonElement>('saveHitboxButton'),
    hitboxPointCount: byId('hitboxPointCount'),
    cursorOverlay: byId('cursorOverlay'),
    rigOverlay: byId<SVGSVGElement>('rigOverlay'),
    rigAngleInput: byId<HTMLInputElement>('rigAngle'),
    resetRigButton: byId<HTMLButtonElement>('resetRigButton'),
    addPivotButton: byId<HTMLButtonElement>('addPivotButton'),
    pivotsList: byId('pivotsList'),
    selectionOverlay: byId<SVGSVGElement>('selectionOverlay'),
    selectionDragCanvas: byId<HTMLCanvasElement>('selectionDragCanvas'),
    selectionMoveButton: byId<HTMLButtonElement>('selectionMoveButton'),
    selectionCutButton: byId<HTMLButtonElement>('selectionCutButton'),
    selectionClearButton: byId<HTMLButtonElement>('selectionClearButton')
  };
}
