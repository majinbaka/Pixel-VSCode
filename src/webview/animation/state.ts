export interface LoadedFrame {
  name: string;
  path: string;
  duration: number;
  dataUri: string;
  image: HTMLImageElement;
}

export interface AnimationState {
  frames: LoadedFrame[];
  currentIndex: number;
  playing: boolean;
  timer: number | undefined;
  zoom: number;
  loadToken: number;
}

export function createInitialState(): AnimationState {
  return {
    frames: [],
    currentIndex: 0,
    playing: false,
    timer: undefined,
    zoom: 8,
    loadToken: 0
  };
}

export function clampDuration(value: string | number): number {
  const duration = Number(value);
  if (!Number.isInteger(duration)) {
    return 120;
  }
  return Math.max(20, Math.min(10000, duration));
}
