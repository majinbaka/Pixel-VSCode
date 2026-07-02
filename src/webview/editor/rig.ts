import { Elements } from './dom';
import { EditorState, Layer, Pivot } from './state';
import { createLayerCanvas, createPivot, getActiveLayer, getActivePivot, renderComposite } from './canvasCore';

function snapAngleToDegree(angle: number): number {
  return Math.round((angle * 180) / Math.PI) * (Math.PI / 180);
}

function snapToGuide(state: EditorState, value: number): number {
  if (!state.snapToGuide || state.guideSize <= 1) return Math.round(value);
  return Math.round(value / state.guideSize) * state.guideSize;
}

export function rigHandleDistance(el: Elements): number {
  return Math.max(el.canvas.width, el.canvas.height) / 4;
}

export function rigHandlePosition(el: Elements, pivot: Pivot): { x: number; y: number } {
  const distance = rigHandleDistance(el);
  return {
    x: pivot.x + Math.cos(pivot.angle - Math.PI / 2) * distance,
    y: pivot.y + Math.sin(pivot.angle - Math.PI / 2) * distance
  };
}

export function renderPivotsPanel(el: Elements, state: EditorState): void {
  if (!el.pivotsList) {
    return;
  }

  el.pivotsList.replaceChildren();
  const layer = getActiveLayer(state);
  if (!layer) {
    return;
  }

  for (const pivot of layer.rig.pivots) {
    const item = document.createElement('div');
    item.className = 'pivot-item';
    item.classList.toggle('active', pivot.id === layer.rig.activePivotId);
    item.dataset.pivotId = pivot.id;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'pivot-name';
    nameSpan.textContent = pivot.name;
    item.append(nameSpan);

    if (layer.rig.pivots.length > 1) {
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'icon-button pivot-delete';
      deleteButton.title = 'Delete pivot';
      deleteButton.setAttribute('aria-label', 'Delete pivot');
      deleteButton.textContent = '×';
      deleteButton.addEventListener('click', (event) => {
        event.stopPropagation();
        deletePivot(el, state, pivot.id);
      });
      item.append(deleteButton);
    }

    item.addEventListener('click', () => setActivePivot(el, state, pivot.id));
    el.pivotsList.append(item);
  }
}

export function setActivePivot(el: Elements, state: EditorState, pivotId: string): void {
  const layer = getActiveLayer(state);
  if (!layer || !layer.rig.pivots.some((pivot) => pivot.id === pivotId)) {
    return;
  }

  layer.rig.activePivotId = pivotId;
  updateRigAngleInput(el, state, layer);
  renderPivotsPanel(el, state);
  renderRigOverlay(el, state);
}

export function addPivot(el: Elements, state: EditorState): void {
  const layer = getActiveLayer(state);
  if (!layer) {
    return;
  }

  const pivot = createPivot(state, el.canvas.width / 2, el.canvas.height / 2);
  layer.rig.pivots.push(pivot);
  layer.rig.activePivotId = pivot.id;
  updateRigAngleInput(el, state, layer);
  renderPivotsPanel(el, state);
  renderRigOverlay(el, state);
}

export function deletePivot(el: Elements, state: EditorState, pivotId: string): void {
  const layer = getActiveLayer(state);
  if (!layer || layer.rig.pivots.length <= 1) {
    return;
  }

  const index = layer.rig.pivots.findIndex((pivot) => pivot.id === pivotId);
  if (index < 0) {
    return;
  }

  layer.rig.pivots.splice(index, 1);
  if (layer.rig.activePivotId === pivotId) {
    layer.rig.activePivotId = layer.rig.pivots[Math.max(0, index - 1)].id;
  }

  updateRigAngleInput(el, state, layer);
  renderComposite(el, state);
  renderPivotsPanel(el, state);
  renderRigOverlay(el, state);
}

