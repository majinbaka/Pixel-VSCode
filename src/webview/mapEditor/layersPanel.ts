import { Elements } from './dom';
import { MapEditorState } from './state';

export interface LayersPanelCallbacks {
  onToggleVisibility(): void;
  onRenameLayer(): void;
  onSelectLayer(index: number): void;
}

export function renderLayers(el: Elements, state: MapEditorState, callbacks: LayersPanelCallbacks): void {
  if (!state.map) {
    return;
  }
  el.layersList.replaceChildren();
  state.map.layers.forEach((layer, index) => {
    const row = document.createElement('div');
    row.className = 'layer-row';
    row.classList.toggle('active', index === state.activeLayer);

    const visibility = document.createElement('button');
    visibility.className = 'icon-button';
    visibility.type = 'button';
    visibility.textContent = state.hiddenLayers.has(index) ? '○' : '●';
    visibility.title = 'Toggle preview visibility';
    visibility.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.hiddenLayers.has(index)) {
        state.hiddenLayers.delete(index);
      } else {
        state.hiddenLayers.add(index);
      }
      callbacks.onToggleVisibility();
    });

    const name = document.createElement('input');
    name.type = 'text';
    name.value = layer.name;
    name.addEventListener('click', (event) => event.stopPropagation());
    name.addEventListener('change', () => {
      const value = name.value.trim();
      if (value && value !== layer.name) {
        layer.name = value;
        callbacks.onRenameLayer();
      }
    });

    const count = document.createElement('span');
    count.className = 'layer-count';
    count.textContent = String(layer.cellMap.size);

    row.append(visibility, name, count);
    row.addEventListener('click', () => callbacks.onSelectLayer(index));
    el.layersList.append(row);
  });
  el.deleteLayerButton.disabled = state.map.layers.length <= 1;
}

export function addLayer(state: MapEditorState): boolean {
  if (!state.map) {
    return false;
  }
  const name = window.prompt('Layer name', `Layer ${state.map.layers.length + 1}`);
  if (!name?.trim()) {
    return false;
  }
  const lastZ = state.map.layers.at(-1)?.zIndex ?? -20;
  state.map.layers.push({
    name: name.trim(),
    zIndex: lastZ + 1,
    cellMap: new Map()
  });
  state.activeLayer = state.map.layers.length - 1;
  return true;
}

export function deleteLayer(state: MapEditorState): boolean {
  if (!state.map || state.map.layers.length <= 1) {
    return false;
  }
  const layer = state.map.layers[state.activeLayer];
  if (!window.confirm(`Delete layer "${layer.name}"?`)) {
    return false;
  }
  state.map.layers.splice(state.activeLayer, 1);
  state.hiddenLayers.clear();
  state.activeLayer = Math.max(0, state.activeLayer - 1);
  return true;
}
