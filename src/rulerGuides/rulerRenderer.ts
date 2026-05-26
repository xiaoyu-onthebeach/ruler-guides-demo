import type { RulerState, Scene } from './types';
import {
  activeOrigin,
  displayValue,
  worldToScreenX,
  worldToScreenY,
  screenToWorldX,
  screenToWorldY,
  RULER_SIZE,
  type ViewportCtx,
} from './coordinateSystem';
import { getRenderOpacities, clearCrossfade } from './crossfade';

// Visual constants
const MAJOR_TICK_LENGTH = 8;
const MINOR_TICK_LENGTH = 4;
const MINOR_TICKS_PER_MAJOR = 5;

// Colors
const RULER_BG    = '#131316CC';
const TICK_MAJOR  = '#50505D';
const TICK_MINOR  = '#40404A80';
const LABEL_COLOR = 'rgba(255, 255, 255, 0.5)';
const BORDER_COLOR = 'rgba(255, 255, 255, 0.08)';

function crisp(n: number): number {
  return Math.round(n) + 0.5;
}

// ── Internal: backgrounds ────────────────────────────────────────────────────

function drawTopRulerBg(ctx: CanvasRenderingContext2D, width: number): void {
  ctx.fillStyle = RULER_BG;
  ctx.fillRect(0, 0, width, RULER_SIZE);

  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, RULER_SIZE - 0.5);
  ctx.lineTo(width, RULER_SIZE - 0.5);
  ctx.stroke();
}

function drawLeftRulerBg(ctx: CanvasRenderingContext2D, height: number): void {
  ctx.fillStyle = RULER_BG;
  ctx.fillRect(0, RULER_SIZE, RULER_SIZE, height - RULER_SIZE);

  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(RULER_SIZE - 0.5, RULER_SIZE);
  ctx.lineTo(RULER_SIZE - 0.5, height);
  ctx.stroke();
}

// ── Internal: ticks + labels (no background) ─────────────────────────────────

function drawTopRulerTicks(
  ctx: CanvasRenderingContext2D,
  width: number,
  rulerState: RulerState,
  viewport: ViewportCtx,
  step: number,
  showMinorTicks: boolean,
  showNumbers: boolean,
  suppressZero = false,
): void {
  const origin = activeOrigin(rulerState);
  const worldLeft = screenToWorldX(RULER_SIZE, viewport);
  const worldRight = screenToWorldX(width, viewport);
  const firstMajor = Math.ceil((worldLeft - origin.x) / step) * step + origin.x;
  const minorStep = step / MINOR_TICKS_PER_MAJOR;

  ctx.font = '10px monospace';

  for (let wx = firstMajor; wx <= worldRight + step; wx += step) {
    const sx = crisp(worldToScreenX(wx, viewport));
    if (sx < RULER_SIZE || sx > width) continue;

    ctx.strokeStyle = TICK_MAJOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, RULER_SIZE - MAJOR_TICK_LENGTH);
    ctx.lineTo(sx, RULER_SIZE);
    ctx.stroke();

    const label = String(Math.round(displayValue(wx, 'x', rulerState)));
    if (showNumbers || (label === '0' && !suppressZero)) {
      ctx.fillStyle = LABEL_COLOR;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, sx, 3);
    }

    if (showMinorTicks) {
      ctx.strokeStyle = TICK_MINOR;
      for (let i = 1; i < MINOR_TICKS_PER_MAJOR; i++) {
        const msx = crisp(worldToScreenX(wx + i * minorStep, viewport));
        if (msx < RULER_SIZE || msx > width) continue;
        ctx.beginPath();
        ctx.moveTo(msx, RULER_SIZE - MINOR_TICK_LENGTH);
        ctx.lineTo(msx, RULER_SIZE);
        ctx.stroke();
      }
    }
  }
}

