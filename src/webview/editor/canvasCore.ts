import { Elements } from './dom';
import { EditorState, Layer, Pivot } from './state';
import { LayerStateFile } from './wireTypes';

declare const acquireVsCodeApi: () => { postMessage: (message: unknown) => void };

export type VsCodeApi = ReturnType<typeof acquireVsCodeApi>;

export function createLayerCanvas(width: number, height: number): HTMLCanvasElement {
  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = width;
  layerCanvas.height = height;
  return layerCanvas;
}

export function createPivot(state: EditorState, x: number, y: number, name?: string): Pivot {
  const id = `pivot-${state.nextPivotId++}`;
  return { id, name: name || `Pivot ${state.nextPivotId - 1}`, x, y, angle: 0 };
}

export function createLayer(el: Elements, state: EditorState, name: string, sourceCanvas?: HTMLCanvasElement): Layer {
  const layerCanvas = createLayerCanvas(el.canvas.width, el.canvas.height);
  if (sourceCanvas) {
    layerCanvas.getContext('2d')!.drawImage(sourceCanvas, 0, 0);
  }

  const defaultPivot = createPivot(state, layerCanvas.width / 2, layerCanvas.height / 2);

  return {
    id: `layer-${state.nextLayerId++}`,
    name,
    visible: true,
    opacity: 1,
    canvas: layerCanvas,
    rig: {
      pivots: [defaultPivot],
      activePivotId: defaultPivot.id
    }
  };
}

export function getActiveLayer(state: EditorState): Layer | undefined {
  return state.layers.find((layer) => layer.id === state.activeLayerId) ?? state.layers[state.layers.length - 1];
}

export function getActivePivot(state: EditorState, layer?: Layer): Pivot | undefined {
  const target = layer ?? getActiveLayer(state);
  if (!target) {
    return undefined;
  }
  return target.rig.pivots.find((pivot) => pivot.id === target.rig.activePivotId) ?? target.rig.pivots[0];
}

export function updateCanvasDisplaySize(el: Elements, state: EditorState): void {
  el.canvas.style.width = `${el.canvas.width * state.zoom}px`;
  el.canvas.style.height = `${el.canvas.height * state.zoom}px`;
  el.canvasFrame.style.setProperty('--pixel-size', `${state.zoom}px`);
  el.canvasFrame.style.setProperty('--guide-size', `${state.zoom * state.guideSize}px`);
}

export function setCanvasSize(el: Elements, state: EditorState, width: number, height: number): void {
  el.canvas.width = width;
  el.canvas.height = height;
  el.canvasSizeDisplay.textContent = `${width} x ${height}`;
  updateCanvasDisplaySize(el, state);
}

export function renderComposite(el: Elements, state: EditorState): void {
  el.ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
  el.ctx.imageSmoothingEnabled = false;

  for (const layer of state.layers) {
    if (!layer.visible || layer.opacity <= 0) {
      continue;
    }

    el.ctx.save();
    el.ctx.globalAlpha = layer.opacity;
    for (const pivot of layer.rig.pivots) {
      if (pivot.angle) {
        el.ctx.translate(pivot.x, pivot.y);
        el.ctx.rotate(pivot.angle);
        el.ctx.translate(-pivot.x, -pivot.y);
      }
    }
    el.ctx.drawImage(layer.canvas, 0, 0);
    el.ctx.restore();
  }
}

export function loadImageElement(dataUri: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.src = dataUri;
  });
}

export function nextIdNumber(id: string | undefined): number {
  const match = /-(\d+)$/.exec(id ?? '');
  return match ? Number(match[1]) : 0;
}

export function flatToHitboxPoints(flat: number[] | undefined, width: number, height: number) {
  if (!Array.isArray(flat) || flat.length < 6 || flat.length % 2 !== 0) {
    return [];
  }

  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index < flat.length; index += 2) {
    points.push({ x: flat[index] + halfWidth, y: flat[index + 1] + halfHeight });
  }
  return points;
}

export function serializeLayerState(state: EditorState): LayerStateFile {
  return {
    layers: state.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      dataUri: layer.canvas.toDataURL('image/png'),
      rig: {
        activePivotId: layer.rig.activePivotId,
        pivots: layer.rig.pivots.map((pivot) => ({
          id: pivot.id,
          name: pivot.name,
          x: pivot.x,
          y: pivot.y,
          angle: pivot.angle
        }))
      }
    }))
  };
}

export function commit(vscode: VsCodeApi, el: Elements, state: EditorState, label: string): void {
  if (!state.ready) {
    return;
  }

  renderComposite(el, state);
  vscode.postMessage({
    type: 'edit',
    label,
    dataUri: el.canvas.toDataURL('image/png'),
    layerState: serializeLayerState(state)
  });
}
