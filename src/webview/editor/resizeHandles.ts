import { Elements } from './dom';
import { EditorState } from './state';
import { updateCanvasDisplaySize } from './canvasCore';

export function initResizeHandles(
  el: Elements,
  state: EditorState,
  applyCanvasResize: (newWidth: number, newHeight: number, offX: number, offY: number) => void
): void {
  let dragEdge: string | null = null;
  let startX = 0, startY = 0;
  let startW = 0, startH = 0;
  let pending: { newW: number; newH: number; offX: number; offY: number } | null = null;

  function snapToGuide(v: number): number {
    if (!state.snapToGuide || state.guideSize <= 1) return v;
    return Math.max(state.guideSize, Math.round(v / state.guideSize) * state.guideSize);
  }

  function calcResize(e: PointerEvent) {
    const dx = Math.round((e.clientX - startX) / state.zoom);
    const dy = Math.round((e.clientY - startY) / state.zoom);
    let newW = startW, newH = startH, offX = 0, offY = 0;

    if (dragEdge!.includes('e')) newW = snapToGuide(Math.max(1, startW + dx));
    if (dragEdge!.includes('s')) newH = snapToGuide(Math.max(1, startH + dy));
    if (dragEdge!.includes('w')) { const raw = startW + Math.max(0, -dx); newW = snapToGuide(Math.max(1, raw)); offX = newW - startW; }
    if (dragEdge!.includes('n')) { const raw = startH + Math.max(0, -dy); newH = snapToGuide(Math.max(1, raw)); offY = newH - startH; }

    return { newW, newH, offX, offY };
  }

  let resizePreview: HTMLDivElement | null = null;

  function showPreview(newW: number, newH: number, offX: number, offY: number) {
    if (!resizePreview) {
      resizePreview = document.createElement('div');
      resizePreview.className = 'resize-preview';
      el.canvasFrame.appendChild(resizePreview);
    }
    resizePreview.style.width = `${newW * state.zoom}px`;
    resizePreview.style.height = `${newH * state.zoom}px`;
    resizePreview.style.left = `${-offX * state.zoom}px`;
    resizePreview.style.top = `${-offY * state.zoom}px`;
  }

  function removePreview() {
    if (resizePreview) {
      resizePreview.remove();
      resizePreview = null;
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragEdge) return;
    pending = calcResize(e);
    el.canvasSizeDisplay.textContent = `${pending.newW} x ${pending.newH}`;
    showPreview(pending.newW, pending.newH, pending.offX, pending.offY);
  }

  function onPointerUp() {
    if (!dragEdge) return;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    removePreview();
    if (pending) {
      applyCanvasResize(pending.newW, pending.newH, pending.offX, pending.offY);
    } else {
      updateCanvasDisplaySize(el, state);
    }
    dragEdge = null;
    pending = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  for (const handle of el.resizeHandles) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragEdge = handle.dataset.edge ?? null;
      startX = e.clientX;
      startY = e.clientY;
      startW = el.canvas.width;
      startH = el.canvas.height;
      document.body.style.cursor = getComputedStyle(handle).cursor;
      document.body.style.userSelect = 'none';
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    });
  }
}
