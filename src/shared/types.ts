import { LayerStateFile } from '../layerState';

export interface AnimationLayerFrame {
  name: string;
  dataUri: string;
}

export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'edit'; dataUri?: string; label?: string; layerState?: LayerStateFile }
  | { type: 'save' }
  | { type: 'saveCollision'; points?: number[] }
  | { type: 'importLayerImages' }
  | { type: 'previewLayersAnimation'; frames: AnimationLayerFrame[] };
