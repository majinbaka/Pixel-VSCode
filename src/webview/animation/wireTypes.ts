export type AnimationFrameWire = {
  name: string;
  path: string;
  duration: number;
  dataUri: string;
};

export type AnimationInboundMessage =
  | { type: 'init'; frames: AnimationFrameWire[] };

export type AnimationOutboundMessage =
  | { type: 'ready' }
  | { type: 'pickFrames' };

export interface VsCodeApi {
  postMessage(message: AnimationOutboundMessage): void;
}
