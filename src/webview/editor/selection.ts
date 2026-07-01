import { Elements } from './dom';
import { EditorState } from './state';
import { createLayerCanvas, getActiveLayer, renderComposite } from './canvasCore';

export function clearSelection(el: Elements, state: EditorState): void {
  state.selection.active = false;
  state.selection.isDrawing = false;
  state.selection.isDraggingContent = false;
  state.selection.lassoPoints = [];
  state.selection.floatCanvas = null;
  renderSelectionOverlay(el, state);
  updateSelectionButtons(el, state);
}

export function updateSelectionButtons(el: Elements, state: EditorState): void {
  const has = state.selection.active;
  el.selectionMoveButton.disabled = !has;
  el.selectionCutButton.disabled = !has;
  el.selectionClearButton.disabled = !has;
}

function applySelectionMask(state: EditorState, targetCtx: CanvasRenderingContext2D): void {
  const sel = state.selection;
  targetCtx.save();
  if (sel.shape === 'lasso') {
    if (sel.lassoPoints.length < 2) { targetCtx.restore(); return; }
    targetCtx.beginPath();
    targetCtx.moveTo(sel.lassoPoints[0].x, sel.lassoPoints[0].y);
    for (let i = 1; i < sel.lassoPoints.length; i++) {
      targetCtx.lineTo(sel.lassoPoints[i].x, sel.lassoPoints[i].y);
    }
    targetCtx.closePath();
  } else if (sel.shape === 'ellipse') {
    const cx = sel.x + sel.w / 2;
    const cy = sel.y + sel.h / 2;
    targetCtx.beginPath();
    targetCtx.ellipse(cx, cy, Math.abs(sel.w / 2), Math.abs(sel.h / 2), 0, 0, Math.PI * 2);
  } else {
    targetCtx.beginPath();
    targetCtx.rect(sel.x, sel.y, sel.w, sel.h);
  }
  targetCtx.clip();
}

export function selectionBounds(state: EditorState): { x1: number; y1: number; x2: number; y2: number } {
  const sel = state.selection;
  if (sel.shape === 'lasso') {
    if (!sel.lassoPoints.length) return { x1: 0, y1: 0, x2: 0, y2: 0 };
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of sel.lassoPoints) {
      if (p.x < x1) x1 = p.x;
      if (p.y < y1) y1 = p.y;
      if (p.x > x2) x2 = p.x;
      if (p.y > y2) y2 = p.y;
    }
    return { x1: Math.floor(x1), y1: Math.floor(y1), x2: Math.ceil(x2), y2: Math.ceil(y2) };
  }
  const x1 = sel.w >= 0 ? sel.x : sel.x + sel.w;
  const y1 = sel.h >= 0 ? sel.y : sel.y + sel.h;
  const x2 = sel.w >= 0 ? sel.x + sel.w : sel.x;
  const y2 = sel.h >= 0 ? sel.y + sel.h : sel.y;
  return { x1: Math.floor(x1), y1: Math.floor(y1), x2: Math.ceil(x2), y2: Math.ceil(y2) };
}

