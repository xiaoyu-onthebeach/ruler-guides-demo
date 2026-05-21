export type Axis = 'x' | 'y';

export interface Guide {
  id: string;
  axis: Axis;
  // Scene-scoped: offset from scene bbox origin (scene-local px).
  // Global: world coordinate (px).
  position: number;
  scope: GuideScope;
}

export type GuideScope =
  | { kind: 'global' }
  | { kind: 'scene'; sceneId: string };

export type OriginMode =
  | { kind: 'default' }
  | { kind: 'selection'; x: number; y: number };

export interface RulerState {
  origin: OriginMode;
  guidesVisible: boolean;
  currentStep: number;
  previousStep: number | null;
  crossfadeStartedAt: number | null;
}

// Host integration types (provided by the host application)
export interface CanvasContext {
  zoom: number;
  panX: number;
  panY: number;
  selection: Selection | null;
  scenes: Scene[];
}

export interface Selection {
  bbox: { x: number; y: number; width: number; height: number };
  sceneId: string | null;
}

export interface Scene {
  id: string;
  bbox: { x: number; y: number; width: number; height: number };
}
