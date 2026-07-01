import { AnimationFrameWire } from './wireTypes';
import { AnimationState, LoadedFrame, clampDuration } from './state';

function loadFrame(frame: AnimationFrameWire): Promise<LoadedFrame> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({
      ...frame,
      duration: clampDuration(frame.duration),
      image
    });
    image.onerror = () => reject(new Error(`Unable to load ${frame.name}`));
    image.src = frame.dataUri;
  });
}

export async function loadFrames(state: AnimationState, frames: AnimationFrameWire[]): Promise<LoadedFrame[] | undefined> {
  const token = ++state.loadToken;
  const loadedFrames = await Promise.all(frames.map(loadFrame));
  if (token !== state.loadToken) {
    return undefined;
  }
  return loadedFrames;
}