function pointInPolygon(x: number, y: number, pts: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isInsideSelection(state: EditorState, x: number, y: number): boolean {
  const sel = state.selection;
  if (!sel.active) return false;
  if (sel.shape === 'lasso') {
    return pointInPolygon(x, y, sel.lassoPoints);
  }
  const b = selectionBounds(state);
  if (x < b.x1 || x >= b.x2 || y < b.y1 || y >= b.y2) return false;
  if (sel.shape === 'ellipse') {
    const cx = (b.x1 + b.x2) / 2;
    const cy = (b.y1 + b.y2) / 2;
    const rx = (b.x2 - b.x1) / 2;
    const ry = (b.y2 - b.y1) / 2;
    if (rx <= 0 || ry <= 0) return false;
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  }
  return true;
}

export function liftSelection(el: Elements, state: EditorState): void {
  const sel = state.selection;
  if (sel.floatCanvas) return;
  const layer = getActiveLayer(state);
  if (!layer) return;

  const bounds = selectionBounds(state);
  const floatW = bounds.x2 - bounds.x1;
  const floatH = bounds.y2 - bounds.y1;
  if (floatW <= 0 || floatH <= 0) return;

  const floatCanvas = createLayerCanvas(floatW, floatH);
  const floatCtx = floatCanvas.getContext('2d')!;
  floatCtx.save();
  floatCtx.translate(-bounds.x1, -bounds.y1);
  applySelectionMask(state, floatCtx);
  floatCtx.drawImage(layer.canvas, 0, 0);
  floatCtx.restore();

  const layerCtx = layer.canvas.getContext('2d', { willReadFrequently: true })!;
  layerCtx.save();
  applySelectionMask(state, layerCtx);
  layerCtx.clearRect(0, 0, el.canvas.width, el.canvas.height);
  layerCtx.restore();

  sel.floatCanvas = floatCanvas;
  sel.floatX = bounds.x1;
  sel.floatY = bounds.y1;

  renderComposite(el, state);
}

export function flattenSelection(el: Elements, state: EditorState, onCommit: (label: string) => void): void {
  const sel = state.selection;
  if (!sel.floatCanvas) { clearSelection(el, state); return; }
  const layer = getActiveLayer(state);
  if (!layer) { clearSelection(el, state); return; }

  const layerCtx = layer.canvas.getContext('2d', { willReadFrequently: true })!;
  layerCtx.drawImage(sel.floatCanvas, sel.floatX, sel.floatY);
  renderComposite(el, state);
  onCommit('Move selection');
  clearSelection(el, state);
}

export function cutSelection(el: Elements, state: EditorState, onCommit: (label: string) => void): void {
  const sel = state.selection;
  if (!sel.active) return;
  if (!sel.floatCanvas) liftSelection(el, state);
  sel.floatCanvas = null;
  renderComposite(el, state);
  onCommit('Cut selection');
  clearSelection(el, state);
}

export function startMoveSelection(el: Elements, state: EditorState, x: number, y: number): boolean {
  const sel = state.selection;
  if (!sel.active) return false;
  if (!isInsideSelection(state, x, y)) return false;
  if (!sel.floatCanvas) liftSelection(el, state);
  sel.isDraggingContent = true;
  sel.dragOffX = x - sel.floatX;
  sel.dragOffY = y - sel.floatY;
  return true;
}

export function moveDragSelection(el: Elements, state: EditorState, x: number, y: number): void {
  const sel = state.selection;
  if (!sel.isDraggingContent) return;
  const newX = x - sel.dragOffX;
  const newY = y - sel.dragOffY;
  const dx = newX - sel.floatX;
  const dy = newY - sel.floatY;
  sel.floatX = newX;
  sel.floatY = newY;
  if (sel.shape === 'lasso') {
    for (const p of sel.lassoPoints) { p.x += dx; p.y += dy; }
  } else {
    sel.x += dx;
    sel.y += dy;
  }
  renderSelectionOverlay(el, state);
  renderCompositeWithFloat(el, state);
}

export function renderCompositeWithFloat(el: Elements, state: EditorState): void {
  renderComposite(el, state);
  const sel = state.selection;
  if (sel.floatCanvas) {
    el.ctx.save();
    el.ctx.imageSmoothingEnabled = false;
    el.ctx.drawImage(sel.floatCanvas, sel.floatX, sel.floatY);
    el.ctx.restore();
  }
}

export function handleSelectionPointerDown(
  el: Elements,
  state: EditorState,
  onCommit: (label: string) => void,
  x: number,
  y: number
): void {
  const sel = state.selection;
  if (sel.active && isInsideSelection(state, x, y)) {
    startMoveSelection(el, state, x, y);
    return;
  }
  if (sel.active) flattenSelection(el, state, onCommit);
  sel.isDrawing = true;
  sel.startX = x;
  sel.startY = y;
  sel.active = false;
  sel.lassoPoints = sel.shape === 'lasso' ? [{ x, y }] : [];
  sel.x = x; sel.y = y; sel.w = 0; sel.h = 0;
  renderSelectionOverlay(el, state);
  updateSelectionButtons(el, state);
}

export function handleSelectionPointerMove(el: Elements, state: EditorState, x: number, y: number): void {
  const sel = state.selection;
  if (sel.isDraggingContent) {
    moveDragSelection(el, state, x, y);
    return;
  }
  if (!sel.isDrawing) return;
  if (sel.shape === 'lasso') {
    sel.lassoPoints.push({ x, y });
  } else {
    sel.w = x - sel.startX;
    sel.h = y - sel.startY;
  }
  renderSelectionOverlay(el, state);
}

export function handleSelectionPointerUp(el: Elements, state: EditorState, x: number, y: number): void {
  const sel = state.selection;
  if (sel.isDraggingContent) {
    sel.isDraggingContent = false;
    return;
  }
  if (!sel.isDrawing) return;
  sel.isDrawing = false;

  if (sel.shape === 'lasso') {
    if (sel.lassoPoints.length >= 3) {
      sel.active = true;
    } else {
      sel.lassoPoints = [];
    }
  } else {
    sel.w = x - sel.startX;
    sel.h = y - sel.startY;
    sel.active = Math.abs(sel.w) >= 1 && Math.abs(sel.h) >= 1;
  }

  renderSelectionOverlay(el, state);
  updateSelectionButtons(el, state);
}

export function renderSelectionOverlay(el: Elements, state: EditorState): void {
  if (!state.ready) return;
  el.selectionOverlay.setAttribute('viewBox', `0 0 ${el.canvas.width} ${el.canvas.height}`);
  el.selectionOverlay.replaceChildren();

  if (el.selectionDragCanvas) {
    el.selectionDragCanvas.hidden = true;
  }

  const sel = state.selection;
  if (!sel.active && !sel.isDrawing) return;

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
  pattern.setAttribute('id', 'marching-ants');
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  const pxSize = Math.max(0.5, 1 / state.zoom);
  pattern.setAttribute('width', String(pxSize * 4));
  pattern.setAttribute('height', String(pxSize * 4));
  const r1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  r1.setAttribute('width', String(pxSize * 4));
  r1.setAttribute('height', String(pxSize * 4));
  r1.setAttribute('fill', 'white');
  const r2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  r2.setAttribute('width', String(pxSize * 2));
  r2.setAttribute('height', String(pxSize * 2));
  r2.setAttribute('fill', 'black');
  pattern.append(r1, r2);
  defs.append(pattern);
  el.selectionOverlay.append(defs);

  const strokeW = Math.max(0.5, 1 / state.zoom);

  if (sel.shape === 'lasso' && sel.lassoPoints.length >= 2) {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', sel.lassoPoints.map((p) => `${p.x},${p.y}`).join(' '));
    poly.setAttribute('fill', 'rgba(100,160,255,0.15)');
    poly.setAttribute('stroke', 'url(#marching-ants)');
    poly.setAttribute('stroke-width', String(strokeW));
    if (sel.active) {
      poly.setAttribute('points', sel.lassoPoints.map((p) => `${p.x},${p.y}`).join(' ') + ` ${sel.lassoPoints[0].x},${sel.lassoPoints[0].y}`);
    }
    el.selectionOverlay.append(poly);
  } else if (sel.shape === 'ellipse') {
    const b = selectionBounds(state);
    const cx = (b.x1 + b.x2) / 2;
    const cy = (b.y1 + b.y2) / 2;
    const rx = (b.x2 - b.x1) / 2;
    const ry = (b.y2 - b.y1) / 2;
    if (rx > 0 && ry > 0) {
      const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      ellipse.setAttribute('cx', String(cx));
      ellipse.setAttribute('cy', String(cy));
      ellipse.setAttribute('rx', String(rx));
      ellipse.setAttribute('ry', String(ry));
      ellipse.setAttribute('fill', 'rgba(100,160,255,0.15)');
      ellipse.setAttribute('stroke', 'url(#marching-ants)');
      ellipse.setAttribute('stroke-width', String(strokeW));
      el.selectionOverlay.append(ellipse);
    }
  } else if (sel.shape === 'rect') {
    const b = selectionBounds(state);
    const w = b.x2 - b.x1;
    const h = b.y2 - b.y1;
    if (w > 0 && h > 0) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(b.x1));
      rect.setAttribute('y', String(b.y1));
      rect.setAttribute('width', String(w));
      rect.setAttribute('height', String(h));
      rect.setAttribute('fill', 'rgba(100,160,255,0.15)');
      rect.setAttribute('stroke', 'url(#marching-ants)');
      rect.setAttribute('stroke-width', String(strokeW));
      el.selectionOverlay.append(rect);
    }
  }

  if (sel.floatCanvas) {
    el.selectionDragCanvas.width = sel.floatCanvas.width;
    el.selectionDragCanvas.height = sel.floatCanvas.height;
    el.selectionDragCanvas.getContext('2d')!.drawImage(sel.floatCanvas, 0, 0);
    el.selectionDragCanvas.style.left = `${sel.floatX * state.zoom}px`;
    el.selectionDragCanvas.style.top = `${sel.floatY * state.zoom}px`;
    el.selectionDragCanvas.style.width = `${sel.floatCanvas.width * state.zoom}px`;
    el.selectionDragCanvas.style.height = `${sel.floatCanvas.height * state.zoom}px`;
    el.selectionDragCanvas.hidden = false;
  }
}