function drawLeftRulerTicks(
  ctx: CanvasRenderingContext2D,
  height: number,
  rulerState: RulerState,
  viewport: ViewportCtx,
  step: number,
  showMinorTicks: boolean,
  showNumbers: boolean,
  suppressZero = false,
): void {
  const origin = activeOrigin(rulerState);
  const worldTop = screenToWorldY(RULER_SIZE, viewport);
  const worldBottom = screenToWorldY(height, viewport);
  const firstMajor = Math.ceil((worldTop - origin.y) / step) * step + origin.y;
  const minorStep = step / MINOR_TICKS_PER_MAJOR;

  ctx.font = '10px monospace';

  for (let wy = firstMajor; wy <= worldBottom + step; wy += step) {
    const sy = crisp(worldToScreenY(wy, viewport));
    if (sy < RULER_SIZE || sy > height) continue;

    ctx.strokeStyle = TICK_MAJOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(RULER_SIZE - MAJOR_TICK_LENGTH, sy);
    ctx.lineTo(RULER_SIZE, sy);
    ctx.stroke();

    const label = String(Math.round(displayValue(wy, 'y', rulerState)));
    if (showNumbers || (label === '0' && !suppressZero)) {
      ctx.fillStyle = LABEL_COLOR;
      ctx.save();
      ctx.translate((RULER_SIZE - MAJOR_TICK_LENGTH) / 2, sy);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }

    if (showMinorTicks) {
      ctx.strokeStyle = TICK_MINOR;
      for (let i = 1; i < MINOR_TICKS_PER_MAJOR; i++) {
        const msy = crisp(worldToScreenY(wy + i * minorStep, viewport));
        if (msy < RULER_SIZE || msy > height) continue;
        ctx.beginPath();
        ctx.moveTo(RULER_SIZE - MINOR_TICK_LENGTH, msy);
        ctx.lineTo(RULER_SIZE, msy);
        ctx.stroke();
      }
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

// Convenience wrappers — bg + ticks together, no crossfade.
export function drawTopRuler(
  ctx: CanvasRenderingContext2D,
  width: number,
  _height: number,
  rulerState: RulerState,
  viewport: ViewportCtx,
  step: number,
  minorTicks = true,
  showNumbers = true,
): void {
  drawTopRulerBg(ctx, width);
  drawTopRulerTicks(ctx, width, rulerState, viewport, step, minorTicks, showNumbers);
}

export function drawLeftRuler(
  ctx: CanvasRenderingContext2D,
  _width: number,
  height: number,
  rulerState: RulerState,
  viewport: ViewportCtx,
  step: number,
  minorTicks = true,
  showNumbers = true,
): void {
  drawLeftRulerBg(ctx, height);
  drawLeftRulerTicks(ctx, height, rulerState, viewport, step, minorTicks, showNumbers);
}

export function drawCorner(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = RULER_BG;
  ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);

  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(RULER_SIZE - 0.5, 0);
  ctx.lineTo(RULER_SIZE - 0.5, RULER_SIZE);
  ctx.moveTo(0, RULER_SIZE - 0.5);
  ctx.lineTo(RULER_SIZE, RULER_SIZE - 0.5);
  ctx.stroke();

  const cx = RULER_SIZE / 2;
  const cy = RULER_SIZE / 2;
  ctx.strokeStyle = TICK_MAJOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy);
  ctx.lineTo(cx + 4, cy);
  ctx.moveTo(cx, cy - 4);
  ctx.lineTo(cx, cy + 4);
  ctx.stroke();
}

// Main entry point — draws rulers with crossfade between tick densities.
// Returns { isAnimating } so the caller can keep the render loop alive.
export function drawRulers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rulerState: RulerState,
  viewport: ViewportCtx,
  now: number,
  minorTicks = true,
  showNumbers = true,
  suppressZero = false,
): { isAnimating: boolean } {
  const opacities = getRenderOpacities(rulerState, now);

  // Backgrounds are drawn once — not affected by crossfade opacity.
  drawTopRulerBg(ctx, width);
  drawLeftRulerBg(ctx, height);

  // Previous tick density fades out.
  if (opacities.isAnimating && rulerState.previousStep !== null) {
    ctx.save();
    ctx.globalAlpha = opacities.previous;
    drawTopRulerTicks(ctx, width, rulerState, viewport, rulerState.previousStep, minorTicks, showNumbers, suppressZero);
    drawLeftRulerTicks(ctx, height, rulerState, viewport, rulerState.previousStep, minorTicks, showNumbers, suppressZero);
    ctx.restore();
  }

  // Current tick density fades in (or is fully opaque when not animating).
  ctx.save();
  ctx.globalAlpha = opacities.current;
  drawTopRulerTicks(ctx, width, rulerState, viewport, rulerState.currentStep, minorTicks, showNumbers, suppressZero);
  drawLeftRulerTicks(ctx, height, rulerState, viewport, rulerState.currentStep, minorTicks, showNumbers, suppressZero);
  ctx.restore();

  drawCorner(ctx);

  return { isAnimating: opacities.isAnimating };
}

