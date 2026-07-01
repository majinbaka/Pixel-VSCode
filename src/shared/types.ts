import { LayerStateFile } from '../layerState';

export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'edit'; dataUri?: string; label?: string; layerState?: LayerStateFile }
  | { type: 'save' }
  | { type: 'saveCollision'; points?: number[] };
