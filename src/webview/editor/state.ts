export type Tool =
  | 'pencil'
  | 'eraser'
  | 'fill'
  | 'picker'
  | 'hitbox'
  | 'rig'
  | 'select-rect'
  | 'select-ellipse'
  | 'select-lasso';

export type SelectionShape = 'rect' | 'ellipse' | 'lasso';

export type RigDragMode = 'pivot' | 'rotate' | undefined;

export interface Point {
  x: number;
  y: number;
}

export interface Pivot {
  id: string;
  name: string;
  x: number;
  y: number;
  angle: number;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  canvas: HTMLCanvasElement;
  rig: {
    pivots: Pivot[];
    activePivotId: string;
  };
}

export interface CollisionState {
  points: Point[];
  draggingIndex: number;
}

export interface RigState {
  dragMode: RigDragMode;
}

export interface SelectionState {
  active: boolean;
  shape: SelectionShape;
  x: number;
  y: number;
  w: number;
  h: number;
  lassoPoints: Point[];
  isDrawing: boolean;
  startX: number;
  startY: number;
  isDraggingContent: boolean;
  dragOffX: number;
  dragOffY: number;
  floatCanvas: HTMLCanvasElement | null;
  floatX: number;
  floatY: number;
}

export interface EditorState {
  tool: Tool;
  drawing: boolean;
  lastKey: string;
  pointerId: number | undefined;
  zoom: number;
  ready: boolean;
  layers: Layer[];
  activeLayerId: string | undefined;
  nextLayerId: number;
  nextPivotId: number;
  guideSize: number;
  snapToGuide: boolean;
  pendingCollisionPoints: number[] | undefined;
  collision: CollisionState;
  rig: RigState;
  selection: SelectionState;
}

export function createInitialState(): EditorState {
  return {
    tool: 'pencil',
    drawing: false,
    lastKey: '',
    pointerId: undefined,
    zoom: 16,
    ready: false,
    layers: [],
    activeLayerId: undefined,
    nextLayerId: 1,
    nextPivotId: 1,
    guideSize: 1,
    snapToGuide: false,
    pendingCollisionPoints: undefined,
    collision: {
      points: [],
      draggingIndex: -1
    },
    rig: {
      dragMode: undefined
    },
    selection: {
      active: false,
      shape: 'rect',
      x: 0, y: 0, w: 0, h: 0,
      lassoPoints: [],
      isDrawing: false,
      startX: 0, startY: 0,
      isDraggingContent: false,
      dragOffX: 0, dragOffY: 0,
      floatCanvas: null,
      floatX: 0, floatY: 0
    }
  };
}

export function isSelectionTool(tool: Tool): boolean {
  return tool === 'select-rect' || tool === 'select-ellipse' || tool === 'select-lasso';
}