export function renderRigOverlay(el: Elements, state: EditorState): void {
  if (!state.ready) {
    return;
  }

  el.rigOverlay.setAttribute('viewBox', `0 0 ${el.canvas.width} ${el.canvas.height}`);
  el.rigOverlay.replaceChildren();

  if (state.tool !== 'rig') {
    return;
  }

  const layer = getActiveLayer(state);
  if (!layer) {
    return;
  }

  const pivotRadius = Math.max(0.75, 6 / state.zoom);
  const handleRadius = Math.max(0.5, 4 / state.zoom);

  for (const pivot of layer.rig.pivots) {
    const isActive = pivot.id === layer.rig.activePivotId;
    const handle = rigHandlePosition(el, pivot);

    if (isActive) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(pivot.x));
      line.setAttribute('y1', String(pivot.y));
      line.setAttribute('x2', String(handle.x));
      line.setAttribute('y2', String(handle.y));
      line.setAttribute('class', 'rig-line');
      el.rigOverlay.append(line);

      const handlePoint = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      handlePoint.setAttribute('cx', String(handle.x));
      handlePoint.setAttribute('cy', String(handle.y));
      handlePoint.setAttribute('r', String(handleRadius));
      handlePoint.setAttribute('class', 'rig-handle');
      el.rigOverlay.append(handlePoint);
    }

    const pivotPoint = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pivotPoint.setAttribute('cx', String(pivot.x));
    pivotPoint.setAttribute('cy', String(pivot.y));
    pivotPoint.setAttribute('r', String(pivotRadius));
    pivotPoint.setAttribute('class', isActive ? 'rig-pivot' : 'rig-pivot inactive');
    el.rigOverlay.append(pivotPoint);
  }
}

export function updateRigAngleInput(el: Elements, state: EditorState, layer?: Layer): void {
  const pivot = getActivePivot(state, layer);
  const degrees = pivot ? Math.round((pivot.angle * 180) / Math.PI) : 0;
  el.rigAngleInput.value = String(degrees);
}

export function setRigAngleFromInput(el: Elements, state: EditorState, onCommit: (label: string) => void): void {
  const layer = getActiveLayer(state);
  const pivot = getActivePivot(state, layer);
  if (!layer || !pivot) {
    return;
  }

  const degrees = Number(el.rigAngleInput.value) || 0;
  pivot.angle = (degrees * Math.PI) / 180;
  renderComposite(el, state);
  renderRigOverlay(el, state);
  if (bakeRigRotation(el, state, layer)) {
    onCommit('Rotate layer');
  }
}

export function handleRigPointerDown(el: Elements, state: EditorState, x: number, y: number): void {
  const layer = getActiveLayer(state);
  const pivot = getActivePivot(state, layer);
  if (!layer || !pivot) {
    return;
  }

  const threshold = 10 / state.zoom;
  const handle = rigHandlePosition(el, pivot);
  const distanceToHandle = Math.hypot(handle.x - x, handle.y - y);
  const distanceToPivot = Math.hypot(pivot.x - x, pivot.y - y);

  const otherPivot = layer.rig.pivots.find(
    (candidate) => candidate.id !== pivot.id && Math.hypot(candidate.x - x, candidate.y - y) <= threshold
  );

  if (distanceToHandle <= threshold) {
    state.rig.dragMode = 'rotate';
  } else if (distanceToPivot <= threshold) {
    state.rig.dragMode = 'pivot';
  } else if (otherPivot) {
    setActivePivot(el, state, otherPivot.id);
    return;
  } else {
    state.rig.dragMode = 'rotate';
    const dx = x - pivot.x;
    const dy = y - pivot.y;
    pivot.angle = snapAngleToDegree(Math.atan2(dy, dx) + Math.PI / 2);
    updateRigAngleInput(el, state, layer);
    renderComposite(el, state);
  }

  renderRigOverlay(el, state);
}

