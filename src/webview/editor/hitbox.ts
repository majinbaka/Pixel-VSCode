import { Elements } from './dom';
import { EditorState, Point } from './state';
import { traceAlphaHull } from './autoTrace';

export function flattenHitboxPoints(el: Elements, state: EditorState): number[] {
  const halfWidth = el.canvas.width / 2;
  const halfHeight = el.canvas.height / 2;
  const flat: number[] = [];
  for (const point of state.collision.points) {
    flat.push(point.x - halfWidth, point.y - halfHeight);
  }
  return flat;
}

export function hitboxPointThreshold(state: EditorState): number {
  return 8 / state.zoom;
}

export function findNearestHitboxPointIndex(state: EditorState, x: number, y: number, threshold: number): number {
  let nearestIndex = -1;
  let nearestDistance = Infinity;
  state.collision.points.forEach((point, index) => {
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestDistance <= threshold ? nearestIndex : -1;
}

export function handleHitboxPointerDown(el: Elements, state: EditorState, x: number, y: number): void {
  const nearestIndex = findNearestHitboxPointIndex(state, x, y, hitboxPointThreshold(state));
  if (nearestIndex >= 0) {
    state.collision.draggingIndex = nearestIndex;
  } else {
    state.collision.points.push({ x, y });
    state.collision.draggingIndex = state.collision.points.length - 1;
  }
  renderHitboxOverlay(el, state);
}

export function handleHitboxPointerMove(el: Elements, state: EditorState, point: Point): void {
  if (state.collision.draggingIndex < 0) {
    return;
  }

  state.collision.points[state.collision.draggingIndex] = point;
  renderHitboxOverlay(el, state);
}

export function deleteNearestHitboxPoint(el: Elements, state: EditorState, x: number, y: number): void {
  const index = findNearestHitboxPointIndex(state, x, y, hitboxPointThreshold(state));
  if (index >= 0) {
    state.collision.points.splice(index, 1);
    renderHitboxOverlay(el, state);
  }
}

export function autoTraceHitbox(el: Elements, state: EditorState): void {
  if (!state.ready) {
    return;
  }

  const hull = traceAlphaHull(el.ctx, el.canvas.width, el.canvas.height);
  if (hull.length < 3) {
    return;
  }

  state.collision.points = hull;
  state.collision.draggingIndex = -1;
  renderHitboxOverlay(el, state);
}

export function renderHitboxOverlay(el: Elements, state: EditorState): void {
  if (!state.ready) {
    return;
  }

  el.hitboxOverlay.setAttribute('viewBox', `0 0 ${el.canvas.width} ${el.canvas.height}`);
  el.hitboxOverlay.replaceChildren();
  el.hitboxPointCount.textContent = String(state.collision.points.length);

  const points = state.collision.points;
  if (points.length >= 2) {
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', points.map((point) => `${point.x},${point.y}`).join(' '));
    polygon.setAttribute('class', 'hitbox-polygon');
    el.hitboxOverlay.append(polygon);
  }

  const radius = Math.max(0.5, 5 / state.zoom);
  for (const point of points) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(point.x));
    circle.setAttribute('cy', String(point.y));
    circle.setAttribute('r', String(radius));
    circle.setAttribute('class', 'hitbox-point');
    el.hitboxOverlay.append(circle);
  }
}
