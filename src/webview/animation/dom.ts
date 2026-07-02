import { byId } from '../domUtil';

export interface Elements {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  previewFrame: HTMLElement;
  framesList: HTMLElement;
  frameCountText: HTMLElement;
  statusText: HTMLElement;
  playButton: HTMLButtonElement;
  restartButton: HTMLButtonElement;
  loopInput: HTMLInputElement;
  zoomInput: HTMLInputElement;
  zoomLabel: HTMLOutputElement;
  fitZoomButton: HTMLButtonElement;
  allDurationInput: HTMLInputElement;
  applyDurationButton: HTMLButtonElement;
  pickFramesButton: HTMLButtonElement;
}

export function queryElements(): Elements {
  const canvas = byId<HTMLCanvasElement>('previewCanvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to acquire 2D canvas context');
  }

  return {
    canvas,
    ctx,
    previewFrame: byId('previewFrame'),
    framesList: byId('framesList'),
    frameCountText: byId('frameCountText'),
    statusText: byId('statusText'),
    playButton: byId<HTMLButtonElement>('playButton'),
    restartButton: byId<HTMLButtonElement>('restartButton'),
    loopInput: byId<HTMLInputElement>('loopInput'),
    zoomInput: byId<HTMLInputElement>('zoomInput'),
    zoomLabel: byId<HTMLOutputElement>('zoomLabel'),
    fitZoomButton: byId<HTMLButtonElement>('fitZoomButton'),
    allDurationInput: byId<HTMLInputElement>('allDurationInput'),
    applyDurationButton: byId<HTMLButtonElement>('applyDurationButton'),
    pickFramesButton: byId<HTMLButtonElement>('pickFramesButton')
  };
}