export function handleRigPointerMove(el: Elements, state: EditorState, x: number, y: number): void {
  if (!state.rig.dragMode) {
    return;
  }

  const layer = getActiveLayer(state);
  const pivot = getActivePivot(state, layer);
  if (!layer || !pivot) {
    return;
  }

  if (state.rig.dragMode === 'pivot') {
    pivot.x = snapToGuide(state, x);
    pivot.y = snapToGuide(state, y);
  } else if (state.rig.dragMode === 'rotate') {
    const dx = x - pivot.x;
    const dy = y - pivot.y;
    pivot.angle = snapAngleToDegree(Math.atan2(dy, dx) + Math.PI / 2);
    updateRigAngleInput(el, state, layer);
  }

  renderComposite(el, state);
  renderRigOverlay(el, state);
}

function rotateNearestNeighbor(
  source: CanvasRenderingContext2D,
  width: number,
  height: number,
  pivotX: number,
  pivotY: number,
  angle: number,
  blockSize: number
): ImageData {
  const src = source.getImageData(0, 0, width, height);
  const dst = source.createImageData(width, height);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const step = Math.max(1, Math.floor(blockSize));

  for (let by = 0; by < height; by += step) {
    for (let bx = 0; bx < width; bx += step) {
      const relX = bx + step / 2 - pivotX;
      const relY = by + step / 2 - pivotY;
      const srcCenterX = pivotX + (relX * cos - relY * sin);
      const srcCenterY = pivotY + (relX * sin + relY * cos);
      if (srcCenterX < 0 || srcCenterX >= width || srcCenterY < 0 || srcCenterY >= height) {
        continue;
      }
      const maxBx = Math.max(0, Math.floor((width - 1) / step) * step);
      const maxBy = Math.max(0, Math.floor((height - 1) / step) * step);
      const srcBx = Math.min(maxBx, Math.floor(srcCenterX / step) * step);
      const srcBy = Math.min(maxBy, Math.floor(srcCenterY / step) * step);
      const sampleX = Math.min(width - 1, srcBx + Math.floor(step / 2));
      const sampleY = Math.min(height - 1, srcBy + Math.floor(step / 2));
      const sampleIndex = (sampleY * width + sampleX) * 4;
      const r = src.data[sampleIndex];
      const g = src.data[sampleIndex + 1];
      const b = src.data[sampleIndex + 2];
      const a = src.data[sampleIndex + 3];

      for (let oy = 0; oy < step && by + oy < height; oy++) {
        for (let ox = 0; ox < step && bx + ox < width; ox++) {
          const dstIndex = ((by + oy) * width + (bx + ox)) * 4;
          dst.data[dstIndex] = r;
          dst.data[dstIndex + 1] = g;
          dst.data[dstIndex + 2] = b;
          dst.data[dstIndex + 3] = a;
        }
      }
    }
  }

  return dst;
}

export function bakeRigRotation(el: Elements, state: EditorState, layer: Layer | undefined): boolean {
  if (!layer || !layer.rig.pivots.some((pivot) => pivot.angle)) {
    return false;
  }

  const width = el.canvas.width;
  const height = el.canvas.height;
  const blockSize = state.snapToGuide && state.guideSize > 1 ? state.guideSize : 1;
  let sourceCanvas = layer.canvas;

  for (const pivot of layer.rig.pivots) {
    if (!pivot.angle) continue;
    const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })!;
    const rotatedData = rotateNearestNeighbor(sourceCtx, width, height, pivot.x, pivot.y, pivot.angle, blockSize);
    const nextCanvas = createLayerCanvas(width, height);
    nextCanvas.getContext('2d')!.putImageData(rotatedData, 0, 0);
    sourceCanvas = nextCanvas;
  }

  layer.canvas = sourceCanvas;
  for (const pivot of layer.rig.pivots) {
    pivot.angle = 0;
  }
  updateRigAngleInput(el, state, layer);
  renderComposite(el, state);
  renderRigOverlay(el, state);
  return true;
}

export function resetRig(el: Elements, state: EditorState): void {
  const layer = getActiveLayer(state);
  const pivot = getActivePivot(state, layer);
  if (!layer || !pivot) {
    return;
  }

  pivot.x = el.canvas.width / 2;
  pivot.y = el.canvas.height / 2;
  pivot.angle = 0;
  updateRigAngleInput(el, state, layer);
  renderComposite(el, state);
  renderRigOverlay(el, state);
}
