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
  el.selectionCopyButton.disabled = !has;
}

function applySelectionMask(state: EditorState, targetCtx: CanvasRenderingContext2D): void {
  const sel = state.selection;
  targetCtx.save();
  const poly = getStaircasePolygon(state);
  if (poly) {
    pathFromPolygon(targetCtx, poly);
  } else if (sel.shape === 'lasso') {
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

// Staircase polygons (ellipse rasterization, orthogonalized lasso) never extend past the
// bounding box of their source shape, so bounds stay correct without a polygon-aware branch here.
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
  const poly = getStaircasePolygon(state);
  if (poly) {
    return pointInPolygon(x, y, poly);
  }
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

export function copySelectionToClipboard(
  el: Elements,
  state: EditorState
): { width: number; height: number; dataUri: string } | undefined {
  const sel = state.selection;
  if (!sel.active) return undefined;

  const wasLifted = !!sel.floatCanvas;
  if (!wasLifted) liftSelection(el, state);
  if (!sel.floatCanvas) return undefined;

  const payload = {
    width: sel.floatCanvas.width,
    height: sel.floatCanvas.height,
    dataUri: sel.floatCanvas.toDataURL('image/png')
  };

  if (!wasLifted) {
    flattenSelection(el, state, () => { /* copy should not create an undo step */ });
  }

  return payload;
}

export function pasteSelectionFromClipboard(
  el: Elements,
  state: EditorState,
  loadedImage: HTMLImageElement,
  width: number,
  height: number
): void {
  const sel = state.selection;
  if (sel.active) flattenSelection(el, state, () => { /* replaced by the pasted selection below */ });

  const floatCanvas = createLayerCanvas(width, height);
  floatCanvas.getContext('2d')!.drawImage(loadedImage, 0, 0, width, height);

  sel.shape = 'rect';
  sel.lassoPoints = [];
  sel.isDrawing = false;
  sel.x = 0;
  sel.y = 0;
  sel.w = width;
  sel.h = height;
  sel.active = true;
  sel.floatCanvas = floatCanvas;
  sel.floatX = 0;
  sel.floatY = 0;

  renderSelectionOverlay(el, state);
  updateSelectionButtons(el, state);
  renderCompositeWithFloat(el, state);
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

function snapToGrid(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function moveDragSelection(el: Elements, state: EditorState, x: number, y: number): void {
  const sel = state.selection;
  if (!sel.isDraggingContent) return;
  const step = state.snapToGuide && state.guideSize > 1 ? state.guideSize : 1;
  const newX = snapToGrid(x - sel.dragOffX, step);
  const newY = snapToGrid(y - sel.dragOffY, step);
  const dx = newX - sel.floatX;
  const dy = newY - sel.floatY;
  if (dx === 0 && dy === 0) return;
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

function snapSelectionPoint(state: EditorState, x: number, y: number): { x: number; y: number } {
  if (!state.snapToGuide || state.guideSize <= 1) return { x, y };
  return {
    x: Math.round(x / state.guideSize) * state.guideSize,
    y: Math.round(y / state.guideSize) * state.guideSize
  };
}

type Point = { x: number; y: number };

function rasterizeEllipseCells(
  b: { x1: number; y1: number; x2: number; y2: number },
  g: number
): { included: boolean[][]; rows: number; cols: number } {
  const cols = Math.max(1, Math.round((b.x2 - b.x1) / g));
  const rows = Math.max(1, Math.round((b.y2 - b.y1) / g));
  const cx = b.x1 + (b.x2 - b.x1) / 2;
  const cy = b.y1 + (b.y2 - b.y1) / 2;
  const rx = (b.x2 - b.x1) / 2;
  const ry = (b.y2 - b.y1) / 2;
  const included: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));
  if (rx <= 0 || ry <= 0) return { included, rows, cols };
  for (let r = 0; r < rows; r++) {
    const cellCenterY = b.y1 + (r + 0.5) * g;
    const ny = (cellCenterY - cy) / ry;
    for (let c = 0; c < cols; c++) {
      const cellCenterX = b.x1 + (c + 0.5) * g;
      const nx = (cellCenterX - cx) / rx;
      if (nx * nx + ny * ny <= 1) included[r][c] = true;
    }
  }
  return { included, rows, cols };
}

// Traces the outer boundary of a filled cell region into an orthogonal polygon of grid-vertex
// coordinates, walking grid vertices so the filled region stays on our right-hand side (standard
// square-tracing / Pavlidis boundary-following convention).
function traceGridBoundary(included: boolean[][], rows: number, cols: number): { col: number; row: number }[] {
  const isFilled = (c: number, r: number): boolean => r >= 0 && r < rows && c >= 0 && c < cols && included[r][c];

  let startR = -1, startC = -1;
  outer: for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (included[r][c]) { startR = r; startC = c; break outer; }
    }
  }
  if (startR === -1) return [];

  type Heading = 'R' | 'D' | 'L' | 'U';
  const deltas: Record<Heading, { dc: number; dr: number }> = {
    R: { dc: 1, dr: 0 },
    D: { dc: 0, dr: 1 },
    L: { dc: -1, dr: 0 },
    U: { dc: 0, dr: -1 }
  };

  const start = { c: startC, r: startR };
  let v = { ...start };
  let heading: Heading = 'R';
  const path: { col: number; row: number }[] = [{ col: v.c, row: v.r }];
  let guard = 0;
  const maxSteps = rows * cols * 4 + 8;

  do {
    const topLeftCell = isFilled(v.c - 1, v.r - 1);
    const topRightCell = isFilled(v.c, v.r - 1);
    const bottomLeftCell = isFilled(v.c - 1, v.r);
    const bottomRightCell = isFilled(v.c, v.r);

    let nextHeading: Heading;
    if (heading === 'R') {
      if (bottomRightCell && !topRightCell) nextHeading = 'R';
      else if (bottomRightCell && topRightCell) nextHeading = 'U';
      else nextHeading = 'D';
    } else if (heading === 'D') {
      if (bottomLeftCell && !bottomRightCell) nextHeading = 'D';
      else if (bottomLeftCell && bottomRightCell) nextHeading = 'R';
      else nextHeading = 'L';
    } else if (heading === 'L') {
      if (topLeftCell && !bottomLeftCell) nextHeading = 'L';
      else if (topLeftCell && bottomLeftCell) nextHeading = 'D';
      else nextHeading = 'U';
    } else {
      if (topRightCell && !topLeftCell) nextHeading = 'U';
      else if (topRightCell && topLeftCell) nextHeading = 'L';
      else nextHeading = 'R';
    }

    const d = deltas[nextHeading];
    v = { c: v.c + d.dc, r: v.r + d.dr };
    heading = nextHeading;

    const last = path[path.length - 1];
    const prev = path.length >= 2 ? path[path.length - 2] : null;
    const collinear = prev && ((v.c === last.col && last.col === prev.col) || (v.r === last.row && last.row === prev.row));
    if (collinear) {
      path[path.length - 1] = { col: v.c, row: v.r };
    } else {
      path.push({ col: v.c, row: v.r });
    }

    guard++;
  } while ((v.c !== start.c || v.r !== start.r) && guard < maxSteps);

  if (path.length > 1 && path[0].col === path[path.length - 1].col && path[0].row === path[path.length - 1].row) {
    path.pop();
  }
  return path;
}

function buildEllipseStaircasePolygon(state: EditorState): Point[] {
  const g = state.guideSize;
  const b = selectionBounds(state);
  if (b.x2 - b.x1 < g || b.y2 - b.y1 < g) return [];
  const { included, rows, cols } = rasterizeEllipseCells(b, g);
  const gridPoly = traceGridBoundary(included, rows, cols);
  if (gridPoly.length < 3) return [];
  return gridPoly.map((v) => ({ x: b.x1 + v.col * g, y: b.y1 + v.row * g }));
}

function orthogonalCorner(a: Point, b: Point): Point {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  return dx >= dy ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
}

function orthogonalizeLassoPolygon(state: EditorState, points: Point[]): Point[] {
  if (!state.snapToGuide || state.guideSize <= 1 || points.length < 2) return points;
  const result: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.x !== b.x && a.y !== b.y) {
      result.push(orthogonalCorner(a, b));
    }
    result.push(b);
  }
  return result;
}

