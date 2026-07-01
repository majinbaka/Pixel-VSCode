import { queryElements, Elements } from './dom';
import { createInitialState, EditorState, Layer, Tool, isSelectionTool } from './state';
import { LayerStateFile } from './wireTypes';
import {
  commit,
  createLayer,
  createLayerCanvas,
  flatToHitboxPoints,
  getActiveLayer,
  loadImageElement,
  nextIdNumber,
  renderComposite,
  setCanvasSize,
  updateCanvasDisplaySize,
  VsCodeApi
} from './canvasCore';
import {
  autoTraceHitbox,
  deleteNearestHitboxPoint,
  flattenHitboxPoints,
  handleHitboxPointerDown,
  handleHitboxPointerMove,
  renderHitboxOverlay
} from './hitbox';
import {
  clearSelection,
  cutSelection,
  flattenSelection,
  handleSelectionPointerDown,
  handleSelectionPointerMove,
  handleSelectionPointerUp,
  liftSelection,
  renderSelectionOverlay
} from './selection';
import {
  addPivot,
  bakeRigRotation,
  handleRigPointerDown,
  handleRigPointerMove,
  renderPivotsPanel,
  renderRigOverlay,
  resetRig,
  setRigAngleFromInput,
  updateRigAngleInput
} from './rig';
import {
  clampCanvasNumber,
  drawAt,
  eventToLayerPixel,
  eventToPixel,
  floodFill,
  hideCursorOverlay,
  pickColor,
  updateCursorOverlay
} from './drawing';
import {
  addLayer,
  deleteLayer,
  duplicateLayer,
  LayersPanelCallbacks,
  mergeLayerDown,
  moveLayer,
  renderLayersPanel,
  setActiveLayerOpacity
} from './layersPanel';
import { renderPaletteSwatches, renderPalettes } from './palettePanel';
import { initResizeHandles } from './resizeHandles';

declare const acquireVsCodeApi: () => VsCodeApi;

