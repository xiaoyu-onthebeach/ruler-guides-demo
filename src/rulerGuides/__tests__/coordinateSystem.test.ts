import { describe, it, expect } from 'vitest';
import {
  worldToScreenX,
  worldToScreenY,
  screenToWorldX,
  screenToWorldY,
  activeOrigin,
  displayValue,
  RULER_SIZE,
} from '../coordinateSystem';
import type { RulerState } from '../types';

const EPSILON = 1e-10;

function defaultState(): RulerState {
  return {
    origin: { kind: 'default' },
    guidesVisible: true,
    currentStep: 100,
    previousStep: null,
    crossfadeStartedAt: null,
  };
}

function selectionState(x: number, y: number): RulerState {
  return {
    origin: { kind: 'selection', x, y },
    guidesVisible: true,
    currentStep: 100,
    previousStep: null,
    crossfadeStartedAt: null,
  };
}

describe('worldToScreen / screenToWorld round-trip', () => {
  const cases: Array<{ zoom: number; panX: number; panY: number }> = [
    { zoom: 1, panX: 0, panY: 0 },
    { zoom: 2, panX: 100, panY: -50 },
    { zoom: 0.5, panX: -200, panY: 300 },
    { zoom: 10, panX: 1000, panY: 1000 },
    { zoom: 0.1, panX: -5000, panY: 5000 },
  ];

  for (const ctx of cases) {
    it(`round-trips at zoom=${ctx.zoom}, pan=(${ctx.panX},${ctx.panY})`, () => {
      const worldPoints = [0, 100, -100, 999.5, -0.5];
      for (const wx of worldPoints) {
        const sx = worldToScreenX(wx, ctx);
        expect(Math.abs(screenToWorldX(sx, ctx) - wx)).toBeLessThan(EPSILON);
      }
      for (const wy of worldPoints) {
        const sy = worldToScreenY(wy, ctx);
        expect(Math.abs(screenToWorldY(sy, ctx) - wy)).toBeLessThan(EPSILON);
      }
    });
  }
});

describe('worldToScreenX / Y', () => {
  it('maps panX to RULER_SIZE (left viewport edge)', () => {
    const ctx = { zoom: 1, panX: 50, panY: 0 };
    expect(worldToScreenX(50, ctx)).toBe(RULER_SIZE);
  });

  it('maps panY to RULER_SIZE (top viewport edge)', () => {
    const ctx = { zoom: 1, panX: 0, panY: 75 };
    expect(worldToScreenY(75, ctx)).toBe(RULER_SIZE);
  });

  it('scales correctly at zoom 2', () => {
    const ctx = { zoom: 2, panX: 0, panY: 0 };
    expect(worldToScreenX(100, ctx)).toBe(RULER_SIZE + 200);
    expect(worldToScreenY(50, ctx)).toBe(RULER_SIZE + 100);
  });
});

describe('activeOrigin', () => {
  it('returns (0,0) for default origin', () => {
    expect(activeOrigin(defaultState())).toEqual({ x: 0, y: 0 });
  });

  it('returns scene top-left for selection origin', () => {
    expect(activeOrigin(selectionState(200, 150))).toEqual({ x: 200, y: 150 });
  });
});

describe('displayValue', () => {
  it('equals worldCoord when origin is default', () => {
    const state = defaultState();
    expect(displayValue(300, 'x', state)).toBe(300);
    expect(displayValue(-50, 'y', state)).toBe(-50);
  });

  it('subtracts origin for selection mode', () => {
    const state = selectionState(200, 100);
    expect(displayValue(300, 'x', state)).toBe(100);  // 300 - 200
    expect(displayValue(175, 'y', state)).toBe(75);   // 175 - 100
  });

  it('produces negative values for coordinates before the origin', () => {
    const state = selectionState(500, 500);
    expect(displayValue(100, 'x', state)).toBe(-400);
  });
});
