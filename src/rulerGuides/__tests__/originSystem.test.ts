import { describe, it, expect } from 'vitest';
import { originFromSceneId, resetOrigin } from '../originSystem';
import type { RulerState, Scene } from '../types';

const SCENES: Scene[] = [
  { id: 'scene-a', bbox: { x: 100, y: 200, width: 400, height: 300 } },
  { id: 'scene-b', bbox: { x: 600, y: 50, width: 300, height: 400 } },
];

function baseState(): RulerState {
  return {
    origin: { kind: 'default' },
    guidesVisible: true,
    currentStep: 100,
    previousStep: null,
    crossfadeStartedAt: null,
  };
}

describe('originFromSceneId', () => {
  it('returns default origin when sceneId is null', () => {
    const result = originFromSceneId(baseState(), null, SCENES);
    expect(result.origin).toEqual({ kind: 'default' });
  });

  it('shifts to scene top-left when a scene is selected', () => {
    const result = originFromSceneId(baseState(), 'scene-a', SCENES);
    expect(result.origin).toEqual({ kind: 'selection', x: 100, y: 200 });
  });

  it('shifts to the correct scene when switching between scenes', () => {
    const after_a = originFromSceneId(baseState(), 'scene-a', SCENES);
    const after_b = originFromSceneId(after_a, 'scene-b', SCENES);
    expect(after_b.origin).toEqual({ kind: 'selection', x: 600, y: 50 });
  });

  it('returns default when sceneId does not match any scene', () => {
    const result = originFromSceneId(baseState(), 'nonexistent', SCENES);
    expect(result.origin).toEqual({ kind: 'default' });
  });

  it('deselecting (null) returns to default from selection mode', () => {
    const selected = originFromSceneId(baseState(), 'scene-a', SCENES);
    const deselected = originFromSceneId(selected, null, SCENES);
    expect(deselected.origin).toEqual({ kind: 'default' });
  });

  it('does not mutate other state fields', () => {
    const state = { ...baseState(), guidesVisible: false, currentStep: 50 };
    const result = originFromSceneId(state, 'scene-a', SCENES);
    expect(result.guidesVisible).toBe(false);
    expect(result.currentStep).toBe(50);
  });
});

describe('resetOrigin', () => {
  it('returns default origin from selection mode', () => {
    const selected = originFromSceneId(baseState(), 'scene-a', SCENES);
    const reset = resetOrigin(selected);
    expect(reset.origin).toEqual({ kind: 'default' });
  });

  it('is a no-op when already at default', () => {
    const state = baseState();
    const reset = resetOrigin(state);
    expect(reset.origin).toEqual({ kind: 'default' });
  });
});
