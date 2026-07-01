import { queryElements, Elements } from './dom';
import { AnimationState, clampDuration, createInitialState } from './state';
import { scheduleNextFrame, setPlaying } from './playback';
import {
  renderFramesList,
  resizeCanvasToFrames,
  setZoom,
  showFrame,
  updateStatus
} from './framesPanel';
import { loadFrames } from './frameLoader';
import { AnimationFrameWire, AnimationInboundMessage, VsCodeApi } from './wireTypes';

declare const acquireVsCodeApi: () => VsCodeApi;

(function main() {
  const vscode = acquireVsCodeApi();
  const el: Elements = queryElements();
  const state: AnimationState = createInitialState();

  function onTick(): void {
    showFrame(el, state, (state.currentIndex + 1) % state.frames.length);
    scheduleNextFrame(el, state, onTick);
  }

  async function loadAndShowFrames(frames: AnimationFrameWire[]): Promise<void> {
    el.statusText.textContent = 'Loading frames';
    setPlaying(el, state, false, onTick);

    try {
      const loadedFrames = await loadFrames(state, frames);
      if (!loadedFrames) {
        return;
      }

      state.frames = loadedFrames;
      state.currentIndex = 0;
      resizeCanvasToFrames(el, state);
      renderFramesList(el, state, {
        onSelectFrame: (index) => {
          showFrame(el, state, index);
          if (state.playing) {
            scheduleNextFrame(el, state, onTick);
          }
        },
        onDurationChange: () => {
          updateStatus(el, state);
          if (state.playing) {
            scheduleNextFrame(el, state, onTick);
          }
        }
      });
      showFrame(el, state, 0);
      el.allDurationInput.value = String(state.frames[0]?.duration ?? 120);
    } catch (error) {
      el.statusText.textContent = error instanceof Error ? error.message : 'Unable to load frames';
      state.frames = [];
      el.framesList.replaceChildren();
      updateStatus(el, state);
    }
  }

  el.playButton.addEventListener('click', () => setPlaying(el, state, !state.playing, onTick));
  el.restartButton.addEventListener('click', () => {
    showFrame(el, state, 0);
    if (state.playing) {
      scheduleNextFrame(el, state, onTick);
    }
  });
  el.loopInput.addEventListener('change', () => {
    if (state.playing) {
      scheduleNextFrame(el, state, onTick);
    }
  });
  el.zoomInput.addEventListener('input', () => setZoom(el, state, el.zoomInput.value));
  el.applyDurationButton.addEventListener('click', () => {
    const duration = clampDuration(el.allDurationInput.value);
    el.allDurationInput.value = String(duration);

    for (const frame of state.frames) {
      frame.duration = duration;
    }

    const inputs = el.framesList.querySelectorAll<HTMLInputElement>('.duration-input');
    inputs.forEach((input) => {
      input.value = String(duration);
    });

    updateStatus(el, state);
    if (state.playing) {
      scheduleNextFrame(el, state, onTick);
    }
  });
  el.pickFramesButton.addEventListener('click', () => vscode.postMessage({ type: 'pickFrames' }));

  window.addEventListener('message', (event: MessageEvent<AnimationInboundMessage>) => {
    if (event.data.type === 'init') {
      void loadAndShowFrames(event.data.frames);
    }
  });

  setZoom(el, state, el.zoomInput.value);
  updateStatus(el, state);
  vscode.postMessage({ type: 'ready' });
}());