(function main() {
  const vscode = acquireVsCodeApi();
  const el: Elements = queryElements();
  const state: EditorState = createInitialState();

  function doCommit(label: string): void {
    commit(vscode, el, state, label);
  }

  function setTool(tool: Tool): void {
    if (state.tool !== tool && isSelectionTool(state.tool)) {
      flattenSelection(el, state, doCommit);
    }
    state.tool = tool;
    for (const button of el.toolButtons) {
      button.classList.toggle('active', button.dataset.tool === tool);
    }
    if (tool === 'picker') {
      el.canvas.style.cursor = 'copy';
    } else {
      el.canvas.style.cursor = 'crosshair';
    }
    const layer = getActiveLayer(state);
    if (tool === 'rig' && layer) {
      updateRigAngleInput(el, state, layer);
      renderPivotsPanel(el, state);
    }
    renderRigOverlay(el, state);
    if (!isSelectionTool(tool)) {
      clearSelection(el, state);
    }
  }

  function setZoom(value: string | number): void {
    const zoom = Math.max(0.1, Math.min(40, Number(value) || 16));
    state.zoom = zoom;
    el.zoomInput.value = String(zoom);
    el.zoomLabel.value = `${Math.round(zoom * 100) / 100}x`;
    updateCanvasDisplaySize(el, state);
    renderHitboxOverlay(el, state);
    renderRigOverlay(el, state);
    renderSelectionOverlay(el, state);
  }

  function fitZoomToWorkspace(): void {
    if (!el.canvas.width || !el.canvas.height || !el.workspace) {
      return;
    }

    const padding = 64;
    const availableWidth = Math.max(1, el.workspace.clientWidth - padding);
    const availableHeight = Math.max(1, el.workspace.clientHeight - padding);
    const fitZoom = Math.min(availableWidth / el.canvas.width, availableHeight / el.canvas.height);
    const niceZoom = fitZoom >= 1 ? Math.max(1, Math.floor(fitZoom)) : fitZoom;
    setZoom(niceZoom);
  }

  function setGuideSize(value: string | number): void {
    const guideSize = Math.max(1, Math.min(128, Number(value) || 1));
    state.guideSize = guideSize;
    el.guideSizeSelect.value = String(guideSize);
    el.canvasFrame.style.setProperty('--guide-size', `${state.zoom * guideSize}px`);
  }

  function setBrushSize(value: string | number): void {
    const size = Math.max(1, Math.min(64, Number(value) || 1));
    el.brushSizeInput.value = String(size);
    el.brushSizeLabel.value = String(size);
  }

  function setActiveLayer(id: string): void {
    if (!state.layers.some((layer) => layer.id === id)) {
      return;
    }

    state.activeLayerId = id;
    renderLayersPanel(el, state, layersPanelCallbacks);
    renderComposite(el, state);
    const layer = getActiveLayer(state);
    if (state.tool === 'rig' && layer) {
      updateRigAngleInput(el, state, layer);
    }
    renderPivotsPanel(el, state);
    renderRigOverlay(el, state);
  }

  const layersPanelCallbacks: LayersPanelCallbacks = {
    onCommit: doCommit,
    onSetActiveLayer: setActiveLayer
  };

  function finishLoad(filename: string | undefined): void {
    el.fileStatus.textContent = filename || 'pixel.png';
    state.ready = true;
    state.collision.points = flatToHitboxPoints(state.pendingCollisionPoints, el.canvas.width, el.canvas.height);
    state.collision.draggingIndex = -1;
    state.pendingCollisionPoints = undefined;
    renderLayersPanel(el, state, layersPanelCallbacks);
    renderComposite(el, state);
    renderHitboxOverlay(el, state);
    renderPivotsPanel(el, state);
    renderRigOverlay(el, state);
  }

  function loadImage(dataUri: string, filename: string | undefined): void {
    loadImageElement(dataUri).then((image) => {
      setCanvasSize(el, state, image.naturalWidth, image.naturalHeight);
      fitZoomToWorkspace();
      const baseCanvas = createLayerCanvas(el.canvas.width, el.canvas.height);
      baseCanvas.getContext('2d')!.drawImage(image, 0, 0);

      state.layers = [createLayer(el, state, 'Layer 1', baseCanvas)];
      state.activeLayerId = state.layers[0].id;
      finishLoad(filename);
    });
  }

  async function loadLayerState(layerState: LayerStateFile | undefined, filename: string | undefined): Promise<boolean> {
    if (!layerState || !Array.isArray(layerState.layers) || layerState.layers.length === 0) {
      return false;
    }

    const images = await Promise.all(layerState.layers.map((entry) => loadImageElement(entry.dataUri)));
    setCanvasSize(el, state, images[0].naturalWidth, images[0].naturalHeight);
    fitZoomToWorkspace();

    let maxLayerId = 0;
    let maxPivotId = 0;

    state.layers = layerState.layers.map((entry, index): Layer => {
      const layerCanvas = createLayerCanvas(el.canvas.width, el.canvas.height);
      layerCanvas.getContext('2d')!.drawImage(images[index], 0, 0);
      maxLayerId = Math.max(maxLayerId, nextIdNumber(entry.id));
      const pivots = entry.rig.pivots.map((pivot) => {
        maxPivotId = Math.max(maxPivotId, nextIdNumber(pivot.id));
        return {
          id: pivot.id,
          name: pivot.name,
          x: pivot.x,
          y: pivot.y,
          angle: pivot.angle
        };
      });
      return {
        id: entry.id,
        name: entry.name,
        visible: entry.visible,
        opacity: entry.opacity,
        canvas: layerCanvas,
        rig: {
          pivots,
          activePivotId: entry.rig.activePivotId
        }
      };
    });
    state.nextLayerId = Math.max(state.nextLayerId, maxLayerId + 1);
    state.nextPivotId = Math.max(state.nextPivotId, maxPivotId + 1);
    state.activeLayerId = state.layers[state.layers.length - 1].id;
    finishLoad(filename);
    return true;
  }

  function applyCanvasResize(newWidth: number, newHeight: number, offX: number, offY: number): void {
    const width = clampCanvasNumber(newWidth, 1);
    const height = clampCanvasNumber(newHeight, 1);
    if (width === el.canvas.width && height === el.canvas.height) return;

    for (const layer of state.layers) {
      const oldCanvas = layer.canvas;
      const nextCanvas = createLayerCanvas(width, height);
      nextCanvas.getContext('2d')!.drawImage(oldCanvas, offX, offY);
      layer.canvas = nextCanvas;
      for (const pivot of layer.rig.pivots) {
        pivot.x += offX;
        pivot.y += offY;
      }
    }

    setCanvasSize(el, state, width, height);
    state.collision.points = [];
    state.collision.draggingIndex = -1;
    renderComposite(el, state);
    renderHitboxOverlay(el, state);
    renderRigOverlay(el, state);
    doCommit('Resize canvas');
  }

  function handlePointerDown(event: PointerEvent): void {
    if (!state.ready || event.button !== 0) {
      return;
    }

    const screenPoint = eventToPixel(el, event);
    state.pointerId = event.pointerId;
    el.canvas.setPointerCapture(event.pointerId);

    if (state.tool === 'hitbox') {
      handleHitboxPointerDown(el, state, screenPoint.x, screenPoint.y);
      return;
    }

    if (state.tool === 'rig') {
      handleRigPointerDown(el, state, screenPoint.x, screenPoint.y);
      return;
    }

    if (isSelectionTool(state.tool)) {
      state.selection.shape = state.tool === 'select-rect' ? 'rect' : state.tool === 'select-ellipse' ? 'ellipse' : 'lasso';
      handleSelectionPointerDown(el, state, doCommit, screenPoint.x, screenPoint.y);
      return;
    }

    if (state.tool === 'picker') {
      pickColor(el, state, setTool, screenPoint.x, screenPoint.y);
      return;
    }

    const layer = getActiveLayer(state);
    const layerPoint = eventToLayerPixel(el, state, event, layer);
    if (!layerPoint) {
      return;
    }
    const { x, y } = layerPoint;

    if (state.tool === 'fill') {
      floodFill(el, state, x, y);
      doCommit('Fill layer');
      return;
    }

    state.drawing = true;
    state.lastKey = `${x}:${y}`;
    drawAt(el, state, x, y);
  }

  function handlePointerMove(event: PointerEvent): void {
    const layer = getActiveLayer(state);
    const layerPoint = eventToLayerPixel(el, state, event, layer);
    if (layerPoint) {
      updateCursorOverlay(el, state, layerPoint.x, layerPoint.y);
    } else {
      hideCursorOverlay(el);
    }

    if (event.pointerId !== state.pointerId) {
      return;
    }

    if (state.tool === 'hitbox') {
      handleHitboxPointerMove(el, state, eventToPixel(el, event));
      return;
    }

    if (state.tool === 'rig') {
      const screenPoint = eventToPixel(el, event);
      handleRigPointerMove(el, state, screenPoint.x, screenPoint.y);
      return;
    }

    if (isSelectionTool(state.tool)) {
      const screenPoint = eventToPixel(el, event);
      handleSelectionPointerMove(el, state, screenPoint.x, screenPoint.y);
      return;
    }

    if (!state.drawing || !layerPoint) {
      return;
    }

    const key = `${layerPoint.x}:${layerPoint.y}`;
    if (key === state.lastKey) {
      return;
    }

    state.lastKey = key;
    drawAt(el, state, layerPoint.x, layerPoint.y);
  }

  function stopDrawing(event: PointerEvent): void {
    if (event.pointerId !== state.pointerId) {
      return;
    }

    if (state.tool === 'hitbox') {
      state.collision.draggingIndex = -1;
      state.pointerId = undefined;
      return;
    }

    if (state.tool === 'rig') {
      const wasDragging = Boolean(state.rig.dragMode);
      state.rig.dragMode = undefined;
      state.pointerId = undefined;
      if (wasDragging) {
        const layer = getActiveLayer(state);
        if (bakeRigRotation(el, state, layer)) {
          doCommit('Rotate layer');
        }
      }
      return;
    }

    if (isSelectionTool(state.tool)) {
      const screenPoint = eventToPixel(el, event);
      handleSelectionPointerUp(el, state, screenPoint.x, screenPoint.y);
      state.pointerId = undefined;
      return;
    }

    if (!state.drawing) {
      return;
    }

    state.drawing = false;
    state.pointerId = undefined;
    state.lastKey = '';
    doCommit(state.tool === 'eraser' ? 'Erase layer' : 'Draw layer');
  }

  for (const button of el.toolButtons) {
    button.addEventListener('click', () => setTool(button.dataset.tool as Tool));
  }

  el.brushSizeInput.addEventListener('input', () => setBrushSize(el.brushSizeInput.value));
  el.zoomInput.addEventListener('input', () => setZoom(el.zoomInput.value));
  el.fitZoomButton.addEventListener('click', fitZoomToWorkspace);
  el.guideSizeSelect.addEventListener('change', () => setGuideSize(el.guideSizeSelect.value));
  initResizeHandles(el, state, applyCanvasResize);
  el.saveButton.addEventListener('click', () => vscode.postMessage({ type: 'save' }));
  el.colorInput.addEventListener('input', () => renderPaletteSwatches(el, () => setTool('pencil')));
  el.paletteSelect.addEventListener('change', () => renderPaletteSwatches(el, () => setTool('pencil')));
  el.addLayerButton.addEventListener('click', () => addLayer(el, state, layersPanelCallbacks));
  el.duplicateLayerButton.addEventListener('click', () => duplicateLayer(el, state, layersPanelCallbacks));
  el.deleteLayerButton.addEventListener('click', () => deleteLayer(el, state, layersPanelCallbacks));
  el.moveLayerUpButton.addEventListener('click', () => moveLayer(el, state, layersPanelCallbacks, 1));
  el.moveLayerDownButton.addEventListener('click', () => moveLayer(el, state, layersPanelCallbacks, -1));
  el.mergeLayerDownButton.addEventListener('click', () => mergeLayerDown(el, state, layersPanelCallbacks));
  el.layerOpacityInput.addEventListener('input', () => setActiveLayerOpacity(el, state, layersPanelCallbacks, el.layerOpacityInput.value, false));
  el.layerOpacityInput.addEventListener('change', () => setActiveLayerOpacity(el, state, layersPanelCallbacks, el.layerOpacityInput.value, true));
  el.toggleGridButton.addEventListener('click', () => {
    el.canvasFrame.classList.toggle('grid');
    el.toggleGridButton.classList.toggle('active', el.canvasFrame.classList.contains('grid'));
  });

  el.toggleSnapButton.addEventListener('click', () => {
    state.snapToGuide = !state.snapToGuide;
    el.toggleSnapButton.classList.toggle('active', state.snapToGuide);
  });

  el.selectionMoveButton.addEventListener('click', () => {
    if (!state.selection.active) return;
    if (!state.selection.floatCanvas) liftSelection(el, state);
    renderSelectionOverlay(el, state);
  });
  el.selectionCutButton.addEventListener('click', () => cutSelection(el, state, doCommit));
  el.selectionClearButton.addEventListener('click', () => {
    flattenSelection(el, state, doCommit);
  });

  el.autoTraceButton.addEventListener('click', () => autoTraceHitbox(el, state));
  el.clearHitboxButton.addEventListener('click', () => {
    state.collision.points = [];
    state.collision.draggingIndex = -1;
    renderHitboxOverlay(el, state);
  });
  el.saveHitboxButton.addEventListener('click', () => {
    vscode.postMessage({ type: 'saveCollision', points: flattenHitboxPoints(el, state) });
  });

  el.rigAngleInput.addEventListener('change', () => setRigAngleFromInput(el, state, doCommit));
  el.resetRigButton.addEventListener('click', () => resetRig(el, state));
  el.addPivotButton.addEventListener('click', () => addPivot(el, state));

  el.canvas.addEventListener('pointerdown', handlePointerDown);
  el.canvas.addEventListener('pointermove', handlePointerMove);
  el.canvas.addEventListener('pointerup', stopDrawing);
  el.canvas.addEventListener('pointercancel', stopDrawing);
  el.canvas.addEventListener('pointerleave', (event) => {
    stopDrawing(event);
    hideCursorOverlay(el);
  });

  document.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (isSelectionTool(state.tool) && state.selection.active) {
      if (event.key === 'Escape') { flattenSelection(el, state, doCommit); event.preventDefault(); }
      if (event.key === 'Delete' || event.key === 'Backspace') { cutSelection(el, state, doCommit); event.preventDefault(); }
    }
  });
  el.canvas.addEventListener('contextmenu', (event) => {
    if (state.tool !== 'hitbox') {
      return;
    }
    event.preventDefault();
    const { x, y } = eventToPixel(el, event);
    deleteNearestHitboxPoint(el, state, x, y);
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'init') {
      state.pendingCollisionPoints = message.collisionPoints;
      loadLayerState(message.layerState, message.filename).then((loaded) => {
        if (!loaded) {
          loadImage(message.dataUri, message.filename);
        }
      });
    }
  });

  renderPalettes(el, () => setTool('pencil'));
  setTool('pencil');
  setBrushSize(el.brushSizeInput.value);
  setZoom(el.zoomInput.value);
  setGuideSize(el.guideSizeSelect.value);
  vscode.postMessage({ type: 'ready' });
})();
