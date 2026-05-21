import { pickStep } from './tickAlgorithm';
import type { RulerState } from './types';

export const CROSSFADE_DURATION_MS = 150;

export interface RenderOpacities {
  current: number;
  previous: number;
  isAnimating: boolean;
}

export function getRenderOpacities(state: RulerState, now: number): RenderOpacities {
  if (state.previousStep === null || state.crossfadeStartedAt === null) {
    return { current: 1, previous: 0, isAnimating: false };
  }
  const elapsed = now - state.crossfadeStartedAt;
  if (elapsed >= CROSSFADE_DURATION_MS) {
    return { current: 1, previous: 0, isAnimating: false };
  }
  const t = elapsed / CROSSFADE_DURATION_MS;
  return { current: t, previous: 1 - t, isAnimating: true };
}

// Call this whenever zoom changes. Returns a new state only if the step changed.
export function updateStep(state: RulerState, zoom: number): RulerState {
  const newStep = pickStep(zoom);
  if (newStep === state.currentStep) return state;
  return {
    ...state,
    previousStep: state.currentStep,
    currentStep: newStep,
    crossfadeStartedAt: performance.now(),
  };
}

// Call after getRenderOpacities returns isAnimating: false to clear stale fields.
export function clearCrossfade(state: RulerState): RulerState {
  if (state.previousStep === null) return state;
  return { ...state, previousStep: null, crossfadeStartedAt: null };
}
