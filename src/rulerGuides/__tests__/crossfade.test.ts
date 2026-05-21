import { describe, it, expect } from 'vitest';
import { getRenderOpacities, updateStep, clearCrossfade, CROSSFADE_DURATION_MS } from '../crossfade';
import type { RulerState } from '../types';

function baseState(): RulerState {
  return {
    origin: { kind: 'default' },
    guidesVisible: true,
    currentStep: 100,
    previousStep: null,
    crossfadeStartedAt: null,
  };
}

describe('getRenderOpacities', () => {
  it('returns fully-opaque current with no animation when no crossfade is active', () => {
    const result = getRenderOpacities(baseState(), performance.now());
    expect(result).toEqual({ current: 1, previous: 0, isAnimating: false });
  });

  it('returns previous=1, current=0 at t=0 (animation just started)', () => {
    const now = 1000;
    const state: RulerState = { ...baseState(), previousStep: 50, crossfadeStartedAt: now };
    const result = getRenderOpacities(state, now);
    expect(result.previous).toBeCloseTo(1);
    expect(result.current).toBeCloseTo(0);
    expect(result.isAnimating).toBe(true);
  });

  it('returns previous=0.5, current=0.5 at t=half duration', () => {
    const start = 1000;
    const state: RulerState = { ...baseState(), previousStep: 50, crossfadeStartedAt: start };
    const result = getRenderOpacities(state, start + CROSSFADE_DURATION_MS / 2);
    expect(result.previous).toBeCloseTo(0.5);
    expect(result.current).toBeCloseTo(0.5);
    expect(result.isAnimating).toBe(true);
  });

  it('returns isAnimating=false at exactly the duration boundary', () => {
    const start = 1000;
    const state: RulerState = { ...baseState(), previousStep: 50, crossfadeStartedAt: start };
    const result = getRenderOpacities(state, start + CROSSFADE_DURATION_MS);
    expect(result).toEqual({ current: 1, previous: 0, isAnimating: false });
  });

  it('returns isAnimating=false past the duration', () => {
    const start = 1000;
    const state: RulerState = { ...baseState(), previousStep: 50, crossfadeStartedAt: start };
    const result = getRenderOpacities(state, start + CROSSFADE_DURATION_MS + 500);
    expect(result).toEqual({ current: 1, previous: 0, isAnimating: false });
  });
});

describe('updateStep', () => {
  it('returns the same state reference when step does not change', () => {
    const state = baseState(); // currentStep = 100
    const result = updateStep(state, 1.0); // pickStep(1.0) = 100
    expect(result).toBe(state);
  });

  it('starts a crossfade when step changes', () => {
    const state = baseState(); // currentStep = 100
    const result = updateStep(state, 0.1); // pickStep(0.1) = 1000
    expect(result.currentStep).toBe(1000);
    expect(result.previousStep).toBe(100);
    expect(result.crossfadeStartedAt).not.toBeNull();
  });

  it('replaces an ongoing crossfade (fast zoom through multiple thresholds)', () => {
    const state: RulerState = {
      ...baseState(),
      currentStep: 100,
      previousStep: 50,
      crossfadeStartedAt: 1000,
    };
    const result = updateStep(state, 0.1); // step jumps to 1000
    expect(result.currentStep).toBe(1000);
    expect(result.previousStep).toBe(100); // carries over the in-progress current
    expect(result.crossfadeStartedAt).not.toBe(1000); // reset to now
  });
});

describe('clearCrossfade', () => {
  it('clears previousStep and crossfadeStartedAt', () => {
    const state: RulerState = {
      ...baseState(),
      previousStep: 50,
      crossfadeStartedAt: 1234,
    };
    const result = clearCrossfade(state);
    expect(result.previousStep).toBeNull();
    expect(result.crossfadeStartedAt).toBeNull();
  });

  it('returns the same reference when already clear', () => {
    const state = baseState();
    expect(clearCrossfade(state)).toBe(state);
  });
});
