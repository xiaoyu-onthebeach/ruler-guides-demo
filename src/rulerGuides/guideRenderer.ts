import type { Guide, RulerState, Scene } from './types';
import {
  worldToScreenX,
  worldToScreenY,
  displayValue,
  RULER_SIZE,
  type ViewportCtx,
} from './coordinateSystem';

// #131316 = rgb(19,19,22) — must match rulerRenderer.ts
// Highlight band = #4570FF20 composited over ruler bg → rgb(25,31,51)
const RULER_BG_SOLID      = 'rgba(19,19,22,1)';
const RULER_BG_CLEAR      = 'rgba(19,19,22,0)';
const HIGHLIGHT_BG_SOLID  = 'rgba(25,31,51,1)';
const HIGHLIGHT_BG_CLEAR  = 'rgba(25,31,51,0)';

const LABEL_PAD  = 3;   // px between text edge and solid bg region
const LABEL_FADE = 10;  // px of gradient fade on each side

export function drawGuides(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  guides: Guide[],
  viewport: ViewportCtx,
  activeId: string | null,
  scenes: Scene[] = [],
  pendingDeleteId: string | null = null,
  creatingIds: Set<string> = new Set(),
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'difference';
  ctx.lineWidth = 1;

  for (const guide of guides) {
    const isPendingDelete = guide.id === pendingDeleteId;
    const isCreating      = creatingIds.has(guide.id);
    const isActive        = !isPendingDelete && (guide.id === activeId || isCreating);

    ctx.globalAlpha = isPendingDelete ? 0.3 : (isActive ? 1.0 : 0.6);
    ctx.strokeStyle = '#FD4E62';

    if (isPendingDelete) {
      drawPendingDeleteGuide(ctx, guide, width, height, viewport, scenes);
      continue;
    }

    const scope = guide.scope;
    if (scope.kind === 'global') {
      ctx.setLineDash([]);
      ctx.beginPath();
      drawGlobalGuide(ctx, guide, width, height, viewport);
      ctx.stroke();
    } else if (scope.kind === 'scene') {
      const scene = scenes.find(s => s.id === scope.sceneId);
      if (scene) drawSceneGuide(ctx, guide, width, height, viewport, scene, isActive, isCreating);
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

// Draw the coordinate label inside the ruler band when a guide is active.
// Call AFTER drawRulers so the label sits on top of ruler ticks.
export function drawGuideRulerLabels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  guides: Guide[],
  activeIds: string[],
  viewport: ViewportCtx,
  rulerState: RulerState,
  scenes: Scene[] = [],
  selectedScene: Scene | null = null,
): void {
  if (activeIds.length === 0) return;

  ctx.save();
  ctx.font = "10px 'Saans', system-ui, sans-serif";

  for (const activeId of activeIds) {
    const guide = guides.find(g => g.id === activeId);
    if (!guide) continue;

    const worldPos = guideWorldCoord(guide, scenes);

    if (guide.axis === 'x') {
      // Vertical guide → label in the top ruler (horizontal gradient)
      const sx = Math.round(worldToScreenX(worldPos, viewport));
      if (sx < RULER_SIZE || sx > width) continue;

      // Use highlight band color when the guide falls within the selected scene's x-span
      const inBand = selectedScene !== null
        && sx >= worldToScreenX(selectedScene.bbox.x, viewport)
        && sx <= worldToScreenX(selectedScene.bbox.x + selectedScene.bbox.width, viewport);
      const bgSolid = inBand ? HIGHLIGHT_BG_SOLID : RULER_BG_SOLID;
      const bgClear = inBand ? HIGHLIGHT_BG_CLEAR : RULER_BG_CLEAR;

      const label = String(Math.round(displayValue(worldPos, 'x', rulerState)));
      const tw    = ctx.measureText(label).width;
      const half  = tw / 2 + LABEL_PAD;
      const x0    = sx - half - LABEL_FADE;
      const x1    = sx + half + LABEL_FADE;
      const span  = x1 - x0;

      const grad = ctx.createLinearGradient(x0, 0, x1, 0);
      grad.addColorStop(0,                     bgClear);
      grad.addColorStop(LABEL_FADE / span,     bgSolid);
      grad.addColorStop(1 - LABEL_FADE / span, bgSolid);
      grad.addColorStop(1,                     bgClear);
      ctx.fillStyle = grad;
      ctx.fillRect(x0, 0, span, RULER_SIZE);

      ctx.fillStyle    = '#FD4E62';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, sx, 3);

    } else {
      // Horizontal guide → label in the left ruler (vertical gradient)
      const sy = Math.round(worldToScreenY(worldPos, viewport));
      if (sy < RULER_SIZE || sy > height) continue;

      // Use highlight band color when the guide falls within the selected scene's y-span
      const inBand = selectedScene !== null
        && sy >= worldToScreenY(selectedScene.bbox.y, viewport)
        && sy <= worldToScreenY(selectedScene.bbox.y + selectedScene.bbox.height, viewport);
      const bgSolid = inBand ? HIGHLIGHT_BG_SOLID : RULER_BG_SOLID;
      const bgClear = inBand ? HIGHLIGHT_BG_CLEAR : RULER_BG_CLEAR;

      const label = String(Math.round(displayValue(worldPos, 'y', rulerState)));
      const tw    = ctx.measureText(label).width;
      const half  = tw / 2 + LABEL_PAD;
      const y0    = sy - half - LABEL_FADE;
      const y1    = sy + half + LABEL_FADE;
      const span  = y1 - y0;

      const grad = ctx.createLinearGradient(0, y0, 0, y1);
      grad.addColorStop(0,                     bgClear);
      grad.addColorStop(LABEL_FADE / span,     bgSolid);
      grad.addColorStop(1 - LABEL_FADE / span, bgSolid);
      grad.addColorStop(1,                     bgClear);
      ctx.fillStyle = grad;
      ctx.fillRect(0, y0, RULER_SIZE, span);

      ctx.save();
      ctx.translate((RULER_SIZE - 8) / 2, sy);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle    = '#FD4E62';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }

  ctx.restore();
}

// ── Internal ──────────────────────────────────────────────────────────────────

// World coordinate of a guide, converting scene-local positions to world space.
function guideWorldCoord(guide: Guide, scenes: Scene[]): number {
  const scope = guide.scope;
  if (scope.kind === 'global') return guide.position;
  const scene = scenes.find(s => s.id === scope.sceneId);
  if (!scene) return guide.position;
  return guide.position + (guide.axis === 'x' ? scene.bbox.x : scene.bbox.y);
}

// Renders a guide being dragged off the viewport edge — clamped to the edge in gray.
function drawPendingDeleteGuide(
  ctx: CanvasRenderingContext2D,
  guide: Guide,
  width: number,
  height: number,
  viewport: ViewportCtx,
  scenes: Scene[],
): void {
  const worldPos = guideWorldCoord(guide, scenes);
  ctx.setLineDash([]);
  ctx.beginPath();
  if (guide.axis === 'x') {
    const sx = Math.max(RULER_SIZE, Math.min(width, Math.round(worldToScreenX(worldPos, viewport)))) + 0.5;
    ctx.moveTo(sx, RULER_SIZE);
    ctx.lineTo(sx, height);
  } else {
    const sy = Math.max(RULER_SIZE, Math.min(height, Math.round(worldToScreenY(worldPos, viewport)))) + 0.5;
    ctx.moveTo(RULER_SIZE, sy);
    ctx.lineTo(width, sy);
  }
  ctx.stroke();
}

function drawGlobalGuide(
  ctx: CanvasRenderingContext2D,
  guide: Guide,
  width: number,
  height: number,
  viewport: ViewportCtx,
): void {
  if (guide.axis === 'x') {
    const sx = Math.round(worldToScreenX(guide.position, viewport)) + 0.5;
    if (sx < RULER_SIZE || sx > width) return;
    ctx.moveTo(sx, RULER_SIZE);
    ctx.lineTo(sx, height);
  } else {
    const sy = Math.round(worldToScreenY(guide.position, viewport)) + 0.5;
    if (sy < RULER_SIZE || sy > height) return;
    ctx.moveTo(RULER_SIZE, sy);
    ctx.lineTo(width, sy);
  }
}

function drawSceneGuide(
  ctx: CanvasRenderingContext2D,
  guide: Guide,
  width: number,
  height: number,
  viewport: ViewportCtx,
  scene: Scene,
  isActive: boolean,
  isCreating: boolean,
): void {
  const worldPos = guide.position + (guide.axis === 'x' ? scene.bbox.x : scene.bbox.y);

  if (guide.axis === 'x') {
    const sx = Math.round(worldToScreenX(worldPos, viewport)) + 0.5;
    if (sx < RULER_SIZE || sx > width) return;

    // While being created and outside the scene x-span → full solid line
    if (isCreating && (worldPos < scene.bbox.x || worldPos > scene.bbox.x + scene.bbox.width)) {
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(sx, RULER_SIZE);
      ctx.lineTo(sx, height);
      ctx.stroke();
      return;
    }

    const sceneTop   = worldToScreenY(scene.bbox.y, viewport);
    const sceneBot   = worldToScreenY(scene.bbox.y + scene.bbox.height, viewport);
    const clampedTop = Math.max(RULER_SIZE, sceneTop);
    const clampedBot = Math.min(height, sceneBot);

    if (clampedTop < clampedBot) {
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(sx, clampedTop);
      ctx.lineTo(sx, clampedBot);
      ctx.stroke();
    }

    if (isActive) {
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (clampedTop > RULER_SIZE) { ctx.moveTo(sx, RULER_SIZE); ctx.lineTo(sx, clampedTop); }
      if (clampedBot < height)     { ctx.moveTo(sx, clampedBot); ctx.lineTo(sx, height); }
      ctx.stroke();
    }

  } else {
    const sy = Math.round(worldToScreenY(worldPos, viewport)) + 0.5;
    if (sy < RULER_SIZE || sy > height) return;

    // While being created and outside the scene y-span → full solid line
    if (isCreating && (worldPos < scene.bbox.y || worldPos > scene.bbox.y + scene.bbox.height)) {
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(RULER_SIZE, sy);
      ctx.lineTo(width, sy);
      ctx.stroke();
      return;
    }

    const sceneLeft   = worldToScreenX(scene.bbox.x, viewport);
    const sceneRight  = worldToScreenX(scene.bbox.x + scene.bbox.width, viewport);
    const clampedLeft  = Math.max(RULER_SIZE, sceneLeft);
    const clampedRight = Math.min(width, sceneRight);

    if (clampedLeft < clampedRight) {
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(clampedLeft, sy);
      ctx.lineTo(clampedRight, sy);
      ctx.stroke();
    }

    if (isActive) {
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (clampedLeft > RULER_SIZE) { ctx.moveTo(RULER_SIZE, sy);   ctx.lineTo(clampedLeft, sy); }
      if (clampedRight < width)     { ctx.moveTo(clampedRight, sy); ctx.lineTo(width, sy); }
      ctx.stroke();
    }
  }

  ctx.setLineDash([]);
}