// `closed` controls whether the lasso polygon includes the segment back to the first point:
// pass true once the selection is finalized (active) or when computing the real mask/hit-test
// region, false for the still-open in-progress preview while the user is still drawing.
function getStaircasePolygon(state: EditorState, closed = true): Point[] | null {
  const sel = state.selection;
  if (!state.snapToGuide || state.guideSize <= 1) return null;
  if (sel.shape === 'ellipse') {
    const poly = buildEllipseStaircasePolygon(state);
    return poly.length >= 3 ? poly : null;
  }
  if (sel.shape === 'lasso') {
    if (sel.lassoPoints.length < 2) return null;
    const points = closed ? [...sel.lassoPoints, sel.lassoPoints[0]] : sel.lassoPoints;
    return orthogonalizeLassoPolygon(state, points);
  }
  return null;
}

function pathFromPolygon(ctx: CanvasRenderingContext2D, poly: Point[]): void {
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) {
    ctx.lineTo(poly[i].x, poly[i].y);
  }
  ctx.closePath();
}

function renderPolygonOverlay(el: Elements, poly: Point[], strokeW: number, closed: boolean): void {
  const svgPoly = document.createElementNS('http://www.w3.org/2000/svg', closed ? 'polygon' : 'polyline');
  svgPoly.setAttribute('points', poly.map((p) => `${p.x},${p.y}`).join(' '));
  svgPoly.setAttribute('fill', 'rgba(100,160,255,0.15)');
  svgPoly.setAttribute('stroke', 'url(#marching-ants)');
  svgPoly.setAttribute('stroke-width', String(strokeW));
  el.selectionOverlay.append(svgPoly);
}

