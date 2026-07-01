import { Elements } from './dom';
import { LoadedTileSource, MapEditorState, SelectedTile } from './state';

export function activeSource(el: Elements, state: MapEditorState): LoadedTileSource | undefined {
  return state.sourceById.get(Number(el.sourceSelect.value));
}

export function renderSourceOptions(el: Elements, state: MapEditorState): void {
  el.sourceSelect.replaceChildren();
  for (const source of state.sources) {
    const option = document.createElement('option');
    option.value = String(source.sourceId);
    option.textContent = `${source.sourceId}: ${source.name} (${source.regionWidth}px)`;
    el.sourceSelect.append(option);
  }
  if (state.sources[0]) {
    el.sourceSelect.value = String(state.sources[0].sourceId);
    renderPalette(el, state);
  }
}

export function renderPalette(el: Elements, state: MapEditorState): void {
  const source = activeSource(el, state);
  if (!source) {
    return;
  }
  el.paletteCanvas.width = source.image.naturalWidth;
  el.paletteCanvas.height = source.image.naturalHeight;
  el.paletteContext.imageSmoothingEnabled = false;
  el.paletteContext.clearRect(0, 0, el.paletteCanvas.width, el.paletteCanvas.height);
  el.paletteContext.drawImage(source.image, 0, 0);
  el.paletteContext.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  el.paletteContext.lineWidth = 1;
  for (let x = 0; x <= source.columns; x += 1) {
    el.paletteContext.beginPath();
    el.paletteContext.moveTo(x * source.regionWidth + 0.5, 0);
    el.paletteContext.lineTo(x * source.regionWidth + 0.5, el.paletteCanvas.height);
    el.paletteContext.stroke();
  }
  for (let y = 0; y <= source.rows; y += 1) {
    el.paletteContext.beginPath();
    el.paletteContext.moveTo(0, y * source.regionHeight + 0.5);
    el.paletteContext.lineTo(el.paletteCanvas.width, y * source.regionHeight + 0.5);
    el.paletteContext.stroke();
  }
  drawPaletteSelection(el, state);
}

function drawPaletteSelection(el: Elements, state: MapEditorState): void {
  const source = activeSource(el, state);
  const selected = state.selectedTile;
  if (!source || !selected || selected.sourceId !== source.sourceId) {
    return;
  }
  el.paletteContext.strokeStyle = '#ffcc00';
  el.paletteContext.lineWidth = 3;
  el.paletteContext.strokeRect(
    selected.atlasX * source.regionWidth + 1.5,
    selected.atlasY * source.regionHeight + 1.5,
    source.regionWidth - 3,
    source.regionHeight - 3
  );
}

export function selectPaletteTile(el: Elements, state: MapEditorState, event: MouseEvent): SelectedTile | undefined {
  const source = activeSource(el, state);
  if (!source) {
    return undefined;
  }
  const rect = el.paletteCanvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) * el.paletteCanvas.width / rect.width);
  const y = Math.floor((event.clientY - rect.top) * el.paletteCanvas.height / rect.height);
  const atlasX = Math.floor(x / source.regionWidth);
  const atlasY = Math.floor(y / source.regionHeight);
  if (atlasX < 0 || atlasY < 0 || atlasX >= source.columns || atlasY >= source.rows) {
    return undefined;
  }
  const selected: SelectedTile = { sourceId: source.sourceId, atlasX, atlasY };
  state.selectedTile = selected;
  el.selectionStatus.textContent = `Source ${source.sourceId} · atlas ${atlasX}, ${atlasY}`;
  renderPalette(el, state);
  return selected;
}
