export type AnimationFrameData = {
  name: string;
  path: string;
  duration: number;
  dataUri: string;
};

export type AnimationPreviewMessage =
  | { type: 'ready' }
  | { type: 'pickFrames' };
