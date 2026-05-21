import { describe, it, expect } from 'vitest';
import { hitTest, findGuideAt, guideWorldPos, isDropOnSourceRuler, guideCursor } from '../interactionLayer';
import { createGuide } from '../guideStore';
import { RULER_SIZE } from '../coordinateSystem';

const VP = { zoom: 1, panX: 0, panY: 0 };
const GLOBAL = { kind: 'global' } as const;

describe('hitTest', () => {
  it('returns corner when sx and sy are both inside RULER_SIZE', () => {
    expect(hitTest(0, 0, [], VP, true)).toEqual({ kind: 'corner' });
    expect(hitTest(RULER_SIZE - 1, RULER_SIZE - 1, [], VP, true)).toEqual({ kind: 'corner' });
  });

  it('returns top-ruler when sy < RULER_SIZE and sx >= RULER_SIZE', () => {
    expect(hitTest(100, 0, [], VP, true)).toEqual({ kind: 'top-ruler' });
  });

  it('returns left-ruler when sx < RULER_SIZE and sy >= RULER_SIZE', () => {
    expect(hitTest(0, 100, [], VP, true)).toEqual({ kind: 'left-ruler' });
  });

  it('returns canvas when no guides are nearby', () => {
    expect(hitTest(200, 200, [], VP, true)).toEqual({ kind: 'canvas' });
  });

  it('returns guide hit when cursor is within slop of a vertical guide', () => {
    // axis 'x' guide at world X=100 → screen X = RULER_SIZE + 100
    const guide = createGuide('x', 100, GLOBAL);
    const sx = RULER_SIZE + 100;
    const result = hitTest(sx + 3, 200, [guide], VP, true);
    expect(result.kind).toBe('guide');
  });

  it('returns canvas when guides are hidden', () => {
    const guide = createGuide('x', 100, GLOBAL);
    const sx = RULER_SIZE + 100;
    expect(hitTest(sx, 200, [guide], VP, false)).toEqual({ kind: 'canvas' });
  });
});

describe('findGuideAt', () => {
  it('finds a vertical guide within slop', () => {
    const guide = createGuide('x', 100, GLOBAL);
    expect(findGuideAt(RULER_SIZE + 100 + 3, 200, [guide], VP)).toBe(guide);
  });

  it('finds a horizontal guide within slop', () => {
    const guide = createGuide('y', 100, GLOBAL);
    expect(findGuideAt(200, RULER_SIZE + 100 - 2, [guide], VP)).toBe(guide);
  });

  it('returns null when cursor is beyond slop', () => {
    const guide = createGuide('x', 100, GLOBAL);
    expect(findGuideAt(RULER_SIZE + 100 + 5, 200, [guide], VP)).toBeNull();
  });

  it('returns the topmost (last) guide when two overlap', () => {
    const g1 = createGuide('x', 100, GLOBAL);
    const g2 = createGuide('x', 100, GLOBAL); // same position
    expect(findGuideAt(RULER_SIZE + 100, 200, [g1, g2], VP)).toBe(g2);
  });

  const SCENE = { id: 's1', bbox: { x: 200, y: 150, width: 300, height: 200 } };
  const SCENES = [SCENE];
  const SCENE_SCOPE = { kind: 'scene' as const, sceneId: 's1' };

  it('finds a scene-scoped vertical guide at scene-local + scene.bbox.x', () => {
    // scene-local x=50 → world x=250 → screen x=RULER_SIZE+250
    const guide = createGuide('x', 50, SCENE_SCOPE);
    expect(findGuideAt(RULER_SIZE + 250 + 3, 200, [guide], VP, SCENES)).toBe(guide);
  });

  it('finds a scene-scoped horizontal guide at scene-local + scene.bbox.y', () => {
    // scene-local y=30 → world y=180 → screen y=RULER_SIZE+180
    const guide = createGuide('y', 30, SCENE_SCOPE);
    expect(findGuideAt(200, RULER_SIZE + 180 - 2, [guide], VP, SCENES)).toBe(guide);
  });

  it('does not find a scene-scoped guide at the raw scene-local position', () => {
    // guide.position=50 as world would be screen RULER_SIZE+50, but real screen is RULER_SIZE+250
    const guide = createGuide('x', 50, SCENE_SCOPE);
    expect(findGuideAt(RULER_SIZE + 50, 200, [guide], VP, SCENES)).toBeNull();
  });

  it('falls back to guide.position when scene is not found', () => {
    const guide = createGuide('x', 50, { kind: 'scene', sceneId: 'missing' });
    // No matching scene → worldPos = guide.position = 50 → screen RULER_SIZE+50
    expect(findGuideAt(RULER_SIZE + 50, 200, [guide], VP, SCENES)).toBe(guide);
  });
});

describe('guideWorldPos', () => {
  it('returns world X for axis x', () => {
    const sx = RULER_SIZE + 150;
    expect(guideWorldPos(sx, 0, 'x', VP)).toBe(150);
  });

  it('returns world Y for axis y', () => {
    const sy = RULER_SIZE + 200;
    expect(guideWorldPos(0, sy, 'y', VP)).toBe(200);
  });
});

describe('isDropOnSourceRuler', () => {
  it('horizontal guide dropped on top-ruler → true', () => {
    expect(isDropOnSourceRuler('y', { kind: 'top-ruler' })).toBe(true);
  });

  it('vertical guide dropped on left-ruler → true', () => {
    expect(isDropOnSourceRuler('x', { kind: 'left-ruler' })).toBe(true);
  });

  it('horizontal guide dropped on canvas → false', () => {
    expect(isDropOnSourceRuler('y', { kind: 'canvas' })).toBe(false);
  });

  it('vertical guide dropped on top-ruler → false', () => {
    expect(isDropOnSourceRuler('x', { kind: 'top-ruler' })).toBe(false);
  });
});

describe('guideCursor', () => {
  it('returns ew-resize for vertical guides (axis x)', () => {
    expect(guideCursor('x')).toBe('ew-resize');
  });

  it('returns ns-resize for horizontal guides (axis y)', () => {
    expect(guideCursor('y')).toBe('ns-resize');
  });
});
