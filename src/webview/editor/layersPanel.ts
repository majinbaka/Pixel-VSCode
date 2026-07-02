import { Elements } from './dom';
import { EditorState } from './state';
import { createLayer, createLayerCanvas, getActiveLayer, loadImageElement, renderComposite } from './canvasCore';
import { renderPivotsPanel, renderRigOverlay } from './rig';

type CommitFn = (label: string) => void;

export interface LayersPanelCallbacks {
  onCommit: CommitFn;
  onSetActiveLayer: (id: string) => void;
}

export async function importLayerImages(
  el: Elements,
  state: EditorState,
  callbacks: LayersPanelCallbacks,
  images: { name: string; dataUri: string }[]
): Promise<void> {
  if (images.length === 0) {
    return;
  }

  const loaded = await Promise.all(images.map((image) => loadImageElement(image.dataUri)));

  for (let index = 0; index < loaded.length; index += 1) {
    const sourceCanvas = createLayerCanvas(el.canvas.width, el.canvas.height);
    sourceCanvas.getContext('2d')!.drawImage(loaded[index], 0, 0, el.canvas.width, el.canvas.height);
    const layer = createLayer(el, state, images[index].name.replace(/\.[^.]+$/, ''), sourceCanvas);
    state.layers.push(layer);
    state.activeLayerId = layer.id;
  }

  renderLayersPanel(el, state, callbacks);
  renderComposite(el, state);
  renderPivotsPanel(el, state);
  renderRigOverlay(el, state);
  callbacks.onCommit(images.length > 1 ? 'Import layer images' : 'Import layer image');
}

export function collectAnimationFrames(state: EditorState): { name: string; dataUri: string }[] {
  return state.layers
    .filter((layer) => layer.visible)
    .map((layer) => ({
      name: layer.name,
      dataUri: layer.canvas.toDataURL('image/png')
    }));
}

export function addLayer(el: Elements, state: EditorState, callbacks: LayersPanelCallbacks): void {
  const layer = createLayer(el, state, `Layer ${state.layers.length + 1}`);
  state.layers.push(layer);
  state.activeLayerId = layer.id;
  renderLayersPanel(el, state, callbacks);
  renderComposite(el, state);
  renderPivotsPanel(el, state);
  renderRigOverlay(el, state);
  callbacks.onCommit('Add layer');
}

export function duplicateLayer(el: Elements, state: EditorState, callbacks: LayersPanelCallbacks): void {
  const activeLayer = getActiveLayer(state);
  if (!activeLayer) {
    return;
  }

  const layer = createLayer(el, state, `${activeLayer.name} copy`, activeLayer.canvas);
  const index = state.layers.findIndex((item) => item.id === activeLayer.id);
  state.layers.splice(index + 1, 0, layer);
  state.activeLayerId = layer.id;
  renderLayersPanel(el, state, callbacks);
  renderComposite(el, state);
  renderPivotsPanel(el, state);
  renderRigOverlay(el, state);
  callbacks.onCommit('Duplicate layer');
}

export function deleteLayer(el: Elements, state: EditorState, callbacks: LayersPanelCallbacks): void {
  if (state.layers.length <= 1) {
    return;
  }

  const index = state.layers.findIndex((layer) => layer.id === state.activeLayerId);
  if (index < 0) {
    return;
  }

  state.layers.splice(index, 1);
  state.activeLayerId = state.layers[Math.max(0, index - 1)].id;
  renderLayersPanel(el, state, callbacks);
  renderComposite(el, state);
  renderPivotsPanel(el, state);
  renderRigOverlay(el, state);
  callbacks.onCommit('Delete layer');
}

function drawLayerInto(targetCtx: CanvasRenderingContext2D, layer: EditorState['layers'][number]): void {
  targetCtx.save();
  targetCtx.globalAlpha = layer.opacity;
  for (const pivot of layer.rig.pivots) {
    if (pivot.angle) {
      targetCtx.translate(pivot.x, pivot.y);
      targetCtx.rotate(pivot.angle);
      targetCtx.translate(-pivot.x, -pivot.y);
    }
  }
  targetCtx.drawImage(layer.canvas, 0, 0);
  targetCtx.restore();
}

export function mergeLayerDown(el: Elements, state: EditorState, callbacks: LayersPanelCallbacks): void {
  const index = state.layers.findIndex((layer) => layer.id === state.activeLayerId);
  if (index <= 0) {
    return;
  }

  const activeLayer = state.layers[index];
  const belowLayer = state.layers[index - 1];

  const mergedCanvas = createLayerCanvas(el.canvas.width, el.canvas.height);
  const mergedCtx = mergedCanvas.getContext('2d')!;
  mergedCtx.imageSmoothingEnabled = false;
  drawLayerInto(mergedCtx, belowLayer);
  drawLayerInto(mergedCtx, activeLayer);

  belowLayer.canvas = mergedCanvas;
  belowLayer.opacity = 1;
  belowLayer.rig.pivots.forEach((pivot) => { pivot.angle = 0; });

  state.layers.splice(index, 1);
  state.activeLayerId = belowLayer.id;
  renderLayersPanel(el, state, callbacks);
  renderComposite(el, state);
  renderPivotsPanel(el, state);
  renderRigOverlay(el, state);
  callbacks.onCommit('Merge layer down');
}

