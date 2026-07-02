import { Elements } from './dom';
import { EditorState, Layer, Point } from './state';
import { getActiveLayer, renderComposite } from './canvasCore';
import { isSelectionTool } from './state';

export function clampCanvasNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(1024, parsed));
}

export function eventToPixel(el: Elements, event: PointerEvent | MouseEvent): Point {
  const rect = el.canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * el.canvas.width);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * el.canvas.height);
  return {
    x: Math.max(0, Math.min(el.canvas.width - 1, x)),
    y: Math.max(0, Math.min(el.canvas.height - 1, y))
  };
}

export function eventToSubPixel(el: Elements, event: PointerEvent | MouseEvent): Point {
  const rect = el.canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * el.canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * el.canvas.height
  };
}

function unrotatePoint(x: number, y: number, pivot: { x: number; y: number }, angle: number): Point {
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const dx = x - pivot.x;
  const dy = y - pivot.y;
  return {
    x: pivot.x + (dx * cos - dy * sin),
    y: pivot.y + (dx * sin + dy * cos)
  };
}

export function eventToLayerPixel(
  el: Elements,
  state: EditorState,
  event: PointerEvent | MouseEvent,
  layer: Layer | undefined
): Point | null {
  const rect = el.canvas.getBoundingClientRect();
  let x = ((event.clientX - rect.left) / rect.width) * el.canvas.width;
  let y = ((event.clientY - rect.top) / rect.height) * el.canvas.height;

  if (layer) {
    const pivots = layer.rig.pivots;
    for (let i = pivots.length - 1; i >= 0; i -= 1) {
      const pivot = pivots[i];
      if (pivot.angle) {
        ({ x, y } = unrotatePoint(x, y, pivot, pivot.angle));
      }
    }
  }

  let px: number, py: number;
  if (state.snapToGuide && state.guideSize > 1) {
    px = Math.floor(x / state.guideSize) * state.guideSize;
    py = Math.floor(y / state.guideSize) * state.guideSize;
  } else {
    px = Math.floor(x);
    py = Math.floor(y);
  }
  if (px < 0 || py < 0 || px >= el.canvas.width || py >= el.canvas.height) {
    return null;
  }

  return { x: px, y: py };
}

export function hideCursorOverlay(el: Elements): void {
  el.cursorOverlay.hidden = true;
}

export function updateCursorOverlay(el: Elements, state: EditorState, x: number, y: number): void {
  if (state.tool === 'hitbox' || state.tool === 'rig' || isSelectionTool(state.tool)) {
    hideCursorOverlay(el);
    return;
  }

  if (state.snapToGuide && state.guideSize > 1) {
    const left = x;
    const top = y;
    const width = Math.min(state.guideSize, el.canvas.width - left);
    const height = Math.min(state.guideSize, el.canvas.height - top);
    el.cursorOverlay.style.left = `${left * state.zoom}px`;
    el.cursorOverlay.style.top = `${top * state.zoom}px`;
    el.cursorOverlay.style.width = `${width * state.zoom}px`;
    el.cursorOverlay.style.height = `${height * state.zoom}px`;
    el.cursorOverlay.hidden = false;
    return;
  }

  const size = state.tool === 'picker' || state.tool === 'fill' ? 1 : Number(el.brushSizeInput.value) || 1;
  const half = Math.floor(size / 2);
  const left = Math.max(0, x - half);
  const top = Math.max(0, y - half);
  const width = Math.min(size, el.canvas.width - left);
  const height = Math.min(size, el.canvas.height - top);

  el.cursorOverlay.style.left = `${left * state.zoom}px`;
  el.cursorOverlay.style.top = `${top * state.zoom}px`;
  el.cursorOverlay.style.width = `${width * state.zoom}px`;
  el.cursorOverlay.style.height = `${height * state.zoom}px`;
  el.cursorOverlay.hidden = false;
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function hexToRgb(hex: string): Rgba {
  const normalized = hex.replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
    a: 255
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function drawAt(el: Elements, state: EditorState, x: number, y: number): void {
  const layer = getActiveLayer(state);
  if (!layer) {
    return;
  }

  const layerCtx = layer.canvas.getContext('2d', { willReadFrequently: true })!;
  let left: number, top: number, width: number, height: number;
  if (state.snapToGuide && state.guideSize > 1) {
    left = x;
    top = y;
    width = Math.min(state.guideSize, el.canvas.width - left);
    height = Math.min(state.guideSize, el.canvas.height - top);
  } else {
    const size = Number(el.brushSizeInput.value);
    const half = Math.floor(size / 2);
    left = Math.max(0, x - half);
    top = Math.max(0, y - half);
    width = Math.min(size, el.canvas.width - left);
    height = Math.min(size, el.canvas.height - top);
  }

  if (state.tool === 'eraser') {
    layerCtx.clearRect(left, top, width, height);
  } else {
    layerCtx.fillStyle = el.colorInput.value;
    layerCtx.fillRect(left, top, width, height);
  }

  renderComposite(el, state);
}

export function pickColor(el: Elements, state: EditorState, setTool: (tool: EditorState['tool']) => void, x: number, y: number): void {
  const [r, g, b, a] = el.ctx.getImageData(x, y, 1, 1).data;
  if (a === 0) {
    setTool('eraser');
    return;
  }
  el.colorInput.value = rgbToHex(r, g, b);
  setTool('pencil');
}

function sameColor(data: Uint8ClampedArray, index: number, target: Rgba): boolean {
  return data[index] === target.r &&
    data[index + 1] === target.g &&
    data[index + 2] === target.b &&
    data[index + 3] === target.a;
}

function setPixel(data: Uint8ClampedArray, index: number, color: Rgba): void {
  data[index] = color.r;
  data[index + 1] = color.g;
  data[index + 2] = color.b;
  data[index + 3] = color.a;
}

export function floodFill(el: Elements, state: EditorState, startX: number, startY: number): void {
  const layer = getActiveLayer(state);
  if (!layer) {
    return;
  }

  const layerCtx = layer.canvas.getContext('2d', { willReadFrequently: true })!;
  const image = layerCtx.getImageData(0, 0, el.canvas.width, el.canvas.height);
  const data = image.data;
  const startIndex = (startY * el.canvas.width + startX) * 4;
  const target: Rgba = {
    r: data[startIndex],
    g: data[startIndex + 1],
    b: data[startIndex + 2],
    a: data[startIndex + 3]
  };
  const replacement = state.tool === 'eraser'
    ? { r: 0, g: 0, b: 0, a: 0 }
    : hexToRgb(el.colorInput.value);

  if (target.r === replacement.r &&
    target.g === replacement.g &&
    target.b === replacement.b &&
    target.a === replacement.a) {
    return;
  }

  const stack: [number, number][] = [[startX, startY]];
  while (stack.length) {
    const point = stack.pop();
    if (!point) {
      continue;
    }

    const [x, y] = point;
    if (x < 0 || y < 0 || x >= el.canvas.width || y >= el.canvas.height) {
      continue;
    }

    const index = (y * el.canvas.width + x) * 4;
    if (!sameColor(data, index, target)) {
      continue;
    }

    setPixel(data, index, replacement);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  layerCtx.putImageData(image, 0, 0);
  renderComposite(el, state);
}
