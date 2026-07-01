import { Elements } from './dom';
import { MapCell, TilePaletteSourceWire } from './wireTypes';
import { LoadedTileSource, MapEditorState, cellKey } from './state';

export async function loadSourceImages(
  state: MapEditorState,
  sources: TilePaletteSourceWire[]
): Promise<boolean> {
  const token = ++state.loadToken;
  const loaded = await Promise.all(sources.map((source) => new Promise<LoadedTileSource>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ ...source, image });
    image.onerror = () => reject(new Error(`Unable to load ${source.name}`));
    image.src = source.dataUri;
  })));
  if (token !== state.loadToken) {
    return false;
  }
  state.sources = loaded;
  state.sourceById = new Map(loaded.map((source) => [source.sourceId, source]));
  return true;
}

export function setZoom(el: Elements, state: MapEditorState, value: string): void {
  state.zoom = Math.max(0.2, Math.min(2, Number(value) / 100 || 0.5));
  el.zoomInput.value = String(Math.round(state.zoom * 100));
  el.zoomLabel.value = `${Math.round(state.zoom * 100)}%`;
  if (state.map) {
    el.mapCanvas.style.width = `${el.mapCanvas.width * state.zoom}px`;
    el.mapCanvas.style.height = `${el.mapCanvas.height * state.zoom}px`;
  }
}

export function renderMap(el: Elements, state: MapEditorState): void {
  if (!state.map) {
    return;
  }
  el.mapContext.clearRect(0, 0, el.mapCanvas.width, el.mapCanvas.height);
  el.mapContext.imageSmoothingEnabled = false;

  for (let index = 0; index < state.map.layers.length; index += 1) {
    if (state.hiddenLayers.has(index)) {
      continue;
    }
    const layer = state.map.layers[index];
    for (const cell of layer.cellMap.values()) {
      drawCell(el, state, cell);
    }
  }

  if (el.gridInput.checked) {
    drawGrid(el, state);
  }
}

function drawCell(el: Elements, state: MapEditorState, cell: MapCell): void {
  const source = state.sourceById.get(cell[2]);
  if (!source || !state.map) {
    return;
  }
  const tileSize = state.map.tileSize;
  el.mapContext.drawImage(
    source.image,
    cell[3] * source.regionWidth,
    cell[4] * source.regionHeight,
    source.regionWidth,
    source.regionHeight,
    cell[0] * tileSize,
    cell[1] * tileSize,
    tileSize,
    tileSize
  );
}

function drawGrid(el: Elements, state: MapEditorState): void {
  if (!state.map) {
    return;
  }
  const tileSize = state.map.tileSize;
  el.mapContext.strokeStyle = 'rgba(127, 127, 127, 0.28)';
  el.mapContext.lineWidth = 1;
  for (let x = 0; x <= state.map.width; x += 1) {
    el.mapContext.beginPath();
    el.mapContext.moveTo(x * tileSize + 0.5, 0);
    el.mapContext.lineTo(x * tileSize + 0.5, el.mapCanvas.height);
    el.mapContext.stroke();
  }
  for (let y = 0; y <= state.map.height; y += 1) {
    el.mapContext.beginPath();
    el.mapContext.moveTo(0, y * tileSize + 0.5);
    el.mapContext.lineTo(el.mapCanvas.width, y * tileSize + 0.5);
    el.mapContext.stroke();
  }
}

export function eventToCell(el: Elements, state: MapEditorState, event: PointerEvent): { x: number; y: number } {
  const rect = el.mapCanvas.getBoundingClientRect();
  const pixelX = (event.clientX - rect.left) * el.mapCanvas.width / rect.width;
  const pixelY = (event.clientY - rect.top) * el.mapCanvas.height / rect.height;
  const tileSize = state.map?.tileSize ?? 1;
  return {
    x: Math.floor(pixelX / tileSize),
    y: Math.floor(pixelY / tileSize)
  };
}

export function isValidCell(state: MapEditorState, x: number, y: number): boolean {
  if (!state.map) {
    return false;
  }
  return x >= 0 && y >= 0 && x < state.map.width && y < state.map.height;
}

export function activeLayer(state: MapEditorState) {
  if (!state.map) {
    throw new Error('No map loaded');
  }
  return state.map.layers[state.activeLayer];
}

export function paintCell(state: MapEditorState, x: number, y: number, erase = false): boolean {
  if (!isValidCell(state, x, y)) {
    return false;
  }
  const layer = activeLayer(state);
  const key = cellKey(x, y);
  if (erase) {
    return layer.cellMap.delete(key);
  }
  if (!state.selectedTile) {
    return false;
  }
  const next: MapCell = [
    x,
    y,
    state.selectedTile.sourceId,
    state.selectedTile.atlasX,
    state.selectedTile.atlasY,
    0
  ];
  const previous = layer.cellMap.get(key);
  if (previous && previous.slice(2, 6).every((value, index) => value === next[index + 2])) {
    return false;
  }
  layer.cellMap.set(key, next);
  return true;
}

export function fillCells(state: MapEditorState, startX: number, startY: number): boolean {
  if (!isValidCell(state, startX, startY) || !state.selectedTile) {
    return false;
  }
  const layer = activeLayer(state);
  const target = layer.cellMap.get(cellKey(startX, startY));
  const targetId = target ? target.slice(2, 6).join(':') : '';
  const replacementId = [
    state.selectedTile.sourceId,
    state.selectedTile.atlasX,
    state.selectedTile.atlasY,
    0
  ].join(':');
  if (targetId === replacementId) {
    return false;
  }

  const stack: Array<[number, number]> = [[startX, startY]];
  const visited = new Set<string>();
  let changed = false;
  while (stack.length) {
    const next = stack.pop();
    if (!next) {
      break;
    }
    const [x, y] = next;
    const key = cellKey(x, y);
    if (!isValidCell(state, x, y) || visited.has(key)) {
      continue;
    }
    visited.add(key);
    const current = layer.cellMap.get(key);
    const currentId = current ? current.slice(2, 6).join(':') : '';
    if (currentId !== targetId) {
      continue;
    }
    changed = paintCell(state, x, y) || changed;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return changed;
}