export function moveLayer(el: Elements, state: EditorState, callbacks: LayersPanelCallbacks, offset: number): void {
  const index = state.layers.findIndex((layer) => layer.id === state.activeLayerId);
  const nextIndex = index + offset;
  if (index < 0 || nextIndex < 0 || nextIndex >= state.layers.length) {
    return;
  }

  const [layer] = state.layers.splice(index, 1);
  state.layers.splice(nextIndex, 0, layer);
  renderLayersPanel(el, state, callbacks);
  renderComposite(el, state);
  callbacks.onCommit(offset > 0 ? 'Move layer up' : 'Move layer down');
}

export function toggleLayerVisibility(el: Elements, state: EditorState, callbacks: LayersPanelCallbacks, id: string): void {
  const layer = state.layers.find((item) => item.id === id);
  if (!layer) {
    return;
  }

  layer.visible = !layer.visible;
  renderLayersPanel(el, state, callbacks);
  renderComposite(el, state);
  callbacks.onCommit(layer.visible ? 'Show layer' : 'Hide layer');
}

export function setActiveLayerOpacity(
  el: Elements,
  state: EditorState,
  callbacks: LayersPanelCallbacks,
  value: string,
  shouldCommit: boolean
): void {
  const layer = getActiveLayer(state);
  if (!layer) {
    return;
  }

  const opacity = Math.max(0, Math.min(100, Number(value) || 0));
  layer.opacity = opacity / 100;
  el.layerOpacityInput.value = String(opacity);
  el.layerOpacityLabel.value = `${opacity}%`;
  renderLayersPanel(el, state, callbacks);
  renderComposite(el, state);
  if (shouldCommit) {
    callbacks.onCommit('Change layer opacity');
  }
}

export function renameLayer(el: Elements, state: EditorState, callbacks: LayersPanelCallbacks, id: string, value: string): void {
  const layer = state.layers.find((item) => item.id === id);
  if (!layer) {
    return;
  }

  const name = value.trim();
  if (!name || name === layer.name) {
    renderLayersPanel(el, state, callbacks);
    return;
  }

  layer.name = name;
  renderLayersPanel(el, state, callbacks);
}

export function renderLayersPanel(el: Elements, state: EditorState, callbacks: LayersPanelCallbacks): void {
  el.layersList.replaceChildren();

  const activeLayer = getActiveLayer(state);
  const activeOpacity = activeLayer ? Math.round(activeLayer.opacity * 100) : 100;
  el.layerOpacityInput.value = String(activeOpacity);
  el.layerOpacityLabel.value = `${activeOpacity}%`;

  for (let index = state.layers.length - 1; index >= 0; index -= 1) {
    const layer = state.layers[index];
    const row = document.createElement('div');
    row.className = 'layer-row';
    row.classList.toggle('active', layer.id === state.activeLayerId);
    row.dataset.layerId = layer.id;

    const visibility = document.createElement('button');
    visibility.className = 'icon-button layer-visibility';
    visibility.type = 'button';
    visibility.title = layer.visible ? 'Hide layer' : 'Show layer';
    visibility.setAttribute('aria-label', visibility.title);
    visibility.textContent = layer.visible ? '👁️' : '🚫';
    visibility.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleLayerVisibility(el, state, callbacks, layer.id);
    });

    const name = document.createElement('input');
    name.className = 'layer-name-input';
    name.type = 'text';
    name.value = layer.name;
    name.title = 'Layer name';
    name.addEventListener('click', (event) => event.stopPropagation());
    name.addEventListener('change', () => renameLayer(el, state, callbacks, layer.id, name.value));
    name.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        name.blur();
      }
    });

    const opacity = document.createElement('span');
    opacity.className = 'layer-opacity';
    opacity.textContent = `${Math.round(layer.opacity * 100)}%`;

    row.append(visibility, name, opacity);
    row.addEventListener('click', () => callbacks.onSetActiveLayer(layer.id));
    el.layersList.append(row);
  }

  el.deleteLayerButton.disabled = state.layers.length <= 1;
  const activeIndex = state.layers.findIndex((layer) => layer.id === state.activeLayerId);
  el.moveLayerDownButton.disabled = activeIndex <= 0;
  el.moveLayerUpButton.disabled = activeIndex === -1 || activeIndex >= state.layers.length - 1;
  el.mergeLayerDownButton.disabled = activeIndex <= 0;
}
