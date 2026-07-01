export interface LayerPivotState {
  id: string;
  name: string;
  x: number;
  y: number;
  angle: number;
}

export interface LayerEntryState {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  dataUri: string;
  rig: {
    activePivotId: string;
    pivots: LayerPivotState[];
  };
}

export interface LayerStateFile {
  layers: LayerEntryState[];
}