// Mutates state in-place after animation ends. Returns the same object if unchanged.
export function finalizeCrossfade(state: RulerState): RulerState {
  return clearCrossfade(state);
}

// Draws a semi-transparent highlight band over the ruler area for the selected scene,
// with coordinate labels at both ends of the highlighted range.
export function drawSceneRulerHighlight(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: Scene,
  viewport: ViewportCtx,
  rulerState: RulerState,
): void {
  const HIGHLIGHT = '#4570FF20';
  const LABEL     = 'rgba(77, 143, 255, 0.9)';
  const LABEL_X   = (RULER_SIZE - MAJOR_TICK_LENGTH) / 2; // 8 — same x-center as tick labels

  ctx.save();
  ctx.font = '10px monospace';

  // ── Top ruler: horizontal span ───────────────────────────────────────────────
  const sxLeft  = worldToScreenX(scene.bbox.x, viewport);
  const sxRight = worldToScreenX(scene.bbox.x + scene.bbox.width, viewport);
  const visLeft  = Math.max(RULER_SIZE, sxLeft);
  const visRight = Math.min(width, sxRight);

  if (visLeft < visRight) {
    ctx.fillStyle = HIGHLIGHT;
    ctx.fillRect(visLeft, 0, visRight - visLeft, RULER_SIZE);

    ctx.fillStyle    = LABEL;
    ctx.textBaseline = 'top';

    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round(displayValue(scene.bbox.x, 'x', rulerState))), visLeft - 2, 3);

    ctx.textAlign = 'left';
    ctx.fillText(String(Math.round(displayValue(scene.bbox.x + scene.bbox.width, 'x', rulerState))), visRight + 2, 3);
  }

  // ── Left ruler: vertical span ────────────────────────────────────────────────
  const syTop    = worldToScreenY(scene.bbox.y, viewport);
  const syBottom = worldToScreenY(scene.bbox.y + scene.bbox.height, viewport);
  const visTop    = Math.max(RULER_SIZE, syTop);
  const visBottom = Math.min(height, syBottom);

  if (visTop < visBottom) {
    ctx.fillStyle = HIGHLIGHT;
    ctx.fillRect(0, visTop, RULER_SIZE, visBottom - visTop);

    ctx.fillStyle    = LABEL;
    ctx.textBaseline = 'middle';

    // Top label: left-aligned at anchor → text extends upward in screen space (outside highlight)
    ctx.save();
    ctx.translate(LABEL_X, visTop - 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'left';
    ctx.fillText(String(Math.round(displayValue(scene.bbox.y, 'y', rulerState))), 0, 0);
    ctx.restore();

    // Bottom label: right-aligned at anchor → text extends downward in screen space (outside highlight)
    ctx.save();
    ctx.translate(LABEL_X, visBottom + 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round(displayValue(scene.bbox.y + scene.bbox.height, 'y', rulerState))), 0, 0);
    ctx.restore();
  }

  ctx.restore();
}
