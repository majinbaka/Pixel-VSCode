import { Elements } from './dom';
import { AnimationState, clampDuration } from './state';

export function updateCanvasDisplaySize(el: Elements, state: AnimationState): void {
  el.canvas.style.width = `${el.canvas.width * state.zoom}px`;
  el.canvas.style.height = `${el.canvas.height * state.zoom}px`;
  el.previewFrame.style.setProperty('--pixel-size', `${state.zoom}px`);
}

export function setZoom(el: Elements, state: AnimationState, value: string): void {
  const zoom = Math.max(1, Math.min(32, Number(value) || 8));
  state.zoom = zoom;
  el.zoomInput.value = String(zoom);
  el.zoomLabel.value = `${zoom}x`;
  updateCanvasDisplaySize(el, state);
}

export function updateStatus(el: Elements, state: AnimationState): void {
  if (!state.frames.length) {
    el.statusText.textContent = 'No frames';
    el.frameCountText.textContent = '0';
    el.playButton.disabled = true;
    el.restartButton.disabled = true;
    return;
  }

  const frame = state.frames[state.currentIndex];
  el.statusText.textContent = `${state.currentIndex + 1}/${state.frames.length} - ${frame.duration} ms`;
  el.frameCountText.textContent = String(state.frames.length);
  el.playButton.disabled = false;
  el.restartButton.disabled = false;
}

function updateActiveFrameRow(el: Elements, state: AnimationState): void {
  const rows = el.framesList.querySelectorAll('.frame-row');
  rows.forEach((row, index) => {
    row.classList.toggle('active', index === state.currentIndex);
  });
}

export function drawFrame(el: Elements, state: AnimationState): void {
  const frame = state.frames[state.currentIndex];
  if (!frame) {
    el.ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
    return;
  }

  el.ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
  el.ctx.imageSmoothingEnabled = false;
  el.ctx.drawImage(frame.image, 0, 0);
}

export function showFrame(el: Elements, state: AnimationState, index: number): void {
  if (!state.frames.length) {
    return;
  }

  state.currentIndex = Math.max(0, Math.min(state.frames.length - 1, index));
  drawFrame(el, state);
  updateActiveFrameRow(el, state);
  updateStatus(el, state);
}

export interface FramesPanelCallbacks {
  onSelectFrame(index: number): void;
  onDurationChange(): void;
}

export function renderFramesList(el: Elements, state: AnimationState, callbacks: FramesPanelCallbacks): void {
  el.framesList.replaceChildren();

  state.frames.forEach((frame, index) => {
    const row = document.createElement('button');
    row.className = 'frame-row';
    row.type = 'button';
    row.title = frame.path;
    row.addEventListener('click', () => callbacks.onSelectFrame(index));

    const thumbnail = document.createElement('img');
    thumbnail.className = 'frame-thumbnail';
    thumbnail.src = frame.dataUri;
    thumbnail.alt = '';

    const details = document.createElement('span');
    details.className = 'frame-details';

    const name = document.createElement('span');
    name.className = 'frame-name';
    name.textContent = frame.name;

    const meta = document.createElement('span');
    meta.className = 'frame-meta';
    meta.textContent = `Frame ${index + 1}`;

    details.append(name, meta);

    const duration = document.createElement('input');
    duration.className = 'duration-input';
    duration.type = 'number';
    duration.min = '20';
    duration.max = '10000';
    duration.step = '10';
    duration.value = String(frame.duration);
    duration.title = 'Frame duration in milliseconds';
    duration.addEventListener('click', (event) => event.stopPropagation());
    duration.addEventListener('change', () => {
      const nextDuration = clampDuration(duration.value);
      duration.value = String(nextDuration);
      frame.duration = nextDuration;
      callbacks.onDurationChange();
    });

    const unit = document.createElement('span');
    unit.className = 'duration-unit';
    unit.textContent = 'ms';

    row.append(thumbnail, details, duration, unit);
    el.framesList.append(row);
  });

  updateActiveFrameRow(el, state);
}

export function resizeCanvasToFrames(el: Elements, state: AnimationState): void {
  const width = Math.max(...state.frames.map((frame) => frame.image.naturalWidth));
  const height = Math.max(...state.frames.map((frame) => frame.image.naturalHeight));
  el.canvas.width = width;
  el.canvas.height = height;
  updateCanvasDisplaySize(el, state);
}
