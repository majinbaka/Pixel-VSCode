import { queryElements, Elements } from './dom';
import { createInitialState, MapEditorState, serializeMap, toMapModel, Tool } from './state';
import {
  eventToCell,
  fillCells,
  isValidCell,
  loadSourceImages,
  paintCell,
  renderMap,
  setZoom
} from './canvas';
import { renderPalette, renderSourceOptions, selectPaletteTile } from './palettePanel';
import { addLayer, deleteLayer, renderLayers } from './layersPanel';
import { MapEditorInboundMessage, PixelMapDataWire, TilePaletteSourceWire, VsCodeApi } from './wireTypes';

declare const acquireVsCodeApi: () => VsCodeApi;

(function main() {
  const vscode = acquireVsCodeApi();
  const el: Elements = queryElements();
  const state: MapEditorState = createInitialState();

  function postEdit(label: string): void {
    if (!state.map) {
      return;
    }
    vscode.postMessage({ type: 'edit', label, map: serializeMap(state.map) });
  }

  function setTool(tool: Tool): void {
    state.tool = tool;
    for (const button of el.toolButtons) {
      button.classList.toggle('active', button.dataset.tool === tool);
    }
  }

  function renderLayersPanel(): void {
    renderLayers(el, state, {
      onToggleVisibility: () => renderMap(el, state),
      onRenameLayer: () => postEdit('Rename map layer'),
      onSelectLayer: (index) => {
        state.activeLayer = index;
        renderLayersPanel();
      }
    });
  }

  async function initialize(map: PixelMapDataWire, sources: TilePaletteSourceWire[]): Promise<void> {
    state.map = toMapModel(map);
    state.activeLayer = 0;
    state.hiddenLayers.clear();
    state.selectedTile = undefined;
    el.mapStatus.textContent = `${state.map.name} · ${state.map.width}x${state.map.height} · ${state.map.tileSize}px`;
    el.mapCanvas.width = state.map.width * state.map.tileSize;
    el.mapCanvas.height = state.map.height * state.map.tileSize;
    setZoom(el, state, el.zoomInput.value);

    try {
      if (!await loadSourceImages(state, sources)) {
        return;
      }
      renderSourceOptions(el, state);
      renderLayersPanel();
      renderMap(el, state);
    } catch (error) {
      el.mapStatus.textContent = error instanceof Error ? error.message : 'Unable to load TileSet';
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    if (!state.map || event.button !== 0) {
      return;
    }
    const { x, y } = eventToCell(el, state, event);
    if (!isValidCell(state, x, y)) {
      return;
    }
    if (state.tool === 'fill') {
      if (fillCells(state, x, y)) {
        renderMap(el, state);
        postEdit('Fill map layer');
      }
      return;
    }

    state.drawing = true;
    state.pointerId = event.pointerId;
    state.lastCell = `${x},${y}`;
    state.changedInStroke = paintCell(state, x, y, state.tool === 'erase');
    el.mapCanvas.setPointerCapture(event.pointerId);
    renderMap(el, state);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!state.map) {
      return;
    }
    const { x, y } = eventToCell(el, state, event);
    el.cellStatus.textContent = `${x}, ${y}`;
    if (!state.drawing || event.pointerId !== state.pointerId || !isValidCell(state, x, y)) {
      return;
    }
    const key = `${x},${y}`;
    if (key === state.lastCell) {
      return;
    }
    state.lastCell = key;
    state.changedInStroke = paintCell(state, x, y, state.tool === 'erase') || state.changedInStroke;
    renderMap(el, state);
  }

  function stopDrawing(event: PointerEvent): void {
    if (!state.drawing || event.pointerId !== state.pointerId) {
      return;
    }
    state.drawing = false;
    state.pointerId = undefined;
    state.lastCell = '';
    if (state.changedInStroke) {
      postEdit(state.tool === 'erase' ? 'Erase map tiles' : 'Paint map tiles');
    }
    state.changedInStroke = false;
  }

  for (const button of el.toolButtons) {
    button.addEventListener('click', () => setTool((button.dataset.tool as Tool) ?? 'paint'));
  }
  el.sourceSelect.addEventListener('change', () => renderPalette(el, state));
  el.paletteCanvas.addEventListener('click', (event) => {
    if (selectPaletteTile(el, state, event)) {
      setTool('paint');
    }
  });
  el.zoomInput.addEventListener('input', () => setZoom(el, state, el.zoomInput.value));
  el.gridInput.addEventListener('change', () => renderMap(el, state));
  el.saveButton.addEventListener('click', () => vscode.postMessage({ type: 'save' }));
  el.exportButton.addEventListener('click', () => vscode.postMessage({ type: 'export' }));
  el.addLayerButton.addEventListener('click', () => {
    if (addLayer(state)) {
      renderLayersPanel();
      renderMap(el, state);
      postEdit('Add map layer');
    }
  });
  el.deleteLayerButton.addEventListener('click', () => {
    if (deleteLayer(state)) {
      renderLayersPanel();
      renderMap(el, state);
      postEdit('Delete map layer');
    }
  });
  el.mapCanvas.addEventListener('pointerdown', handlePointerDown);
  el.mapCanvas.addEventListener('pointermove', handlePointerMove);
  el.mapCanvas.addEventListener('pointerup', stopDrawing);
  el.mapCanvas.addEventListener('pointercancel', stopDrawing);
  el.mapCanvas.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('message', (event: MessageEvent<MapEditorInboundMessage>) => {
    if (event.data.type === 'init') {
      void initialize(event.data.map, event.data.sources);
    }
  });

  setTool('paint');
  setZoom(el, state, el.zoomInput.value);
  vscode.postMessage({ type: 'ready' });
}());
