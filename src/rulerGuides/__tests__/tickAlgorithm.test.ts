import { describe, it, expect } from 'vitest';
import { pickStep } from '../tickAlgorithm';

describe('pickStep', () => {
  it('returns 100 at zoom 1.0 (60/1=60, first nice ≥ 60)', () => {
    expect(pickStep(1.0)).toBe(100);
  });

  it('returns 1000 at zoom 0.1 (60/0.1=600, first nice ≥ 600)', () => {
    expect(pickStep(0.1)).toBe(1000);
  });

  it('returns 200 at zoom 0.5 (60/0.5=120, first nice ≥ 120)', () => {
    expect(pickStep(0.5)).toBe(200);
  });

  it('returns 50 at zoom 2.0 (60/2=30, first nice ≥ 30)', () => {
    expect(pickStep(2.0)).toBe(50);
  });

  it('returns 20 at zoom 5.0 (60/5=12, first nice ≥ 12)', () => {
    expect(pickStep(5.0)).toBe(20);
  });

  it('returns 10 at zoom 10.0 (60/10=6, first nice ≥ 6)', () => {
    expect(pickStep(10.0)).toBe(10);
  });

  it('screen gap between major ticks is always ≥ 60px', () => {
    const zooms = [0.1, 0.25, 0.5, 1, 2, 5, 10];
    for (const zoom of zooms) {
      const step = pickStep(zoom);
      const screenGap = step * zoom;
      expect(screenGap).toBeGreaterThanOrEqual(60);
    }
  });

  it('returns a nice number (member of the sequence)', () => {
    const niceNumbers = new Set([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]);
    const testZooms = [0.1, 0.2, 0.5, 1, 1.5, 2, 3, 5, 7, 10];
    for (const zoom of testZooms) {
      expect(niceNumbers.has(pickStep(zoom))).toBe(true);
    }
  });
});
