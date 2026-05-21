import type { Guide, Axis, Scene } from './types';
import {
  worldToScreenX,
  worldToScreenY,
  screenToWorldX,
  screenToWorldY,
  RULER_SIZE,
  type ViewportCtx,
} from './coordinateSystem';

const GUIDE_HIT_SLOP = 4; // px

export type HitTarget =
  | { kind: 'corner' }
  | { kind: 'top-ruler' }
  | { kind: 'left-ruler' }
  | { kind: 'guide'; guideId: string; axis: Axis }
  | { kind: 'canvas' };

export type GuideDragState =
  | { kind: 'none' }
  | { kind: 'creating-guide'; guideId: string; axis: Axis }
  | { kind: 'moving-guide'; guideId: string; axis: Axis };

export function hitTest(
  sx: number,
  sy: number,
  guides: Guide[],
  viewport: ViewportCtx,
  guidesVisible: boolean,
  scenes: Scene[] = [],
): HitTarget {
  if (sx < RULER_SIZE && sy < RULER_SIZE) return { kind: 'corner' };
  if (sy < RULER_SIZE) return { kind: 'top-ruler' };
  if (sx < RULER_SIZE) return { kind: 'left-ruler' };

  if (guidesVisible) {
    const guide = findGuideAt(sx, sy, guides, viewport, scenes);
    if (guide) return { kind: 'guide', guideId: guide.id, axis: guide.axis };
  }

  return { kind: 'canvas' };
}

// Returns the topmost guide within hit slop, or null.
export function findGuideAt(
  sx: number,
  sy: number,
  guides: Guide[],
  viewport: ViewportCtx,
  scenes: Scene[] = [],
): Guide | null {
  for (let i = guides.length - 1; i >= 0; i--) {
    const guide = guides[i];
    const sc = guideScreenCoord(guide, viewport, scenes);
    if (guide.axis === 'x') {
      if (Math.abs(sx - sc) <= GUIDE_HIT_SLOP) return guide;
    } else {
      if (Math.abs(sy - sc) <= GUIDE_HIT_SLOP) return guide;
    }
  }
  return null;
}

// Screen coordinate of a guide along its constrained axis, accounting for scene-local positions.
function guideScreenCoord(guide: Guide, viewport: ViewportCtx, scenes: Scene[]): number {
  let worldPos = guide.position;
  const scope = guide.scope;
  if (scope.kind === 'scene') {
    const scene = scenes.find(s => s.id === scope.sceneId);
    if (scene) worldPos += guide.axis === 'x' ? scene.bbox.x : scene.bbox.y;
  }
  return guide.axis === 'x'
    ? worldToScreenX(worldPos, viewport)
    : worldToScreenY(worldPos, viewport);
}

// World coordinate for a guide being dragged to the current mouse position.
export function guideWorldPos(sx: number, sy: number, axis: Axis, viewport: ViewportCtx): number {
  return axis === 'x' ? screenToWorldX(sx, viewport) : screenToWorldY(sy, viewport);
}

// True when releasing a guide back onto its source ruler (triggers deletion).
export function isDropOnSourceRuler(axis: Axis, hit: HitTarget): boolean {
  return (
    (axis === 'y' && hit.kind === 'top-ruler') ||
    (axis === 'x' && hit.kind === 'left-ruler')
  );
}

// Cursor string for hovering over a guide.
export function guideCursor(axis: Axis): string {
  return axis === 'x' ? 'ew-resize' : 'ns-resize';
}
