import { Elements } from './dom';
import { AnimationState } from './state';

export function clearPlaybackTimer(state: AnimationState): void {
  if (state.timer !== undefined) {
    window.clearTimeout(state.timer);
    state.timer = undefined;
  }
}

export function setPlaying(
  el: Elements,
  state: AnimationState,
  playing: boolean,
  onTick: () => void
): void {
  state.playing = Boolean(playing && state.frames.length);
  el.playButton.textContent = state.playing ? 'Pause' : 'Play';

  if (state.playing) {
    scheduleNextFrame(el, state, onTick);
  } else {
    clearPlaybackTimer(state);
  }
}

export function scheduleNextFrame(el: Elements, state: AnimationState, onTick: () => void): void {
  clearPlaybackTimer(state);

  if (!state.playing || state.frames.length === 0) {
    return;
  }

  const frame = state.frames[state.currentIndex];
  state.timer = window.setTimeout(() => {
    const atEnd = state.currentIndex >= state.frames.length - 1;
    if (atEnd && !el.loopInput.checked) {
      setPlaying(el, state, false, onTick);
      return;
    }
    onTick();
  }, frame.duration);
}
