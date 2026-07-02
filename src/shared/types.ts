import { LayerStateFile } from '../layerState';

export interface AnimationLayerFrame {
  name: string;
  dataUri: string;
}

export type EditorClipboardPayload =
  | { kind: 'layer'; name: string; dataUri: string }
  | { kind: 'selection'; width: number; height: number; dataUri: string };

export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'edit'; dataUri?: string; label?: string; layerState?: LayerStateFile }
  | { type: 'save' }
  | { type: 'saveCollision'; points?: number[] }
  | { type: 'importLayerImages' }
  | { type: 'previewLayersAnimation'; frames: AnimationLayerFrame[] }
  | { type: 'copyLayer'; name: string; dataUri: string }
  | { type: 'copySelection'; width: number; height: number; dataUri: string }
  | { type: 'requestPaste' }
  | { type: 'exportSpriteSheet'; frames: AnimationLayerFrame[] };