export function selectAll(el: Elements, state: EditorState, onCommit: (label: string) => void): void {
  const sel = state.selection;
  if (sel.active) flattenSelection(el, state, onCommit);
  sel.shape = 'rect';
  sel.isDrawing = false;
  sel.lassoPoints = [];
  sel.startX = 0;
  sel.startY = 0;
  sel.x = 0;
  sel.y = 0;
  sel.w = el.canvas.width;
  sel.h = el.canvas.height;
  sel.active = sel.w >= 1 && sel.h >= 1;
  renderSelectionOverlay(el, state);
  updateSelectionButtons(el, state);
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
  const snapped = snapSelectionPoint(state, x, y);
  sel.isDrawing = true;
  sel.startX = snapped.x;
  sel.startY = snapped.y;
  sel.active = false;
  sel.lassoPoints = sel.shape === 'lasso' ? [{ x: snapped.x, y: snapped.y }] : [];
  sel.x = snapped.x; sel.y = snapped.y; sel.w = 0; sel.h = 0;
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
  const snapped = snapSelectionPoint(state, x, y);
  if (sel.shape === 'lasso') {
    sel.lassoPoints.push(snapped);
  } else {
    sel.w = snapped.x - sel.startX;
    sel.h = snapped.y - sel.startY;
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
    const snapped = snapSelectionPoint(state, x, y);
    sel.w = snapped.x - sel.startX;
    sel.h = snapped.y - sel.startY;
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
  const staircaseClosed = sel.shape !== 'lasso' || sel.active;
  const staircasePoly = sel.shape !== 'rect' ? getStaircasePolygon(state, staircaseClosed) : null;

  if (staircasePoly) {
    renderPolygonOverlay(el, staircasePoly, strokeW, staircaseClosed);
  } else if (sel.shape === 'lasso' && sel.lassoPoints.length >= 2) {
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
    el.selectionDragCanvas.style.left = `${Math.round(sel.floatX * state.zoom)}px`;
    el.selectionDragCanvas.style.top = `${Math.round(sel.floatY * state.zoom)}px`;
    el.selectionDragCanvas.style.width = `${Math.round(sel.floatCanvas.width * state.zoom)}px`;
    el.selectionDragCanvas.style.height = `${Math.round(sel.floatCanvas.height * state.zoom)}px`;
    el.selectionDragCanvas.hidden = false;
  }
}
