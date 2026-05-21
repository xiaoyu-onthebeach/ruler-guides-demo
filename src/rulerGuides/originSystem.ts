import type { RulerState, Scene } from './types';

export function originFromSceneId(
  state: RulerState,
  sceneId: string | null,
  scenes: Scene[],
): RulerState {
  if (sceneId === null) {
    return { ...state, origin: { kind: 'default' } };
  }
  const scene = scenes.find(s => s.id === sceneId);
  if (!scene) return { ...state, origin: { kind: 'default' } };
  return {
    ...state,
    origin: { kind: 'selection', x: scene.bbox.x, y: scene.bbox.y },
  };
}

export function resetOrigin(state: RulerState): RulerState {
  return { ...state, origin: { kind: 'default' } };
}
